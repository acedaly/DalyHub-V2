/**
 * SET-02 — the version gate.
 *
 * Data recovery is the wrong place for guesswork, so the interesting assertions
 * here are all refusals: a backup DalyHub does not understand must be REFUSED,
 * not partially read, not coerced, and not silently treated as the current
 * version. Each case below is a shape a real file has actually taken at some
 * point in some product's history — a missing field, a stringified number, a
 * future version, a different application's JSON.
 */

import { describe, expect, it } from "vitest";

import { SNAPSHOT_SCHEMA_NAME, SNAPSHOT_SCHEMA_VERSION } from "~/kernel/export";
import {
  RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS,
  readBackupCompatibility,
} from "~/kernel/restore";

const meta = (patch: Record<string, unknown> = {}) => ({
  meta: {
    schema: SNAPSHOT_SCHEMA_NAME,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    ...patch,
  },
});

describe("backup compatibility", () => {
  it("accepts the version this build writes", () => {
    const verdict = readBackupCompatibility(meta());
    expect(verdict.status).toBe("supported");
    expect(verdict.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS).toContain(
      SNAPSHOT_SCHEMA_VERSION,
    );
  });

  it("refuses a FUTURE version rather than reading it optimistically", () => {
    const verdict = readBackupCompatibility(
      meta({ schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 }),
    );
    expect(verdict.status).toBe("unsupported_version");
    expect(verdict.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION + 1);
  });

  it("refuses an OLDER version this build has no reader for", () => {
    expect(readBackupCompatibility(meta({ schemaVersion: 1 })).status).toBe(
      "unsupported_version",
    );
  });

  it("refuses a missing version", () => {
    expect(
      readBackupCompatibility({ meta: { schema: SNAPSHOT_SCHEMA_NAME } })
        .status,
    ).toBe("missing_version");
    expect(readBackupCompatibility(meta({ schemaVersion: null })).status).toBe(
      "missing_version",
    );
  });

  it("refuses a malformed version instead of coercing it", () => {
    // The exact trap: "2" is not 2. A file that says this has been through
    // something the reader cannot model, and guessing is how data is lost.
    for (const value of ["2", 2.5, 0, -1, Number.NaN, {}, []]) {
      expect(
        readBackupCompatibility(meta({ schemaVersion: value })).status,
        `schemaVersion ${JSON.stringify(value)}`,
      ).toBe("malformed_version");
    }
  });

  it("refuses another application's JSON", () => {
    expect(
      readBackupCompatibility({
        meta: { schema: "notion.export", schemaVersion: 2 },
      }).status,
    ).toBe("unknown_schema");
  });

  it("is total: it never throws, whatever it is handed", () => {
    for (const value of [
      null,
      undefined,
      42,
      "text",
      [],
      {},
      { meta: null },
      { meta: [] },
    ]) {
      expect(() => readBackupCompatibility(value)).not.toThrow();
    }
    expect(readBackupCompatibility(null).status).toBe("not_a_snapshot");
    expect(readBackupCompatibility([]).status).toBe("not_a_snapshot");
    expect(readBackupCompatibility({}).status).toBe("not_a_snapshot");
  });
});
