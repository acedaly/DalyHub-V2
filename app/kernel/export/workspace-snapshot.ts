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
 *
 * **2 (M3-01).** `owner.preferences.theme` is REMOVED. DalyHub no longer has a
 * theme feature — one generated light/dark pair, selected by
 * `prefers-color-scheme` (ADR-074) — and migration `0031` drops the column the
 * field mirrored. A removed field is exactly the breaking change this constant
 * exists to signal, so a v1 archive is still readable as a historical artefact
 * and is not mistaken for a current one.
 */
export const SNAPSHOT_SCHEMA_VERSION = 2;

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
  /**
   * APPEARANCE-01 — the owner's System/Light/Dark choice.
   *
   * Added by SET-02 because a restore that silently reset it would be an
   * unfaithful reconstruction of owner configuration the snapshot already claims
   * to carry (`timezone`, `dateFormat`, the landing destination …). It is
   * additive: an archive written before this field existed simply omits the key,
   * and a reader defaults it to `"system"`.
   */
  readonly appearance: string;
  /**
   * THEME-01 — the owner's colour scheme, carried for exactly the reason above:
   * a restore that silently reset it would be an unfaithful reconstruction of
   * configuration the snapshot already claims to carry. Additive in the same way
   * — an archive written before this field existed omits the key, and a reader
   * defaults it to `"violet"`, which is what was true when it was written.
   */
  readonly colorScheme: string;
  readonly navigationConfig: JsonValue;
  /** The preference record's optimistic version; `0` when no row exists yet. */
  readonly version: number;
  readonly createdAt: IsoInstant | null;
  readonly updatedAt: IsoInstant | null;
}

