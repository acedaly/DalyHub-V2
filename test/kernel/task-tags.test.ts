import { beforeEach, describe, expect, it } from "vitest";

import { canonicalTagKey } from "~/kernel/tags";
import {
  parseTaskViewConfig,
  serialiseTaskViewConfig,
  toWorkspaceFilters,
} from "~/kernel/task-views";
import type { TaskRepository, WorkspaceTaskFilters } from "~/kernel/tasks";
import {
  createTagVocabularyRepository,
  createTaskRepository,
} from "~/platform/storage/d1";
import { env } from "cloudflare:test";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * V2.6 FIND-03 — Tasks adopt the one tag vocabulary, and the collection gains
 * ONE tag dimension. Against real D1.
 *
 * DEBT-48's closing condition has three clauses, and this file is where the
 * third is discharged: *"the filter is covered by a real-D1 COMBINED-filter
 * test."* The roadmap sharpens it — *"tag × at least two existing dimensions"* —
 * because a tag filter that only works alone is a filter that works in a demo.
 *
 * Also proven here, because each is a way the join could be wrong in a manner a
 * single-dimension test cannot see:
 *
 *   - **no duplication.** A Task carrying two of the filtered tags appears
 *     ONCE. A `JOIN` would return it twice, which corrupts the page, the count
 *     beside the filter and the keyset cursor;
 *   - **deterministic order and pagination** across the filter;
 *   - **workspace isolation**;
 *   - **tag removal changes the result**, so the filter reads live state;
 *   - **a tag another entity still uses stays in the vocabulary**;
 *   - the recorded decisions: a tag IS expressible in a saved view, and is NOT
 *     an input to the smart sort or to the kernel next-action rule.
 */

const WS = "ws_find03";
const OTHER = "ws_find03_other";
const TODAY = "2026-07-25";

const nextEntityId = sequentialIds("e-f03");
const nextActivityId = sequentialIds("a-f03");

