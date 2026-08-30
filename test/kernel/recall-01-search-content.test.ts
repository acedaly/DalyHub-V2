/**
 * RECALL-01 — Search reaches content. The repository-level proof.
 *
 * Every assertion here runs against the REAL D1 (the Workers test pool), because
 * the claims are about SQL: which columns are matched, how many statements it
 * costs, how big the payload is, and which rows a workspace predicate keeps out.
 * A fake repository could satisfy none of them.
 *
 * What this file proves:
 *
 *   1. A distinctive phrase existing ONLY in a body column finds its record —
 *      Meeting notes, Meeting agenda, a captured decision item, a Task
 *      description, a Review reflection and a Diary body.
 *   2. One result per record, however many of its body fields match.
 *   3. One statement per provider, identical for one match and fifty.
 *   4. Hostile content in a SECOND workspace is never returned — asserted at the
 *      repository, not inferred from routing.
 *   5. A People free-text `notes` phrase matches NOTHING (the privacy rule is a
 *      test, not an intention).
 *   6. A 100 KiB body matches, ships a bounded excerpt, and never crosses the
 *      repository boundary whole.
 *
 * **Fixtures are synthetic distinctive nonsense**, never realistic private
 * prose, and no assertion here prints a record body: the large-body test
 * compares LENGTHS and boolean containment, so a failure message can never
 * become a Diary dump.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  createDiaryRepository,
  createMeetingRepository,
  createNoteRepository,
  createReviewRepository,
  createTaskRepository,
} from "~/platform/storage/d1";

import {
  makeContext,
  makeDiaryRepository,
  makeMeetingRepository,
  makeNoteDetailsRepository,
  makePersonRepository,
  makeRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  makeWorkspaceRepository,
  resetTables,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "recall01-hostile-workspace";

/**
 * Distinctive synthetic phrases. Each exists in exactly ONE body field of one
 * record, so a hit can only have come from the column under test. None of them
 * reads as private prose.
 */
const PHRASE = {
  meetingNotes: "quibblewax",
  meetingAgenda: "florbulent",
  meetingItem: "grondlesnap",
  taskDescription: "vexicular",
  reviewSection: "plimberwock",
  diaryBody: "zibblethorn",
  personNotes: "murkwaddle",
  everywhere: "octoprismic",
} as const;

