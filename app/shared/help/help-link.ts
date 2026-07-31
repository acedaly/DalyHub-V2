/**
 * HELP-01 — deep links into Help, from anywhere in the product.
 *
 * "No dead ends" (AGENTS.md §6) means an empty state should teach the next action.
 * Some empty states are better served by a sentence of explanation than by another
 * button — "what IS the Inbox?" is a real question a new owner has, and answering it
 * in place would either bloat the empty state or repeat Help badly.
 *
 * ── Why this lives in `app/shared` and not in the Help module ─────────────────
 * A module may not import another module's internals (ADR-013 §18, enforced by
 * `test/unit/module-registry/module-import-boundary.test.ts`). If the Tasks module
 * imported Help's content to build a link, that rule would be broken for the sake of
 * a URL. So the small, stable part — WHICH topics other surfaces may link to, and
 * how to build the URL — lives here in the shared layer, and the Help module imports
 * it. Dependencies point one way: modules → shared, never module → module.
 *
 * The topic ids are a CLOSED set, so a link cannot be built to a topic that does not
 * exist, and `test/unit/help/help-content.test.ts` asserts every id here resolves to
 * a real Help topic. Renaming a topic without updating this list fails the build's
 * type check or that test — a link into Help can never silently rot.
 */

/** The Help topics other surfaces are allowed to link to. */
export const LINKABLE_HELP_TOPICS = [
  "spine",
  "inbox",
  "scheduled-vs-due",
  "priority",
  "time-sectors",
  "recurrence",
  "review-inbox",
  "reviews",
  "archive-delete",
  "themes",
  "privacy",
  "not-yet",
] as const;

/** A Help topic id that may be linked to from outside Help. */
export type LinkableHelpTopic = (typeof LINKABLE_HELP_TOPICS)[number];

/** The route Help lives at. */
export const HELP_PATH = "/help";

/**
 * The URL for a Help topic. Help validates the `?topic=` value against its own
 * content on arrival, so a stale link degrades to the top of Help rather than to an
 * empty page.
 */
export function helpTopicHref(topic: LinkableHelpTopic): string {
  return `${HELP_PATH}?topic=${encodeURIComponent(topic)}`;
}
