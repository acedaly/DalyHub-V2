/**
 * HABITS-01 — the ONE check-in endpoint (`POST /habits/:habitId/check-in`).
 *
 * An action-only resource route. Today, the `/habits` collection and the Habit
 * record all post HERE, which is what makes them agree about a tick by
 * construction rather than by convention — there is no second check-in path, no
 * per-surface store and no client that writes a completion itself.
 *
 * It is separate from `/habits/:id/mutate` because it changes the HISTORY rather
 * than the record, exactly as `/goals/:id/measurements` is separate from
 * `/goals/:id/mutate`. Conflating them would make "correct a schedule" and
 * "record a check-in" the same operation.
 *
 * ── The date is the OWNER's, and it is decided here ─────────────────────────
 * The client sends the date it believes it is acting on, and the server checks
 * it against the OWNER's calendar day (AUDIT-14's one authority). A future date
 * is refused; a browser in another timezone cannot move a completion onto
 * tomorrow; and a request with no date at all falls back to the owner's today
 * rather than to the Worker's UTC day.
 */

import { env } from "cloudflare:workers";

import {
  HabitArchivedError,
  HabitNotFoundError,
  HabitValidationError,
  type HabitCheckInResult,
} from "~/kernel/habits";
import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/check-in";

export const loader = actionOnlyLoader;

/** The discriminated check-in outcome every Habit surface consumes. */
export type HabitCheckInResponse =
  | {
      readonly ok: true;
      readonly habitId: string;
      readonly date: string;
      readonly outcome: HabitCheckInResult["outcome"];
      readonly changed: boolean;
    }
  | { readonly ok: false; readonly message: string };

function json(data: HabitCheckInResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const habitId = params.habitId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "check_in");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const todayIso = await scope.ownerTodayIso();
  const rawDate = String(form.get("date") ?? "").trim();
  const date = rawDate === "" ? todayIso : rawDate;

  try {
    const result =
      intent === "undo"
        ? await scope.habits.undoCheckIn(habitId, date)
        : await scope.habits.checkIn(habitId, date);
    return json({
      ok: true,
      habitId: result.habitId,
      date: result.date,
      outcome: result.outcome,
      changed: result.changed,
    });
  } catch (cause) {
    if (cause instanceof HabitArchivedError) {
      return json({ ok: false, message: cause.message }, 409);
    }
    if (cause instanceof HabitNotFoundError) {
      return json({ ok: false, message: "That habit no longer exists." }, 404);
    }
    if (cause instanceof HabitValidationError) {
      return json(
        {
          ok: false,
          message:
            cause.field === "date"
              ? "A habit can only be checked in for today or an earlier day."
              : "That couldn’t be saved. Nothing was changed.",
        },
        400,
      );
    }
    return json(
      { ok: false, message: "That couldn’t be saved. Nothing was changed." },
      500,
    );
  }
}
