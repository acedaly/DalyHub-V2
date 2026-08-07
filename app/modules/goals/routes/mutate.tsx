/**
 * AREA-02 — Goal mutation endpoint (`POST /goals/:goalId/mutate`).
 *
 * An action-only resource route (no UI). The `goalId` is verified to be an
 * ACTIVE GOAL in this workspace BEFORE any dispatch, so a task/project/area id
 * (or a cross-workspace id) can never reach `spine.complete`/`rename` (which
 * also act on Projects/Tasks) — it gets the calm not-found and nothing is
 * mutated. Title/completion go through `SpineRepository` (the single
 * authority); target date and definition of done go through the Goal-owned
 * `goalDetails` repository, atomic with its own Activity event. Returns a real
 * JSON Response so the DS-06 forms post with a plain `fetch`.
 */

import { env } from "cloudflare:workers";

import {
  SpineHasActiveChildrenError,
  SpineParentUnavailableError,
  SpineValidationError,
} from "~/kernel/spine";
import { GoalDetailsValidationError } from "~/kernel/goals";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

/** The discriminated Goal-mutation outcomes the client consumes. */
export type GoalMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | {
      readonly kind: "rename";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "update_details"; readonly ok: true }
  | {
      readonly kind: "update_details";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  /**
   * EDIT-02 — the two FOCUSED detail intents behind the record's inline fields.
   *
   * `update_details` writes both Goal-owned fields at once, which is right for a
   * form that shows both and wrong for an inline edit that shows one: submitting
   * the whole slice to change a date would resubmit whatever definition of done
   * the page happened to be holding, silently reverting a change made elsewhere
   * since the load. `UpdateGoalDetailsInput` is already a partial patch, so each
   * inline field posts only its own key (DESIGN_SYSTEM.md → inline editing:
   * "prefer a focused intent over resubmitting a whole record").
   */
  | { readonly kind: "set_target_date"; readonly ok: true }
  | {
      readonly kind: "set_target_date";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | { readonly kind: "set_definition_of_done"; readonly ok: true }
  | {
      readonly kind: "set_definition_of_done";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "completion";
      readonly ok: true;
      readonly completed: boolean;
    }
  | {
      readonly kind: "completion";
      readonly ok: false;
      readonly formError?: string;
    }
  | { readonly kind: "delete"; readonly ok: true }
  | {
      readonly kind: "delete";
      readonly ok: false;
      readonly blocked: boolean;
      readonly formError: string;
    }
  | { readonly kind: "restore"; readonly ok: true }
  | { readonly kind: "restore"; readonly ok: false; readonly formError: string }
  | {
      readonly kind: "unknown";
      readonly ok: false;
      readonly formError: string;
    };

function json(data: GoalMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length === 0 ? null : text;
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const goalId = params.goalId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // PX-04 — reversible removal. `delete`/`restore` anchor on the Goal REGARDLESS
  // of its current lifecycle state (`includeDeleted: true`), exactly as Notes do
  // (ADR-042): Undo must be able to restore an already-deleted Goal, and a
  // repeated call must stay the idempotent no-op `SpineRepository.softDelete`/
  // `.restore` already guarantee — never a spurious 404. Missing, wrong-kind and
  // cross-workspace ids still fail closed with the same calm not-found.
  //
  // No new kernel capability and NO MIGRATION: the spine has supported soft-
  // delete and restore since FND-07; only the UI was missing. The child guard is
  // the kernel's own — a Goal with active Projects is refused, never cascaded.
  if (intent === "delete" || intent === "restore") {
    const anchor = await scope.spine.getById(goalId, { includeDeleted: true });
    if (!anchor || anchor.kind !== "goal") {
      throw new Response("Not Found", { status: 404 });
    }
    return handleLifecycle(scope, goalId, intent);
  }

  const goal = await scope.spine.getById(goalId);
  if (!goal || goal.kind !== "goal") {
    throw new Response("Not Found", { status: 404 });
  }

  if (intent === "rename") {
    try {
      await scope.spine.rename(goalId, String(form.get("title") ?? ""));
      return json({ kind: "rename", ok: true });
    } catch (cause) {
      if (cause instanceof SpineValidationError) {
        return json({
          kind: "rename",
          ok: false,
          fieldErrors: { title: cause.message },
        });
      }
      return json({
        kind: "rename",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  if (intent === "update_details") {
    try {
      await scope.goalDetails.update(goalId, {
        targetDate: emptyToNull(form.get("targetDate")),
        definitionOfDone: emptyToNull(form.get("definitionOfDone")),
      });
      return json({ kind: "update_details", ok: true });
    } catch (cause) {
      if (cause instanceof GoalDetailsValidationError) {
        return json({
          kind: "update_details",
          ok: false,
          fieldErrors: { [cause.field]: cause.message },
        });
      }
      return json({
        kind: "update_details",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  // The focused, single-field detail intents. Same repository, same validation,
  // same atomic `goal.details_updated` Activity event — they differ from
  // `update_details` only in writing ONE key of the patch, so an inline edit can
  // never overwrite the field beside it.
  if (intent === "set_target_date" || intent === "set_definition_of_done") {
    const patch =
      intent === "set_target_date"
        ? { targetDate: emptyToNull(form.get("targetDate")) }
        : { definitionOfDone: emptyToNull(form.get("definitionOfDone")) };
    try {
      await scope.goalDetails.update(goalId, patch);
      return json({ kind: intent, ok: true });
    } catch (cause) {
      if (cause instanceof GoalDetailsValidationError) {
        return json({
          kind: intent,
          ok: false,
          fieldErrors: { [cause.field]: cause.message },
        });
      }
      return json({
        kind: intent,
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  if (intent === "complete" || intent === "reopen") {
    try {
      const result =
        intent === "complete"
          ? await scope.spine.complete(goalId)
          : await scope.spine.reopen(goalId);
      return json({
        kind: "completion",
        ok: true,
        completed: result.record.completedAt !== null,
      });
    } catch {
      return json({
        kind: "completion",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  return json(
    { kind: "unknown", ok: false, formError: "Unknown action." },
    400,
  );
}

type Scope = Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>;

async function handleLifecycle(
  scope: Scope,
  goalId: string,
  intent: "delete" | "restore",
): Promise<Response> {
  try {
    if (intent === "delete") {
      await scope.spine.softDelete(goalId);
      return json({ kind: "delete", ok: true });
    }
    await scope.spine.restore(goalId);
    return json({ kind: "restore", ok: true });
  } catch (cause) {
    if (cause instanceof SpineHasActiveChildrenError) {
      // The precondition is explained, never silently swallowed, and nothing is
      // cascaded or orphaned (AGENTS.md §6 — every error names a recovery).
      return json({
        kind: "delete",
        ok: false,
        blocked: true,
        formError:
          "This Goal still has active Projects. Move, complete or remove them first, then try again.",
      });
    }
    if (cause instanceof SpineParentUnavailableError) {
      return json({
        kind: "restore",
        ok: false,
        formError:
          "This Goal’s Area is no longer available, so it can’t be restored.",
      });
    }
    if (intent === "restore") {
      return json({
        kind: "restore",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
    return json({
      kind: "delete",
      ok: false,
      blocked: false,
      formError: "That couldn’t be completed. Please try again.",
    });
  }
}
