/**
 * X-04 — `DalyHubWorkspaceSnapshotV1`: the ONE canonical, versioned, storage-
 * independent representation of an entire DalyHub workspace.
 *
 * This module is the export contract. Both shipped exports — the structured
 * archive and the Obsidian vault — are DERIVED from a snapshot built to this
 * shape, so there is exactly one serialisation of the workspace and the two
 * downloads can never drift apart. It is also the input contract a future
 * [SET-02](../../../docs/roadmap/ROADMAP_V2.md) restore will read; that is why
 * the snapshot carries stable ids, lifecycle state, structural parents and
 * module-specific child records rather than a presentation-shaped summary.
 *
 * Design rules this file exists to enforce:
 *
 *   - **Storage-independent.** No D1, React, Cloudflare or Worker type appears
 *     here. Rows arrive from a `WorkspaceSnapshotRepository`; the shapes below
 *     are the domain contract, not a table dump — but they stay deliberately
 *     CLOSE to the canonical records so nothing is invented or lost in
 *     translation.
 *   - **JSON-native.** Every timestamp is an ISO-8601 UTC string and every
 *     date-only value stays a `YYYY-MM-DD` string; absent values are explicit
 *     `null`, never omitted keys. A snapshot is `JSON.stringify`-able with no
 *     custom replacer, so the file on disk and the object in memory agree.
 *   - **Deterministic.** Every collection has a documented, total ordering (see
 *     {@link SNAPSHOT_COLLECTION_ORDER}), so two exports of unchanged data are
 *     byte-identical.
 *   - **Honest.** Archived and soft-deleted records are INCLUDED and clearly
 *     marked, never silently dropped. Anything the export could not represent
 *     completely is named in {@link WorkspaceSnapshotV1.limitations} rather than
 *     hidden.
 *
 * ## What is deliberately NOT in a snapshot
 *
 * Cloudflare bindings and secrets, Access JWTs/cookies/session state, the
 * authenticated owner's subject identifier, `DEFAULT_WORKSPACE_ID`-style
 * infrastructure configuration, raw SQL, database identifiers, application logs
 * and test fixtures. The owner's *preferences* are exported; the owner's
 * *credentials and identity artefacts* are not. See
 * `docs/development/EXPORT_AND_PORTABILITY.md`.
 */

/* -------------------------------------------------------------------------- */
/* Schema identity                                                            */
/* -------------------------------------------------------------------------- */

/** The snapshot schema name. Stable across compatible revisions. */
export const SNAPSHOT_SCHEMA_NAME = "dalyhub.workspace.snapshot";

/**
 * The snapshot schema version. Bumped only for a BREAKING change to the shapes
 * below (a removed field, a changed meaning, a changed ordering rule). Adding an
 * optional-by-`null` field is backwards compatible and does not bump it — see
 * the compatibility policy in `EXPORT_AND_PORTABILITY.md`.
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

/** The archive format name written into `manifest.json`. */
export const EXPORT_FORMAT_NAME = "dalyhub.workspace.export";

/** The archive format version written into `manifest.json`. */
export const EXPORT_FORMAT_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* Primitive aliases (documentation, not enforcement)                         */
/* -------------------------------------------------------------------------- */

/** An ISO-8601 UTC instant with millisecond precision, e.g. `2026-08-01T09:00:00.000Z`. */
export type IsoInstant = string;

/** A calendar date with no time and no timezone, e.g. `2026-08-01`. */
export type IsoDate = string;

/** A JSON value, as it appears after `JSON.parse`. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/* -------------------------------------------------------------------------- */
/* Meta                                                                       */
/* -------------------------------------------------------------------------- */

/** The safe application build facts a snapshot records about its producer. */
export interface SnapshotApplication {
  readonly name: string;
  readonly version: string;
  readonly releaseName: string;
  /** A recognised environment label, or `"unknown"`. Never a raw env value. */
  readonly environment: string;
  /** A short commit identifier when the deployment supplied one, else `null`. */
  readonly buildCommit: string | null;
}

