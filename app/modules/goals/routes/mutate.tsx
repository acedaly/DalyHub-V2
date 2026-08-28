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
import {
  GoalDetailsValidationError,
  GoalMeasurementValidationError,
  validateGoalConditionInput,
  validateGoalMeasurementPatch,
} from "~/kernel/goals";
import {
  readEntityIconField,
  readIdentityColourField,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

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
  /**
   * GOAL-02 — the Goal's measurement configuration.
   *
   * One intent for the whole slice rather than five field intents, because the
   * five values are interdependent: a baseline means nothing without the target
   * it is measured against, and changing the STRATEGY changes which of them
   * exist. That is the case DESIGN_SYSTEM.md's "prefer a focused intent" rule
   * explicitly excludes.
   */
  /*
   * IDENTITY-01 — the Goal's own icon and colour. Both come back so an
   * optimistic caller can reconcile against what was actually stored rather
   * than against what it sent.
   */
  | {
      readonly kind: "set_identity";
      readonly ok: true;
      readonly iconKey: string | null;
      readonly colourSlot: string | null;
    }
  | {
      readonly kind: "set_identity";
      readonly ok: false;
      readonly formError: string;
    }
  /**
   * STEER-02 — the OWNER's condition, its own focused intent.
   *
   * Its own intent rather than a key on `update_details` for the reason
   * EDIT-02 gives for the two detail intents: an inline control that shows one
   * value must submit one value, or changing the condition would resubmit
   * whatever definition of done the page happened to be holding. It also keeps
   * the write path legible — `set_condition` is the ONLY route through which a
   * Goal's condition can change, and grep proves it (ADR-111 decision 1).
   */
  | {
      readonly kind: "set_condition";
      readonly ok: true;
      readonly condition: string | null;
    }
  | {
      readonly kind: "set_condition";
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
    }
  /**
   * STEER-02 — the Goal's structural MOVE between Areas (DEBT-184).
   *
   * The outcome vocabulary is the Project's, verbatim (`moved` / `unchanged` /
   * `invalid`), because it is the same operation on the same spine authority
   * and two vocabularies for one act is how two surfaces come to disagree.
   */
  | {
      readonly kind: "move";
      readonly ok: true;
      readonly outcome: "moved" | "unchanged";
    }
  | {
      readonly kind: "move";
      readonly ok: false;
      readonly outcome: "invalid";
      readonly formError: string;
    }
  | { readonly kind: "set_measurement"; readonly ok: true }
  | {
      readonly kind: "set_measurement";
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

  /*
   * IDENTITY-01 — the Goal's own icon and colour, chosen together.
   *
   * A focused intent like the two above, and for the same reason: it writes two
   * keys of the patch and can never overwrite the target date or the definition
   * of done beside them. Both halves are read through the SAME trusted boundary
   * readers the Area and Project routes use, so an unrecognised key or slot is
   * REFUSED and named rather than quietly stored as "no choice" — an owner whose
   * choice cannot be honoured is told, instead of being shown a success message
   * and then the Area's colour.
   *
   * `null` on either field is a legitimate value, not a failure: it is what
   * "use the default" and "Automatic" store, and it returns the Goal to
   * inheriting its Area's identity — which is what every Goal did before this
   * release.
   */
  if (intent === "set_identity") {
    const icon = readEntityIconField(form);
    if (!icon.ok) {
      return json({ kind: "set_identity", ok: false, formError: icon.message });
    }
    const colour = readIdentityColourField(form);
    if (!colour.ok) {
      return json({
        kind: "set_identity",
        ok: false,
        formError: colour.message,
      });
    }
    try {
      await scope.goalDetails.update(goalId, {
        iconKey: icon.iconKey,
        colourSlot: colour.colourSlot,
      });
      return json({
        kind: "set_identity",
        ok: true,
        iconKey: icon.iconKey,
        colourSlot: colour.colourSlot,
      });
    } catch {
      return json({
        kind: "set_identity",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  /*
   * STEER-02 — the owner's condition (ADR-111 decisions 1–3).
   *
   * A focused intent, validated against the closed kernel vocabulary at the
   * repository boundary, writing the Goal-owned slice through the ONE mutation
   * path and appending the `goal.condition_changed` verb in the same
   * transaction. Nothing else in the product writes this column: no background
   * job, no derivation, no import, no AI. An unrecognised value is REFUSED
   * here rather than stored, and the field's message says so.
   */
  if (intent === "set_condition") {
    try {
      const condition = validateGoalConditionInput(form.get("condition"));
      await scope.goalDetails.update(goalId, { condition });
      return json({ kind: "set_condition", ok: true, condition });
    } catch (cause) {
      if (cause instanceof GoalDetailsValidationError) {
        return json({
          kind: "set_condition",
          ok: false,
          fieldErrors: { [cause.field]: cause.message },
        });
      }
      return json({
        kind: "set_condition",
        ok: false,
        formError: "That couldn’t be saved. Please try again.",
      });
    }
  }

  /*
   * STEER-02 — re-file a Goal into another Area (DEBT-184).
   *
   * The SPINE owns parentage, so this delegates to `SpineRepository.move` with
   * the same guards `handleMove` gives a Project: the destination is resolved
   * SERVER-side from the id (the client never asserts a kind), it must be an
   * ACTIVE AREA in this workspace, and the move is one conditional link
   * mutation — the existing `goal.belongs_to_area` link is soft-deleted and the
   * destination link created or restored, in ONE batch with its Activity
   * events. The Goal keeps its id, its history, its measurements and its
   * subtree by construction: nothing is deleted and recreated, and its
   * advancing Projects parent to the GOAL, not to the Area.
   *
   * An archived destination Area is refused, matching Goal CREATION
   * (`routes/new.tsx`) rather than the Project move's silence: a Goal may not
   * be created in an archived Area, so it may not be moved into one either.
   */
  if (intent === "move") {
    return json(
      await handleGoalMove(scope, goalId, String(form.get("areaId") ?? "")),
    );
  }

  if (intent === "set_measurement") {
    try {
      // Untrusted wire values become a domain patch through the KERNEL
      // validators; the repository merges it over the current configuration and
      // renormalises the whole thing, so no route decides what a coherent
      // measurement looks like.
      const measurement = validateGoalMeasurementPatch({
        measurementType: form.get("measurementType"),
        unit: form.get("unit"),
        baselineValue: form.get("baselineValue"),
        targetValue: form.get("targetValue"),
        ...(form.get("direction") === null
          ? {}
          : { direction: form.get("direction") }),
      });
      await scope.goalDetails.update(goalId, { measurement });
      return json({ kind: "set_measurement", ok: true });
    } catch (cause) {
      if (
        cause instanceof GoalDetailsValidationError ||
        cause instanceof GoalMeasurementValidationError
      ) {
        return json({
          kind: "set_measurement",
          ok: false,
          fieldErrors: { [cause.field]: cause.message },
        });
      }
      return json({
        kind: "set_measurement",
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

/**
 * STEER-02 — the Goal move handler (DEBT-184), the Project's `handleMove`
 * shape with the one deliberate difference recorded above: an archived Area is
 * refused.
 *
 * Every failure is the same calm, non-disclosing outcome — a missing, deleted,
 * wrong-kind, archived or cross-workspace destination all read as "Choose an
 * available Area", because distinguishing them would tell the caller which
 * ids exist in another workspace.
 */
async function handleGoalMove(
  scope: Scope,
  goalId: string,
  areaId: string,
): Promise<GoalMutationResult> {
  const invalid = {
    kind: "move",
    ok: false,
    outcome: "invalid",
    formError: "Choose an available Area.",
  } as const;
  const area = await scope.spine.getById(areaId);
  if (!area || area.kind !== "area") return invalid;
  const settings = await scope.areaSettings.get(areaId);
  if (settings?.archivedAt) return invalid;
  try {
    const result = await scope.spine.move(goalId, {
      kind: "area",
      id: area.id,
    });
    return {
      kind: "move",
      ok: true,
      outcome: result.changed ? "moved" : "unchanged",
    };
  } catch {
    return invalid;
  }
}

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
