/**
 * V2.12 — the Finance command-palette contributions.
 *
 * Four, and they are the four things an owner types rather than navigates to.
 * Every one is a NAVIGATION: the palette takes you to the surface that does the
 * work, it does not do the work. A command that imported a file or set a budget
 * from a text box would be an action with no preview and no undo, which is the
 * opposite of how money should be handled.
 */

import type { CommandContribution } from "~/kernel/modules";

export const financeCommands: readonly CommandContribution[] = [
  {
    id: "finance.open",
    title: "Finance",
    subtitle: "Where is my money going?",
    keywords: ["money", "spend", "spending", "budget", "accounts", "bank"],
    kind: "navigate",
    target: { kind: "route", to: "/finance" },
  },
  {
    id: "finance.uncategorised",
    title: "Categorise transactions",
    subtitle: "Clear the uncategorised queue",
    keywords: ["uncategorised", "uncategorized", "categorise", "categorize"],
    kind: "navigate",
    target: { kind: "route", to: "/finance/transactions?uncategorised=1" },
  },
  {
    id: "finance.import",
    title: "Import a statement",
    subtitle: "Read a bank CSV into an account",
    keywords: ["csv", "import", "statement", "bank"],
    kind: "navigate",
    target: { kind: "route", to: "/finance/import" },
  },
  {
    id: "finance.budgets",
    title: "Budgets",
    subtitle: "What you meant to spend, against what you did",
    keywords: ["budget", "budgets", "limit"],
    kind: "navigate",
    target: { kind: "route", to: "/finance/budgets" },
  },
];
