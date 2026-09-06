/**
 * The ONE shared entity-destination helper (deliverable 4).
 *
 * Maps an already-authorised entity `type` + `id` to the accepted canonical
 * in-app destination for that record type, or `null` when no genuine implemented
 * destination exists. It is deliberately:
 *
 *   - **storage-independent** — no D1, repository, workspace or route-loader import;
 *   - **pure / React-free** — safe to import from non-UI code (the React renderer
 *     is `EntityLink.tsx`);
 *   - **access-blind** — it maps identity to a URL, it NEVER infers access. Only
 *     records already resolved by a trusted server-side loader may be passed here
 *     (the caller is responsible for that), and a missing/inaccessible target still
 *     degrades to non-interactive text at the render layer.
 *
 * Destinations follow the accepted DalyHub conventions:
 *   - Area / Goal / Project / Note / Person / Meeting / Asset / Review / Diary entry →
 *     their canonical record route.
 *   - Task → the shared Task Drawer (a `task:<id>` drawer key, opened over the
 *     current record context — never a standalone page, matching the app-wide
 *     convention).
 *   - Finance transaction → the shared Transaction Drawer
 *     (`transaction:<id>`), for the same reason: a transaction is a LIGHT
 *     entity and deliberately has no record page (V2.12, ADR-120 decision 2).
 *   - Any entity type with no implemented record route → `null`, so the caller
 *     renders plain text. We never link to a "Coming Soon" placeholder merely
 *     because a type is registered.
 *
 * PEOPLE-03 registered `diary` here, pointing at `/diary/:entryId` — but that
 * path is a UI-less RESOURCE route (the JSON endpoint the details panel fetches),
 * not a record page, so every link opened the entry's raw JSON including its
 * private body (DEBT-222). RECALL-00-A corrected the mapping to Diary's canonical
 * record surface: the day view with the entry's inspector open
 * (`/diary?inspector=view:<id>`), the same target the Diary search provider uses.
 * There is deliberately NO `/diary/:id` record page — day + inspector IS the
 * record surface, and a second one would fork it.
 *
 * This is the single source of truth for "where does this record open"; modules
 * must not reintroduce per-module route `switch` statements.
 */

import { isEntityType } from "./identity";

/** Where an entity record opens. */
export type EntityDestination =
  /** A canonical record page — navigate to `to`. */
  | { readonly kind: "route"; readonly to: string }
  /** The shared Task Drawer — opened over the current context via `drawerKey`. */
  | { readonly kind: "drawer"; readonly drawerKey: string };

/** Canonical record-route builders for the entity types that have a real page. */
const CANONICAL_ROUTE: Partial<Record<string, (id: string) => string>> = {
  area: (id) => `/areas/${encodeURIComponent(id)}`,
  goal: (id) => `/goals/${encodeURIComponent(id)}`,
  project: (id) => `/projects/${encodeURIComponent(id)}`,
  note: (id) => `/notes/${encodeURIComponent(id)}`,
  person: (id) => `/person/${encodeURIComponent(id)}`,
  meeting: (id) => `/meeting/${encodeURIComponent(id)}`,
  asset: (id) => `/asset/${encodeURIComponent(id)}`,
  review: (id) => `/reviews/${encodeURIComponent(id)}`,
  // Diary's canonical record surface is the day view with the entry's inspector
  // open — `/diary/:entryId` is the JSON resource route feeding that inspector,
  // never a destination (RECALL-00-A). The id lands in a query parameter, so
  // `encodeURIComponent` also keeps `?`/`&`/`#` in an id from splitting the URL.
  diary: (id) => `/diary?inspector=view:${encodeURIComponent(id)}`,
  // FIND-01 added `habit`, which was missing while `/habits/:habitId` had
  // existed since HABITS-01. The Habits search provider had worked around the
  // gap by hard-coding its own route (`app/modules/habits/search.ts`) — exactly
  // the per-module route table this file's contract forbids — so the omission
  // was invisible until something consulted THIS map for a Habit and got
  // `null`. Search's recency list was that something.
  habit: (id) => `/habits/${encodeURIComponent(id)}`,
  // V2.10 LIFE-02 — added in the SAME change as the identity entry, which is
  // the whole lesson of the `habit` note above: a record page with no entry
  // here is a record the recency list, Linked Items and every search result
  // silently refuse to open.
  obligation: (id) => `/obligations/${encodeURIComponent(id)}`,
  /*
   * V2.12 FIN-00 — the account has a record page. The TRANSACTION does not, and
   * its absence from this map is the decision, not an oversight: a transaction
   * is a LIGHT entity that opens in the shared Drawer, and it is handled as
   * `task` is, below.
   */
  finance_account: (id) => `/finance/accounts/${encodeURIComponent(id)}`,
};

