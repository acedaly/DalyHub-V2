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
 * > **DalyHub reads every schema-version-2 archive it has ever written, and
 * > refuses a version-1 archive by name.**
 *
 * That sentence took two goes. The first draft of this file said "every archive
 * it has ever written" and asserted it with
 * `expect(RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS).toContain(SNAPSHOT_SCHEMA_VERSION)`
 * against a list DEFINED as `[SNAPSHOT_SCHEMA_VERSION]` — `[X].includes(X)`, a
 * check that cannot fail and a claim that was already false, because v1 archives
 * have been refused since the M3-01 bump on 2026-08-21. That is the exact shape
 * of defect V2.16 exists to remove, found by the programme's own independent
 * review pass, so it is recorded here rather than quietly corrected.
 *
 * Both halves are now real. The version list is a LITERAL in
 * `backup-compatibility.ts`, pinned here, so narrowing the horizon fails a test
 * instead of happening as a side effect of a schema bump; and the REFUSAL is
 * exercised through `readBackupCompatibility` on a version either side of the
 * horizon, which is behaviour rather than a restatement of a constant.
 *
 * Within the horizon, two more append-only lists carry the promise, and each is
 * a permanent statement about files already on somebody's disk:
 *
 *   - `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS` — collections an OLDER archive
 *     may lack, because it predates them;
 *   - `RETIRED_SNAPSHOT_COLLECTIONS` — collections whose STORE is gone, still
 *     read and upgraded on the way in.
 */

import { describe, expect, it } from "vitest";

import {
  RETIRED_SNAPSHOT_COLLECTIONS,
  SNAPSHOT_COLLECTION_ORDER,
  SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS,
  SNAPSHOT_SCHEMA_NAME,
  SNAPSHOT_SCHEMA_VERSION,
} from "~/kernel/export";
import {
  RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS,
  readBackupCompatibility,
} from "~/kernel/restore";

describe("V2.16 CONSOL-04 — the archive support horizon", () => {
  it("can read the version it writes", () => {
    // The floor of the whole promise: an export DalyHub writes must be one it
    // will read back. DEBT-247 is what happens when that stops being true.
    expect(RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS).toContain(
      SNAPSHOT_SCHEMA_VERSION,
    );
  });

  it("states the horizon as a LITERAL, so narrowing it is a deliberate edit", () => {
    /*
     * Pinned to its exact contents on purpose. Any assertion weaker than this
     * is satisfiable by a list derived from the current schema version, which
     * is what this constant used to be — and a derived list drops the previous
     * version at the moment of a bump, silently, in the same commit.
     *
     * Changing this line is the whole cost of changing the horizon, and it is
     * meant to be paid in the same review as the change.
     */
    expect([...RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS]).toEqual([2]);
  });

  it("ACCEPTS an archive at the horizon and REFUSES one either side, by name", () => {
    /*
     * Behaviour, not a restatement of the constant. `readBackupCompatibility`
     * is what an owner's restore actually runs, and a refusal has to be a named
     * verdict rather than a throw, a crash or a partial read — because the one
     * thing worse than declining an old backup is half-importing it.
     */
    const header = (schemaVersion: number) => ({
      meta: { schema: SNAPSHOT_SCHEMA_NAME, schemaVersion },
    });

    expect(readBackupCompatibility(header(2)).status).toBe("supported");

    // Below: the one break DalyHub has made. `owner.preferences.theme` names a
    // feature that no longer exists (M3-01, migration 0031).
    const old = readBackupCompatibility(header(1));
    expect(old.status).toBe("unsupported_version");
    expect(old.schemaVersion).toBe(1);

    // Above: an archive from a FUTURE build. Refused for the same reason and in
    // the same words — a reader that guesses forwards is a reader that invents.
    expect(readBackupCompatibility(header(3)).status).toBe(
      "unsupported_version",
    );
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
