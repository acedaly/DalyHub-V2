import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as indexLoader } from "~/modules/diary/routes/index";
import { action as newAction } from "~/modules/diary/routes/new";
import { loader as entryLoader } from "~/modules/diary/routes/entry";
import { action as mutateAction } from "~/modules/diary/routes/mutate";
import type { CreateDiaryEntryResult } from "~/modules/diary/routes/new";
import type { DiaryMutationResult } from "~/modules/diary/routes/mutate";
import type { DiaryEntryEditResponse } from "~/modules/diary/routes/entry";

import { env } from "cloudflare:test";

import {
  FakeClock,
  countDiaryEntryRows,
  makeContext,
  makeDiaryRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

/**
 * DIARY-01 — the Diary routes over the real Worker/D1 runtime: workspace
 * isolation, capture through the RESERVED repository (never a bare entity),
 * exact persistence, default occurred/manual source, backdated ordering, the
 * title-vs-detail edit split, fail-closed access control, bounded cursor
 * pagination, filter/cursor scope binding, idempotent updates and the privacy
 * invariant that body content never reaches an Activity payload.
 */

const WS = "test-default-workspace";
const OTHER = "ws_diary_route_other";

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

type IndexResult = Awaited<ReturnType<typeof indexLoader>>;

async function runIndex(search = ""): Promise<IndexResult> {
  return indexLoader({
    request: new Request(`https://app.test/diary${search}`),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof indexLoader>[0]);
}

async function runNew(form: FormData, method = "POST"): Promise<Response> {
  return newAction({
    request: new Request("https://app.test/diary/new", {
      method,
      body: method === "POST" ? form : undefined,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof newAction>[0]);
}

async function capture(fields: Record<string, string>): Promise<string> {
  const response = await runNew(formData(fields));
  const data = (await response.json()) as CreateDiaryEntryResult;
  if (!data.ok) throw new Error(`capture failed: ${JSON.stringify(data)}`);
  return data.entryId;
}

async function runEntry(entryId: string): Promise<Response> {
  return entryLoader({
    request: new Request(`https://app.test/diary/${entryId}`),
    context: authedContext(),
    params: { entryId },
  } as unknown as Parameters<typeof entryLoader>[0]);
}

async function runMutate(entryId: string, form: FormData): Promise<Response> {
  return mutateAction({
    request: new Request(`https://app.test/diary/${entryId}/mutate`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { entryId },
  } as unknown as Parameters<typeof mutateAction>[0]);
}

/** Every serialized entry across the index loader's day groups, in order. */
function flatEntries(result: IndexResult) {
  return result.groups.flatMap((group) => group.entries);
}

async function activityPayloads(): Promise<string[]> {
  const rows = await env.DB.prepare(
    "SELECT payload_json FROM activities WHERE workspace_id = ?",
  )
    .bind(WS)
    .all<{ payload_json: string }>();
  return rows.results.map((row) => row.payload_json);
}

async function countUpdatedEvents(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ? AND type = 'diary_entry.updated'",
  )
    .bind(WS)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

describe("DIARY-01 capture route", () => {
  it("captures through the reserved DiaryRepository (a detail row, never a bare entity)", async () => {
    expect(await countDiaryEntryRows()).toBe(0);
    const id = await capture({ entryType: "meeting", title: "Kickoff" });

    // A detail row exists (the create went through diary.create, not a bare
    // entities.create — which the generic repository refuses for `diary`).
    expect(await countDiaryEntryRows()).toBe(1);
    const stored = await makeDiaryRepository(makeContext(WS)).get(id);
    expect(stored).not.toBeNull();
    expect(stored?.entryType).toBe("meeting");
  });

  it("persists title, body, type and timezone exactly", async () => {
    const id = await capture({
      entryType: "decision",
      title: "Chose the plan",
      body: "# Why\n\nBecause **it fits**.",
      when: "2026-07-19T14:30",
    });
    const stored = await makeDiaryRepository(makeContext(WS)).get(id);
    expect(stored?.title).toBe("Chose the plan");
    expect(stored?.entryType).toBe("decision");
    expect(stored?.body).toBe("# Why\n\nBecause **it fits**.");
    expect(stored?.timezone).toBe("Australia/Sydney");
    // 14:30 Sydney (winter, +10) is 04:30 UTC.
    expect(stored?.occurredAt.toISOString()).toBe("2026-07-19T04:30:00.000Z");
  });

  it("defaults occurredAt to now and the source channel to manual", async () => {
    const before = Date.now();
    const id = await capture({ entryType: "note", title: "Just now" });
    const stored = await makeDiaryRepository(makeContext(WS)).get(id);
    expect(stored?.source.channel).toBe("manual");
    expect(stored?.source.reference).toBeNull();
    const occurred = stored?.occurredAt.getTime() ?? 0;
    expect(occurred).toBeGreaterThanOrEqual(before - 1000);
    expect(occurred).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("rejects an invalid entry type as a field error, keeping the draft path", async () => {
    const response = await runNew(
      formData({ entryType: "Not A Type!", title: "x" }),
    );
    const data = (await response.json()) as CreateDiaryEntryResult;
    expect(data.ok).toBe(false);
    if (!data.ok) expect(data.fieldErrors?.entryType).toBeTruthy();
  });

  it("rejects a non-POST method", async () => {
    await expect(runNew(new FormData(), "GET")).rejects.toMatchObject({
      status: 405,
    });
  });

  it("never writes body content into an Activity payload", async () => {
    await capture({
      entryType: "reflection",
      title: "Private thought",
      body: "SECRET_BODY_ToKeN_9f2",
    });
    const payloads = await activityPayloads();
    expect(payloads.length).toBeGreaterThan(0);
    for (const payload of payloads) {
      expect(payload).not.toContain("SECRET_BODY_ToKeN_9f2");
    }
  });
});

describe("DIARY-01 timeline loader", () => {
  it("returns only the active workspace's entries (isolation)", async () => {
    await capture({ entryType: "note", title: "Mine" });
    // Seed a DIFFERENT workspace directly; it must never appear.
    await makeDiaryRepository(makeContext(OTHER), {
      clock: new FakeClock("2026-07-24T00:00:00.000Z").now,
      idGenerator: sequentialIds("other"),
    }).create({ entryType: "note", title: "Theirs" });

    const result = await runIndex();
    const titles = flatEntries(result).map((entry) => entry.title);
    expect(titles).toContain("Mine");
    expect(titles).not.toContain("Theirs");
  });

  it("orders a backdated entry after more recent ones (occurred_at ordering)", async () => {
    await capture({
      entryType: "note",
      title: "Recent",
      when: "2026-07-20T10:00",
    });
    await capture({
      entryType: "note",
      title: "Backdated",
      when: "2026-07-10T10:00",
    });
    const result = await runIndex();
    const titles = flatEntries(result).map((entry) => entry.title);
    expect(titles.indexOf("Recent")).toBeLessThan(titles.indexOf("Backdated"));
  });

  it("paginates with a bounded cursor and binds the cursor to the filter scope", async () => {
    // Seed 30 entries directly (fast) at distinct instants.
    const repo = makeDiaryRepository(makeContext(WS), {
      clock: new FakeClock("2026-07-24T00:00:00.000Z").now,
      idGenerator: sequentialIds("seed"),
    });
    for (let index = 0; index < 30; index += 1) {
      const day = String(index + 1).padStart(2, "0");
      await repo.create({
        entryType: "note",
        title: `Entry ${index}`,
        occurredAt: new Date(`2026-05-${day}T00:00:00.000Z`),
      });
    }

    const first = await runIndex();
    expect(flatEntries(first).length).toBe(25); // the bounded page size
    expect(first.nextCursor).not.toBeNull();

    const second = await runIndex(
      `?cursor=${encodeURIComponent(first.nextCursor as string)}`,
    );
    expect(flatEntries(second).length).toBe(5);
    expect(second.failed).toBe(false);

    // A cursor issued for the unfiltered scope is rejected calmly when reused
    // under a different (type-filtered) scope — never silently reinterpreted.
    const mismatched = await runIndex(
      `?type=meeting&cursor=${encodeURIComponent(first.nextCursor as string)}`,
    );
    expect(mismatched.failed).toBe(true);
  });

  it("filters by entry type", async () => {
    await capture({ entryType: "meeting", title: "A meeting" });
    await capture({ entryType: "idea", title: "An idea" });

    const result = await runIndex("?type=meeting");
    const titles = flatEntries(result).map((entry) => entry.title);
    expect(titles).toContain("A meeting");
    expect(titles).not.toContain("An idea");
    expect(result.isFiltered).toBe(true);
    expect(result.activeTypes).toEqual(["meeting"]);
  });
});

describe("DIARY-01 edit route", () => {
  it("routes a title change to the entity and a detail change to the diary repo", async () => {
    const id = await capture({
      entryType: "note",
      title: "Original",
      when: "2026-07-19T14:30",
    });

    const response = await runMutate(
      id,
      formData({
        title: "Renamed",
        entryType: "decision",
        body: "New body.",
        when: "2026-07-19T15:00",
      }),
    );
    const data = (await response.json()) as DiaryMutationResult;
    expect(data.ok).toBe(true);

    const stored = await makeDiaryRepository(makeContext(WS)).get(id);
    expect(stored?.title).toBe("Renamed"); // via EntityRepository.update
    expect(stored?.entryType).toBe("decision"); // via DiaryRepository.update
    expect(stored?.body).toBe("New body.");
    expect(stored?.occurredAt.toISOString()).toBe("2026-07-19T05:00:00.000Z");
  });

  it("appends no diary_entry.updated event for an unchanged edit", async () => {
    const id = await capture({
      entryType: "note",
      title: "Same",
      body: "Body",
      when: "2026-07-19T14:30",
    });
    expect(await countUpdatedEvents()).toBe(0);

    // Re-submit the identical values: title unchanged and detail unchanged.
    const response = await runMutate(
      id,
      formData({
        title: "Same",
        entryType: "note",
        body: "Body",
        when: "2026-07-19T14:30",
      }),
    );
    expect(((await response.json()) as DiaryMutationResult).ok).toBe(true);
    expect(await countUpdatedEvents()).toBe(0);
  });

  it("loads an entry for the editor and fails closed for bad ids", async () => {
    const id = await capture({ entryType: "note", title: "Editable" });
    const ok = (await (await runEntry(id)).json()) as DiaryEntryEditResponse;
    expect(ok.entry.title).toBe("Editable");
    expect(ok.entry.occurredLocal).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

    // A wrong-type id (a Note) fails closed with 404.
    const note = await makeRepository(makeContext(WS)).create({
      type: "note",
      title: "Not a diary",
    });
    await expect(runEntry(note.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      runMutate(
        note.id,
        formData({ title: "x", entryType: "note", when: "2026-07-19T14:30" }),
      ),
    ).rejects.toMatchObject({ status: 404 });

    // A missing id fails closed too.
    await expect(runEntry("does-not-exist")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("fails closed for a cross-workspace id", async () => {
    const foreign = await makeDiaryRepository(makeContext(OTHER)).create({
      entryType: "note",
      title: "Theirs",
    });
    await expect(runEntry(foreign.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      runMutate(
        foreign.id,
        formData({ title: "x", entryType: "note", when: "2026-07-19T14:30" }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("fails closed for a soft-deleted entry", async () => {
    const id = await capture({ entryType: "note", title: "To delete" });
    await makeRepository(makeContext(WS)).softDelete(id);
    await expect(runEntry(id)).rejects.toMatchObject({ status: 404 });
  });
});
