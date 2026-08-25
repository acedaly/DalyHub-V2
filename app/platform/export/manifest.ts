/**
 * X-04 — `manifest.json`: what this archive is, and what is honestly in it.
 *
 * The manifest is the first file a person (or a future SET-02 restore) reads. It
 * has to answer, without opening the snapshot: which format and version is this,
 * which application produced it, when, what does it contain, what does it
 * deliberately NOT contain, and what could it not do completely.
 *
 * Counts are derived from the snapshot the archive actually carries — never from
 * a second database read — so the manifest cannot claim a record the snapshot
 * does not hold.
 */

import {
  EXPORT_FORMAT_NAME,
  EXPORT_FORMAT_VERSION,
  SNAPSHOT_COLLECTION_ORDER,
  snapshotLifecycleState,
  type SnapshotCollection,
  type SnapshotLifecycleState,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";

/** Per-entity-type counts, split by lifecycle state. */
export interface ManifestModuleCounts {
  readonly total: number;
  readonly active: number;
  readonly completed: number;
  readonly archived: number;
  readonly deleted: number;
}

/** One file the archive contains. */
export interface ManifestFile {
  readonly path: string;
  readonly bytes: number;
  /** Lowercase hex SHA-256 of the file's bytes. */
  readonly sha256: string;
}

export interface ExportManifest {
  readonly format: typeof EXPORT_FORMAT_NAME;
  readonly formatVersion: number;
  readonly snapshotSchema: string;
  readonly snapshotSchemaVersion: number;
  readonly application: WorkspaceSnapshotV1["meta"]["application"];
  readonly exportedAt: string;
  readonly workspaceId: string;
  readonly contents: {
    /** Whether the Activity stream is part of this archive. */
    readonly includesActivity: boolean;
    /** Whether soft-deleted records are part of this archive. */
    readonly includesDeletedRecords: boolean;
    /** Whether archived records are part of this archive. */
    readonly includesArchivedRecords: boolean;
    /** Whether owner preferences are part of this archive. */
    readonly includesOwnerPreferences: boolean;
  };
  /** Counts per entity type (`area`, `note`, …), split by lifecycle state. */
  readonly recordsByModule: Readonly<Record<string, ManifestModuleCounts>>;
  /** Raw row counts for every snapshot collection, including child records. */
  readonly recordsByCollection: Readonly<Record<SnapshotCollection, number>>;
  /** The read-consistency guarantee, stated plainly. */
  readonly consistency: {
    readonly guarantee: string;
    readonly explanation: string;
  };
  /** Everything this export could not do completely. */
  readonly limitations: WorkspaceSnapshotV1["limitations"];
  /** Categories deliberately absent, so their absence is not read as a bug. */
  readonly excluded: readonly string[];
  readonly files: readonly ManifestFile[];
}

/**
 * The categories an export never carries, named so the omission is explicit.
 *
 * This list is the archive's own statement of what it does NOT hold, and the
 * export contract's promise is that an omission "is reported in `limitations`
 * and in the manifest, never silently". HARDEN-06E (F-10) added the last three
 * entries: notification settings, the notification ledger and the subscribed
 * calendars had all left the snapshot with nothing said, so a restored workspace
 * came back with notifications off, the digest time and its zone gone, the
 * per-source toggles gone and every subscribed calendar gone — and the manifest
 * did not say so. Excluding the ROWS is defensible (each of those tables holds a
 * credential or a sealed feed URL); excluding them without saying so was not.
 *
 * Whether the NON-SECRET half — the digest time, its zone, the per-source
 * toggles, a calendar's name — should be exported as `owner`-scoped
 * configuration, by column rather than by table, is a separate and open
 * question, recorded as DEBT-176 rather than decided here.
 *
 * DEBT-94, which that question was compared to, IS now decided, and this list
 * is where it belongs: AI preferences are deliberately not exported. The
 * comparison was apt — the same shape, and the same answer. Those rows hold a
 * spending budget, feature switches and a privacy CONSENT, and a restore that
 * quietly re-enabled all three would spend the owner's money and re-grant a
 * consent they may have withdrawn. An archive that loses a setting is
 * recoverable in a minute; one that silently restores a consent is not.
 *
 * It is HERE and not in `limitations` for a reason worth stating, because the
 * first attempt got it wrong: `limitations` means *something happened during
 * THIS export* — a collection truncated, a payload that would not parse. A
 * standing exclusion is a property of the schema, and putting it there would
 * have made "this export hit no problems" unexpressible. `workspace-restore`'s
 * round-trip assertion, `expect(source.limitations).toEqual([])`, is exactly
 * that claim, and it caught the mistake.
 */
export const EXPORT_EXCLUSIONS: readonly string[] = [
  "Authentication artefacts: Cloudflare Access JWTs, cookies and session state.",
  "Credentials of any kind: no password, token, API key or provider secret.",
  "Workspace-member email addresses and sign-in telemetry. The membership rows an archive does carry hold a subject identifier and display names only — the minimum needed to keep exported history interpretable — and grant no access to anything.",
  "Cloudflare secrets, bindings, account, database and deployment identifiers.",
  "Application configuration and environment variables.",
  "Raw SQL, migration files and database internals.",
  "Application logs and test fixtures.",
  "Rendered HTML: Markdown is exported as its canonical source.",
  "File attachments: DalyHub stores none.",
  "Notification settings: the delivery channel, the digest time and its zone, and the per-source toggles. The row holds Pushover credentials, so it is omitted whole; a restored workspace starts with notifications off and the defaults.",
  "The notification ledger: what was sent and delivered. It is a record of how the system was operated, not anything the owner authored — the same rule the AI usage ledger follows.",
  "Calendar sources and the events read from them: a subscribed feed's sealed URL is a credential, and the events themselves belong to the calendar that publishes them. A restored workspace subscribes to nothing until the owner adds the feeds again.",
  "AI preferences: the spending budget, the allowed features and categories, and the privacy consent. Restoring them would re-enable spending and re-grant a consent the owner may have withdrawn — silently — so they are omitted. Re-set them from Settings after a restore; every other owner preference and saved view is carried.",
];

/**
 * Count records by entity type and lifecycle state.
 *
 * Lifecycle precedence is the shared kernel rule (`snapshotLifecycleState`), so
 * the manifest, the vault frontmatter and the vault banners can never disagree
 * about whether a record is archived or deleted.
 */
export function countRecordsByModule(
  snapshot: WorkspaceSnapshotV1,
): Readonly<Record<string, ManifestModuleCounts>> {
  // Index the archived and completed instants ONCE. Resolving them per entity by
  // scanning the detail arrays would be quadratic, and would bite hardest on the
  // types that have no archive at all (tasks, goals, diary entries) because every
  // one of them would scan every array to find nothing.
  const archived = new Map<string, string | null>();
  const completed = new Map<string, string | null>();
  for (const row of snapshot.records.spineRecords) {
    completed.set(row.entityId, row.completedAt);
  }
  for (const row of snapshot.records.reviewDetails) {
    completed.set(row.entityId, row.completedAt);
    archived.set(row.entityId, row.archivedAt);
  }
  for (const rows of [
    snapshot.records.areaDetails,
    snapshot.records.projectDetails,
    snapshot.records.noteDetails,
    snapshot.records.personDetails,
    snapshot.records.meetingDetails,
    snapshot.records.assetDetails,
    // HABITS-01 — a Habit carries the same reversible archive a Person does, so
    // an archived Habit is counted as archived rather than as active.
    snapshot.records.habitDetails,
  ]) {
    for (const row of rows) archived.set(row.entityId, row.archivedAt);
  }

  const counts = new Map<string, ManifestModuleCounts>();
  for (const entity of snapshot.records.entities) {
    const state: SnapshotLifecycleState = snapshotLifecycleState({
      deletedAt: entity.deletedAt,
      // The map covers every type that HAS an archive column, so a miss means
      // "this type cannot be archived", not "look somewhere else".
      archivedAt: archived.get(entity.id) ?? null,
      completedAt: completed.get(entity.id) ?? null,
    });
    const current = counts.get(entity.type) ?? {
      total: 0,
      active: 0,
      completed: 0,
      archived: 0,
      deleted: 0,
    };
    counts.set(entity.type, {
      total: current.total + 1,
      active: current.active + (state === "active" ? 1 : 0),
      completed: current.completed + (state === "completed" ? 1 : 0),
      archived: current.archived + (state === "archived" ? 1 : 0),
      deleted: current.deleted + (state === "deleted" ? 1 : 0),
    });
  }
  // Sorted keys, so the manifest is deterministic.
  return Object.fromEntries(
    [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
  );
}

/** Build the manifest for an archive. `files` is filled in by the assembler. */
export function buildExportManifest(
  snapshot: WorkspaceSnapshotV1,
  files: readonly ManifestFile[],
): ExportManifest {
  const byModule = countRecordsByModule(snapshot);
  const byCollection = Object.fromEntries(
    SNAPSHOT_COLLECTION_ORDER.map((collection) => [
      collection,
      snapshot.records[collection].length,
    ]),
  ) as Record<SnapshotCollection, number>;

  const deletedRecords = Object.values(byModule).reduce(
    (total, counts) => total + counts.deleted,
    0,
  );
  const archivedRecords = Object.values(byModule).reduce(
    (total, counts) => total + counts.archived,
    0,
  );

  return {
    format: EXPORT_FORMAT_NAME,
    formatVersion: EXPORT_FORMAT_VERSION,
    snapshotSchema: snapshot.meta.schema,
    snapshotSchemaVersion: snapshot.meta.schemaVersion,
    application: snapshot.meta.application,
    exportedAt: snapshot.meta.exportedAt,
    workspaceId: snapshot.workspace.id,
    contents: {
      // These are statements about THIS archive, derived from it. An empty
      // workspace reports `true` with a zero count — "included, and there were
      // none" is a different claim from "excluded".
      includesActivity: true,
      includesDeletedRecords: true,
      includesArchivedRecords: true,
      includesOwnerPreferences: true,
    },
    recordsByModule: byModule,
    recordsByCollection: byCollection,
    consistency: {
      guarantee: snapshot.meta.consistency,
      explanation:
        "The snapshot was read through a sequence of bounded, workspace-scoped " +
        "statements. Each statement saw a consistent database, but the sequence " +
        "is not an atomic point-in-time snapshot: a write committed while the " +
        "export was running may be present in some collections and absent from " +
        "others. DalyHub does not claim a stronger guarantee than D1 provides " +
        "for this read pattern.",
    },
    limitations: [
      ...snapshot.limitations,
      ...(deletedRecords > 0
        ? [
            {
              code: "deleted_records_included" as const,
              subject: null,
              detail: `${deletedRecords} soft-deleted record(s) are included and marked, not omitted.`,
            },
          ]
        : []),
      ...(archivedRecords > 0
        ? [
            {
              code: "archived_records_included" as const,
              subject: null,
              detail: `${archivedRecords} archived record(s) are included and marked.`,
            },
          ]
        : []),
    ],
    excluded: EXPORT_EXCLUSIONS,
    files,
  };
}