/**
 * The read-consistency guarantee this snapshot actually carries.
 *
 * DalyHub reads D1 through many bounded, paginated statements. D1 gives each
 * statement a consistent view of the database, but a SEQUENCE of statements is
 * not an atomic point-in-time snapshot: a write committed between page 3 and
 * page 4 is visible to page 4 and not to page 3. Saying otherwise would be a
 * lie the owner could only discover during a restore, so the guarantee is named
 * in the snapshot itself.
 */
export type SnapshotConsistency = "per-statement-read-committed";

/** The single consistency value this version of the contract can produce. */
export const SNAPSHOT_CONSISTENCY: SnapshotConsistency =
  "per-statement-read-committed";

/** The snapshot's self-describing header. */
export interface SnapshotMeta {
  readonly schema: typeof SNAPSHOT_SCHEMA_NAME;
  readonly schemaVersion: number;
  readonly application: SnapshotApplication;
  /** When the export STARTED, in UTC. */
  readonly exportedAt: IsoInstant;
  readonly consistency: SnapshotConsistency;
}

/**
 * A named, machine-readable limitation of THIS snapshot — a collection that hit
 * its ceiling, a payload that would not parse, a field the contract cannot yet
 * carry. Recorded rather than hidden, and surfaced in the manifest and README.
 */
export interface SnapshotLimitation {
  /** A stable, greppable code, e.g. `collection_truncated`. */
  readonly code: string;
  /** The collection or subject the limitation applies to, when it has one. */
  readonly subject: string | null;
  /** A plain-language explanation for the person reading the export. */
  readonly detail: string;
}

/* -------------------------------------------------------------------------- */
/* Workspace and owner                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The exportable workspace identity. `id` is DalyHub's own stable workspace
 * identifier — the key every record is scoped by and the value a restore needs.
 * It is not a Cloudflare account, database or binding identifier.
 */
export interface SnapshotWorkspace {
  readonly id: string;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
}

/**
 * The owner's behavioural preferences (SET-01 / THEME-01 / TASKS-04).
 *
 * The authenticated owner's SUBJECT identifier is deliberately absent: it is an
 * identity artefact of Cloudflare Access, not workspace data, and a restore
 * re-binds preferences to whoever is authenticated at the time.
 */
export interface SnapshotOwnerPreferences {
  readonly timezone: string;
  readonly dateFormat: string;
  readonly firstDayOfWeek: string;
  readonly defaultLandingDestination: string;
  readonly defaultTasksView: string;
  readonly defaultTaskViewId: string | null;
  readonly defaultTaskDestination: string;
  readonly defaultTaskCaptureParentId: string | null;
  readonly defaultTaskCaptureParentKind: string | null;
  readonly defaultDiaryMode: string;
  readonly navigationConfig: JsonValue;
  readonly theme: string;
  /** The preference record's optimistic version; `0` when no row exists yet. */
  readonly version: number;
  readonly createdAt: IsoInstant | null;
  readonly updatedAt: IsoInstant | null;
}

