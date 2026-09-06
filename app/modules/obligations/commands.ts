/**
 * V2.10 LIFE-02 — the Life Admin command-palette contributions.
 *
 * Two: open the surface, and start a new obligation. Both are `navigate`
 * commands, so the palette needs no handler and no client bundle from this
 * module — the destination is the whole behaviour.
 *
 * The create command deliberately does NOT pre-select a subject. An obligation
 * about nothing is the ordinary case V2.10 exists for, and a palette entry that
 * asked "about what?" first would reintroduce the parent the whole programme
 * removed.
 */

import type { CommandContribution } from "~/kernel/modules";

export const obligationsCommands: readonly CommandContribution[] = [
  {
    id: "obligations.open",
    title: "Open Life Admin",
    subtitle: "Everything with a date on it that is not a task",
    keywords: [
      "life admin",
      "obligations",
      "renewals",
      "bills",
      "due",
      "admin",
    ],
    kind: "navigate",
    target: { kind: "route", to: "/obligations" },
  },
  {
    id: "obligations.new",
    title: "New Obligation",
    subtitle: "A renewal, a bill, a registration — with or without a subject",
    keywords: [
      "obligation",
      "renewal",
      "bill",
      "due",
      "rego",
      "insurance",
      "new",
      "create",
      "add",
    ],
    kind: "navigate",
    target: { kind: "route", to: "/obligations/new" },
  },
];
