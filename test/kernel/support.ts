import { env } from "cloudflare:test";

import { createEntityRepository } from "~/platform/storage/d1";
import type { Clock, IdGenerator } from "~/kernel/entities";

/**
 * A deterministic, injectable clock for repository tests. Time only moves when
 * a test advances it — so timestamp assertions never depend on wall-clock or
 * arbitrary sleeps (see AGENTS.md §14).
 */
export class FakeClock {
  #current: Date;

  constructor(start: string | Date = "2026-07-17T00:00:00.000Z") {
    this.#current = new Date(start);
  }

  /** Bound so it can be passed directly as a `Clock`. */
  readonly now: Clock = () => new Date(this.#current);

  /** Advance the clock by a number of milliseconds. */
  advance(ms: number): this {
    this.#current = new Date(this.#current.getTime() + ms);
    return this;
  }
}

/**
 * A deterministic id generator producing lexically-ordered ids (`id_0001`,
 * `id_0002`, …). Ordering matters: it makes the `(created_at, id)` pagination
 * tiebreaker predictable in tests.
 */
export function sequentialIds(prefix = "id"): IdGenerator {
  let n = 0;
  return () => `${prefix}_${String(++n).padStart(4, "0")}`;
}

/** Construct a D1-backed repository over the isolated test database. */
export function makeRepository(options?: {
  clock?: Clock;
  idGenerator?: IdGenerator;
}) {
  return createEntityRepository(env.DB, options);
}

/** Count all rows in `entities` (including deleted) directly, for write-safety assertions. */
export async function countRows(): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM entities").first<{
    n: number;
  }>();
  return row?.n ?? 0;
}

/**
 * Clear all rows from the local test `entities` table.
 *
 * The Workers Vitest pool isolates storage PER FILE (not per test), so a
 * `beforeEach` reset gives every test a deterministic empty table while keeping
 * the migrated schema in place. Scoped strictly to the local/isolated test
 * database — never any real data.
 */
export async function resetEntities(): Promise<void> {
  await env.DB.prepare("DELETE FROM entities").run();
}
