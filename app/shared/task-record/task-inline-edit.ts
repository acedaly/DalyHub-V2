/**
 * TASKS-05 — the ONE client-side seam between a DS-16 inline field and the canonical
 * Task routes.
 *
 * Every inline Task edit in the product — the Drawer's title, priority and dates, and
 * (new in V2.2) the same four plus the structural parent ON THE LIST ROW — goes
 * through these three functions. They exist because DS-16 fields want a
 * promise-returning `onSave` that resolves to an {@link InlineSaveOutcome}, while
 * React Router's fetchers are fire-and-forget: without a shared seam each surface
 * grows its own `fetch` + result-shape + error-wording, which is exactly how "change
 * this value where it is shown" ends up behaving differently in three places.
 *
 * What they are NOT:
 *
 *   - **not an authority.** They POST to `/tasks/:id` and `/tasks/bulk` — the same
 *     routes the Drawer, the bulk bar, Review Inbox and the quick-edit panel use.
 *     Validation, workspace scoping, atomicity and Activity all stay server-side.
 *   - **not optimistic.** A refusal is returned as `{ ok: false, message }` with the
 *     server's own wording, so the field keeps the previous value and the owner's
 *     draft. Nothing is applied locally and then hoped for.
 *   - **not a revalidation policy.** The caller decides what to refresh, because a
 *     Drawer and a list row need different things reloaded.
 *
 * `basePath` exists only so a surface mounted under a different route prefix can say
 * so; it defaults to the canonical `/tasks`.
 */

import type { InlineSaveOutcome } from "~/shared/inline-edit";

import type { TaskActionData } from "./contract";

/** The wording used when the server said no but said nothing useful about why. */
const GENERIC_REFUSAL =
  "That change couldn’t be saved. Nothing was changed — try again.";

/**
 * POST an intent to the canonical Task record route and return its typed outcome.
 * Never throws for a rejected mutation — a transport failure is the only throw, and
 * the wrappers below turn that into a refusal too.
 */
export async function postTaskRecordAction(
  taskId: string,
  fields: Readonly<Record<string, string>>,
  basePath = "/tasks",
): Promise<TaskActionData> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const response = await fetch(`${basePath}/${encodeURIComponent(taskId)}`, {
    method: "POST",
    body,
  });
  return (await response.json()) as TaskActionData;
}

/**
 * A record-route mutation as a DS-16 save outcome. `field` names the `fieldErrors`
 * key to prefer, so a rejected title shows the title's message rather than a generic
 * one.
 */
export async function saveTaskRecordField(
  taskId: string,
  fields: Readonly<Record<string, string>>,
  options: {
    readonly basePath?: string;
    readonly field?: string;
    readonly fallback?: string;
  } = {},
): Promise<InlineSaveOutcome> {
  const fallback = options.fallback ?? GENERIC_REFUSAL;
  try {
    const result = await postTaskRecordAction(
      taskId,
      fields,
      options.basePath ?? "/tasks",
    );
    if (
      (result.kind === "update" ||
        result.kind === "planning" ||
        result.kind === "waiting") &&
      result.status === "success"
    ) {
      return { ok: true };
    }
    if (
      (result.kind === "update" ||
        result.kind === "planning" ||
        result.kind === "waiting") &&
      result.status === "error"
    ) {
      const named =
        options.field === undefined
          ? undefined
          : result.fieldErrors?.[options.field];
      return { ok: false, message: named ?? result.formError ?? fallback };
    }
    return { ok: false, message: fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}

/**
 * A SINGLE-ID `/tasks/bulk` field change as a DS-16 save outcome — the same trusted,
 * atomic, Activity-correct authority the bulk bar uses for a whole selection. Using
 * it for one task is deliberate: a field edited from a row and the same field edited
 * for fourteen rows then travel one code path, so they cannot drift.
 */
export async function saveTaskBulkField(
  taskId: string,
  fields: Readonly<Record<string, string>>,
  options: { readonly basePath?: string; readonly fallback?: string } = {},
): Promise<InlineSaveOutcome> {
  const fallback = options.fallback ?? GENERIC_REFUSAL;
  const body = new FormData();
  body.append("id", taskId);
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  try {
    const response = await fetch(`${options.basePath ?? "/tasks"}/bulk`, {
      method: "POST",
      body,
    });
    const result = (await response.json()) as {
      readonly ok?: boolean;
      readonly formError?: string;
    };
    return result.ok
      ? { ok: true }
      : { ok: false, message: result.formError ?? fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}
