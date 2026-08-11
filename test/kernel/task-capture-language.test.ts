/**
 * TASKS-11 — the parsed sentence, all the way to storage and back out again.
 *
 * The unit suite proves what `Service Hilux every 6 months after completion` MEANS.
 * This file proves the far more important thing: that the meaning survives the trip
 * through the real create route, the real repository and real D1, and that the record
 * it produces is the SAME record the recurrence editor produces — not a parallel one.
 *
 * Five claims, each against real storage:
 *
 *   1. a capture typed into an ordinary surface persists a TASKS-07 recurrence row
 *      with the after-completion mode;
 *   2. that row is STRUCTURALLY IDENTICAL to one authored through the editor's own
 *      translation layer (`recurrence-authoring.ts`) — same columns, same values;
 *   3. completing it produces the successor the TASKS-07 engine computes, from the
 *      COMPLETION day, with no recurrence arithmetic anywhere in the parser;
 *   4. a fixed-schedule phrase still persists a fixed schedule and still lands back
 *      on its grid when finished late;
 *   5. `POST /api/capture` produces the same Task from the same sentence, in the
 *      OWNER's timezone, with no capture-specific recurrence field.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { action as taskCreateAction } from "~/modules/tasks/routes/new";
import { action as taskDetailAction } from "~/modules/tasks/routes/task-detail";
import { action as captureAction } from "~/routes/api-capture";
import type { TasksCreateResult } from "~/modules/tasks/tasks-contract";
import {
  captureTokenFingerprint,
  generateCaptureToken,
  hashCaptureToken,
} from "~/kernel/capture";
import {
  applyRecurrenceFields,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";
import {
  recurrenceFormFields,
  ruleFromDraft,
  type RecurrenceDraft,
} from "~/shared/task-record/recurrence-authoring";

import {
  FakeClock,
  makeAppPreferencesRepository,
  makeContext,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

/** The capture route resolves the deployment's default workspace, so both paths share it. */
const WS = "test-default-workspace";
const OWNER_SUBJECT = "owner-subject";

/** The owner's calendar day every UI capture in this file is read against. */
const TODAY = "2026-08-13";

const nextEntityId = sequentialIds("t11");
const nextActivityId = sequentialIds("t11act");

