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
 *   - Area / Goal / Project / Note / Person / Meeting → their canonical record route.
 *   - Task → the shared Task Drawer (a `task:<id>` drawer key, opened over the
 *     current record context — never a standalone page, matching the app-wide
 *     convention).
 *   - Every other entity type (asset, diary, review) → `null`, because no genuine
 *     canonical record destination is implemented yet. We never link to a "Coming
 *     Soon" placeholder merely because a type is registered.
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
};

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
  const route = isEntityType(type) ? CANONICAL_ROUTE[type] : undefined;
  return route ? { kind: "route", to: route(id) } : null;
}

/** True when this entity type currently has a genuine, navigable destination. */
export function hasEntityDestination(type: string, id: string): boolean {
  return entityDestination(type, id) !== null;
}