/**
 * Every entity type with a genuine, navigable destination.
 *
 * Exported so a caller that must decide UP FRONT which types it can render —
 * rather than discovering per-record that `entityDestination` returned `null` —
 * asks this map instead of keeping its own list. FIND-01's recency read is the
 * first such caller: it applies a SQL `LIMIT`, so a type it cannot open has to
 * be excluded by the QUERY, or unopenable rows silently consume the limit and
 * the owner is shown a short (or empty) list of the records they were just
 * working on.
 *
 * `task` is included and is not in the route map: it opens in the shared Drawer
 * rather than on a page of its own, which `entityDestination` handles as a
 * special case. **V2.12 FIN-00 adds the second**, `finance_transaction`, for
 * exactly the same reason — a transaction is a light entity with a drawer and no
 * record page (ADR-120 decision 2) — and it is listed here so a settled
 * obligation's Linked items can OPEN the transaction that paid it rather than
 * rendering its payee as dead text.
 *
 * Being here is not the same as being volunteered: `RECENCY_EXCLUDED_TYPES`
 * keeps `finance_transaction` out of the empty-query recency list, so the
 * product can open one on request and never offer one unbidden.
 */
export const DESTINATION_ENTITY_TYPES: readonly string[] = [
  "task",
  "finance_transaction",
  ...Object.keys(CANONICAL_ROUTE),
];

/**
 * Resolve the canonical destination for an entity, or `null` when no genuine
 * implemented destination exists (so the caller renders plain, non-interactive
 * text). A blank id is treated as no destination.
 */
export function entityDestination(
  type: string,
  id: string,
): EntityDestination | null {
  if (!id) {
    return null;
  }
  if (type === "task") {
    return { kind: "drawer", drawerKey: `task:${id}` };
  }
  /*
   * V2.12 — a transaction has no record page, and it is reached by ROUTE.
   *
   * It briefly returned a `transaction:<id>` DRAWER key, on the reasoning that
   * the transactions surface opens one. But a drawer key is interpreted by the
   * CURRENT route's `DrawerProvider`, and every other route that renders an
   * `EntityLink` has no transaction renderer — the Obligation record, which is
   * exactly where the settlement link appears, passes `renderDrawer={() => null}`.
   * Clicking "paid" there opened the "record isn't available" fallback.
   *
   * `/finance/transactions?open=<id>` works from anywhere and lands on the one
   * surface where a transaction can be acted on, which is what the Search
   * provider already does with it. The id is opaque: no payee, no amount.
   */
  if (type === "finance_transaction") {
    return {
      kind: "route",
      to: `/finance/transactions?open=${encodeURIComponent(id)}`,
    };
  }
  const route = isEntityType(type) ? CANONICAL_ROUTE[type] : undefined;
  return route ? { kind: "route", to: route(id) } : null;
}

/** True when this entity type currently has a genuine, navigable destination. */
export function hasEntityDestination(type: string, id: string): boolean {
  return entityDestination(type, id) !== null;
}
