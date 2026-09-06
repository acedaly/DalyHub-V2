/**
 * V2.12 — the Finance route descriptors (declarative, dependency-free).
 *
 * Plain data with only a type import (erased at build time), so it is safe for
 * React Router's bare `routes.ts` config loader AND for `module.ts`'s runtime
 * registry (ADR-016 §5.10). Adding a route means editing this file and adding
 * the route file; never `app/routes.ts`.
 *
 * ── ONE primary navigation item, and Finance owns the rest ──────────────────
 * `/finance` in the MORE group at `navOrder: 210`, so the rail reads Finance →
 * Life Admin → Assets: money, then paperwork, then things. There is deliberately
 * NO nav item for Accounts, Transactions, Budgets or Imports — those are
 * questions Finance answers, not places to go, and four rail rows for one domain
 * is how a sidebar becomes a filing cabinet.
 *
 * ── No `mobilePrimaryOrder`, and that is a decision ─────────────────────────
 * The three earned phone slots are unchanged for the whole of V2, exactly as
 * Life Admin decided. Finance reaches the phone through the More sheet, and the
 * daily-driver phone action — categorising the uncategorised — is one tap from
 * the Finance home rather than a fourth bar slot.
 *
 * ── No `navIcon` ───────────────────────────────────────────────────────────
 * This module declares an entity type, so the rail draws its identity glyph.
 * Two sources for one glyph is how drift starts.
 */

import type { RouteContribution } from "~/kernel/modules";

const routes: readonly RouteContribution[] = [
  {
    id: "finance.index",
    path: "finance",
    file: "routes/index.tsx",
    meta: { navLabel: "Finance", navGroup: "more", navOrder: 210 },
  },
  {
    /*
     * The transactions surface: the month's list, and the uncategorised queue
     * that the same route serves with `?uncategorised=1`. ONE screen, because
     * they are one list under two filters, and a second screen would be a second
     * row and a second set of actions.
     */
    id: "finance.transactions",
    path: "finance/transactions",
    file: "routes/transactions.tsx",
  },
  {
    id: "finance.transactions.mutate",
    path: "finance/transactions/mutate",
    file: "routes/transactions.mutate.tsx",
  },
  {
    id: "finance.budgets",
    path: "finance/budgets",
    file: "routes/budgets.tsx",
  },
  {
    id: "finance.budgets.mutate",
    path: "finance/budgets/mutate",
    file: "routes/budgets.mutate.tsx",
  },
  {
    id: "finance.categories",
    path: "finance/categories",
    file: "routes/categories.tsx",
  },
  {
    id: "finance.categories.mutate",
    path: "finance/categories/mutate",
    file: "routes/categories.mutate.tsx",
  },
  {
    /*
     * The CSV flow. Desktop-first and stated as such: mapping columns is a
     * table-shaped task, and squeezing one into 320 px to claim responsive
     * parity would make it worse on both. The phone's Finance job is
     * categorisation, which is a different screen.
     */
    id: "finance.import",
    path: "finance/import",
    file: "routes/import.tsx",
  },
  {
    /*
     * The preview and apply ENDPOINT, deliberately separate from the page: a
     * route that also exports a UI component is a document route, so a `fetch`
     * POST to it re-renders HTML rather than returning JSON.
     */
    id: "finance.import.run",
    path: "finance/import/run",
    file: "routes/import.run.tsx",
  },
  {
    id: "finance.accounts.new",
    path: "finance/accounts/new",
    file: "routes/accounts.new.tsx",
  },
  {
    id: "finance.accounts.create",
    path: "finance/accounts/create",
    file: "routes/accounts.create.tsx",
  },
  {
    id: "finance.accounts.detail",
    path: "finance/accounts/:accountId",
    file: "routes/accounts.detail.tsx",
  },
  {
    id: "finance.accounts.mutate",
    path: "finance/accounts/:accountId/mutate",
    file: "routes/accounts.mutate.tsx",
  },
];

export default routes;
