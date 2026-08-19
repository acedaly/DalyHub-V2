/**
 * TASKS-12 — the dependency ROUTE, and the advanced-recurrence fields it
 * validates.
 *
 * Nothing here is mocked. Every submission goes through the same
 * `/tasks/:taskId` action the record posts to, against the committed migrations
 * and the real domain, so what is proven is what actually ships:
 *
 *   - the record's loader carries both directions of the dependency set;
 *   - the two dependency intents answer with the WHOLE set as the server holds
 *     it, so the section reconciles rather than accumulating an opinion;
 *   - every refusal is a SENTENCE — a cycle, a bound, a missing endpoint — and
 *     never a status code or a leaked constraint;
 *   - a hand-made POST meets exactly the same graph rules the picker does, which
 *     is the point of the check being server-side;
 *   - the advanced recurrence fields are validated at the trusted boundary, and
 *     absent ones mean the documented defaults, so an older client cannot
 *     accidentally change a rule.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";
import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import {
  action as taskAction,
  loader as taskLoader,
} from "~/modules/tasks/routes/task-detail";
import { loader as dependencyTargetsLoader } from "~/modules/tasks/routes/task-dependency-targets";

import {
  FakeClock,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OWNER = "dev@dalyhub.test";

const nextEntityId = sequentialIds("depr_ent");
const nextActivityId = sequentialIds("depr_act");

function taskRepo() {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock("2026-08-19T00:00:00.000Z").now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function authedContext(subject = OWNER): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject, email: subject, displayName: null },
  } as AuthenticatedSession;
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

interface DependencyBody {
  readonly taskId: string;
  readonly title: string;
  readonly completedAt: string | null;
}

type ActionBody = Record<string, unknown> & {
  readonly kind?: string;
  readonly status?: string;
  readonly formError?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly dependencies?: {
    readonly blockedBy: readonly DependencyBody[];
    readonly blocks: readonly DependencyBody[];
  };
  readonly task?: { readonly recurrence?: Record<string, unknown> | null };
};

async function post(
  taskId: string,
  fields: Record<string, string>,
): Promise<ActionBody> {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  const response = (await taskAction({
    request: new Request(`https://app.test/tasks/${taskId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof taskAction>[0])) as Response;
  return (await response.json()) as ActionBody;
}

async function loadRecord(taskId: string): Promise<ActionBody> {
  const response = (await taskLoader({
    request: new Request(`https://app.test/tasks/${taskId}`),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof taskLoader>[0])) as Response;
  return (await response.json()) as ActionBody;
}

async function searchTargets(taskId: string, query: string) {
  const response = (await dependencyTargetsLoader({
    request: new Request(
      `https://app.test/tasks/${taskId}/dependency-targets?q=${encodeURIComponent(query)}`,
    ),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof dependencyTargetsLoader>[0])) as Response;
  return (await response.json()) as {
    readonly options?: readonly { readonly id: string; readonly title: string }[];
  };
}

async function seedTask(
  title: string,
  scheduledDate: string | null = null,
): Promise<string> {
  const task = await taskRepo().createTask({
    title,
    parent: null,
    ...(scheduledDate === null ? {} : { scheduledDate }),
  });
  return task.id;
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("the record's loader", () => {
  it("carries BOTH directions with the record", async () => {
    const publish = await seedTask("Publish report");
    const draft = await seedTask("Prepare draft");
    const review = await seedTask("Review with legal");
    await post(publish, { intent: "dependency_add", blockerId: draft });
    await post(review, { intent: "dependency_add", blockerId: publish });

    const body = await loadRecord(publish);
    expect(body.dependencies!.blockedBy.map((d) => d.title)).toEqual([
      "Prepare draft",
    ]);
    expect(body.dependencies!.blocks.map((d) => d.title)).toEqual([
      "Review with legal",
    ]);
  });

  it("carries two empty lists for a Task with no dependencies", async () => {
    const body = await loadRecord(await seedTask("Alone"));
    expect(body.dependencies).toEqual({ blockedBy: [], blocks: [] });
  });
});

describe("the two dependency intents", () => {
  it("answers with the WHOLE set the server now holds", async () => {
    const publish = await seedTask("Publish report");
    const draft = await seedTask("Prepare draft");
    const added = await post(publish, {
      intent: "dependency_add",
      blockerId: draft,
    });
    expect(added.kind).toBe("dependency");
    expect(added.status).toBe("success");
    expect(added.dependencies!.blockedBy.map((d) => d.title)).toEqual([
      "Prepare draft",
    ]);

    const removed = await post(publish, {
      intent: "dependency_remove",
      blockerId: draft,
    });
    expect(removed.status).toBe("success");
    expect(removed.dependencies!.blockedBy).toEqual([]);
  });

  it("reports a blocker's completion, so the section can say Done", async () => {
    const publish = await seedTask("Publish report");
    const draft = await seedTask("Prepare draft");
    await post(publish, { intent: "dependency_add", blockerId: draft });
    await taskRepo().completeTask(draft, { ownerTodayIso: "2026-08-19" });
    const body = await loadRecord(publish);
    expect(body.dependencies!.blockedBy[0]!.completedAt).not.toBeNull();
  });
});

describe("every refusal is a sentence", () => {
  it("refuses a CYCLE, whatever its length, with the owner's wording", async () => {
    const a = await seedTask("A");
    const b = await seedTask("B");
    const c = await seedTask("C");
    await post(b, { intent: "dependency_add", blockerId: a });
    await post(c, { intent: "dependency_add", blockerId: b });

    const refusal = await post(a, { intent: "dependency_add", blockerId: c });
    expect(refusal.status).toBe("error");
    expect(refusal.fieldErrors?.dependency).toContain("wait for each other");
    // Nothing leaked: no SQL, no constraint name, no id.
    expect(refusal.fieldErrors?.dependency).not.toContain("entity_links");
    expect(refusal.fieldErrors?.dependency).not.toContain(c);
  });

  it("refuses a SELF dependency", async () => {
    const a = await seedTask("A");
    const refusal = await post(a, { intent: "dependency_add", blockerId: a });
    expect(refusal.status).toBe("error");
    expect(refusal.fieldErrors?.dependency).toContain("cannot block itself");
  });

  it("refuses a blocker that is not a Task in this workspace", async () => {
    const a = await seedTask("A");
    const refusal = await post(a, {
      intent: "dependency_add",
      blockerId: "ent_nope",
    });
    expect(refusal.status).toBe("error");
    expect(refusal.formError).toBe("That task is no longer available.");
  });

  it("refuses a submission with no blocker at all", async () => {
    const a = await seedTask("A");
    const refusal = await post(a, { intent: "dependency_add" });
    expect(refusal.status).toBe("error");
    expect(refusal.fieldErrors?.dependency).toBe(
      "Choose the task this one waits on.",
    );
  });
});

describe("the dependency picker's candidates", () => {
  it("offers Tasks, never the anchor itself", async () => {
    const anchor = await seedTask("Publish the annual report");
    await seedTask("Prepare the annual report draft");
    const found = await searchTargets(anchor, "annual report");
    expect(found.options!.map((option) => option.title)).toEqual([
      "Prepare the annual report draft",
    ]);
  });

  it("returns a calm not-found for a non-Task anchor", async () => {
    const response = (await dependencyTargetsLoader({
      request: new Request(
        "https://app.test/tasks/ent_missing/dependency-targets?q=",
      ),
      context: authedContext(),
      params: { taskId: "ent_missing" },
    } as unknown as Parameters<typeof dependencyTargetsLoader>[0])) as Response;
    expect(response.status).toBe(404);
  });
});

/* -------------------------------------------------------------------------- */
/* The advanced recurrence fields, at the trusted boundary                    */
/* -------------------------------------------------------------------------- */

