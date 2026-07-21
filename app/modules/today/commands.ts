/**
 * TODAY-01 / DS-09 — Today's registry-discovered command contributions.
 *
 * Honest, fixture-free NAVIGATION commands (ADR-024 §24.15): they open Today, or
 * open Today and focus its existing Quick Capture control. Both reuse the validated
 * DS-08 `SearchResultTarget` route contract — no bespoke navigation type — and
 * neither persists anything. "Focus Quick Capture" navigates to `/today?capture=1`;
 * Today reads the bounded `capture` param, focuses the existing textarea and then
 * cleans the param from the URL (no Back-button trap), WITHOUT clearing the draft
 * and WITHOUT claiming anything was saved.
 *
 * Because these are declarative navigations, they carry no `run` handler and never
 * cross the server execution boundary — the palette navigates to them directly.
 */

import type { CommandContribution } from "~/kernel/modules";

/** The bounded query parameter Today reads to focus Quick Capture on arrival. */
export const TODAY_CAPTURE_PARAM = "capture";

/** The single accepted value of the capture parameter. */
export const TODAY_CAPTURE_VALUE = "1";

/**
 * The bounded query parameter the "Focus task list" / "Go to <section>" NAVIGATE
 * commands carry. Today reads it on arrival, moves keyboard focus to the target task
 * (the task list's first task, or a section's first task), then cleans it from the
 * URL — the Focus-Quick-Capture pattern, so focus lands AFTER the palette closes and
 * restores focus, with no timing hacks. Value: `"list"` or a planning bucket id
 * (`overdue`/`today`/`upcoming`/`anytime`).
 */
export const TODAY_NAV_PARAM = "today-nav";

/** The `today-nav` value that focuses the whole task list (its first task). */
export const TODAY_NAV_LIST = "list";

/** The path (with the capture intent) the Focus Quick Capture command opens. */
export const TODAY_CAPTURE_PATH = `/today?${TODAY_CAPTURE_PARAM}=${TODAY_CAPTURE_VALUE}`;

export const todayCommands: readonly CommandContribution[] = [
  {
    id: "today.open",
    title: "Go to Today",
    subtitle: "The calm daily home",
    keywords: ["today", "home", "dashboard", "focus"],
    kind: "navigate",
    target: { kind: "route", to: "/today" },
  },
  {
    id: "today.focus_quick_capture",
    title: "Focus Quick Capture",
    subtitle: "Open Today and start capturing",
    keywords: ["capture", "quick", "add", "new", "inbox", "jot"],
    kind: "navigate",
    target: { kind: "route", to: TODAY_CAPTURE_PATH },
  },
  {
    id: "today.open_waiting",
    title: "Open Waiting",
    subtitle: "Tasks blocked on someone or something else",
    keywords: ["waiting", "blocked", "delegated", "waiting for", "stuck"],
    kind: "navigate",
    target: { kind: "route", to: "/today/waiting" },
  },
];
