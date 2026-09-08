/**
 * V2.16 CONSOL-04 — the archive support HORIZON, made checkable.
 *
 * The compatibility POLICY has always been written down (what happens to an
 * archive of a given version). How far BACK it reaches was only ever implied by
 * three lists, and a consolidation release is exactly when that gets quietly
 * narrowed — somebody removes a "legacy" reader nothing seems to use, and the
 * promise "export always possible" (AGENTS.md section 2) becomes "yesterday's
 * backup restores".
 *
 * The claim, stated in `EXPORT_AND_PORTABILITY.md` section 8 and asserted here:
 *
 * > **DalyHub reads every archive it has ever written.**
 *
 * Three append-only lists are what make it true, and each is a permanent
 * statement about files already on somebody's disk:
 *
 *   - `RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS` — the versions a build can read;
 *   - `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` — collections an OLDER archive
 *     may lack, because it predates them;
 *   - `RETIRED_SNAPSHOT_COLLECTIONS` — collections whose STORE is gone, still
 *     read and upgraded on the way in.
 *
 * What this file cannot do is stop a future author deleting an entry — no test
 * can, short of pinning every list to a literal that would then have to be
 * edited alongside it, which is the same edit twice. What it CAN do is make the
 * shape of the promise explicit and fail on the specific mistakes that would
 * break it silently: a retired collection that is also required on read, a
 * retired collection missing from the archive's shape, an optional collection
 * that is not a real collection, and an empty version list.
 */

import { describe, expect, it } from "vitest";

import {
  RETIRED_SNAPSHOT_COLLECTIONS,
  SNAPSHOT_COLLECTION_ORDER,
  SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS,
  SNAPSHOT_SCHEMA_VERSION,
} from "~/kernel/export";
import { RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS } from "~/kernel/restore";

describe("V2.16 CONSOL-04 — the archive support horizon", () => {
  it("can read the version it writes", () => {
    // The floor of the whole promise: an export DalyHub writes must be one it
    // will read back. DEBT-247 is what happens when that stops being true.
    expect(RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS).toContain(
      SNAPSHOT_SCHEMA_VERSION,
    );
    expect(RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS.length).toBeGreaterThan(0);
  });

  it("keeps every RETIRED collection in the archive's shape", () => {
    /*
     * Retiring a TABLE and retiring a COLLECTION are different acts. The table
     * can go; the key it occupied stays in the order, so the shape of an
     * archive never changes and a reader written for an older one still finds
     * what it expects.
     */
    for (const collection of RETIRED_SNAPSHOT_COLLECTIONS) {
      expect(
        SNAPSHOT_COLLECTION_ORDER,
        `${collection} is retired and must keep its place in the archive`,
      ).toContain(collection);
    }
  });

  it("marks every RETIRED collection optional on read", () => {
    /*
     * The mistake this catches, and it is a quiet one: a retired collection is
     * never WRITTEN any more, so every archive written after the retirement
     * lacks it. If it were still required on read, DalyHub would refuse its own
     * recent exports — the exact inversion of the compatibility this list is
     * for.
     */
    for (const collection of RETIRED_SNAPSHOT_COLLECTIONS) {
      expect(
        SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS,
        `${collection} is retired, so an archive written since must validate without it`,
      ).toContain(collection);
    }
  });

  it("names only real collections in either list", () => {
    const known = new Set<string>(SNAPSHOT_COLLECTION_ORDER);
    for (const collection of [
      ...RETIRED_SNAPSHOT_COLLECTIONS,
      ...SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS,
    ]) {
      expect(known.has(collection), collection).toBe(true);
    }
  });

  it("keeps the worked example: assetObligations", () => {
    /*
     * Pinned by NAME rather than by count, because it is the case the whole
     * mechanism was built for and the one a future reader will want to find:
     * V2.10 replaced `asset_obligations` with `obligation_details`, and an
     * archive written before that still restores — upgraded on read by the same
     * rule migration `0050` applied to the live rows.
     */
    expect(RETIRED_SNAPSHOT_COLLECTIONS).toContain("assetObligations");
    expect(SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS).toContain("assetObligations");
    expect(SNAPSHOT_COLLECTION_ORDER).toContain("assetObligations");
  });

  it("lists no collection twice in the order", () => {
    // The order is the archive's key order. A duplicate would make one
    // collection's rows overwrite another's on the way out.
    expect(new Set(SNAPSHOT_COLLECTION_ORDER).size).toBe(
      SNAPSHOT_COLLECTION_ORDER.length,
    );
  });
});
