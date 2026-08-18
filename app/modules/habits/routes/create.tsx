/**
 * HABITS-01 — the create-habit endpoint (`POST /habits/create`).
 *
 * An action-only resource route (no UI) — the trusted server boundary for
 * creating a Habit. Deliberately SEPARATE from the `/habits/new` page: a route
 * that also exports a UI component is a document route, so a `fetch` POST to it
 * re-renders HTML rather than returning the action's JSON (the DS-06 forms need
 * JSON). Creation goes through the authoritative `HabitRepository.create` —
 * `habit` is reserved, so the entity row, its detail slice, its FIRST schedule
 * version, its relationships and the `habit.created` event are written
 * atomically. The client never supplies workspace or actor data (ADR-010).
 */

import { env } from "cloudflare:workers";

import { HabitValidationError } from "~/kernel/habits";
import { requireAuthenticatedSession } from "~/platform/request";
import { actionOnlyLoader } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { parseHabitScheduleForm } from "../habit-form-fields";
import type { Route } from "./+types/create";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather than
 * React Router's internal error object and stack trace.
 */
export const loader = actionOnlyLoader;

/** The discriminated create-habit outcome the forms consume. */
export type CreateHabitResult =
  | { readonly ok: true; readonly habitId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    };

function json(data: CreateHabitResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  try {
    const schedule = parseHabitScheduleForm(form);
    const habit = await scope.habits.create({
      title: String(form.get("title") ?? ""),
      notes: form.has("notes") ? String(form.get("notes") ?? "") : null,
      schedule,
      goalId: emptyToNull(form.get("goalId")),
      areaId: emptyToNull(form.get("areaId")),
    });
    return json({ ok: true, habitId: habit.id });
  } catch (cause) {
    if (cause instanceof HabitValidationError) {
      return json({ ok: false, fieldErrors: { [cause.field]: cause.message } });
    }
    return json({
      ok: false,
      formError: "That habit couldn’t be created. Please try again.",
    });
  }
}

/** A picker that submitted "no selection" means NO relationship, not "". */
function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? null : text;
}
