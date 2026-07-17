/**
 * FND-02/FND-03 Data kernel — D1 storage adapter public surface.
 *
 * Construct persistence-backed repositories from here. Returned values are typed
 * as the kernel's contracts (`EntityRepository`, `WorkspaceRepository`), so
 * callers depend on the contract, not on D1.
 *
 * The entity repository is WORKSPACE-BOUND: its factory requires a
 * `WorkspaceContext`, so this barrel exposes no unscoped, convenient
 * entity-store construction path (FND-03 / ADR-010). The `WorkspaceRepository`
 * is a low-level platform/bootstrap store (creating and verifying workspace
 * records), deliberately named as such and not a module-facing contract.
 */

import type { EntityRepository } from "~/kernel/entities";
import type {
  WorkspaceContext,
  WorkspaceRepository,
} from "~/kernel/workspaces";

import {
  D1EntityRepository,
  type D1EntityRepositoryOptions,
} from "./d1-entity-repository";
import {
  D1WorkspaceRepository,
  type D1WorkspaceRepositoryOptions,
} from "./d1-workspace-repository";

export { D1EntityRepository, type D1EntityRepositoryOptions };
export { D1WorkspaceRepository, type D1WorkspaceRepositoryOptions };
export type { EntityRow } from "./database";
export type { WorkspaceRow } from "./workspace-database";

/**
 * Factory for a workspace-scoped D1-backed entity repository. The returned
 * repository operates only within `context`'s workspace; there is no way to
 * construct one without a context. Prefer this over `new` at call sites so the
 * concrete adapter type stays an implementation detail.
 */
export function createEntityRepository(
  db: D1Database,
  context: WorkspaceContext,
  options?: D1EntityRepositoryOptions,
): EntityRepository {
  return new D1EntityRepository(db, context, options);
}

/**
 * Factory for the low-level D1-backed workspace repository. This is a
 * platform/bootstrap concern used by the composition boundary to establish a
 * `WorkspaceContext`; it is not handed to modules.
 */
export function createWorkspaceRepository(
  db: D1Database,
  options?: D1WorkspaceRepositoryOptions,
): WorkspaceRepository {
  return new D1WorkspaceRepository(db, options);
}