function spineRepo(ws: string) {
  return makeSpineRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function taskRepo(ws: string) {
  return makeTaskRepository(makeContext(ws), {
    clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
    activityIdGenerator: nextActivityId,
  });
}

async function titles(
  repo: TaskRepository,
  filters: WorkspaceTaskFilters,
  extra: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<{ titles: string[]; nextCursor: string | null }> {
  const page = await repo.listWorkspaceTasks({
    view: "all",
    filters,
    todayIso: TODAY,
    timezone: "UTC",
    ...(extra.limit ? { limit: extra.limit } : {}),
    ...(extra.cursor ? { cursor: extra.cursor } : {}),
  });
  return {
    titles: page.items.map((item) => item.title),
    nextCursor: page.nextCursor ?? null,
  };
}

interface Seeded {
  readonly repo: TaskRepository;
  readonly alphaId: string;
  readonly betaId: string;
  readonly ids: Record<string, string>;
}

/**
 * A workspace shaped so that EVERY assertion below needs more than one
 * dimension to be true.
 *
 * `Errand under Alpha, P1` and `Errand under Beta, P1` differ only by parent;
 * `Errand under Alpha, P3` differs only by priority. So a tag filter that
 * quietly ignored the parent or the priority would return the wrong set, and a
 * parent/priority filter that quietly ignored the tag would too.
 */
async function seed(ws: string): Promise<Seeded> {
  const spine = spineRepo(ws);
  const work = await spine.createArea({ title: "Work" });
  const alpha = await spine.createProject({
    title: "Alpha",
    parent: { kind: "area", id: work.id },
  });
  const beta = await spine.createProject({
    title: "Beta",
    parent: { kind: "area", id: work.id },
  });
  const repo = taskRepo(ws);
  const ids: Record<string, string> = {};

  const make = async (
    title: string,
    projectId: string,
    priority: "p1" | "p3",
    tags: readonly string[],
  ) => {
    const task = await repo.createTask({
      title,
      parent: { kind: "project", id: projectId },
      priority,
      tags,
    });
    ids[title] = task.id;
    return task;
  };

  await make("Alpha errand P1", alpha.id, "p1", ["Errand"]);
  await make("Alpha errand P3", alpha.id, "p3", ["errand"]);
  await make("Beta errand P1", beta.id, "p1", ["ERRAND"]);
  // Two of the filtered tags at once — the duplication case.
  await make("Alpha both P1", alpha.id, "p1", ["Errand", "Deep Work"]);
  await make("Alpha deep P1", alpha.id, "p1", ["Deep Work"]);
  await make("Alpha untagged P1", alpha.id, "p1", []);

  return { repo, alphaId: alpha.id, betaId: beta.id, ids };
}

describe("FIND-03 — the Tasks tag dimension (D1)", () => {
  let seeded: Seeded;

  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    seeded = await seed(WS);
  });

  it("is ONE tag whatever case the Task was created with", async () => {
    // Three Tasks typed `Errand`, `errand` and `ERRAND`. One tag, one filter.
    const { titles: matched } = await titles(seeded.repo, {
      tagKeys: ["errand"],
    });
    expect(matched.sort()).toEqual([
      "Alpha both P1",
      "Alpha errand P1",
      "Alpha errand P3",
      "Beta errand P1",
    ]);
    // …and the vocabulary holds ONE entry, with the first spelling.
    const vocabulary = await createTagVocabularyRepository(
      env.DB,
      makeContext(WS),
    ).listVocabulary();
    expect(vocabulary).toEqual([
      { key: "deep work", label: "Deep Work" },
      { key: "errand", label: "Errand" },
    ]);
  });

  it("COMBINES with the parent and the priority, not instead of them", async () => {
    // Tag × parent × priority — three dimensions at once, which is the whole
    // point of the criterion. Each pair below differs from the answer by exactly
    // one dimension, so a filter that ignored any one of the three would fail.
    const combined: WorkspaceTaskFilters = {
      tagKeys: ["errand"],
      projectId: seeded.alphaId,
      priorities: ["p1"],
    };
    expect((await titles(seeded.repo, combined)).titles.sort()).toEqual([
      "Alpha both P1",
      "Alpha errand P1",
    ]);

    // Drop the tag: the Alpha P1 Tasks that are NOT errands come back.
    expect(
      (
        await titles(seeded.repo, {
          projectId: seeded.alphaId,
          priorities: ["p1"],
        })
      ).titles.sort(),
    ).toEqual([
      "Alpha both P1",
      "Alpha deep P1",
      "Alpha errand P1",
      "Alpha untagged P1",
    ]);
    // Drop the priority: the P3 errand joins.
    expect(
      (
        await titles(seeded.repo, {
          tagKeys: ["errand"],
          projectId: seeded.alphaId,
        })
      ).titles.sort(),
    ).toEqual(["Alpha both P1", "Alpha errand P1", "Alpha errand P3"]);
    // Drop the parent: Beta's errand joins.
    expect(
      (
        await titles(seeded.repo, { tagKeys: ["errand"], priorities: ["p1"] })
      ).titles.sort(),
    ).toEqual(["Alpha both P1", "Alpha errand P1", "Beta errand P1"]);
  });

  it("returns a Task carrying TWO of the filtered tags exactly once", async () => {
    /*
     * The defect a `JOIN` would produce, and the reason the predicate is an
     * `EXISTS`. A duplicated row corrupts the page, the count beside the filter
     * and the keyset cursor — and it is invisible to a single-tag test.
     */
    const { titles: matched } = await titles(seeded.repo, {
      tagKeys: ["errand", "deep work"],
    });
    expect(matched.filter((title) => title === "Alpha both P1")).toHaveLength(
      1,
    );
    expect(matched.sort()).toEqual([
      "Alpha both P1",
      "Alpha deep P1",
      "Alpha errand P1",
      "Alpha errand P3",
      "Beta errand P1",
    ]);
    expect(new Set(matched).size).toBe(matched.length);
  });

  it("paginates deterministically across the filter", async () => {
    const filters: WorkspaceTaskFilters = { tagKeys: ["errand", "deep work"] };
    const whole = await titles(seeded.repo, filters);
    const first = await titles(seeded.repo, filters, { limit: 2 });
    expect(first.titles).toEqual(whole.titles.slice(0, 2));
    expect(first.nextCursor).not.toBeNull();
    const second = await titles(seeded.repo, filters, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.titles).toEqual(whole.titles.slice(2, 4));
    // No row appears on two pages, which is the same claim the duplication test
    // makes, checked where a duplicate would actually hurt.
    expect(
      first.titles.filter((title) => second.titles.includes(title)),
    ).toEqual([]);
  });

  it("never reaches another workspace's Tasks", async () => {
    const other = await seed(OTHER);
    // Both workspaces have an `errand` tag and identically-titled Tasks.
    const mine = await titles(seeded.repo, { tagKeys: ["errand"] });
    const theirs = await titles(other.repo, { tagKeys: ["errand"] });
    expect(mine.titles.length).toBe(4);
    expect(theirs.titles.length).toBe(4);
    // The ids are disjoint — the titles are deliberately the same, so comparing
    // titles would prove nothing.
    const mineIds = new Set(Object.values(seeded.ids));
    for (const id of Object.values(other.ids)) {
      expect(mineIds.has(id)).toBe(false);
    }
  });

  it("stops matching as soon as the tag is removed", async () => {
    const id = seeded.ids["Alpha errand P1"]!;
    const before = await titles(seeded.repo, { tagKeys: ["errand"] });
    expect(before.titles).toContain("Alpha errand P1");

    const result = await seeded.repo.updateTask(id, { tags: [] });
    expect(result.changed).toBe(true);
    expect(result.task.tags).toEqual([]);

    const after = await titles(seeded.repo, { tagKeys: ["errand"] });
    expect(after.titles).not.toContain("Alpha errand P1");
    // …and the other errands are untouched.
    expect(after.titles.sort()).toEqual([
      "Alpha both P1",
      "Alpha errand P3",
      "Beta errand P1",
    ]);
  });

  it("keeps a tag in the vocabulary while another record still uses it", async () => {
    // Remove `deep work` from one of its two Tasks.
    await seeded.repo.updateTask(seeded.ids["Alpha both P1"]!, {
      tags: ["Errand"],
    });
    const vocabulary = await createTagVocabularyRepository(
      env.DB,
      makeContext(WS),
    ).listVocabulary();
    expect(vocabulary.map((tag) => tag.key)).toContain("deep work");
    expect(
      (await titles(seeded.repo, { tagKeys: ["deep work"] })).titles,
    ).toEqual(["Alpha deep P1"]);
  });

  it("re-typing a tag in another case changes nothing and records nothing", async () => {
    const id = seeded.ids["Alpha errand P1"]!;
    const result = await seeded.repo.updateTask(id, { tags: ["ERRAND"] });
    // A Task carries tag IDENTITIES; `ERRAND` is the same tag, and the
    // vocabulary keeps the first spelling.
    expect(result.changed).toBe(false);
    expect(result.task.tags).toEqual(["Errand"]);
  });

  it("shows the vocabulary's spelling on the Task, not the one typed", async () => {
    // `Beta errand P1` was created with `ERRAND`; the workspace already knew the
    // tag as `Errand`, so that is what the owner reads.
    const task = await seeded.repo.getTask(seeded.ids["Beta errand P1"]!);
    expect(task?.tags).toEqual(["Errand"]);
  });

  it("costs the list query NOTHING: the filter is a predicate, not a join", async () => {
    /*
     * The performance claim, counted rather than asserted. The tag dimension is
     * an `EXISTS` inside the page's existing WHERE, so filtering by tag runs the
     * SAME number of statements as not filtering — and adding tagged Tasks does
     * not change it either, which is what "flat in workspace size" means here.
     */
    const counting = countingDb(env.DB);
    const counted = createTaskRepository(counting.db, makeContext(WS), {
      clock: new FakeClock("2026-07-20T00:00:00.000Z").now,
      activityIdGenerator: nextActivityId,
    });

    await counted.listWorkspaceTasks({
      view: "all",
      filters: {},
      todayIso: TODAY,
      timezone: "UTC",
    });
    const unfiltered = counting.prepareCount();

    counting.reset();
    await counted.listWorkspaceTasks({
      view: "all",
      filters: { tagKeys: ["errand", "deep work"] },
      todayIso: TODAY,
      timezone: "UTC",
    });
    expect(counting.prepareCount()).toBe(unfiltered);
  });

  it("validates a Task's tags through the ONE validator", async () => {
    await expect(
      seeded.repo.updateTask(seeded.ids["Alpha untagged P1"]!, {
        tags: ["x".repeat(65)],
      }),
    ).rejects.toMatchObject({ field: "tags" });
    // Nothing was written.
    const task = await seeded.repo.getTask(seeded.ids["Alpha untagged P1"]!);
    expect(task?.tags).toEqual([]);
  });
});