/** A saved Tasks view (TASKS-03) belonging to the exporting owner. */
export interface SnapshotTaskSavedView {
  readonly id: string;
  readonly name: string;
  readonly configVersion: number;
  readonly config: JsonValue;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* Kernel records                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The uniform kernel record every first-class DalyHub record is (FND-02).
 * `deletedAt` is the soft-deletion instant: a non-null value is exported and
 * clearly marked, never dropped.
 */
export interface SnapshotEntity {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
  readonly deletedAt: IsoInstant | null;
}

/** A spine membership row (FND-07): which of the four kinds, and completion. */
export interface SnapshotSpineRecord {
  readonly entityId: string;
  readonly kind: string;
  readonly completedAt: IsoInstant | null;
}

/**
 * A typed relationship (FND-04). Direction is meaningful and preserved:
 * `sourceEntityId` → `targetEntityId`. `deletedAt` marks an UNLINKED
 * relationship, which is exported rather than discarded so a restore can
 * reproduce the exact lifecycle (including "explicitly unlinked, stays
 * unlinked").
 */
export interface SnapshotEntityLink {
  readonly id: string;
  readonly sourceEntityId: string;
  readonly targetEntityId: string;
  readonly type: string;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
  readonly deletedAt: IsoInstant | null;
}

/** One append-only Activity event (FND-05). */
export interface SnapshotActivity {
  readonly id: string;
  readonly type: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly occurredAt: IsoInstant;
  /**
   * The event's structural payload, parsed. A payload that is not valid JSON
   * (only reachable through corrupt storage) becomes `null` and is named in
   * {@link WorkspaceSnapshotV1.limitations} rather than silently swallowed.
   */
  readonly payload: JsonValue;
}

/** The association of one entity to one Activity event, with its role. */
export interface SnapshotActivitySubject {
  readonly activityId: string;
  readonly entityId: string;
  readonly role: string;
}

/* -------------------------------------------------------------------------- */
/* Module-specific detail records                                             */
/* -------------------------------------------------------------------------- */

/** Area-owned state (AREA-05): the reversible archive. */
export interface SnapshotAreaDetail {
  readonly entityId: string;
  readonly archivedAt: IsoInstant | null;
  readonly updatedAt: IsoInstant;
}

/** Goal-owned state (AREA-02). `definitionOfDone` is plain text, not Markdown. */
export interface SnapshotGoalDetail {
  readonly entityId: string;
  readonly targetDate: IsoDate | null;
  readonly definitionOfDone: string | null;
  readonly updatedAt: IsoInstant;
}

/** Project-owned state (PROJ-05): workflow status and the reversible archive. */
export interface SnapshotProjectDetail {
  readonly entityId: string;
  readonly status: string;
  readonly archivedAt: IsoInstant | null;
  readonly updatedAt: IsoInstant;
}

/** Task-owned state (TODAY-02 / TASKS-01 / TASKS-04). */
export interface SnapshotTaskDetail {
  readonly entityId: string;
  readonly status: string;
  readonly priority: string | null;
  readonly dueDate: IsoDate | null;
  readonly scheduledDate: IsoDate | null;
  readonly timeSector: string | null;
  readonly commitmentState: string;
  readonly delegateTo: string | null;
  readonly delegatedOn: IsoDate | null;
  readonly followUpOn: IsoDate | null;
  readonly delegateNote: string | null;
  /** Canonical Markdown source. Exported verbatim, never rendered. */
  readonly description: string | null;
  readonly waitingSince: IsoInstant | null;
  readonly waitingNote: string | null;
  readonly updatedAt: IsoInstant;
}

/** A Task's structured recurrence rule and its series identity (TASKS-04). */
export interface SnapshotTaskRecurrenceRule {
  readonly entityId: string;
  readonly dateKind: string;
  readonly frequency: string;
  readonly interval: number;
  readonly weekdays: string | null;
  readonly anchorDay: number | null;
  readonly anchorMonth: number | null;
  readonly seriesId: string;
  readonly sequence: number;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
}

/** Note-owned state (NOTES-01A / NOTES-03). */
export interface SnapshotNoteDetail {
  readonly entityId: string;
  /** The EXACT canonical Markdown source (ADR-015). Never rendered to HTML. */
  readonly content: string;
  readonly tags: readonly string[];
  readonly archivedAt: IsoInstant | null;
  readonly updatedAt: IsoInstant;
}

/** Diary-entry-owned state (DIARY-01A). */
export interface SnapshotDiaryEntryDetail {
  readonly entityId: string;
  readonly entryType: string;
  /** Canonical Markdown source. Exported verbatim, never rendered. */
  readonly body: string | null;
  readonly occurredAt: IsoInstant;
  readonly timezone: string;
  readonly sourceChannel: string;
  readonly sourceReference: string | null;
  readonly updatedAt: IsoInstant;
}

/** Person-owned state (PEOPLE-01/02/03). The most sensitive data in an export. */
export interface SnapshotPersonDetail {
  readonly entityId: string;
  readonly preferredName: string | null;
  readonly firstName: string | null;
  readonly middleName: string | null;
  readonly lastName: string | null;
  readonly pronouns: string | null;
  readonly organisation: string | null;
  readonly role: string | null;
  readonly department: string | null;
  readonly email: string | null;
  readonly secondaryEmail: string | null;
  readonly mobile: string | null;
  readonly workPhone: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly birthday: IsoDate | null;
  readonly relationship: string | null;
  readonly tags: readonly string[];
  readonly notes: string | null;
  readonly favouriteContactMethod: string | null;
  readonly followUpFrequency: string | null;
  readonly nextFollowUp: IsoDate | null;
  readonly lastInteraction: IsoInstant | null;
  readonly photoUrl: string | null;
  readonly archivedAt: IsoInstant | null;
  readonly updatedAt: IsoInstant;
}

/** Meeting-owned state (MEET-01/02/03). */
export interface SnapshotMeetingDetail {
  readonly entityId: string;
  readonly startsAt: IsoInstant;
  readonly endsAt: IsoInstant | null;
  readonly timezone: string;
  readonly location: string | null;
  readonly mode: string | null;
  readonly meetingUrl: string | null;
  readonly status: string;
  /** Canonical Markdown source. Exported verbatim, never rendered. */
  readonly agendaMarkdown: string;
  /** Canonical Markdown source. Exported verbatim, never rendered. */
  readonly notesMarkdown: string;
  /** When the meeting was recorded as HELD — a durable, write-once fact. */
  readonly heldAt: IsoInstant | null;
  readonly archivedAt: IsoInstant | null;
  readonly updatedAt: IsoInstant;
}

/** A structured Meeting child item: agenda, decision, outcome or action. */
export interface SnapshotMeetingItem {
  readonly id: string;
  readonly meetingId: string;
  readonly kind: string;
  /** Canonical Markdown source. Exported verbatim, never rendered. */
  readonly bodyMarkdown: string;
  readonly position: number;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
}

/**
 * The MEET-02 mapping recording WHICH meeting (and optionally which item)
 * produced a follow-up Task. It supplements the `task.relates_to` EntityLink;
 * it never replaces it.
 */
export interface SnapshotMeetingItemTask {
  readonly meetingId: string;
  readonly itemId: string | null;
  readonly taskId: string;
  readonly createdAt: IsoInstant;
}

/** Asset-owned state (ASSET-01 / ASSET-02). */
export interface SnapshotAssetDetail {
  readonly entityId: string;
  readonly assetType: string;
  readonly status: string;
  readonly description: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly referenceCode: string | null;
  readonly tags: readonly string[];
  readonly ownerPersonId: string | null;
  readonly responsiblePersonId: string | null;
  readonly location: string | null;
  readonly areaId: string | null;
  readonly acquisitionDate: IsoDate | null;
  readonly purchasePriceMinor: number | null;
  readonly currencyCode: string | null;
  readonly supplier: string | null;
  readonly replacementValueMinor: number | null;
  readonly disposalDate: IsoDate | null;
  readonly disposalNotes: string | null;
  readonly warrantyExpiry: IsoDate | null;
  readonly serviceInterval: string | null;
  readonly lastServiceDate: IsoDate | null;
  readonly nextServiceDate: IsoDate | null;
  readonly serviceProvider: string | null;
  readonly maintenanceNotes: string | null;
  readonly issuer: string | null;
  readonly referenceNumber: string | null;
  readonly issueDate: IsoDate | null;
  readonly renewalDate: IsoDate | null;
  readonly url: string | null;
  readonly documentNotes: string | null;
  readonly currentMeterValue: number | null;
  readonly currentMeterUnit: string | null;
  readonly currentMeterDate: IsoDate | null;
  readonly archivedAt: IsoInstant | null;
  readonly updatedAt: IsoInstant;
}

/** One recorded Asset history event (ASSET-02). */
export interface SnapshotAssetEvent {
  readonly id: string;
  readonly assetId: string;
  readonly category: string;
  readonly title: string;
  readonly eventDate: IsoDate;
  readonly completedAt: IsoInstant | null;
  readonly description: string | null;
  readonly provider: string | null;
  readonly personId: string | null;
  readonly costMinor: number | null;
  readonly valueMinor: number | null;
  readonly currencyCode: string | null;
  readonly meterValue: number | null;
  readonly meterUnit: string | null;
  readonly warrantyExpiry: IsoDate | null;
  readonly nextDueDate: IsoDate | null;
  readonly taskId: string | null;
  readonly noteId: string | null;
  readonly obligationId: string | null;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
  readonly archivedAt: IsoInstant | null;
  readonly deletedAt: IsoInstant | null;
}

/** One future Asset obligation — maintenance, renewal or reminder (ASSET-02). */
export interface SnapshotAssetObligation {
  readonly id: string;
  readonly assetId: string;
  readonly category: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: IsoDate | null;
  readonly leadDays: number;
  readonly recurrenceKind: string;
  readonly recurrenceInterval: number | null;
  readonly meterThreshold: number | null;
  readonly meterInterval: number | null;
  readonly meterUnit: string | null;
  readonly status: string;
  readonly taskId: string | null;
  readonly completedEventId: string | null;
  readonly completedAt: IsoInstant | null;
  readonly nextObligationId: string | null;
  readonly seriesId: string;
  readonly sequence: number;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
  readonly archivedAt: IsoInstant | null;
  readonly deletedAt: IsoInstant | null;
}

/** Review-owned state (REVIEWS-01): period, template and completion. */
export interface SnapshotReviewDetail {
  readonly entityId: string;
  readonly reviewType: string;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly status: string;
  readonly templateId: string;
  readonly completedAt: IsoInstant | null;
  readonly archivedAt: IsoInstant | null;
  readonly updatedAt: IsoInstant;
}

/** One Review section response. */
export interface SnapshotReviewSection {
  readonly reviewId: string;
  readonly sectionId: string;
  /** Canonical Markdown source. Exported verbatim, never rendered. */
  readonly bodyMarkdown: string;
  readonly updatedAt: IsoInstant;
}

/* -------------------------------------------------------------------------- */
/* The collection map                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Every paginated collection a snapshot reads, mapped to its row type.
 *
 * Declaring this as ONE map (rather than a method per table) is what keeps the
 * repository contract, the builder, the validator and the manifest counts in
 * step: adding a module means adding one entry here and one statement in the D1
 * adapter, and every downstream consumer fails to compile until it is handled.
 */
export interface SnapshotCollectionRowMap {
  readonly entities: SnapshotEntity;
  readonly spineRecords: SnapshotSpineRecord;
  readonly areaDetails: SnapshotAreaDetail;
  readonly goalDetails: SnapshotGoalDetail;
  readonly projectDetails: SnapshotProjectDetail;
  readonly taskDetails: SnapshotTaskDetail;
  readonly taskRecurrenceRules: SnapshotTaskRecurrenceRule;
  readonly noteDetails: SnapshotNoteDetail;
  readonly diaryEntryDetails: SnapshotDiaryEntryDetail;
  readonly personDetails: SnapshotPersonDetail;
  readonly meetingDetails: SnapshotMeetingDetail;
  readonly meetingItems: SnapshotMeetingItem;
  readonly meetingItemTasks: SnapshotMeetingItemTask;
  readonly assetDetails: SnapshotAssetDetail;
  readonly assetEvents: SnapshotAssetEvent;
  readonly assetObligations: SnapshotAssetObligation;
  readonly reviewDetails: SnapshotReviewDetail;
  readonly reviewSections: SnapshotReviewSection;
  readonly entityLinks: SnapshotEntityLink;
  readonly activities: SnapshotActivity;
  readonly activitySubjects: SnapshotActivitySubject;
}

/** The name of one paginated snapshot collection. */
export type SnapshotCollection = keyof SnapshotCollectionRowMap;

/**
 * The canonical read (and serialisation) order of the collections.
 *
 * Fixed and total, so a snapshot's JSON key order is stable and a restore can
 * insert parents before children without re-deriving the dependency graph:
 * entities first, then the spine, then per-module details, then children, then
 * relationships, then history.
 */
export const SNAPSHOT_COLLECTION_ORDER: readonly SnapshotCollection[] = [
  "entities",
  "spineRecords",
  "areaDetails",
  "goalDetails",
  "projectDetails",
  "taskDetails",
  "taskRecurrenceRules",
  "noteDetails",
  "diaryEntryDetails",
  "personDetails",
  "meetingDetails",
  "meetingItems",
  "meetingItemTasks",
  "assetDetails",
  "assetEvents",
  "assetObligations",
  "reviewDetails",
  "reviewSections",
  "entityLinks",
  "activities",
  "activitySubjects",
] as const;

/** The collections, as a JSON object of ordered rows. */
export type SnapshotRecords = {
  readonly [K in SnapshotCollection]: readonly SnapshotCollectionRowMap[K][];
};

/* -------------------------------------------------------------------------- */
/* The snapshot                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A complete, versioned workspace snapshot.
 *
 * Both exports are pure functions of this value. Nothing downstream reads the
 * database again, so the structured archive and the Obsidian vault describe the
 * SAME workspace state by construction.
 */
export interface WorkspaceSnapshotV1 {
  readonly meta: SnapshotMeta;
  readonly workspace: SnapshotWorkspace;
  readonly owner: {
    readonly preferences: SnapshotOwnerPreferences;
    readonly taskSavedViews: readonly SnapshotTaskSavedView[];
  };
  readonly records: SnapshotRecords;
  readonly limitations: readonly SnapshotLimitation[];
}

/* -------------------------------------------------------------------------- */
/* Derived helpers                                                            */
/* -------------------------------------------------------------------------- */

/** The lifecycle state an exported record is in, as one honest word. */
export type SnapshotLifecycleState =
  "active" | "completed" | "archived" | "deleted";

/**
 * Resolve a record's single lifecycle word from the states it actually carries.
 *
 * Precedence is deliberate and is the same everywhere the export writes a
 * lifecycle: **deleted** beats **archived** beats **completed** beats active.
 * Soft-deletion is the strongest claim (the record is gone from the product),
 * archival is the next (put away but intact), and completion is a property of a
 * record that is still very much present.
 */
export function snapshotLifecycleState(input: {
  readonly deletedAt?: string | null;
  readonly archivedAt?: string | null;
  readonly completedAt?: string | null;
}): SnapshotLifecycleState {
  if (input.deletedAt != null) return "deleted";
  if (input.archivedAt != null) return "archived";
  if (input.completedAt != null) return "completed";
  return "active";
}

/** Count the rows in every collection, in canonical order. */
export function snapshotRecordCounts(
  snapshot: WorkspaceSnapshotV1,
): Readonly<Record<SnapshotCollection, number>> {
  const counts: Partial<Record<SnapshotCollection, number>> = {};
  for (const collection of SNAPSHOT_COLLECTION_ORDER) {
    counts[collection] = snapshot.records[collection].length;
  }
  return counts as Record<SnapshotCollection, number>;
}
