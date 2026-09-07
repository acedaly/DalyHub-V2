/**
 * V2.13 RPT-04 — the Reports module's command contributions.
 *
 * Honest NAVIGATION commands only. Each one opens a surface, using the same
 * query vocabulary the address bar uses, so a command and a bookmarked link
 * land in exactly the same place.
 *
 * ── Two, and deliberately not eight ────────────────────────────────────────
 * "Open Reports" and "New report". There is no command per built-in: six more
 * permanent rows would crowd the palette in exchange for one keystroke over
 * opening Reports and clicking the one you want, and the palette's job is the
 * frequent action rather than the complete index.
 *
 * ── Nothing here MUTATES ───────────────────────────────────────────────────
 * No command saves, renames or deletes a report. A command that silently wrote
 * a definition would be a change the owner never saw a screen for.
 */

import type { CommandContribution } from "~/kernel/modules";

export const reportsCommands: readonly CommandContribution[] = [
  {
    id: "reports.open",
    title: "Open Reports",
    subtitle: "Saved questions, answered from your records",
    keywords: [
      "reports",
      "report",
      "insight",
      "analytics",
      "spending",
      "chart",
      "saved question",
    ],
    kind: "navigate",
    target: { kind: "route", to: "/reports" },
  },
  {
    id: "reports.new",
    title: "New report",
    subtitle: "Ask a new question of your records",
    keywords: ["new report", "create report", "build report", "ask"],
    kind: "navigate",
    target: { kind: "route", to: "/reports/new" },
  },
];
