/**
 * UIX-05 — the Analytics module's command contributions.
 *
 * Honest NAVIGATION commands only: each opens the same surface at one of its
 * named windows, using the SAME `?window=` vocabulary the address bar uses — so
 * a command, a bookmarked link and the window rail all land in exactly the same
 * place. Nothing here computes anything.
 *
 * V2.9 INS-03 — the commands are DERIVED from `INSIGHT_WINDOWS` rather than
 * written out, so a window added to that list gets a command and one removed
 * loses it. The default window's command carries no parameter at all, which is
 * the same rule the rail's own hrefs follow: two equivalent states always
 * produce the same link.
 */

import {
  DEFAULT_INSIGHT_WINDOW,
  INSIGHT_WINDOWS,
  type InsightWindowId,
} from "~/kernel/analytics";
import type { CommandContribution } from "~/kernel/modules";

/** The extra words that find one window, beyond its own label. */
const WINDOW_KEYWORDS: Readonly<Record<InsightWindowId, readonly string[]>> = {
  "this-week": ["week", "7 days", "recent"],
  "4-weeks": ["month", "4 weeks"],
  "12-weeks": ["quarter", "12 weeks", "long"],
  "6-months": ["6 months", "half year"],
  "12-months": ["year", "12 months", "annual"],
  "24-months": ["2 years", "24 months", "two years"],
};

export const analyticsCommands: readonly CommandContribution[] = [
  {
    id: "analytics.open",
    title: "Open Analytics",
    subtitle: "Where your effort has actually gone",
    keywords: [
      "analytics",
      "stats",
      "statistics",
      "trend",
      "completed",
      "progress",
      "insights",
      "history",
    ],
    kind: "navigate",
    target: { kind: "route", to: "/analytics" },
  },
  ...INSIGHT_WINDOWS.map((window) => ({
    /*
     * The window id, made into an IDENTIFIER.
     *
     * A command id must be a lowercase dotted identifier whose every segment
     * starts with a letter (the module kernel validates it); a window id is a
     * URL token, where `4-weeks` reads better than `window_4_weeks`. So the
     * hyphens become underscores and the whole thing is prefixed — two
     * vocabularies, one derivation, never a hand-written list that would drift
     * from `INSIGHT_WINDOWS`.
     */
    id: `analytics.window_${window.id.replace(/-/g, "_")}`,
    title: `Analytics — last ${window.label}`,
    subtitle: `The shape of the last ${window.label}`,
    keywords: ["analytics", ...WINDOW_KEYWORDS[window.id]],
    kind: "navigate" as const,
    target: {
      kind: "route" as const,
      to:
        window.id === DEFAULT_INSIGHT_WINDOW
          ? "/analytics"
          : `/analytics?window=${window.id}`,
    },
  })),
];
