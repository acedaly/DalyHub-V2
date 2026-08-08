/**
 * SET-03 Activity kernel — the workspace-event recording contract.
 *
 * The module-facing `ActivityRepository` is READ-ONLY, and every WRITE to the
 * Activity stream is the atomic side effect of a domain mutation (ADR-012).
 * That is still true for everything that changes a record. It cannot be true for
 * an event that changes no record: signing out, or clearing this device's local
 * copy of the workspace, are things the owner did — with real security value in
 * the history — that touch no row in `entities` and therefore have no domain
 * statement to be atomic with.
 *
 * This is the seam for exactly those events, and it is deliberately narrow:
 *
 *   - it takes a TYPE and a small structured PAYLOAD, and nothing else. The
 *     workspace, the event id, the timestamp and the ACTOR all come from the
 *     bound composition, so a caller cannot forge who did it or when;
 *   - it appends to the ONE `activities` stream every other event lives in, with
 *     no subjects, so the event shows up in the workspace feed and in no entity
 *     Timeline. DalyHub does not grow a second audit log beside the first one
 *     (DEBT-33's stated failure mode);
 *   - it is best-effort by contract at the CALL SITE, not here: recording that
 *     the owner signed out must never be able to stop them signing out. See
 *     `app/modules/settings/routes/sign-out.tsx`.
 *
 * Storage-independent: nothing here imports D1, Cloudflare, React or env.
 */

import type { NewWorkspaceActivityEvent } from "./activity-recorder";

/**
 * Append one workspace-scoped Activity event. Resolves when the event is
 * durable; rejects with a typed Activity error if the event is invalid or the
 * store fails.
 */
export interface WorkspaceEventRecorder {
  record(event: NewWorkspaceActivityEvent): Promise<void>;
}
