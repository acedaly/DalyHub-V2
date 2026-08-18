/**
 * HABITS-01 — the trusted Habit boundaries, exercised as the surfaces use them.
 *
 * `/habits/create`, `/habits/:id/mutate` and `/habits/:id/check-in` are the ONLY
 * ways a Habit changes. Today, the collection and the record all post to them,
 * so what matters is that the ACTIONS are right for every shape a browser can
 * produce, and that no browser-supplied value can widen them:
 *
 *   - a name and a cadence alone is a valid Habit;
 *   - an invalid cadence is refused and writes NOTHING;
 *   - a check-in is idempotent, undoable, and refused for the future or for an
 *     archived Habit — with an honest message rather than a silent success;
 *   - a schedule change is VERSIONED from today;
 *   - workspace and actor come from the authenticated session, never the form.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { setAuthenticatedSession } from "~/platform/request";
import { action as createAction } from "~/modules/habits/routes/create";
import type { CreateHabitResult } from "~/modules/habits/routes/create";
import { action as checkInAction } from "~/modules/habits/routes/check-in";
import type { HabitCheckInResponse } from "~/modules/habits/routes/check-in";
import { action as mutateAction } from "~/modules/habits/routes/mutate";
import type { HabitMutationResult } from "~/modules/habits/routes/mutate";

import {
  countHabitCompletionRows,
  makeContext,
  makeHabitRepository,
  resetTables,
} from "./support";

const WS = "test-default-workspace";

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  const session: AuthenticatedSession = {
    user: {
      subject: "owner-subject",
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  setAuthenticatedSession(context, session);
  return context;
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function create(
  entries: Record<string, string>,
): Promise<CreateHabitResult> {
  const response = (await createAction({
    request: new Request("https://app.test/habits/create", {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof createAction>[0])) as Response;
  return (await response.json()) as CreateHabitResult;
}

async function checkIn(
  habitId: string,
  entries: Record<string, string>,
): Promise<{ status: number; body: HabitCheckInResponse }> {
  const response = (await checkInAction({
    request: new Request("https://app.test/habits/x/check-in", {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: { habitId },
  } as unknown as Parameters<typeof checkInAction>[0])) as Response;
  return {
    status: response.status,
    body: (await response.json()) as HabitCheckInResponse,
  };
}

async function mutate(
  habitId: string,
  entries: Record<string, string>,
): Promise<HabitMutationResult> {
  const response = (await mutateAction({
    request: new Request("https://app.test/habits/x/mutate", {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: { habitId },
  } as unknown as Parameters<typeof mutateAction>[0])) as Response;
  return (await response.json()) as HabitMutationResult;
}

function habits() {
  return makeHabitRepository(makeContext(WS));
}

/** The owner's calendar day, as the actions resolve it. */
/**
 * The OWNER's today, which is the day the route actually uses.
 *
 * Not UTC. The check-in route resolves "today" in the owner's timezone, and the
 * product's default is `Australia/Sydney` — ten hours ahead — so a UTC answer
 * here disagrees with the route for the ten hours of every day between 14:00 UTC
 * and midnight. Reading the same constant the product reads keeps the two in
 * lockstep instead of agreeing only during Sydney's afternoon.
 */