/** A saved Tasks view (TASKS-03) belonging to the exporting owner. */
export interface SnapshotTaskSavedView {
  readonly id: string;
  /**
   * X-02 — which configuration vocabulary this row speaks (`tasks` | `cross`).
   * Saved views of every kind share one table and one repository, so the export
   * carries the discriminator rather than silently exporting a cross-module view
   * as if it were a Tasks one. Absent in archives written before X-02, which
   * read back as `tasks` — the value that was true when they were written.
   */
  readonly kind: string;
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

/**
 * Area-owned state (AREA-05): the reversible archive, and the owner's chosen
 * icon.
 *
 * `iconKey` is the stored KEY verbatim — `"travel"`, never a glyph, markup or a
 * component name — and `null` means "no choice, use the entity default". It is
 * exported UNNORMALISED, exactly as the column holds it: an export is a record
 * of what the database contains, so a key this build no longer recognises must
 * survive the round trip rather than being quietly dropped by the exporter. The
 * READ path normalises instead (`D1AreaSettingsRepository`), which is where a
 * stale key should become the default.
 *
 * Additive and optional-by-`null`, so it does not bump the schema version.
 */
export interface SnapshotAreaDetail {
  readonly entityId: string;
  readonly archivedAt: IsoInstant | null;
  readonly iconKey: string | null;
  /**
   * IDENTITY-01 — the owner's chosen colour SLOT, verbatim, on exactly the same
   * terms as `iconKey`: a stable NAME (`"teal"`), never a hex, `null` for "no
   * choice — derive it", exported UNNORMALISED, additive and
   * optional-by-`null`.
   *
   * An archive that omitted it would restore a workspace in which every chosen
   * identity had reverted to its derived default — a silent loss of something
   * the owner deliberately set, and exactly the portability failure the export
   * exists to prevent.
   */
  readonly colourSlot: string | null;
  readonly updatedAt: IsoInstant;
}

/**
 * Goal-owned state (AREA-02, extended by GOAL-02). `definitionOfDone` is plain
 * text, not Markdown.
 *
 * The five measurement fields are additive and optional-by-`null`, so an archive
 * written before GOAL-02 restores unchanged: absent keys read as `null`, which is
 * exactly the "no measurement configured" state those Goals were in.
 */
export interface SnapshotGoalDetail {
  readonly entityId: string;
  readonly targetDate: IsoDate | null;
  readonly definitionOfDone: string | null;
  readonly measurementType: string | null;
  readonly measurementUnit: string | null;
  readonly measurementDirection: string | null;
  readonly baselineValue: number | null;
  readonly targetValue: number | null;
  /**
   * IDENTITY-01 — a Goal's OWN identity, which it did not have before this
   * release. `null` on both means "inherit the Area's", which is what every
   * Goal in an archive written before IDENTITY-01 restores as. See
   * {@link SnapshotAreaDetail.colourSlot}.
   */
  readonly iconKey: string | null;
  readonly colourSlot: string | null;
  readonly updatedAt: IsoInstant;
}

/**
 * One recorded Goal measurement (GOAL-02).
 *
 * The history IS the Goal's progress — the current value is the latest row here,
 * never a stored percentage — so an export that omitted it would produce a
 * restore in which every measurable Goal had silently forgotten where it was.
 * `measuredOn` is an owner-calendar date, never an instant.
 */
export interface SnapshotGoalMeasurement {
  readonly id: string;
  readonly goalId: string;
  readonly value: number;
  readonly measuredOn: IsoDate;
  readonly note: string | null;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
}

/** One defined stage of a milestone-measured Goal (GOAL-02). */
export interface SnapshotGoalMilestone {
  readonly id: string;
  readonly goalId: string;
  readonly title: string;
  readonly weight: number;
  readonly position: number;
  readonly completedAt: IsoInstant | null;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
}

/**
 * Project-owned state (PROJ-05): workflow status, the reversible archive, and
 * the owner's chosen icon. `iconKey` carries the same contract as
 * {@link SnapshotAreaDetail.iconKey} — the stored key verbatim, `null` for no
 * choice, additive and optional-by-`null`.
 */
export interface SnapshotProjectDetail {
  readonly entityId: string;
  readonly status: string;
  readonly archivedAt: IsoInstant | null;
  readonly iconKey: string | null;
  /** IDENTITY-01 — see {@link SnapshotAreaDetail.colourSlot}. */
  readonly colourSlot: string | null;
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

/**
 * REVIEW-02 — a Review's guided-flow resume bookmark: the step the owner
 * deliberately stopped on, plus the revision that makes a stale write refusable.
 *
 * Exported because "own the data" (AGENTS.md §7) covers owner-scoped product
 * state, exactly as it already covers `taskSavedViews` and owner preferences.
 * A restored workspace should reopen a half-finished Review where its owner left
 * it, not at step one.
 */
export interface SnapshotReviewWorkflowState {
  readonly reviewId: string;
  readonly currentStep: string;
  readonly revision: number;
  readonly updatedAt: IsoInstant;
}

/**
 * REVIEW-02 — one step the owner explicitly marked reviewed.
 *
 * The reason this is exported rather than treated as scratch state: it records a
 * DECISION no calculation can reproduce ("I am leaving these Inbox Tasks on
 * purpose"), and it gates whether the guided flow will complete the Review
 * (ADR-072 decision 3). Dropping it from an export would lose owner intent, not
 * merely convenience.
 */
export interface SnapshotReviewStepAcknowledgement {
  readonly reviewId: string;
  readonly stepId: string;
  readonly acknowledgedAt: IsoInstant;
}

/**
 * REVIEW-03 — one completed Review's insight snapshot.
 *
 * Exported because it is the ONE thing in the insight feature that cannot be
 * recomputed: it states what a Project's health and a Goal's contribution WERE
 * at a past Review point, and the inputs to that only describe the present.
 * Dropping it from an archive would silently erase the owner's ability to see
 * what changed, and no restore could rebuild it. `factsJson` is carried
 * verbatim, versioned by the row's own `version`, so an archive written under
 * an older shape still round-trips unchanged.
 */
export interface SnapshotReviewInsightSnapshot {
  readonly reviewId: string;
  readonly version: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly capturedAt: IsoInstant;
  readonly factsJson: string;
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * SET-02 — one workspace MEMBERSHIP row: the minimum needed to interpret the
 * actor ids the exported Activity stream already carries.
 *
 * ## Why this is in the snapshot at all
 *
 * `activities.actorId` is exported verbatim (it is the owner's own copy of their
 * own ids). Until this collection existed, a restored workspace held a history
 * whose every actor resolved to `Unknown user`, because the row that maps a
 * subject to a name lived only in the database being replaced. That is a loss of
 * historical truth a restore is supposed to prevent, so the membership row
 * travels with the workspace.
 *
 * ## What it deliberately does NOT carry
 *
 * - **No credential.** `subject` is a stable Cloudflare Access identifier, not a
 *   secret, and it is already present on every exported Activity row. Nothing
 *   here authenticates anybody: signing in still goes through Cloudflare Access
 *   and the `OWNER_EMAIL` gate, and a restored membership row grants no access.
 * - **No email.** `workspace_members.email` is a *display fallback* that the
 *   request boundary refreshes on every sign-in
 *   (`provisionAuthenticatedMember`), so excluding it loses nothing durable —
 *   and it keeps the one authentication-adjacent identifier out of the file.
 * - **No `last_seen_at`.** Operational telemetry, never displayed. A restore
 *   writes `updatedAt` into that column rather than inventing a sign-in.
 *
 * Additive and optional-on-read, so archives written before it existed still
 * validate and still restore.
 */
export interface SnapshotWorkspaceMember {
  /** The stable authenticated subject — equals `activities[].actorId`. */
  readonly subject: string;
  /** The owner-curated display name, or `null`. */
  readonly displayName: string | null;
  /** The display name the identity provider supplied, or `null`. */
  readonly authDisplayName: string | null;
  /** The linked Person record in THIS workspace, or `null`. */
  readonly personEntityId: string | null;
  readonly createdAt: IsoInstant;
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
  readonly goalMeasurements: SnapshotGoalMeasurement;
  readonly goalMilestones: SnapshotGoalMilestone;
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
  readonly reviewWorkflowState: SnapshotReviewWorkflowState;
  readonly reviewStepAcknowledgements: SnapshotReviewStepAcknowledgement;
  readonly reviewInsightSnapshots: SnapshotReviewInsightSnapshot;
  readonly entityLinks: SnapshotEntityLink;
  readonly activities: SnapshotActivity;
  readonly activitySubjects: SnapshotActivitySubject;
  readonly workspaceMembers: SnapshotWorkspaceMember;
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
/**
 * Collections a snapshot READ tolerates being absent, defaulting to `[]`.
 *
 * Every export DalyHub writes contains every collection. This list exists only
 * so an archive written BEFORE the collection existed still validates and still
 * restores — the alternative is that adding a collection retroactively
 * invalidates every file an owner has already saved, which would make "export
 * always possible" (AGENTS.md §7) a promise with an expiry date.
 *
 * Add to this list in the SAME change that adds a collection, and never remove
 * from it: an entry here is a permanent statement about archives already on
 * disk. It is deliberately not a general "everything is optional" rule —
 * validation still requires every other collection, so a genuinely truncated
 * or corrupt snapshot is still caught.
 */
export const SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS: readonly SnapshotCollection[] =
  [
    "reviewWorkflowState",
    "reviewStepAcknowledgements",
    "reviewInsightSnapshots",
    "workspaceMembers",
    // GOAL-02 — added with the measurable-Goal model. Every archive written
    // before it is still valid and still restores.
    "goalMeasurements",
    "goalMilestones",
  ];

export const SNAPSHOT_COLLECTION_ORDER: readonly SnapshotCollection[] = [
  "entities",
  "spineRecords",
  "areaDetails",
  "goalDetails",
  "goalMeasurements",
  "goalMilestones",
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
  "reviewWorkflowState",
  "reviewStepAcknowledgements",
  "reviewInsightSnapshots",
  "entityLinks",
  "activities",
  "activitySubjects",
  // SET-02 — last, because it is the only collection that references an entity
  // AND is referenced by nothing: a restore can write it after everything else
  // without a dependency edge pointing back into the earlier collections.
  "workspaceMembers",
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
