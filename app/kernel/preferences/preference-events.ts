/**
 * DEBT-33 — a preference change is a thing the owner DID, and the history
 * should say so.
 *
 * SET-03 built the seam for an event that changes no record
 * (`WorkspaceEventRecorder`, ADR-082 decision 9) and adopted it for exactly two
 * security acts. Ordinary preference changes — the timezone, the date format,
 * which modules are in the navigation, where a captured Task lands — still
 * wrote nothing, so an owner reading their own history could see that they
 * signed out and not that they had changed where their work goes.
 *
 * ── The reason this is a NAME list and not a diff ────────────────────────────
 * The entry that asked for this also said why it had not been taken: *"preference
 * values can also be sensitive or identifying, so arbitrary before/after
 * payloads are not acceptable"*. A timezone is a location. A default capture
 * parent is a record id. A saved-view id names a filter the owner wrote. None of
 * those belongs in an append-only stream that is read back on a screen.
 *
 * So the payload is the SET OF FIELD NAMES that changed, and nothing else — the
 * same discipline `SignedOutPayload` uses when it records a COUNT of queued
 * captures rather than the captures. "You changed your timezone on Tuesday" is
 * the fact worth keeping; what you changed it TO is already on the settings
 * screen, and is nobody's business twice.
 *
 * Storage-independent: nothing here imports D1, Cloudflare, React or env.
 */

/**
 * The type itself is NOT declared here.
 *
 * `APP_PREFERENCES_CHANGED` ("settings.preferences_changed") already existed in
 * `app-preferences.ts` and already had a line in the workspace feed's
 * descriptor map — declared, described, and never once written. A second
 * constant for one type string is exactly the duplicate vocabulary the
 * architecture rules forbid, so this file supplies only what was missing: the
 * PAYLOAD contract, and the rule about what may go in it.
 *
 * The `settings.preferences_changed` payload.
 *
 * `fields` is sorted and duplicate-free so two identical changes produce two
 * identical payloads — an event stream whose payloads depend on object key order
 * is one nobody can diff.
 */
export type PreferencesChangedPayload = {
  readonly fields: readonly string[];
};

/**
 * Every preference field name this event is allowed to name.
 *
 * An ALLOWLIST rather than "whatever keys the patch had", and that is the
 * safety property: a future patch key carrying something identifying in its NAME
 * (a saved-view title, a module id, a record id) cannot reach the payload by
 * being added to the preferences type. Adding a field here is a deliberate act,
 * and the test below is what makes it one.
 */
export const RECORDABLE_PREFERENCE_FIELDS = [
  "appearance",
  "colorScheme",
  "dateFormat",
  "defaultDiaryMode",
  "defaultLandingDestination",
  "defaultTaskCaptureParentId",
  "defaultTaskCaptureParentKind",
  "defaultTaskDestination",
  "defaultTaskViewId",
  "defaultTasksView",
  "firstDayOfWeek",
  "navigation",
  "timezone",
] as const;

export type RecordablePreferenceField =
  (typeof RECORDABLE_PREFERENCE_FIELDS)[number];

const ALLOWED: ReadonlySet<string> = new Set(RECORDABLE_PREFERENCE_FIELDS);

/**
 * The payload for a preference patch, or `null` when there is nothing to record.
 *
 * `null` rather than an empty payload: an event that says "the owner changed
 * nothing" is noise in a stream a person reads, and the call site treats `null`
 * as "do not record" rather than as a failure.
 *
 * Values are never read. Only the KEYS of `patch` are inspected, and only those
 * on the allowlist survive — so a caller cannot smuggle a value into this
 * payload even by passing one, and a key nobody has declared is dropped rather
 * than trusted.
 */
export function preferencesChangedPayload(
  patch: Readonly<Record<string, unknown>>,
): PreferencesChangedPayload | null {
  const fields = [
    ...new Set(Object.keys(patch).filter((key) => ALLOWED.has(key))),
  ].sort();
  if (fields.length === 0) return null;
  return { fields };
}
