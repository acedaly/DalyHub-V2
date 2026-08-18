/**
 * HABITS-01 — the Habit mutation endpoint (`POST /habits/:habitId/mutate`).
 *
 * An action-only resource route: the trusted server boundary for every change to
 * the Habit RECORD. Five intents, each mapping to exactly one authoritative
 * repository call:
 *
 *   rename           → `habits.update({ title })`
 *   update           → `habits.update({ notes, goalId, areaId })`
 *   set_schedule     → `habits.changeSchedule(...)`   — versioned, from today
 *   archive/restore  → `habits.archive` / `habits.restore`
 *   delete           → `entities.softDelete`          — the generic lifecycle
 *
 * `set_schedule` is deliberately its own intent rather than a field of `update`:
 * changing a cadence CLOSES the current version and opens a new one from the
 * owner's today, so every earlier day keeps the schedule it actually had. Making
 * it a field would make it look like an ordinary edit, and an ordinary edit is
 * exactly what it must not be.
 */

import { env } from "cloudflare:workers";

import { EntityValidationError } from "~/kernel/entities";
import {
  HabitConflictError,
  HabitNotFoundError,
  HabitValidationError,
} from "~/kernel/habits";
import {
  actionOnlyLoader,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { parseHabitScheduleForm } from "../habit-form-fields";
import type { Route } from "./+types/mutate";

export const loader = actionOnlyLoader;

export type HabitMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "update"; readonly ok: true }
  | {
      readonly kind: "update";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "set_schedule";
      readonly ok: true;
      readonly outcome: "versioned" | "amended" | "unchanged";
    }
  | {
      readonly kind: "set_schedule";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "archive"; readonly ok: boolean }
  | { readonly kind: "restore"; readonly ok: boolean }
  | { readonly kind: "delete"; readonly ok: boolean }
  | { readonly kind: "unknown"; readonly ok: false };

function json(data: HabitMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** A picker that submitted "no selection" means NO relationship, not "". */
function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const habitId = params.habitId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    switch (intent) {
      case "rename": {
        await scope.habits.update(habitId, {
          title: String(form.get("title") ?? ""),
        });
        return json({ kind: "rename", ok: true });
      }
      case "update": {
        await scope.habits.update(habitId, {
          ...(form.has("notes")
            ? { notes: String(form.get("notes") ?? "") }
            : {}),
          ...(form.has("goalId")
            ? { goalId: emptyToNull(form.get("goalId")) }
            : {}),
          ...(form.has("areaId")
            ? { areaId: emptyToNull(form.get("areaId")) }
            : {}),
        });
        return json({ kind: "update", ok: true });
      }
      case "set_schedule": {
        const result = await scope.habits.changeSchedule(
          habitId,
          parseHabitScheduleForm(form),
        );
        return json({
          kind: "set_schedule",
          ok: true,
          outcome: result.outcome,
        });
      }
      case "archive": {
        await scope.habits.archive(habitId);
        return json({ kind: "archive", ok: true });
      }
      case "restore": {
        await scope.habits.restore(habitId);
        return json({ kind: "restore", ok: true });
      }
      case "delete": {
        /*
         * Soft-deletion is the GENERIC entity lifecycle, not a Habits
         * operation — exactly as it is for a Person. The Habit's completions
         * and schedule versions are left in place: a deleted record is
         * recoverable, and destroying its history on the way out would make
         * "restore" a lie.
         */
        await scope.entities.softDelete(habitId);
        return json({ kind: "delete", ok: true });
      }
      default:
        return json({ kind: "unknown", ok: false }, 400);
    }
  } catch (cause) {
    if (cause instanceof HabitNotFoundError) {
      throw new Response("Not Found", { status: 404 });
    }
    if (cause instanceof HabitValidationError) {
      const fieldErrors = { [cause.field]: cause.message };
      if (intent === "rename") {
        return json({ kind: "rename", ok: false, fieldErrors });
      }
      if (intent === "set_schedule") {
        return json({ kind: "set_schedule", ok: false, fieldErrors });
      }
      return json({ kind: "update", ok: false, fieldErrors });
    }
    if (cause instanceof EntityValidationError) {
      return json({
        kind: "rename",
        ok: false,
        fieldErrors: { title: cause.message },
      });
    }
    if (cause instanceof HabitConflictError) {
      return json({ kind: "update", ok: false, formError: cause.message }, 409);
    }
    throw cause;
  }
}
