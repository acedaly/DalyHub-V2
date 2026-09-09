/**
 * SET-02 — the version gate a restore passes BEFORE it looks at anything else.
 *
 * Data recovery is the wrong place for guesswork. A backup whose schema DalyHub
 * does not understand is not "mostly readable"; it is a file whose field
 * meanings are unknown, and importing it on a best-effort basis is how an owner
 * loses the data they were trying to protect. So this module answers exactly one
 * question — *may this build read this file at all?* — and answers it from the
 * two self-describing fields the X-04 contract guarantees are first:
 * `meta.schema` and `meta.schemaVersion`.
 *
 * It runs before {@link validateWorkspaceSnapshot}, deliberately: the validator
 * checks a snapshot of the CURRENT shape, so pointing it at a v3 archive would
 * produce a hundred confusing field errors instead of the one true statement
 * ("this backup is newer than this DalyHub").
 *
 * Storage-independent and total: it never throws, and it accepts an arbitrary
 * parsed JSON value, because the value it is given came out of a file the owner
 * supplied.
 */

import { SNAPSHOT_SCHEMA_NAME } from "~/kernel/export";

/**
 * Every snapshot schema version THIS build can restore.
 *
 * A list rather than a comparison because "can restore" is a statement about
 * code that exists, not about arithmetic: when version 3 lands, whether version
 * 2 is still restorable depends on whether a reader for it was written, and
 * that decision belongs here in the open.
 *
 * **V2.16 CONSOL-04 — written as a LITERAL, not as `[SNAPSHOT_SCHEMA_VERSION]`.**
 * It used to be derived from the current version, which made it a promise that
 * could never be broken and never be kept: bumping the schema would have
 * dropped the previous version from the horizon silently, in the same commit,
 * with no test able to notice — because the only assertion available against a
 * derived list is that it contains the thing it was derived from. Spelling the
 * versions out makes narrowing the horizon an edit somebody has to make on
 * purpose, which is the whole point of having a horizon.
 *
 * **Version 1 is deliberately NOT here.** It is the one break DalyHub has ever
 * made to this shape: v1 carries `owner.preferences.theme`, a field whose
 * feature no longer exists (M3-01, migration `0031`). A v1 archive is refused
 * by name — `unsupported_version`, never a silent failure or a guess — and
 * stays readable as a historical artefact rather than being mistaken for a
 * current one.
 */
export const RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS: readonly number[] = [2];

/** Why a backup's declared version was or was not accepted. */
export type BackupCompatibilityStatus =
  /** The schema and version are both understood by this build. */
  | "supported"
  /** The value is not a JSON object with a `meta` object at all. */
  | "not_a_snapshot"
  /** `meta.schema` names something other than a DalyHub workspace snapshot. */
  | "unknown_schema"
  /** `meta.schemaVersion` is absent. A version-less file is never guessed at. */
  | "missing_version"
  /** `meta.schemaVersion` is present but is not a positive integer. */
  | "malformed_version"
  /** A DalyHub snapshot of a version this build cannot read (older OR newer). */
  | "unsupported_version";

/** The verdict, with the facts a message can be written from. */
export interface BackupCompatibility {
  readonly status: BackupCompatibilityStatus;
  /** The declared version when it was a usable number, else `null`. */
  readonly schemaVersion: number | null;
  /** The declared schema name when it was a string, else `null`. */
  readonly schema: string | null;
  /** The versions this build can read, for an honest message. */
  readonly supportedVersions: readonly number[];
}

function verdict(
  status: BackupCompatibilityStatus,
  schema: string | null,
  schemaVersion: number | null,
): BackupCompatibility {
  return {
    status,
    schema,
    schemaVersion,
    supportedVersions: RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS,
  };
}

/**
 * Read a parsed backup's declared schema identity and decide whether this build
 * may proceed.
 *
 * Every non-`supported` answer is a refusal. There is deliberately no
 * "supported with warnings" and no coercion: a version that reads `"2"` as a
 * string is malformed, not two, because a file DalyHub wrote never looks like
 * that and a file that does has been through something this code cannot model.
 */
export function readBackupCompatibility(value: unknown): BackupCompatibility {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return verdict("not_a_snapshot", null, null);
  }
  const meta = (value as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null || Array.isArray(meta)) {
    return verdict("not_a_snapshot", null, null);
  }

  const schema = (meta as { schema?: unknown }).schema;
  const schemaName = typeof schema === "string" ? schema : null;
  if (schemaName !== SNAPSHOT_SCHEMA_NAME) {
    return verdict("unknown_schema", schemaName, null);
  }

  const rawVersion = (meta as { schemaVersion?: unknown }).schemaVersion;
  if (rawVersion === undefined || rawVersion === null) {
    return verdict("missing_version", schemaName, null);
  }
  if (
    typeof rawVersion !== "number" ||
    !Number.isInteger(rawVersion) ||
    rawVersion < 1
  ) {
    return verdict("malformed_version", schemaName, null);
  }
  if (!RESTORABLE_SNAPSHOT_SCHEMA_VERSIONS.includes(rawVersion)) {
    return verdict("unsupported_version", schemaName, rawVersion);
  }
  return verdict("supported", schemaName, rawVersion);
}