function taskRepo(at = "2026-08-13T09:00:00.000Z") {
  return makeTaskRepository(makeContext(WS), {
    clock: new FakeClock(at).now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  });
}

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: {
      subject: OWNER_SUBJECT,
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

/**
 * Capture a line exactly as an ordinary DalyHub surface does: ONE call to the shared
 * parser, the shared recurrence mapping, and a POST to the canonical `/tasks/new`
 * resource route. Nothing here knows anything about recurrence that
 * `TasksQuickAdd`, the capture Drawer and `/tasks/new`'s form do not.
 */
async function captureThroughUi(
  text: string,
  todayIso = TODAY,
): Promise<TasksCreateResult> {
  const interpretation = parseQuickCapture(text, { todayIso });
  const body = new FormData();
  body.set("intent", "create");
  body.set("title", interpretation.title);
  if (interpretation.priority) body.set("priority", interpretation.priority);
  if (interpretation.timeSector) {
    body.set("timeSector", interpretation.timeSector);
  }
  if (interpretation.scheduledDate) {
    body.set("scheduledDate", interpretation.scheduledDate);
  }
  if (interpretation.dueDate) body.set("dueDate", interpretation.dueDate);
  applyRecurrenceFields(body, interpretation.recurrence, {
    scheduledDate: interpretation.scheduledDate,
    dueDate: interpretation.dueDate,
  });

  const response = (await taskCreateAction({
    request: new Request("https://app.test/tasks/new", {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof taskCreateAction>[0])) as Response;
  return (await response.json()) as TasksCreateResult;
}

/** Author a rule the way the shared recurrence EDITOR does, over the canonical route. */
async function authorThroughEditor(
  taskId: string,
  draft: RecurrenceDraft,
): Promise<void> {
  const rule = ruleFromDraft(draft);
  expect(rule).not.toBeUndefined();
  const fields = recurrenceFormFields(rule ?? null);
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const response = (await taskDetailAction({
    request: new Request(`https://app.test/tasks/${taskId}`, {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof taskDetailAction>[0])) as Response;
  expect(await response.json()).toMatchObject({ status: "success" });
}

/** The stored rule, straight from D1 — the representation, not a projection of it. */
async function storedRule(taskId: string) {
  return await env.DB.prepare(
    `SELECT frequency, interval, date_kind, mode, weekdays, anchor_day, anchor_month,
            sequence
       FROM task_recurrence_rules
      WHERE workspace_id = ? AND entity_id = ?`,
  )
    .bind(WS, taskId)
    .first<{
      readonly frequency: string;
      readonly interval: number;
      readonly date_kind: string;
      readonly mode: string;
      readonly weekdays: string | null;
      readonly anchor_day: number | null;
      readonly anchor_month: number | null;
      readonly sequence: number;
    }>();
}

/** Mint a capture credential the way the Settings endpoint does. */
async function seedToken(
  options: { readonly ownerSubject?: string } = {},
): Promise<string> {
  const token = generateCaptureToken();
  const tokenHash = await hashCaptureToken(token);
  await env.DB.prepare(
    `INSERT INTO capture_tokens
       (id, workspace_id, owner_subject, name, token_hash, fingerprint,
        capabilities, source, created_at, last_used_at, expires_at, revoked_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, NULL, NULL, NULL)`,
  )
    .bind(
      crypto.randomUUID(),
      WS,
      options.ownerSubject ?? OWNER_SUBJECT,
      "Test iPhone",
      tokenHash,
      captureTokenFingerprint(tokenHash),
      "task,note",
      new Date("2026-08-13T00:00:00.000Z").toISOString(),
    )
    .run();
  return token;
}

async function captureThroughApi(
  token: string,
  text: string,
): Promise<{ readonly id: string; readonly title: string }> {
  const response = (await captureAction({
    request: new Request("https://hub.daly.id.au/api/capture", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind: "task", text, source: "ios-shortcut" }),
    }),
    context: undefined as never,
    params: {},
  } as unknown as Parameters<typeof captureAction>[0])) as Response;
  const body = (await response.json()) as {
    readonly ok: boolean;
    readonly capture: { readonly id: string; readonly title: string };
  };
  expect(body.ok).toBe(true);
  return body.capture;
}

/** The owner's calendar day for a timezone, computed the way the platform does. */
function ownerDay(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("TASKS-11 — a captured sentence becomes a TASKS-07 rule", () => {
  it("persists the after-completion rule through the canonical create route", async () => {
    const result = await captureThroughUi(
      "Service Hilux every 6 months after completion",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const task = await taskRepo().getTask(result.taskId);
    expect(task?.title).toBe("Service Hilux");
    expect(task?.scheduledDate).toBe(TODAY);
    // Read back through the ordinary projection every Task view uses.
    expect(task?.recurrence).toMatchObject({
      frequency: "month",
      interval: 6,
      mode: "after_completion",
      dateKind: "scheduled",
      weekdays: [],
    });
    // And in storage: ONE row in the existing table, no capture-owned representation.
    expect(await storedRule(result.taskId)).toMatchObject({
      frequency: "month",
      interval: 6,
      date_kind: "scheduled",
      mode: "after_completion",
      sequence: 0,
    });
  });

  it("produces a rule structurally identical to one authored in the editor", async () => {
    const captured = await captureThroughUi(
      "Service Hilux every 6 months after completion",
    );
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;

    // The same Task, the same date, authored the OTHER way: the shared recurrence
    // editor's own draft → rule → form-field translation, over the canonical
    // `set_recurrence` mutation.
    const manual = await captureThroughUi("Service Hilux today");
    expect(manual.ok).toBe(true);
    if (!manual.ok) return;
    expect((await taskRepo().getTask(manual.taskId))?.scheduledDate).toBe(
      TODAY,
    );
    await authorThroughEditor(manual.taskId, {
      preset: "custom",
      unit: "month",
      interval: "6",
      weekdays: [],
      mode: "after_completion",
      dateKind: "scheduled",
    });

    const fromCapture = await storedRule(captured.taskId);
    const fromEditor = await storedRule(manual.taskId);
    // Every column that DESCRIBES the rule, compared directly. `series_id` and the
    // timestamps are per-record identity, not rule shape, so they are not in the SELECT.
    expect(fromCapture).toEqual(fromEditor);
  });

  it("completes into the successor the TASKS-07 engine computes, from the completion day", async () => {
    const result = await captureThroughUi(
      "Service Hilux every 6 months after completion",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Finished five days after it was captured. An after-completion interval measures
    // from THAT day: 18 August + 6 months.
    const completion = await taskRepo("2026-08-18T09:00:00.000Z").completeTask(
      result.taskId,
      { ownerTodayIso: "2026-08-18" },
    );
    expect(completion.successor?.scheduledDate).toBe("2027-02-18");
    expect(completion.successor?.title).toBe("Service Hilux");
    // The mode travels with the series, so the routine keeps meaning what it meant.
    expect((await storedRule(completion.successor!.id))?.mode).toBe(
      "after_completion",
    );
  });
});

describe("TASKS-11 — a fixed schedule stays a fixed schedule", () => {
  it("keeps an ordinary repeat on the grid when it is finished late", async () => {
    const result = await captureThroughUi("Pay rent tomorrow every month");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const task = await taskRepo().getTask(result.taskId);
    expect(task?.title).toBe("Pay rent");
    expect(task?.scheduledDate).toBe("2026-08-14");
    expect(task?.recurrence?.mode).toBe("fixed");

    // Finished four days late. A FIXED schedule returns to its own slot (14 September),
    // never to completion + one month (18 September).
    const completion = await taskRepo("2026-08-18T09:00:00.000Z").completeTask(
      result.taskId,
      { ownerTodayIso: "2026-08-18" },
    );
    expect(completion.successor?.scheduledDate).toBe("2026-09-14");
    expect((await storedRule(completion.successor!.id))?.mode).toBe("fixed");
  });

  it("invents no anchor for a fixed repeat the capture gave no date", async () => {
    // "Pay rent every month" names no date, so the rule is DROPPED rather than pinned
    // to an arbitrary day of the month. The Task is still created, with its words.
    const result = await captureThroughUi("Pay rent every month");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const task = await taskRepo().getTask(result.taskId);
    expect(task?.title).toBe("Pay rent");
    expect(task?.scheduledDate).toBeNull();
    expect(task?.recurrence).toBeNull();
    expect(await storedRule(result.taskId)).toBeNull();
  });

  it("creates an ordinary Task, and nothing structured, for language it cannot read", async () => {
    for (const text of [
      "Service Hilux when needed",
      "Regularly check the camper",
      "Do this every so often",
    ]) {
      const result = await captureThroughUi(text);
      expect(result.ok, text).toBe(true);
      if (!result.ok) continue;
      const task = await taskRepo().getTask(result.taskId);
      expect(task?.title, text).toBe(text);
      expect(task?.recurrence, text).toBeNull();
      expect(task?.scheduledDate, text).toBeNull();
      expect(task?.dueDate, text).toBeNull();
      expect(task?.priority, text).toBeNull();
      // No Project, Area or Goal was guessed at either.
      expect(task?.project, text).toBeNull();
      expect(task?.area, text).toBeNull();
    }
  });

  it("refuses an out-of-range interval by not recognising it at all", async () => {
    const result = await captureThroughUi(
      "Service Hilux every 999999 months after completion",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const task = await taskRepo().getTask(result.taskId);
    // The whole phrase stayed the owner's words, and no invalid rule was written.
    expect(task?.title).toBe(
      "Service Hilux every 999999 months after completion",
    );
    expect(await storedRule(result.taskId)).toBeNull();
  });
});

describe("TASKS-11 — the same sentence through CAPTURE-01", () => {
  it("produces the same Task and the same rule as the in-app surfaces", async () => {
    const token = await seedToken();
    await makeAppPreferencesRepository(makeContext(WS)).update(OWNER_SUBJECT, {
      timezone: "Australia/Sydney",
    });

    const captured = await captureThroughApi(
      token,
      "Service Hilux every 6 months after completion",
    );
    expect(captured.title).toBe("Service Hilux");

    const task = await taskRepo().getTask(captured.id);
    expect(task?.recurrence).toMatchObject({
      frequency: "month",
      interval: 6,
      mode: "after_completion",
      dateKind: "scheduled",
    });
    // The transport carried NO recurrence field — the sentence was the whole input.
    expect(task?.scheduledDate).toBe(ownerDay("Australia/Sydney", new Date()));
  });

  it("anchors the first occurrence in the OWNER's timezone, never the machine's", async () => {
    // Two owners, 25 hours apart: their calendar days ALWAYS differ by exactly one,
    // whatever instant the suite runs at. If the parser used the runtime's own date,
    // the two captures would land on the same day.
    const forward = await seedToken({ ownerSubject: "owner-forward" });
    const back = await seedToken({ ownerSubject: "owner-back" });
    const preferences = makeAppPreferencesRepository(makeContext(WS));
    await preferences.update("owner-forward", {
      timezone: "Pacific/Kiritimati",
    });
    await preferences.update("owner-back", { timezone: "Pacific/Midway" });

    const forwardTask = await taskRepo().getTask(
      (
        await captureThroughApi(
          forward,
          "Service Hilux every 6 months after completion",
        )
      ).id,
    );
    const backTask = await taskRepo().getTask(
      (
        await captureThroughApi(
          back,
          "Service Hilux every 6 months after completion",
        )
      ).id,
    );

    expect(forwardTask?.scheduledDate).not.toBe(backTask?.scheduledDate);
    const gap =
      Date.parse(`${forwardTask!.scheduledDate}T00:00:00Z`) -
      Date.parse(`${backTask!.scheduledDate}T00:00:00Z`);
    expect(gap).toBe(86_400_000);
    // Both still carry the same RULE — only the anchor differs.
    expect(forwardTask?.recurrence?.mode).toBe("after_completion");
    expect(backTask?.recurrence?.mode).toBe("after_completion");
  });
});