describe("the recurrence action validates the TASKS-12 fields", () => {
  it("stores an nth-weekday rule with an end condition", async () => {
    const taskId = await seedTask("Last Friday review", "2026-08-28");
    const body = await post(taskId, {
      intent: "set_recurrence",
      frequency: "month",
      interval: "1",
      dateKind: "scheduled",
      mode: "fixed",
      weekdays: "5",
      ordinal: "last",
      weekendRule: "allow",
      endsAfterCount: "6",
      endsOnDate: "",
    });
    expect(body.status).toBe("success");
    expect(body.task!.recurrence).toMatchObject({
      ordinal: "last",
      weekdays: [5],
      endsAfterCount: 6,
      endsOnDate: null,
    });
  });

  it("refuses each value outside its closed set, storing nothing", async () => {
    const taskId = await seedTask("Weekly", "2026-08-24");
    const base = {
      intent: "set_recurrence",
      frequency: "week",
      interval: "1",
      dateKind: "scheduled",
      mode: "fixed",
      weekdays: "1",
    };
    for (const [field, value, wording] of [
      ["ordinal", "fifth", "which weekday of the month"],
      ["weekendRule", "sometimes", "falls at a weekend"],
      ["endsAfterCount", "0", "how many times"],
      ["endsAfterCount", "1000", "how many times"],
    ] as const) {
      const refusal = await post(taskId, { ...base, [field]: value });
      expect(refusal.status).toBe("error");
      expect(refusal.fieldErrors?.recurrence).toContain(wording);
    }
    const record = await loadRecord(taskId);
    expect(record.task!.recurrence).toBeNull();
  });

  it("treats ABSENT advanced fields as the documented defaults", async () => {
    // Exactly the field set a client written before TASKS-12 posts.
    const taskId = await seedTask("Weekly", "2026-08-24");
    const body = await post(taskId, {
      intent: "set_recurrence",
      frequency: "week",
      interval: "2",
      dateKind: "scheduled",
      mode: "fixed",
      weekdays: "1,4",
    });
    expect(body.status).toBe("success");
    expect(body.task!.recurrence).toMatchObject({
      interval: 2,
      weekdays: [1, 4],
      ordinal: null,
      weekendRule: "allow",
      endsAfterCount: null,
      endsOnDate: null,
    });
  });

  it("refuses a rule the KERNEL rejects, in the kernel's own words", async () => {
    const taskId = await seedTask("Weekend only", "2026-08-22");
    const refusal = await post(taskId, {
      intent: "set_recurrence",
      frequency: "week",
      interval: "1",
      dateKind: "scheduled",
      mode: "fixed",
      weekdays: "0,6",
      weekendRule: "skip",
    });
    expect(refusal.status).toBe("error");
    expect(refusal.fieldErrors?.recurrence).toContain("no occurrences");
  });
});
