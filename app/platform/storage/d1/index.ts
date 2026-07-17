/**
 * FND-02 Data kernel — D1 storage adapter public surface.
 *
 * Construct a persistence-backed repository from here. The returned value is
 * typed as the kernel's `EntityRepository` contract, so callers depend on the
 * contract, not on D1.
 */

import type { EntityRepository } from "~/kernel/entities";

import {
  D1EntityRepository,
  type D1EntityRepositoryOptions,
} from "./d1-entity-repository";

export { D1EntityRepository, type D1EntityRepositoryOptions };
export type { EntityRow } from "./database";

/**
 * Factory for a D1-backed entity repository. Prefer this over `new` at call
 * sites so the concrete adapter type stays an implementation detail.
 */
export function createEntityRepository(
  db: D1Database,
  options?: D1EntityRepositoryOptions,
): EntityRepository {
  return new D1EntityRepository(db, options);
}
