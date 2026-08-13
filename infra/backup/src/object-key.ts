/**
 * BACKUP-01 — deterministic R2 object naming for production D1 backups.
 *
 * ── Why this is not Cloudflare's filename ─────────────────────────────────────
 * The D1 export API hands back a generated filename of its own. It is fine as a
 * transfer name and useless as a long-term key: it does not sort, it does not
 * say which database it came from, and it does not say when the backup was
 * taken. On the day the owner is recovering, the question is always "which of
 * these is the most recent good one, and what moment does it represent?" — so
 * the key answers exactly that, and Cloudflare's own name is retained as object
 * metadata rather than as the identity of the object.
 *
 * ── The shape ─────────────────────────────────────────────────────────────────
 *
 *     production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql
 *     └─ env ──┘└ tier ┘└ y ┘└m┘ └ database ┘└─ UTC instant ──┘
 *
 * - **UTC, always.** The owner is in Australia/Sydney, which changes offset
 *   twice a year. A local-time key would sort wrongly across a DST boundary and
 *   would be ambiguous for one hour every April. The `Z` is not decoration.
 * - **Lexicographically sortable.** `YYYY-MM-DDTHHMMSSZ` sorts identically as a
 *   string and as an instant, so an R2 prefix listing is already in time order
 *   and "the newest backup" needs no parsing.
 * - **Year/month directories.** They keep a listing browsable by hand once there
 *   are ninety of them, and they make an R2 lifecycle prefix rule read naturally.
 * - **No colons.** `16:00:00Z` would be a legal R2 key but is hostile to shells,
 *   S3 tooling and local filesystems on download. The time is written compactly
 *   instead, which is still unambiguous.
 * - **The tier is in the key**, because retention is enforced by an R2 lifecycle
 *   rule keyed on the prefix (`production/daily/` → 90 days,
 *   `production/manual/` → 365). The key is therefore the retention policy: a
 *   backup cannot be filed under the wrong tier and quietly outlive or
 *   under-live its rule. See infra/backup/README.md § Retention.
 *
 * Everything here is PURE and has no Workers dependency, so the naming rules are
 * tested directly rather than inferred from a live backup.
 */

/**
 * Which retention tier a backup belongs to.
 *
 * `daily` is what the Workflow's own cron schedule produces; `manual` is what an
 * operator-triggered run produces. They are separate prefixes because they carry
 * genuinely different retention, and a manual backup taken deliberately before a
 * risky migration should not be swept away on the daily rule's 90-day clock.
 */
export type BackupTrigger = "daily" | "manual";

/** The object-key prefix for each tier. Lifecycle rules are keyed on these. */
export const BACKUP_PREFIX: Record<BackupTrigger, string> = {
  daily: "production/daily/",
  manual: "production/manual/",
};

/** Retention, in days, that the R2 lifecycle rule applies to each prefix. */
export const BACKUP_RETENTION_DAYS: Record<BackupTrigger, number> = {
  daily: 90,
  manual: 365,
};

/** File extension. The dump is plain SQL — see README § "Why not encrypted". */
export const BACKUP_EXTENSION = ".sql";

function twoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Format an instant as the compact, sortable UTC stamp used in object keys:
 * `2026-08-13T160000Z`.
 *
 * Built from the explicit `getUTC*` accessors rather than by slicing
 * `toISOString()`, so the intent is legible and a future edit cannot silently
 * reintroduce local time. Sub-second precision is deliberately dropped: two
 * backups of the same database in the same second are not a case worth naming
 * around, and the collision guard in the Workflow covers it properly.
 *
 * @throws if given a date that is not a valid instant — a NaN timestamp would
 *   otherwise produce a key like `NaN-NaN-NaNTNaNNaNNaNZ` and store a real
 *   backup under an unfindable name.
 */
export function backupTimestamp(at: Date): string {
  const time = at.getTime();
  if (!Number.isFinite(time)) {
    throw new Error("Cannot build a backup key from an invalid date.");
  }
  const date = `${at.getUTCFullYear()}-${twoDigits(at.getUTCMonth() + 1)}-${twoDigits(at.getUTCDate())}`;
  const clock = `${twoDigits(at.getUTCHours())}${twoDigits(at.getUTCMinutes())}${twoDigits(at.getUTCSeconds())}`;
  return `${date}T${clock}Z`;
}

/**
 * Build the full R2 object key for a backup. PURE.
 *
 * The database name is validated rather than trusted: it reaches this function
 * from configuration, and a value carrying a slash, a space or a `..` segment
 * would file the backup somewhere other than the tier whose lifecycle rule is
 * supposed to govern it. Refusing is the only safe answer — a backup stored
 * outside its retention prefix is either kept forever or deleted early, and
 * neither is discovered until it matters.
 */
export function backupObjectKey(options: {
  trigger: BackupTrigger;
  databaseName: string;
  at: Date;
}): string {
  const { trigger, databaseName, at } = options;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(databaseName)) {
    throw new Error(
      `Refusing to build a backup key for an unsafe database name: ${JSON.stringify(databaseName)}.`,
    );
  }
  const prefix = BACKUP_PREFIX[trigger];
  if (prefix === undefined) {
    throw new Error(`Unknown backup trigger: ${JSON.stringify(trigger)}.`);
  }
  const stamp = backupTimestamp(at);
  const year = at.getUTCFullYear();
  const month = twoDigits(at.getUTCMonth() + 1);
  return `${prefix}${year}/${month}/${databaseName}-${stamp}${BACKUP_EXTENSION}`;
}