/** A D1 proxy that counts prepared statements — the one-statement contract. */
function countedDb(): {
  readonly db: D1Database;
  readonly count: () => number;
  readonly reset: () => void;
} {
  let statements = 0;
  return {
    db: new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === "prepare") {
          return (query: string) => {
            statements += 1;
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database,
    count: () => statements,
    reset: () => {
      statements = 0;
    },
  };
}

/**
 * A D1 proxy that watches what actually COMES BACK from the database.
 *
 * The excerpt contract's central claim is about the REPOSITORY BOUNDARY: the
 * window is cut in SQL, so a huge body is never carried into the Worker at all.
 * Asserting only on the mapped result would miss a projection that selects a
 * whole body column and then discards it in JavaScript — which is a real cost
 * (the row still crosses the wire) and was a real defect: the Task search
 * projection selected `td.description` for a `TaskListItem` that has no such
 * field until RECALL-01 dropped it. This records the longest string in any
 * returned row, so that class of regression fails.
 */
function boundedRowDb(): {
  readonly db: D1Database;
  readonly longestValue: () => number;
  readonly reset: () => void;
} {
  let longest = 0;
  const inspect = (value: unknown): void => {
    if (typeof value === "string") {
      longest = Math.max(longest, value.length);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) inspect(item);
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const item of Object.values(value)) inspect(item);
    }
  };
  const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, property, receiver) {
        if (property === "bind") {
          return (...args: unknown[]) => wrapStatement(target.bind(...args));
        }
        if (property === "all" || property === "first" || property === "raw") {
          return async (...args: unknown[]) => {
            const method = Reflect.get(target, property) as (
              ...rest: unknown[]
            ) => Promise<unknown>;
            const result = await method.apply(target, args);
            inspect(result);
            return result;
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1PreparedStatement;

  return {
    db: new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === "prepare") {
          return (query: string) => wrapStatement(target.prepare(query));
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database,
    longestValue: () => longest,
    reset: () => {
      longest = 0;
    },
  };
}

async function seedWorkspace(workspaceId: string): Promise<void> {
  try {
    await makeWorkspaceRepository().create({
      id: parseWorkspaceId(workspaceId),
    });
  } catch {
    // The Workers kernel harness seeds the configured default workspace already.
  }
}

/** A meeting with prose in all three of its body sources. */
async function seedMeeting(
  workspaceId: string,
  options: {
    readonly title: string;
    readonly agenda: string;
    readonly notes: string;
    readonly items?: readonly string[];
  },
): Promise<string> {
  const meetings = makeMeetingRepository(makeContext(workspaceId));
  const meeting = await meetings.create({
    title: options.title,
    startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    timezone: "UTC",
  });
  await meetings.update(meeting.id, {
    agendaMarkdown: options.agenda,
    notesMarkdown: options.notes,
  });
  for (const body of options.items ?? []) {
    await meetings.addItem(meeting.id, "decision", body);
  }
  return meeting.id;
}

/** A task whose description carries the phrase. */
async function seedTask(
  workspaceId: string,
  title: string,
  description: string,
): Promise<string> {
  const context = makeContext(workspaceId);
  const spine = makeSpineRepository(context);
  const area = await spine.createArea({ title: `${title} area` });
  const task = await spine.createTask({
    title,
    parent: { kind: "area", id: area.id },
  });
  await makeTaskRepository(context).updateTask(task.id, { description });
  return task.id;
}

/** A Review with one or more authored section bodies. */
async function seedReview(
  workspaceId: string,
  title: string,
  sections: ReadonlyArray<readonly [string, string]>,
  // Review creation is idempotent per period, so a fixture that wants SEVERAL
  // Reviews has to give each its own week.
  weekOffset = 0,
): Promise<string> {
  const reviews = makeReviewRepository(makeContext(workspaceId));
  const day = 24 * 60 * 60 * 1000;
  const start = new Date(Date.UTC(2026, 0, 5) + weekOffset * 7 * day);
  const iso = (date: Date): string => date.toISOString().slice(0, 10);
  const created = await reviews.create({
    type: "weekly",
    periodStart: iso(start),
    periodEnd: iso(new Date(start.getTime() + 6 * day)),
    title,
  });
  for (const [sectionId, body] of sections) {
    await reviews.updateSection(
      created.review.id,
      sectionId as Parameters<typeof reviews.updateSection>[1],
      body,
    );
  }
  return created.review.id;
}

describe("RECALL-01 — Search reaches record content", () => {
  beforeEach(async () => {
    await resetTables([WS, OTHER]);
    await seedWorkspace(WS);
    await seedWorkspace(OTHER);
  });

  /* ---------------------------------------------------------------------- */
  /* 1. A phrase that exists only inside a record finds the record           */
  /* ---------------------------------------------------------------------- */

  it("finds a Meeting by its notes, its agenda and a captured item", async () => {
    const id = await seedMeeting(WS, {
      title: "Recall meeting one",
      agenda: `## Preparation\n\nReview the ${PHRASE.meetingAgenda} figures.`,
      notes: `We agreed the ${PHRASE.meetingNotes} approach.`,
      items: [`Adopt the ${PHRASE.meetingItem} plan.`],
    });
    const repo = createMeetingRepository(env.DB, makeContext(WS));

    const notes = await repo.searchMeetings({ text: PHRASE.meetingNotes });
    expect(notes.map((hit) => hit.id)).toEqual([id]);
    expect(notes[0]?.matchSource).toBe("notes");
    expect(notes[0]?.excerpt).toContain(PHRASE.meetingNotes);

    const agenda = await repo.searchMeetings({ text: PHRASE.meetingAgenda });
    expect(agenda.map((hit) => hit.id)).toEqual([id]);
    expect(agenda[0]?.matchSource).toBe("agenda");
    expect(agenda[0]?.excerpt).toContain(PHRASE.meetingAgenda);
    // The excerpt is PLAIN TEXT: the analyser stripped the heading syntax.
    expect(agenda[0]?.excerpt).not.toContain("##");

    const item = await repo.searchMeetings({ text: PHRASE.meetingItem });
    expect(item.map((hit) => hit.id)).toEqual([id]);
    expect(item[0]?.matchSource).toBe("item");
    expect(item[0]?.itemKind).toBe("decision");
    expect(item[0]?.excerpt).toContain(PHRASE.meetingItem);
  });

  it("finds a Task by its description", async () => {
    const id = await seedTask(
      WS,
      "Recall task one",
      `Check the ${PHRASE.taskDescription} readings before Friday.`,
    );
    const repo = createTaskRepository(env.DB, makeContext(WS));
    const hits = await repo.searchTasks({ text: PHRASE.taskDescription });
    expect(hits.map((hit) => hit.id)).toEqual([id]);
    expect(hits[0]?.matchSource).toBe("description");
    expect(hits[0]?.excerpt).toContain(PHRASE.taskDescription);
  });

  it("finds a Review by a section reflection", async () => {
    const id = await seedReview(WS, "Recall review one", [
      ["summary.lessons", `The ${PHRASE.reviewSection} lesson stuck.`],
    ]);
    const repo = createReviewRepository(env.DB, makeContext(WS));
    const hits = await repo.searchReviews({ text: PHRASE.reviewSection });
    expect(hits.map((hit) => hit.id)).toEqual([id]);
    expect(hits[0]?.matchSource).toBe("section");
    expect(hits[0]?.sectionId).toBe("summary.lessons");
    expect(hits[0]?.excerpt).toContain(PHRASE.reviewSection);
  });

  it("finds a Diary entry by its body, under an explicit query only", async () => {
    const entry = await makeDiaryRepository(makeContext(WS)).create({
      entryType: "reflection",
      title: "Recall diary one",
      body: `A ${PHRASE.diaryBody} afternoon.`,
    });
    const repo = createDiaryRepository(env.DB, makeContext(WS));
    const hits = await repo.search({ text: PHRASE.diaryBody });
    expect(hits.map((hit) => hit.id)).toEqual([entry.id]);
    expect(hits[0]?.matchSource).toBe("body");
    expect(hits[0]?.excerpt).toContain(PHRASE.diaryBody);

    // No query, no match — the boundary is solicitation, enforced before SQL.
    expect(await repo.search({ text: "" })).toEqual([]);
    expect(await repo.search({ text: "   " })).toEqual([]);
  });

  /* ---------------------------------------------------------------------- */
  /* 2. One result per record                                                */
  /* ---------------------------------------------------------------------- */

  it("returns one Meeting result when every body source matches, and one when ten items match", async () => {
    const many = Array.from(
      { length: 10 },
      (_, index) => `Item ${index}: the ${PHRASE.everywhere} decision.`,
    );
    const id = await seedMeeting(WS, {
      title: "Recall duplicate meeting",
      agenda: `Agenda mentions ${PHRASE.everywhere}.`,
      notes: `Notes mention ${PHRASE.everywhere}.`,
      items: many,
    });

    const hits = await createMeetingRepository(
      env.DB,
      makeContext(WS),
    ).searchMeetings({ text: PHRASE.everywhere, limit: 50 });
    expect(hits.map((hit) => hit.id)).toEqual([id]);
    // Deterministic precedence within the body sources: agenda, then notes,
    // then a captured item.
    expect(hits[0]?.matchSource).toBe("agenda");
  });

  it("returns one Review result when several sections match", async () => {
    const id = await seedReview(WS, "Recall duplicate review", [
      ["summary.overall", `Overall: ${PHRASE.everywhere}.`],
      ["summary.lessons", `Lessons: ${PHRASE.everywhere}.`],
      ["summary.next_focus", `Next: ${PHRASE.everywhere}.`],
    ]);
    const hits = await createReviewRepository(
      env.DB,
      makeContext(WS),
    ).searchReviews({ text: PHRASE.everywhere, limit: 50 });
    expect(hits.map((hit) => hit.id)).toEqual([id]);
    // `section_id` order is total, so the chosen section is deterministic.
    expect(hits[0]?.sectionId).toBe("summary.lessons");
  });

  it("labels a record by the strongest reason it matched (title > metadata > body)", async () => {
    const id = await seedMeeting(WS, {
      title: `Recall ${PHRASE.everywhere} meeting`,
      agenda: `Agenda also says ${PHRASE.everywhere}.`,
      notes: `Notes also say ${PHRASE.everywhere}.`,
    });
    const hits = await createMeetingRepository(
      env.DB,
      makeContext(WS),
    ).searchMeetings({ text: PHRASE.everywhere });
    expect(hits.map((hit) => hit.id)).toEqual([id]);
    expect(hits[0]?.matchSource).toBe("title");
    // A title hit carries no body excerpt — the reason is already visible.
    expect(hits[0]?.excerpt).toBe("");
  });

  /* ---------------------------------------------------------------------- */
  /* 3. One statement per provider, whatever it matches                      */
  /* ---------------------------------------------------------------------- */

  it("keeps every content-searching provider at ONE statement", async () => {
    await seedMeeting(WS, {
      title: "Counted meeting",
      agenda: `Agenda ${PHRASE.everywhere}`,
      notes: `Notes ${PHRASE.everywhere}`,
      items: [`Item ${PHRASE.everywhere}`],
    });
    await seedTask(WS, "Counted task", `Description ${PHRASE.everywhere}`);
    await seedReview(WS, "Counted review", [
      ["summary.overall", `Overall ${PHRASE.everywhere}`],
    ]);
    await makeDiaryRepository(makeContext(WS)).create({
      entryType: "reflection",
      title: "Counted diary",
      body: `Body ${PHRASE.everywhere}`,
    });
    const note = await makeRepository(makeContext(WS)).create({
      type: "note",
      title: "Counted note",
    });
    await makeNoteDetailsRepository(makeContext(WS)).update(
      note.id,
      `Content ${PHRASE.everywhere}`,
    );

    const counter = countedDb();
    const context = makeContext(WS);
    const cases: ReadonlyArray<readonly [string, () => Promise<unknown>]> = [
      [
        "meetings",
        () =>
          createMeetingRepository(counter.db, context).searchMeetings({
            text: PHRASE.everywhere,
          }),
      ],
      [
        "tasks",
        () =>
          createTaskRepository(counter.db, context).searchTasks({
            text: PHRASE.everywhere,
          }),
      ],
      [
        "reviews",
        () =>
          createReviewRepository(counter.db, context).searchReviews({
            text: PHRASE.everywhere,
          }),
      ],
      [
        "diary",
        () =>
          createDiaryRepository(counter.db, context).search({
            text: PHRASE.everywhere,
          }),
      ],
      [
        "notes",
        () =>
          createNoteRepository(counter.db, context).search({
            text: PHRASE.everywhere,
          }),
      ],
    ];

    for (const [name, run] of cases) {
      counter.reset();
      const hits = (await run()) as readonly unknown[];
      expect(hits.length, `${name} found its body match`).toBeGreaterThan(0);
      expect(counter.count(), `${name} is one statement`).toBe(1);
    }
  });

  it("costs the same for one body match and fifty", async () => {
    for (let index = 0; index < 50; index += 1) {
      await seedTask(
        WS,
        `Bulk task ${String(index).padStart(2, "0")}`,
        `Body carries ${PHRASE.taskDescription} number ${index}.`,
      );
    }
    const counter = countedDb();
    const repo = createTaskRepository(counter.db, makeContext(WS));

    counter.reset();
    const one = await repo.searchTasks({
      text: `${PHRASE.taskDescription} number 7.`,
      limit: 50,
    });
    const oneStatement = counter.count();
    expect(one).toHaveLength(1);

    counter.reset();
    const many = await repo.searchTasks({
      text: PHRASE.taskDescription,
      limit: 50,
    });
    expect(many).toHaveLength(50);
    expect(counter.count()).toBe(oneStatement);
    expect(counter.count()).toBe(1);
  });

  it("costs the same for one matching Meeting and fifty, items and all", async () => {
    for (let index = 0; index < 50; index += 1) {
      await seedMeeting(WS, {
        title: `Bulk meeting ${String(index).padStart(2, "0")}`,
        agenda: "",
        notes: `Notes carry ${PHRASE.meetingNotes} number ${index}.`,
        items: [`Item carries ${PHRASE.meetingItem} number ${index}.`],
      });
    }
    const counter = countedDb();
    const repo = createMeetingRepository(counter.db, makeContext(WS));

    counter.reset();
    await repo.searchMeetings({
      text: `${PHRASE.meetingNotes} number 3.`,
      limit: 50,
    });
    const oneStatement = counter.count();

    counter.reset();
    const many = await repo.searchMeetings({
      text: PHRASE.meetingItem,
      limit: 50,
    });
    expect(many).toHaveLength(50);
    expect(counter.count()).toBe(oneStatement);
    expect(counter.count()).toBe(1);
  });

  it("costs one statement for a Review search however many sections match", async () => {
    for (let index = 0; index < 10; index += 1) {
      await seedReview(
        WS,
        `Bulk review ${index}`,
        [
          ["summary.overall", `Overall ${PHRASE.reviewSection}`],
          ["summary.lessons", `Lessons ${PHRASE.reviewSection}`],
        ],
        index,
      );
    }
    const counter = countedDb();
    const repo = createReviewRepository(counter.db, makeContext(WS));
    counter.reset();
    const hits = await repo.searchReviews({
      text: PHRASE.reviewSection,
      limit: 50,
    });
    expect(hits).toHaveLength(10);
    expect(counter.count()).toBe(1);
  });

  /* ---------------------------------------------------------------------- */
  /* 4. Workspace isolation, at the repository                               */
  /* ---------------------------------------------------------------------- */

  it("never returns hostile matching content from a second workspace", async () => {
    // Every body source, in the OTHER workspace, carrying every phrase.
    await seedMeeting(OTHER, {
      title: "Hostile meeting",
      agenda: `Hostile agenda ${PHRASE.meetingAgenda}`,
      notes: `Hostile notes ${PHRASE.meetingNotes}`,
      items: [`Hostile item ${PHRASE.meetingItem}`],
    });
    await seedTask(
      OTHER,
      "Hostile task",
      `Hostile description ${PHRASE.taskDescription}`,
    );
    await seedReview(OTHER, "Hostile review", [
      ["summary.overall", `Hostile reflection ${PHRASE.reviewSection}`],
    ]);
    await makeDiaryRepository(makeContext(OTHER)).create({
      entryType: "reflection",
      title: "Hostile diary",
      body: `Hostile body ${PHRASE.diaryBody}`,
    });
    const hostileNote = await makeRepository(makeContext(OTHER)).create({
      type: "note",
      title: "Hostile note",
    });
    await makeNoteDetailsRepository(makeContext(OTHER)).update(
      hostileNote.id,
      `Hostile content ${PHRASE.everywhere}`,
    );

    const context = makeContext(WS);
    expect(
      await createMeetingRepository(env.DB, context).searchMeetings({
        text: PHRASE.meetingNotes,
      }),
    ).toEqual([]);
    expect(
      await createMeetingRepository(env.DB, context).searchMeetings({
        text: PHRASE.meetingItem,
      }),
    ).toEqual([]);
    expect(
      await createTaskRepository(env.DB, context).searchTasks({
        text: PHRASE.taskDescription,
      }),
    ).toEqual([]);
    expect(
      await createReviewRepository(env.DB, context).searchReviews({
        text: PHRASE.reviewSection,
      }),
    ).toEqual([]);
    expect(
      await createDiaryRepository(env.DB, context).search({
        text: PHRASE.diaryBody,
      }),
    ).toEqual([]);
    expect(
      await createNoteRepository(env.DB, context).search({
        text: PHRASE.everywhere,
      }),
    ).toEqual([]);
  });

  /* ---------------------------------------------------------------------- */
  /* 5. People free-text notes stay unmatched                                */
  /* ---------------------------------------------------------------------- */

  it("does not match a phrase that exists only in a Person's free-text notes", async () => {
    const people = makePersonRepository(makeContext(WS));
    const person = await people.create({
      title: "Recall person one",
      notes: `A private ${PHRASE.personNotes} observation.`,
    });
    expect(person.notes).toContain(PHRASE.personNotes);

    // The People provider searches through `list({ query })` — the same read the
    // provider uses. A phrase living only in `notes` finds nobody.
    const page = await people.list({
      status: "active",
      query: PHRASE.personNotes,
      limit: 20,
    });
    expect(page.items).toEqual([]);

    // …while the structured fields still work, so this is a boundary rather
    // than a broken search.
    const byName = await people.list({
      status: "active",
      query: "Recall person one",
      limit: 20,
    });
    expect(byName.items.map((item) => item.id)).toEqual([person.id]);
  });

  /* ---------------------------------------------------------------------- */
  /* 6. A large body ships an excerpt, never the record                      */
  /* ---------------------------------------------------------------------- */

  it("cuts the excerpt in SQL, so a 100 KiB body never crosses the repository boundary", async () => {
    // 100 KiB of synthetic filler with the phrase buried in the middle. Nothing
    // in this fixture reads as prose, and nothing below prints it.
    const filler = "wobblegrit ".repeat(5_000);
    const body = `${filler}\n\n## Middle\n\nThe ${PHRASE.everywhere} moment.\n\n${filler}`;
    expect(body.length).toBeGreaterThan(100 * 1024);

    const context = makeContext(WS);
    const meetingId = await seedMeeting(WS, {
      title: "Large body meeting",
      agenda: "",
      notes: body,
    });
    const taskId = await seedTask(WS, "Large body task", body);
    const entry = await makeDiaryRepository(context).create({
      entryType: "reflection",
      title: "Large body diary",
      body,
    });

    const meetingHits = await createMeetingRepository(
      env.DB,
      context,
    ).searchMeetings({ text: PHRASE.everywhere });
    const taskHits = await createTaskRepository(env.DB, context).searchTasks({
      text: PHRASE.everywhere,
    });
    const diaryHits = await createDiaryRepository(env.DB, context).search({
      text: PHRASE.everywhere,
    });

    expect(meetingHits.map((hit) => hit.id)).toEqual([meetingId]);
    expect(taskHits.map((hit) => hit.id)).toEqual([taskId]);
    expect(diaryHits.map((hit) => hit.id)).toEqual([entry.id]);

    for (const [name, excerpt] of [
      ["meeting", meetingHits[0]?.excerpt ?? ""],
      ["task", taskHits[0]?.excerpt ?? ""],
      ["diary", diaryHits[0]?.excerpt ?? ""],
    ] as const) {
      // Bounded well inside the shared display limit, and centred on the match.
      expect(excerpt.length, `${name} excerpt is bounded`).toBeLessThanOrEqual(
        200,
      );
      expect(excerpt.includes(PHRASE.everywhere), `${name} excerpt`).toBe(true);
      // Markdown syntax stripped: no heading marker survives the analyser.
      expect(excerpt.includes("##"), `${name} excerpt syntax`).toBe(false);
    }

    /*
     * The payload proof. The excerpt is cut BEFORE the body crosses the
     * repository boundary, so the whole serialised result set is orders of
     * magnitude smaller than one body. Compared as LENGTHS and booleans — a
     * failure message here can never dump a record body.
     */
    const payload = JSON.stringify({ meetingHits, taskHits, diaryHits });
    expect(payload.length).toBeLessThan(4_000);
    expect(payload.length * 25).toBeLessThan(body.length);
    expect(payload.includes(filler.slice(0, 200))).toBe(false);

    /*
     * And the stronger claim, at the boundary itself: nothing the DATABASE
     * returned was ever bigger than one excerpt window. This is what
     * distinguishes "the excerpt was cut in SQL" from "the excerpt was cut in
     * JavaScript after the body arrived" — the latter passes the payload check
     * above and fails here.
     */
    const watcher = boundedRowDb();
    const watched: ReadonlyArray<() => Promise<unknown>> = [
      () =>
        createMeetingRepository(watcher.db, context).searchMeetings({
          text: PHRASE.everywhere,
        }),
      () =>
        createTaskRepository(watcher.db, context).searchTasks({
          text: PHRASE.everywhere,
        }),
      () =>
        createDiaryRepository(watcher.db, context).search({
          text: PHRASE.everywhere,
        }),
    ];
    for (const run of watched) {
      watcher.reset();
      await run();
      // One window (400) plus room for the row's short fields. Orders of
      // magnitude below the 100 KiB body, and reported as a NUMBER — a failure
      // here prints a length, never a record.
      expect(watcher.longestValue()).toBeLessThan(1_000);
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Bounded inputs still degrade rather than fail the statement             */
  /* ---------------------------------------------------------------------- */

  /* ---------------------------------------------------------------------- */
  /* The bounded needle: one prefix, used by every part of the statement     */
  /* ---------------------------------------------------------------------- */

  it("labels and excerpts an over-long query's body hit honestly, not as a title match", async () => {
    /*
     * D1 caps a LIKE pattern at 50 bytes, so a longer query DEGRADES to
     * matching its opening characters — documented and intended. What is not
     * intended is the statement disagreeing with itself: bind the whole query to
     * the excerpt `instr()` beside a bounded `LIKE` and the row is admitted by
     * the prefix but reported as having no body hit, so a body match comes back
     * mislabelled "Title" with no excerpt and nothing to highlight. Raised by
     * review on PR #243; `likeContainsNeedle` is the fix, and this is the proof.
     *
     * 48 bytes is the contains-pattern budget (50 minus the two `%` wrappers),
     * so the prefix below is exactly what the LIKE will match on and the four
     * trailing characters are exactly what it must not require.
     */
    const prefix = "quibnarp".repeat(6);
    expect(prefix.length).toBe(48);
    const query = `${prefix}zzzz`;

    const context = makeContext(WS);
    const taskId = await seedTask(
      WS,
      "Bounded needle task",
      `Description carrying ${prefix} and nothing after it.`,
    );
    const meetingId = await seedMeeting(WS, {
      title: "Bounded needle meeting",
      agenda: "",
      notes: `Notes carrying ${prefix} and nothing after it.`,
    });
    const entry = await makeDiaryRepository(context).create({
      entryType: "reflection",
      title: "Bounded needle diary",
      body: `Body carrying ${prefix} and nothing after it.`,
    });

    const taskHits = await createTaskRepository(env.DB, context).searchTasks({
      text: query,
    });
    expect(taskHits.map((hit) => hit.id)).toEqual([taskId]);
    expect(taskHits[0]?.matchSource).toBe("description");
    expect(taskHits[0]?.excerpt).toContain(prefix);

    const meetingHits = await createMeetingRepository(
      env.DB,
      context,
    ).searchMeetings({ text: query });
    expect(meetingHits.map((hit) => hit.id)).toEqual([meetingId]);
    expect(meetingHits[0]?.matchSource).toBe("notes");
    expect(meetingHits[0]?.excerpt).toContain(prefix);

    const diaryHits = await createDiaryRepository(env.DB, context).search({
      text: query,
    });
    expect(diaryHits.map((hit) => hit.id)).toEqual([entry.id]);
    expect(diaryHits[0]?.matchSource).toBe("body");
    expect(diaryHits[0]?.excerpt).toContain(prefix);
  });

  it("bounds an over-long query on every content provider rather than erroring", async () => {
    const context = makeContext(WS);
    // Well past D1's 50-byte LIKE-pattern cap, which fails the WHOLE statement
    // when a repository binds an unbounded needle. `like-pattern.ts` truncates
    // instead, so every provider degrades to a bounded match.
    const long = "x".repeat(100);
    await expect(
      createMeetingRepository(env.DB, context).searchMeetings({ text: long }),
    ).resolves.toEqual([]);
    await expect(
      createTaskRepository(env.DB, context).searchTasks({ text: long }),
    ).resolves.toEqual([]);
    await expect(
      createReviewRepository(env.DB, context).searchReviews({ text: long }),
    ).resolves.toEqual([]);
    await expect(
      createDiaryRepository(env.DB, context).search({ text: long }),
    ).resolves.toEqual([]);
  });
});