function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: DEFAULT_OWNER_TIME_ZONE,
  }).format(new Date());
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("POST /habits/create", () => {
  it("creates from a name and a cadence alone", async () => {
    const result = await create({ title: "Read", scheduleKind: "daily" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const habit = await habits().get(result.habitId);
    expect(habit?.title).toBe("Read");
    expect(habit?.schedule).toEqual({ kind: "daily" });
  });

  it("accepts selected weekdays and normalises them", async () => {
    const result = await create({
      title: "Strength training",
      scheduleKind: "weekdays",
      weekdays: "5,1,3",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const habit = await habits().get(result.habitId);
    expect(habit?.schedule).toEqual({ kind: "weekdays", weekdays: [1, 3, 5] });
  });

  it("accepts a weekly count", async () => {
    const result = await create({
      title: "Long walk",
      scheduleKind: "weekly_count",
      timesPerWeek: "2",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const habit = await habits().get(result.habitId);
    expect(habit?.schedule).toEqual({ kind: "weekly_count", timesPerWeek: 2 });
  });

  it("REFUSES a cadence outside the vocabulary, and writes nothing", async () => {
    const result = await create({ title: "Monthly", scheduleKind: "monthly" });
    expect(result.ok).toBe(false);
    expect((await habits().list({ status: "all" })).items).toEqual([]);
  });

  it("REFUSES an empty weekday list", async () => {
    const result = await create({
      title: "Nothing",
      scheduleKind: "weekdays",
      weekdays: "",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.fieldErrors?.weekdays).toMatch(/at least one day/);
  });

  it("rejects a non-POST request", async () => {
    await expect(
      createAction({
        request: new Request("https://app.test/habits/create"),
        context: authedContext(),
        params: {},
      } as unknown as Parameters<typeof createAction>[0]),
    ).rejects.toBeInstanceOf(Response);
  });
});

describe("POST /habits/:id/check-in", () => {
  it("records, is idempotent, and undoes — through ONE endpoint", async () => {
    const created = await create({ title: "Read", scheduleKind: "daily" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.habitId;
    const today = todayIso();

    const first = await checkIn(id, { intent: "check_in", date: today });
    expect(first.body).toMatchObject({ ok: true, outcome: "recorded" });

    const second = await checkIn(id, { intent: "check_in", date: today });
    expect(second.body).toMatchObject({
      ok: true,
      outcome: "already_recorded",
      changed: false,
    });
    expect(await countHabitCompletionRows()).toBe(1);

    const undone = await checkIn(id, { intent: "undo", date: today });
    expect(undone.body).toMatchObject({ ok: true, outcome: "removed" });
    expect(await countHabitCompletionRows()).toBe(0);
  });

  it("defaults to the OWNER's today when the client sends no date", async () => {
    const created = await create({ title: "Read", scheduleKind: "daily" });
    if (!created.ok) return;
    const result = await checkIn(created.habitId, { intent: "check_in" });
    expect(result.body).toMatchObject({ ok: true, date: todayIso() });
  });

  it("REFUSES a future date, and says so", async () => {
    const created = await create({ title: "Read", scheduleKind: "daily" });
    if (!created.ok) return;
    const result = await checkIn(created.habitId, {
      intent: "check_in",
      date: "2099-01-01",
    });
    expect(result.status).toBe(400);
    expect(result.body.ok).toBe(false);
    if (result.body.ok) return;
    expect(result.body.message).toMatch(/today or an earlier day/);
    expect(await countHabitCompletionRows()).toBe(0);
  });

  it("REFUSES a check-in against an archived Habit, honestly", async () => {
    const created = await create({
      title: "Cold shower",
      scheduleKind: "daily",
    });
    if (!created.ok) return;
    await mutate(created.habitId, { intent: "archive" });
    const result = await checkIn(created.habitId, { intent: "check_in" });
    expect(result.status).toBe(409);
    expect(result.body.ok).toBe(false);
    expect(await countHabitCompletionRows()).toBe(0);
  });

  it("is a 404 for a Habit that does not exist", async () => {
    const result = await checkIn("nope", { intent: "check_in" });
    expect(result.status).toBe(404);
  });
});

describe("POST /habits/:id/mutate", () => {
  it("renames, updates and versions the schedule", async () => {
    const created = await create({ title: "Read", scheduleKind: "daily" });
    if (!created.ok) return;
    const id = created.habitId;

    expect(await mutate(id, { intent: "rename", title: "Read daily" })).toEqual(
      { kind: "rename", ok: true },
    );
    expect(
      await mutate(id, { intent: "update", notes: "Twenty pages." }),
    ).toEqual({ kind: "update", ok: true });

    const scheduled = await mutate(id, {
      intent: "set_schedule",
      scheduleKind: "weekdays",
      weekdays: "1,3,5",
    });
    expect(scheduled).toMatchObject({ kind: "set_schedule", ok: true });

    const habit = await habits().get(id);
    expect(habit?.title).toBe("Read daily");
    expect(habit?.notes).toBe("Twenty pages.");
    expect(habit?.schedule).toEqual({ kind: "weekdays", weekdays: [1, 3, 5] });
    // The cadence was set today, so today's version is amended rather than
    // stacked — the chain stays contiguous and holds no zero-length entries.
    expect(habit?.versions).toHaveLength(1);
  });

  it("refuses an unknown intent rather than guessing", async () => {
    const created = await create({ title: "Read", scheduleKind: "daily" });
    if (!created.ok) return;
    expect(await mutate(created.habitId, { intent: "explode" })).toEqual({
      kind: "unknown",
      ok: false,
    });
  });

  it("archives and restores", async () => {
    const created = await create({ title: "Read", scheduleKind: "daily" });
    if (!created.ok) return;
    expect(await mutate(created.habitId, { intent: "archive" })).toEqual({
      kind: "archive",
      ok: true,
    });
    expect((await habits().get(created.habitId))?.archivedAt).not.toBeNull();
    expect(await mutate(created.habitId, { intent: "restore" })).toEqual({
      kind: "restore",
      ok: true,
    });
    expect((await habits().get(created.habitId))?.archivedAt).toBeNull();
  });
});