describe("FIND-03 — the recorded decisions", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
  });

  it("IS expressible in a saved view, through the one declarative config", async () => {
    /*
     * The recorded decision: a tag participates in saved views, because it is
     * ONE dimension in the ONE declarative vocabulary (ADR-082) and nothing
     * else. There is no tag-shaped code in the codec, the serialiser or the
     * repository translation — which is why this test can be written by round-
     * tripping the generic config rather than by exercising a tag-specific path.
     */
    const config = parseTaskViewConfig({
      systemView: "all",
      filters: { tags: ["Errand", "Deep  Work"], priorities: ["p1"] },
    });
    // Canonicalised on parse, so a saved view naming `Errand` and a link naming
    // `errand` are the same view.
    expect(config.filters.tags).toEqual(["deep work", "errand"]);
    // Survives the exact round trip a saved view is stored and restored by.
    const restored = parseTaskViewConfig(
      JSON.parse(serialiseTaskViewConfig(config)),
    );
    expect(restored.filters.tags).toEqual(config.filters.tags);
    // And it becomes the repository's ONE tag parameter, not a second query.
    expect(toWorkspaceFilters(config).tagKeys).toEqual(["deep work", "errand"]);
  });

  it("is NOT an input to the smart sort", async () => {
    /*
     * ADR-112 decision 4: a tag *"never orders a collection"*. Asserted by
     * BEHAVIOUR rather than by reading the SQL, because an ordering claim is
     * about the result: two Tasks identical in every smart-sort segment
     * (open, not overdue, same priority, same due date) and different only in
     * their tags must come back in the order their tie-break decides, and
     * tagging one of them must not move it.
     */
    const seeded = await seed(WS);
    const untaggedOrder = await titles(seeded.repo, { priorities: ["p1"] });

    await seeded.repo.updateTask(seeded.ids["Alpha untagged P1"]!, {
      tags: ["zzz-last-alphabetically"],
    });
    const taggedOrder = await titles(seeded.repo, { priorities: ["p1"] });
    expect(taggedOrder.titles).toEqual(untaggedOrder.titles);
  });

  it("is NOT an input to the kernel next-action rule", async () => {
    /*
     * ADR-112 decision 4: a tag *"never feeds the kernel next-action rule"*
     * (STEER-04). The SOURCE-level half of this claim — that `next-action.ts`
     * does not mention a tag at all, so one CANNOT reach the decision — is in
     * `test/unit/tasks/tag-boundary.test.ts`, which can read a file. Here the
     * rule is driven, so both halves exist and neither stands alone.
     */
    const { selectNextAction } = await import("~/kernel/tasks");
    const base = {
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      completedAt: null,
      status: "todo" as const,
      commitmentState: "active" as const,
      dueDate: null,
      waitingSince: null,
      blocked: false,
    };
    const chosen = selectNextAction(
      [
        { ...base, id: "b", title: "B", priority: "p3" as const },
        { ...base, id: "a", title: "A", priority: "p1" as const },
      ],
      TODAY,
    );
    expect(chosen?.id).toBe("a");
  });

  it("canonicalises a filter the same way the vocabulary does", () => {
    // One rule, so a URL, a saved view and a stored tag cannot disagree.
    expect(canonicalTagKey("  Deep   WORK ")).toBe("deep work");
    expect(
      parseTaskViewConfig({ filters: { tags: "Deep   WORK" } }).filters.tags,
    ).toEqual(["deep work"]);
  });
});
