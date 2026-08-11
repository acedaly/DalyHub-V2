/**
 * SET-02 — the D1 implementation of the workspace RESTORE write port.
 *
 * This is the only code in DalyHub that replaces a workspace's records wholesale,
 * so its shape is dictated entirely by one invariant:
 *
 *   **At every instant, the workspace is either entirely the old one or entirely
 *   the restored one. There is no third state.**
 *
 * ## How the invariant is achieved on D1
 *
 * D1 gives ONE `batch()` transactional atomicity, and a whole workspace does not
 * fit in one batch (the per-statement bound-parameter ceiling forces the rows
 * across many statements and many batches). So the write is split:
 *
 *   - {@link D1WorkspaceRestoreRepository.stageSnapshot} writes every row into
 *     `workspace_restore_staged_rows` as an inert JSON object whose keys are
 *     exactly the destination table's columns. Many bounded batches, none of
 *     them canonical. An interruption here leaves the workspace untouched.
 *   - {@link D1WorkspaceRestoreRepository.applyStagedSnapshot} performs the
 *     cutover in ONE batch: per table, a `DELETE … WHERE workspace_id = ?`
 *     followed by an `INSERT … SELECT json_extract(row_json, '$.<column>') …`.
 *     That is a FIXED ~55 statements whatever the workspace's size, so the
 *     atomic step never grows with the data. An interruption rolls it back.
 *
 * ## Workspace isolation
 *
 * Constructed with a single `WorkspaceContext`; **no method accepts a workspace
 * id** (ADR-010). Every statement binds `workspace_id` from that context, and
 * every INSERT projects it as a literal bound parameter rather than reading it
 * from the staged row. A crafted archive therefore cannot name a destination:
 * the snapshot's own `workspace.id` is never read by this file at all.
 *
 * Ordering is the snapshot's documented `SNAPSHOT_COLLECTION_ORDER` for inserts
 * and its exact reverse for deletes, which satisfies every `ON DELETE RESTRICT`
 * foreign key in the schema without deferring constraint checks.
 */

import {
  SNAPSHOT_COLLECTION_ORDER,
  type SnapshotCollection,
  type SnapshotCollectionRowMap,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";
import {
  emptyRecordCounts,
  type RestoreCheck,
  type RestoreMode,
  type RestoreOperationRecord,
  type RestoreOperationStatus,
  type RestoreRecordCounts,
  type RestoreVerification,
  type SafetyBackupReceipt,
  type WorkspaceRestoreRepository,
} from "~/kernel/restore";
import { isSavedViewKind } from "~/kernel/views";
import type { WorkspaceContext } from "~/kernel/workspaces";

/* -------------------------------------------------------------------------- */
/* Staging limits                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Rows per staging INSERT.
 *
 * Each staged row binds five parameters (workspace, operation, collection,
 * sequence, JSON), and D1 caps a statement at 100 bound parameters, so twenty is
 * the largest safe multi-row insert. It is a hard ceiling, not a tuning knob.
 */
const STAGE_ROWS_PER_STATEMENT = 20;

/** Statements per staging batch — bounds the work one transaction does. */
const STAGE_STATEMENTS_PER_BATCH = 40;

/** Serialised-JSON budget per staging batch, so one batch stays a sane size. */
const STAGE_BYTES_PER_BATCH = 1_500_000;

/**
 * How long a prepared-but-unapplied restore stays valid.
 *
 * A staged restore is inert, but it is also the owner's uploaded data sitting in
 * the database, so it does not live forever. Anything older is expired and
 * purged the next time a restore is prepared.
 */
export const RESTORE_OPERATION_TTL_MS = 6 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Value coercion                                                             */
/* -------------------------------------------------------------------------- */

/** A value a staged row may carry — exactly what the SQL column will hold. */
type StagedValue = string | number | null;

/** Owner-scoped pseudo-collections, staged alongside the snapshot's own. */
const OWNER_PREFERENCES = "ownerPreferences";
const TASK_SAVED_VIEWS = "taskSavedViews";

/** Every staged collection, in INSERT order (parents before children). */
const STAGED_COLLECTIONS: readonly string[] = [
  ...SNAPSHOT_COLLECTION_ORDER,
  OWNER_PREFERENCES,
  TASK_SAVED_VIEWS,
];

interface TableDescriptor {
  readonly table: string;
  /** Destination columns, excluding `workspace_id` (always bound server-side). */
  readonly columns: readonly string[];
  /**
   * Owner-scoped tables also delete by `owner_id`, so a restore replaces the
   * restoring owner's rows and never another member's.
   */
  readonly ownerScoped?: true;
}

/** The destination of every staged collection. */
const TABLES: Readonly<Record<string, TableDescriptor>> = {
  entities: {
    table: "entities",
    columns: ["id", "type", "title", "created_at", "updated_at", "deleted_at"],
  },
  spineRecords: {
    table: "spine_records",
    columns: ["entity_id", "kind", "completed_at"],
  },
  areaDetails: {
    table: "area_details",
    columns: ["entity_id", "archived_at", "icon_key", "updated_at"],
  },
  goalDetails: {
    table: "goal_details",
    columns: [
      "entity_id",
      "target_date",
      "definition_of_done",
      "measurement_type",
      "measurement_unit",
      "measurement_direction",
      "baseline_value",
      "target_value",
      "updated_at",
    ],
  },
  goalMeasurements: {
    table: "goal_measurements",
    columns: [
      "id",
      "entity_id",
      "value",
      "measured_on",
      "note",
      "created_at",
      "updated_at",
    ],
  },
  goalMilestones: {
    table: "goal_milestones",
    columns: [
      "id",
      "entity_id",
      "title",
      "weight",
      "position",
      "completed_at",
      "created_at",
      "updated_at",
    ],
  },
  projectDetails: {
    table: "project_details",
    columns: ["entity_id", "status", "archived_at", "icon_key", "updated_at"],
  },
  taskDetails: {
    table: "task_details",
    columns: [
      "entity_id",
      "status",
      "priority",
      "due_date",
      "scheduled_date",
      "time_sector",
      "commitment_state",
      "delegate_to",
      "delegated_on",
      "follow_up_on",
      "delegate_note",
      "description",
      "waiting_since",
      "waiting_note",
      "updated_at",
    ],
  },
  taskRecurrenceRules: {
    table: "task_recurrence_rules",
    columns: [
      "entity_id",
      "date_kind",
      "frequency",
      "interval",
      "weekdays",
      "anchor_day",
      "anchor_month",
      "series_id",
      "sequence",
      "created_at",
      "updated_at",
    ],
  },
  noteDetails: {
    table: "note_details",
    columns: ["entity_id", "content", "tags", "archived_at", "updated_at"],
  },
  diaryEntryDetails: {
    table: "diary_entry_details",
    columns: [
      "entity_id",
      "entry_type",
      "body",
      "occurred_at",
      "timezone",
      "source_channel",
      "source_reference",
      "updated_at",
    ],
  },
  personDetails: {
    table: "person_details",
    columns: [
      "entity_id",
      "preferred_name",
      "first_name",
      "middle_name",
      "last_name",
      "pronouns",
      "organisation",
      "role",
      "department",
      "email",
      "secondary_email",
      "mobile",
      "work_phone",
      "address",
      "website",
      "birthday",
      "relationship",
      "tags",
      "notes",
      "favourite_contact_method",
      "follow_up_frequency",
      "next_follow_up",
      "last_interaction",
      "photo_url",
      "archived_at",
      "updated_at",
    ],
  },
  meetingDetails: {
    table: "meeting_details",
    columns: [
      "entity_id",
      "starts_at",
      "ends_at",
      "timezone",
      "location",
      "mode",
      "meeting_url",
      "status",
      "agenda_markdown",
      "notes_markdown",
      "held_at",
      "archived_at",
      "updated_at",
    ],
  },
  meetingItems: {
    table: "meeting_items",
    columns: [
      "id",
      "meeting_id",
      "kind",
      "body_markdown",
      "position",
      "created_at",
      "updated_at",
    ],
  },
  meetingItemTasks: {
    table: "meeting_item_tasks",
    columns: ["meeting_id", "item_id", "task_id", "created_at"],
  },
  assetDetails: {
    table: "asset_details",
    columns: [
      "entity_id",
      "asset_type",
      "status",
      "description",
      "manufacturer",
      "model",
      "serial_number",
      "reference_code",
      "tags",
      "owner_person_id",
      "responsible_person_id",
      "location",
      "area_id",
      "acquisition_date",
      "purchase_price_minor",
      "currency_code",
      "supplier",
      "replacement_value_minor",
      "disposal_date",
      "disposal_notes",
      "warranty_expiry",
      "service_interval",
      "last_service_date",
      "next_service_date",
      "service_provider",
      "maintenance_notes",
      "issuer",
      "reference_number",
      "issue_date",
      "renewal_date",
      "url",
      "document_notes",
      "current_meter_value",
      "current_meter_unit",
      "current_meter_date",
      "archived_at",
      "updated_at",
    ],
  },
  assetEvents: {
    table: "asset_events",
    columns: [
      "id",
      "asset_id",
      "category",
      "title",
      "event_date",
      "completed_at",
      "description",
      "provider",
      "person_id",
      "cost_minor",
      "value_minor",
      "currency_code",
      "meter_value",
      "meter_unit",
      "warranty_expiry",
      "next_due_date",
      "task_id",
      "note_id",
      "obligation_id",
      "created_at",
      "updated_at",
      "archived_at",
      "deleted_at",
    ],
  },
  assetObligations: {
    table: "asset_obligations",
    columns: [
      "id",
      "asset_id",
      "category",
      "title",
      "description",
      "due_date",
      "lead_days",
      "recurrence_kind",
      "recurrence_interval",
      "meter_threshold",
      "meter_interval",
      "meter_unit",
      "status",
      "task_id",
      "completed_event_id",
      "completed_at",
      "next_obligation_id",
      "series_id",
      "sequence",
      "created_at",
      "updated_at",
      "archived_at",
      "deleted_at",
    ],
  },
  reviewDetails: {
    table: "review_details",
    columns: [
      "entity_id",
      "review_type",
      "period_start",
      "period_end",
      "status",
      "template_id",
      "completed_at",
      "archived_at",
      "updated_at",
    ],
  },
  reviewSections: {
    table: "review_sections",
    columns: ["review_id", "section_id", "body_markdown", "updated_at"],
  },
  reviewWorkflowState: {
    table: "review_workflow_state",
    columns: ["review_id", "current_step", "revision", "updated_at"],
  },
  reviewStepAcknowledgements: {
    table: "review_step_acknowledgements",
    columns: ["review_id", "step_id", "acknowledged_at"],
  },
  reviewInsightSnapshots: {
    table: "review_insight_snapshots",
    columns: [
      "review_id",
      "version",
      "period_start",
      "period_end",
      "captured_at",
      "facts_json",
    ],
  },
  entityLinks: {
    table: "entity_links",
    columns: [
      "id",
      "source_entity_id",
      "target_entity_id",
      "type",
      "created_at",
      "updated_at",
      "deleted_at",
    ],
  },
  activities: {
    table: "activities",
    columns: [
      "id",
      "type",
      "actor_type",
      "actor_id",
      "occurred_at",
      "payload_json",
    ],
  },
  activitySubjects: {
    table: "activity_subjects",
    columns: ["activity_id", "entity_id", "role"],
  },
  workspaceMembers: {
    table: "workspace_members",
    columns: [
      "subject",
      "display_name",
      "auth_display_name",
      "person_entity_id",
      "created_at",
      "updated_at",
      "last_seen_at",
    ],
  },
  [OWNER_PREFERENCES]: {
    table: "owner_app_preferences",
    ownerScoped: true,
    columns: [
      "owner_id",
      "timezone",
      "date_format",
      "first_day_of_week",
      "default_landing_destination",
      "default_tasks_view",
      "default_task_view_id",
      "default_task_destination",
      "default_task_capture_parent_id",
      "default_task_capture_parent_kind",
      "default_diary_mode",
      "appearance",
      "color_scheme",
      "navigation_config",
      "version",
      "created_at",
      "updated_at",
    ],
  },
  [TASK_SAVED_VIEWS]: {
    table: "task_saved_views",
    ownerScoped: true,
    columns: [
      "id",
      "owner_id",
      // X-02: one table holds saved views of more than one KIND. Restoring
      // without it would silently rewrite every cross-module view as a Tasks
      // view (the column default), which is a data change wearing a restore's
      // clothes. An archive written before X-02 carries no kind and reads back
      // as `tasks`, which is what was true when it was written.
      "kind",
      "name",
      "config_version",
      "config",
      "created_at",
      "updated_at",
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Snapshot row → column row                                                  */
/* -------------------------------------------------------------------------- */

/** Serialise a value the schema stores as JSON TEXT. */
function jsonText(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Build the staged column rows for one collection.
 *
 * The returned objects' keys are EXACTLY the destination columns, which is what
 * lets the cutover be a pure `json_extract` projection with no per-row binding.
 * `entity_type` discriminator columns are deliberately omitted: each carries a
 * schema DEFAULT, so the database asserts the record type rather than trusting a
 * value that travelled inside an uploaded file.
 */
function stageRows(
  collection: string,
  snapshot: WorkspaceSnapshotV1,
  ownerId: string,
): readonly Record<string, StagedValue>[] {
  switch (collection) {
    case OWNER_PREFERENCES: {
      const p = snapshot.owner.preferences;
      // `version: 0` is the X-04 contract's "the owner never saved a
      // preference". Restoring a row for it would invent a stored value the
      // source workspace did not have (and would violate `version >= 1`).
      if (p.version < 1) return [];
      return [
        {
          owner_id: ownerId,
          timezone: p.timezone,
          date_format: p.dateFormat,
          first_day_of_week: p.firstDayOfWeek,
          default_landing_destination: p.defaultLandingDestination,
          default_tasks_view: p.defaultTasksView,
          default_task_view_id: p.defaultTaskViewId,
          default_task_destination: p.defaultTaskDestination,
          default_task_capture_parent_id: p.defaultTaskCaptureParentId,
          default_task_capture_parent_kind: p.defaultTaskCaptureParentKind,
          default_diary_mode: p.defaultDiaryMode,
          // Additive field: an archive written before APPEARANCE-01 joined the
          // snapshot simply has no key, and the schema's own default applies.
          appearance: p.appearance ?? "system",
          // Additive in the same way: an archive written before THEME-01 joined
          // the snapshot has no key, and the schema's own default applies.
          color_scheme: p.colorScheme ?? "violet",
          navigation_config: jsonText(p.navigationConfig),
          version: p.version,
          created_at: p.createdAt ?? snapshot.meta.exportedAt,
          updated_at: p.updatedAt ?? snapshot.meta.exportedAt,
        },
      ];
    }
    case TASK_SAVED_VIEWS:
      return snapshot.owner.taskSavedViews.map((view) => ({
        id: view.id,
        // The AUTHENTICATED owner, never a value from the backup.
        owner_id: ownerId,
        // An unrecognised kind from an untrusted archive degrades to `tasks`
        // rather than being written through — a row of an unknown kind would be
        // invisible to every switcher, which is worse than being readable.
        kind: isSavedViewKind(view.kind) ? view.kind : "tasks",
        name: view.name,
        config_version: view.configVersion,
        config: jsonText(view.config),
        created_at: view.createdAt,
        updated_at: view.updatedAt,
      }));
    default:
      break;
  }

  const rows = snapshot.records[collection as SnapshotCollection];
  switch (collection as SnapshotCollection) {
    case "entities":
      return (rows as readonly SnapshotCollectionRowMap["entities"][]).map(
        (row) => ({
          id: row.id,
          type: row.type,
          title: row.title,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        }),
      );
    case "spineRecords":
      return (rows as readonly SnapshotCollectionRowMap["spineRecords"][]).map(
        (row) => ({
          entity_id: row.entityId,
          kind: row.kind,
          completed_at: row.completedAt,
        }),
      );
    case "areaDetails":
      return (rows as readonly SnapshotCollectionRowMap["areaDetails"][]).map(
        (row) => ({
          entity_id: row.entityId,
          archived_at: row.archivedAt,
          icon_key: row.iconKey,
          updated_at: row.updatedAt,
        }),
      );
    case "goalDetails":
      return (rows as readonly SnapshotCollectionRowMap["goalDetails"][]).map(
        (row) => ({
          entity_id: row.entityId,
          target_date: row.targetDate,
          definition_of_done: row.definitionOfDone,
          // `?? null` rather than the value alone: an archive written BEFORE
          // GOAL-02 has no such key, and `undefined` is not a bindable D1 value.
          // The result is the same state those Goals were already in.
          measurement_type: row.measurementType ?? null,
          measurement_unit: row.measurementUnit ?? null,
          measurement_direction: row.measurementDirection ?? null,
          baseline_value: row.baselineValue ?? null,
          target_value: row.targetValue ?? null,
          updated_at: row.updatedAt,
        }),
      );
    case "goalMeasurements":
      return (
        rows as readonly SnapshotCollectionRowMap["goalMeasurements"][]
      ).map((row) => ({
        id: row.id,
        entity_id: row.goalId,
        value: row.value,
        measured_on: row.measuredOn,
        note: row.note,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }));
    case "goalMilestones":
      return (
        rows as readonly SnapshotCollectionRowMap["goalMilestones"][]
      ).map((row) => ({
        id: row.id,
        entity_id: row.goalId,
        title: row.title,
        weight: row.weight,
        position: row.position,
        completed_at: row.completedAt,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }));
    case "projectDetails":
      return (
        rows as readonly SnapshotCollectionRowMap["projectDetails"][]
      ).map((row) => ({
        entity_id: row.entityId,
        status: row.status,
        archived_at: row.archivedAt,
        icon_key: row.iconKey,
        updated_at: row.updatedAt,
      }));
    case "taskDetails":
      return (rows as readonly SnapshotCollectionRowMap["taskDetails"][]).map(
        (row) => ({
          entity_id: row.entityId,
          status: row.status,
          priority: row.priority,
          due_date: row.dueDate,
          scheduled_date: row.scheduledDate,
          time_sector: row.timeSector,
          commitment_state: row.commitmentState,
          delegate_to: row.delegateTo,
          delegated_on: row.delegatedOn,
          follow_up_on: row.followUpOn,
          delegate_note: row.delegateNote,
          description: row.description,
          waiting_since: row.waitingSince,
          waiting_note: row.waitingNote,
          updated_at: row.updatedAt,
        }),
      );
    case "taskRecurrenceRules":
      return (
        rows as readonly SnapshotCollectionRowMap["taskRecurrenceRules"][]
      ).map((row) => ({
        entity_id: row.entityId,
        date_kind: row.dateKind,
        frequency: row.frequency,
        interval: row.interval,
        weekdays: row.weekdays,
        anchor_day: row.anchorDay,
        anchor_month: row.anchorMonth,
        series_id: row.seriesId,
        sequence: row.sequence,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      }));
    case "noteDetails":
      return (rows as readonly SnapshotCollectionRowMap["noteDetails"][]).map(
        (row) => ({
          entity_id: row.entityId,
          // The canonical Markdown source, byte for byte. Nothing here trims,
          // normalises line endings or renders (ADR-015).
          content: row.content,
          tags: jsonText(row.tags),
          archived_at: row.archivedAt,
          updated_at: row.updatedAt,
        }),
      );
    case "diaryEntryDetails":
      return (
        rows as readonly SnapshotCollectionRowMap["diaryEntryDetails"][]
      ).map((row) => ({
        entity_id: row.entityId,
        entry_type: row.entryType,
        body: row.body,
        occurred_at: row.occurredAt,
        timezone: row.timezone,
        source_channel: row.sourceChannel,
        source_reference: row.sourceReference,
        updated_at: row.updatedAt,
      }));
    case "personDetails":
      return (rows as readonly SnapshotCollectionRowMap["personDetails"][]).map(
        (row) => ({
          entity_id: row.entityId,
          preferred_name: row.preferredName,
          first_name: row.firstName,
          middle_name: row.middleName,
          last_name: row.lastName,
          pronouns: row.pronouns,
          organisation: row.organisation,
          role: row.role,
          department: row.department,
          email: row.email,
          secondary_email: row.secondaryEmail,
          mobile: row.mobile,
          work_phone: row.workPhone,
          address: row.address,
          website: row.website,
          birthday: row.birthday,
          relationship: row.relationship,
          tags: jsonText(row.tags),
          notes: row.notes,
          favourite_contact_method: row.favouriteContactMethod,
          follow_up_frequency: row.followUpFrequency,
          next_follow_up: row.nextFollowUp,
          last_interaction: row.lastInteraction,
          photo_url: row.photoUrl,
          archived_at: row.archivedAt,
          updated_at: row.updatedAt,
        }),
      );
    case "meetingDetails":
      return (
        rows as readonly SnapshotCollectionRowMap["meetingDetails"][]
      ).map((row) => ({
        entity_id: row.entityId,
        starts_at: row.startsAt,
        ends_at: row.endsAt,
        timezone: row.timezone,
        location: row.location,
        mode: row.mode,
        meeting_url: row.meetingUrl,
        status: row.status,
        agenda_markdown: row.agendaMarkdown,
        notes_markdown: row.notesMarkdown,
        held_at: row.heldAt,
        archived_at: row.archivedAt,
        updated_at: row.updatedAt,
      }));
    case "meetingItems":
      return (rows as readonly SnapshotCollectionRowMap["meetingItems"][]).map(
        (row) => ({
          id: row.id,
          meeting_id: row.meetingId,
          kind: row.kind,
          body_markdown: row.bodyMarkdown,
          position: row.position,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        }),
      );
    case "meetingItemTasks":
      return (
        rows as readonly SnapshotCollectionRowMap["meetingItemTasks"][]
      ).map((row) => ({
        meeting_id: row.meetingId,
        item_id: row.itemId,
        task_id: row.taskId,
        created_at: row.createdAt,
      }));
    case "assetDetails":
      return (rows as readonly SnapshotCollectionRowMap["assetDetails"][]).map(
        (row) => ({
          entity_id: row.entityId,
          asset_type: row.assetType,
          status: row.status,
          description: row.description,
          manufacturer: row.manufacturer,
          model: row.model,
          serial_number: row.serialNumber,
          reference_code: row.referenceCode,
          tags: jsonText(row.tags),
          owner_person_id: row.ownerPersonId,
          responsible_person_id: row.responsiblePersonId,
          location: row.location,
          area_id: row.areaId,
          acquisition_date: row.acquisitionDate,
          purchase_price_minor: row.purchasePriceMinor,
          currency_code: row.currencyCode,
          supplier: row.supplier,
          replacement_value_minor: row.replacementValueMinor,
          disposal_date: row.disposalDate,
          disposal_notes: row.disposalNotes,
          warranty_expiry: row.warrantyExpiry,
          service_interval: row.serviceInterval,
          last_service_date: row.lastServiceDate,
          next_service_date: row.nextServiceDate,
          service_provider: row.serviceProvider,
          maintenance_notes: row.maintenanceNotes,
          issuer: row.issuer,
          reference_number: row.referenceNumber,
          issue_date: row.issueDate,
          renewal_date: row.renewalDate,
          url: row.url,
          document_notes: row.documentNotes,
          current_meter_value: row.currentMeterValue,
          current_meter_unit: row.currentMeterUnit,
          current_meter_date: row.currentMeterDate,
          archived_at: row.archivedAt,
          updated_at: row.updatedAt,
        }),
      );
    case "assetEvents":
      return (rows as readonly SnapshotCollectionRowMap["assetEvents"][]).map(
        (row) => ({
          id: row.id,
          asset_id: row.assetId,
          category: row.category,
          title: row.title,
          event_date: row.eventDate,
          completed_at: row.completedAt,
          description: row.description,
          provider: row.provider,
          person_id: row.personId,
          cost_minor: row.costMinor,
          value_minor: row.valueMinor,
          currency_code: row.currencyCode,
          meter_value: row.meterValue,
          meter_unit: row.meterUnit,
          warranty_expiry: row.warrantyExpiry,
          next_due_date: row.nextDueDate,
          task_id: row.taskId,
          note_id: row.noteId,
          obligation_id: row.obligationId,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          archived_at: row.archivedAt,
          deleted_at: row.deletedAt,
        }),
      );
    case "assetObligations":
      return (
        rows as readonly SnapshotCollectionRowMap["assetObligations"][]
      ).map((row) => ({
        id: row.id,
        asset_id: row.assetId,
        category: row.category,
        title: row.title,
        description: row.description,
        due_date: row.dueDate,
        lead_days: row.leadDays,
        recurrence_kind: row.recurrenceKind,
        recurrence_interval: row.recurrenceInterval,
        meter_threshold: row.meterThreshold,
        meter_interval: row.meterInterval,
        meter_unit: row.meterUnit,
        status: row.status,
        task_id: row.taskId,
        completed_event_id: row.completedEventId,
        completed_at: row.completedAt,
        next_obligation_id: row.nextObligationId,
        series_id: row.seriesId,
        sequence: row.sequence,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        archived_at: row.archivedAt,
        deleted_at: row.deletedAt,
      }));
    case "reviewDetails":
      return (rows as readonly SnapshotCollectionRowMap["reviewDetails"][]).map(
        (row) => ({
          entity_id: row.entityId,
          review_type: row.reviewType,
          period_start: row.periodStart,
          period_end: row.periodEnd,
          status: row.status,
          template_id: row.templateId,
          completed_at: row.completedAt,
          archived_at: row.archivedAt,
          updated_at: row.updatedAt,
        }),
      );
    case "reviewSections":
      return (
        rows as readonly SnapshotCollectionRowMap["reviewSections"][]
      ).map((row) => ({
        review_id: row.reviewId,
        section_id: row.sectionId,
        body_markdown: row.bodyMarkdown,
        updated_at: row.updatedAt,
      }));
    case "reviewWorkflowState":
      return (
        rows as readonly SnapshotCollectionRowMap["reviewWorkflowState"][]
      ).map((row) => ({
        review_id: row.reviewId,
        current_step: row.currentStep,
        revision: row.revision,
        updated_at: row.updatedAt,
      }));
    case "reviewStepAcknowledgements":
      return (
        rows as readonly SnapshotCollectionRowMap["reviewStepAcknowledgements"][]
      ).map((row) => ({
        review_id: row.reviewId,
        step_id: row.stepId,
        acknowledged_at: row.acknowledgedAt,
      }));
    case "reviewInsightSnapshots":
      return (
        rows as readonly SnapshotCollectionRowMap["reviewInsightSnapshots"][]
      ).map((row) => ({
        review_id: row.reviewId,
        version: row.version,
        period_start: row.periodStart,
        period_end: row.periodEnd,
        captured_at: row.capturedAt,
        facts_json: row.factsJson,
      }));
    case "entityLinks":
      return (rows as readonly SnapshotCollectionRowMap["entityLinks"][]).map(
        (row) => ({
          id: row.id,
          source_entity_id: row.sourceEntityId,
          target_entity_id: row.targetEntityId,
          type: row.type,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
          deleted_at: row.deletedAt,
        }),
      );
    case "activities":
      return (rows as readonly SnapshotCollectionRowMap["activities"][]).map(
        (row) => ({
          id: row.id,
          type: row.type,
          actor_type: row.actorType,
          actor_id: row.actorId,
          occurred_at: row.occurredAt,
          // The column is NOT NULL. An event whose payload could not be parsed
          // at export time exported as `null`, and restores as the JSON literal
          // `null` — the event, its type, its instant and its subjects are
          // intact, and the loss is the one the export already declared.
          payload_json: jsonText(row.payload),
        }),
      );
    case "activitySubjects":
      return (
        rows as readonly SnapshotCollectionRowMap["activitySubjects"][]
      ).map((row) => ({
        activity_id: row.activityId,
        entity_id: row.entityId,
        role: row.role,
      }));
    case "workspaceMembers":
      return (
        rows as readonly SnapshotCollectionRowMap["workspaceMembers"][]
      ).map((row) => ({
        subject: row.subject,
        display_name: row.displayName,
        auth_display_name: row.authDisplayName,
        person_entity_id: row.personEntityId,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        // Operational telemetry the snapshot deliberately does not carry. A
        // restore records the membership's own last update rather than
        // inventing a sign-in that never happened.
        last_seen_at: row.updatedAt,
      }));
    default:
      return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Repository                                                                 */
/* -------------------------------------------------------------------------- */

/** The columns a restore projects, as `json_extract` expressions. */
function projection(descriptor: TableDescriptor): string {
  return descriptor.columns
    .map((column) => `json_extract(row_json, '$.${column}')`)
    .join(", ");
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export class D1WorkspaceRestoreRepository implements WorkspaceRestoreRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #now: () => Date;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: { readonly now?: () => Date } = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#now = options.now ?? (() => new Date());
  }

  /* -- reads ------------------------------------------------------------- */

  async countTargetRecords(): Promise<RestoreRecordCounts> {
    const byType = await this.#db
      .prepare(
        "SELECT type, COUNT(*) AS n FROM entities WHERE workspace_id = ? GROUP BY type",
      )
      .bind(this.#workspaceId)
      .all<{ type: string; n: number }>();
    const links = await this.#db
      .prepare("SELECT COUNT(*) AS n FROM entity_links WHERE workspace_id = ?")
      .bind(this.#workspaceId)
      .first<{ n: number }>();
    const activities = await this.#db
      .prepare("SELECT COUNT(*) AS n FROM activities WHERE workspace_id = ?")
      .bind(this.#workspaceId)
      .first<{ n: number }>();

    const counts: Record<string, number> = { ...emptyRecordCounts() };
    const named: Record<string, string> = {
      area: "areas",
      goal: "goals",
      project: "projects",
      task: "tasks",
      note: "notes",
      diary: "diaryEntries",
      meeting: "meetings",
      person: "people",
      asset: "assets",
      review: "reviews",
    };
    for (const row of byType.results ?? []) {
      const key = named[row.type] ?? "other";
      counts[key] = (counts[key] ?? 0) + row.n;
      counts.total = (counts.total ?? 0) + row.n;
    }
    counts.links = integer(links?.n, 0);
    counts.activityEvents = integer(activities?.n, 0);
    return counts as unknown as RestoreRecordCounts;
  }

  async readOperation(
    operationId: string,
  ): Promise<RestoreOperationRecord | null> {
    const row = await this.#db
      .prepare(
        `SELECT id, status, mode, backup_created_at, source_workspace_id,
                staged_row_count, safety_backup_filename, safety_backup_sha256,
                safety_backup_bytes, safety_backup_records, created_at
         FROM workspace_restore_operations
         WHERE workspace_id = ? AND id = ? LIMIT 1`,
      )
      .bind(this.#workspaceId, operationId)
      .first<Record<string, unknown>>();
    if (row === null) return null;
    const filename = text(row.safety_backup_filename);
    const sha256 = text(row.safety_backup_sha256);
    return {
      id: text(row.id) ?? operationId,
      status: (text(row.status) ?? "failed") as RestoreOperationStatus,
      mode: (text(row.mode) ?? "replace") as RestoreMode,
      backupCreatedAt: text(row.backup_created_at) ?? "",
      sourceWorkspaceId: text(row.source_workspace_id) ?? "",
      stagedRowCount: integer(row.staged_row_count, 0),
      safetyBackup:
        filename !== null && sha256 !== null
          ? {
              filename,
              sha256,
              bytes: integer(row.safety_backup_bytes, 0),
              recordCount: integer(row.safety_backup_records, 0),
            }
          : null,
      createdAt: text(row.created_at) ?? "",
    };
  }

  /* -- staging ----------------------------------------------------------- */

  /**
   * Purge staged rows for operations that can never be applied, and expire
   * prepared restores older than {@link RESTORE_OPERATION_TTL_MS}.
   *
   * Called before staging, never after, so it can never remove the rows the
   * caller has just written.
   *
   * `applied` is included in the expiry sweep deliberately: a cutover that
   * COMMITTED but whose response never reached the browser leaves an operation
   * nothing will ever complete, and its staged rows would otherwise sit in the
   * database forever. The workspace is already restored in that case — this only
   * reclaims the scratch space.
   */
  async purgeStaleOperations(): Promise<void> {
    const cutoff = new Date(
      this.#now().getTime() - RESTORE_OPERATION_TTL_MS,
    ).toISOString();
    await this.#db.batch([
      this.#db
        .prepare(
          `UPDATE workspace_restore_operations
           SET status = 'failed', failure_reason = 'expired', updated_at = ?
           WHERE workspace_id = ?
             AND status IN ('staged', 'safety_backup_ready', 'safety_backed_up', 'applied')
             AND created_at < ?`,
        )
        .bind(this.#now().toISOString(), this.#workspaceId, cutoff),
      this.#db
        .prepare(
          `DELETE FROM workspace_restore_staged_rows
           WHERE workspace_id = ?
             AND operation_id NOT IN (
               SELECT id FROM workspace_restore_operations
               WHERE workspace_id = ?
                 AND status IN ('staged', 'safety_backup_ready', 'safety_backed_up', 'applied')
             )`,
        )
        .bind(this.#workspaceId, this.#workspaceId),
    ]);
  }

  async stageSnapshot(
    operationId: string,
    snapshot: WorkspaceSnapshotV1,
    ownerId: string,
  ): Promise<number> {
    let staged = 0;
    let batch: D1PreparedStatement[] = [];
    let batchBytes = 0;

    const flush = async () => {
      if (batch.length === 0) return;
      await this.#db.batch(batch);
      batch = [];
      batchBytes = 0;
    };

    for (const collection of STAGED_COLLECTIONS) {
      const rows = stageRows(collection, snapshot, ownerId);
      for (
        let index = 0;
        index < rows.length;
        index += STAGE_ROWS_PER_STATEMENT
      ) {
        const chunk = rows.slice(index, index + STAGE_ROWS_PER_STATEMENT);
        const values = chunk.map(() => "(?, ?, ?, ?, ?)").join(", ");
        const binds: unknown[] = [];
        let bytes = 0;
        chunk.forEach((row, offset) => {
          const serialised = JSON.stringify(row);
          bytes += serialised.length;
          binds.push(
            this.#workspaceId,
            operationId,
            collection,
            index + offset,
            serialised,
          );
        });
        batch.push(
          this.#db
            .prepare(
              `INSERT INTO workspace_restore_staged_rows
                 (workspace_id, operation_id, collection, sequence, row_json)
               VALUES ${values}`,
            )
            .bind(...binds),
        );
        batchBytes += bytes;
        staged += chunk.length;
        if (
          batch.length >= STAGE_STATEMENTS_PER_BATCH ||
          batchBytes >= STAGE_BYTES_PER_BATCH
        ) {
          await flush();
        }
      }
    }
    await flush();
    return staged;
  }

  async createOperation(input: {
    readonly operationId: string;
    readonly mode: RestoreMode;
    readonly backupCreatedAt: string;
    readonly sourceWorkspaceId: string;
    readonly stagedRowCount: number;
    readonly ownerId: string;
  }): Promise<void> {
    const now = this.#now().toISOString();
    await this.#db
      .prepare(
        `INSERT INTO workspace_restore_operations
           (id, workspace_id, owner_id, status, mode, backup_created_at,
            source_workspace_id, staged_row_count, created_at, updated_at)
         VALUES (?, ?, ?, 'staged', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.operationId,
        this.#workspaceId,
        input.ownerId,
        input.mode,
        input.backupCreatedAt,
        input.sourceWorkspaceId,
        input.stagedRowCount,
        now,
        now,
      )
      .run();
  }

  /**
   * Record that the SERVER produced and verified a safety archive.
   *
   * This advances to `safety_backup_ready`, NOT to `safety_backed_up`. The
   * difference is the reviewer's point and it is load-bearing: at this instant
   * the file exists on the server and the owner may still never receive it, so a
   * state that permitted a destructive apply here would let the gate be
   * satisfied by a backup nobody holds.
   */
  async recordSafetyBackup(
    operationId: string,
    receipt: SafetyBackupReceipt,
  ): Promise<void> {
    await this.#db
      .prepare(
        `UPDATE workspace_restore_operations
         SET status = 'safety_backup_ready',
             safety_backup_filename = ?, safety_backup_sha256 = ?,
             safety_backup_bytes = ?, safety_backup_records = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ? AND status = 'staged'`,
      )
      .bind(
        receipt.filename,
        receipt.sha256,
        receipt.bytes,
        receipt.recordCount,
        this.#now().toISOString(),
        this.#workspaceId,
        operationId,
      )
      .run();
  }

  /**
   * Record that the CLIENT received the complete safety archive.
   *
   * The digest is compared inside the `UPDATE`'s own `WHERE` clause against the
   * one the server recorded when it produced the file, so a truncated or
   * corrupted delivery cannot acknowledge itself and a client that never got a
   * response cannot either. Returns whether the transition actually happened —
   * never whether it was merely requested.
   */
  async acknowledgeSafetyBackup(
    operationId: string,
    sha256: string,
  ): Promise<boolean> {
    const result = await this.#db
      .prepare(
        `UPDATE workspace_restore_operations
         SET status = 'safety_backed_up', updated_at = ?
         WHERE workspace_id = ? AND id = ?
           AND status = 'safety_backup_ready'
           AND safety_backup_sha256 = ?`,
      )
      .bind(this.#now().toISOString(), this.#workspaceId, operationId, sha256)
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }

  /* -- cutover ----------------------------------------------------------- */

  /**
   * Replace the workspace's records with the staged rows, atomically.
   *
   * The whole method is ONE `db.batch()`, therefore ONE transaction — and the
   * valid STATE TRANSITION is enforced inside it rather than by a read before
   * it. The first statement claims the operation:
   *
   * ```sql
   * UPDATE workspace_restore_operations
   *    SET status = 'applied', apply_token = ?
   *  WHERE workspace_id = ? AND id = ?
   *    AND status = ?              -- the exact expected state, no other
   *    AND apply_token IS NULL     -- nobody has claimed it
   * ```
   *
   * and every DELETE and INSERT that follows carries
   * `AND EXISTS (… WHERE apply_token = <this call's token>)`. Two concurrent
   * applies therefore cannot both replace the workspace: one wins the claim, and
   * the loser's statements all match zero rows, so its transaction commits a
   * complete no-op rather than a second wholesale delete/insert cycle.
   *
   * Returns whether THIS call performed the cutover.
   */
  async applyStagedSnapshot(operationId: string): Promise<boolean> {
    const operation = await this.#db
      .prepare(
        `SELECT owner_id, mode, status FROM workspace_restore_operations
         WHERE workspace_id = ? AND id = ? LIMIT 1`,
      )
      .bind(this.#workspaceId, operationId)
      .first<{ owner_id: string; mode: string; status: string }>();
    if (operation === null) {
      throw new Error("The restore operation no longer exists.");
    }
    const ownerId = operation.owner_id;
    /*
     * The precondition the transaction will require. A destructive replace
     * demands the ACKNOWLEDGED safety-backup state — not `safety_backup_ready`,
     * which only says the server made a file. This value is derived from `mode`,
     * which never changes after the operation is created, so reading it here
     * introduces no race: the status itself is only ever compared inside the
     * `UPDATE` below.
     */
    const requiredStatus =
      operation.mode === "replace" ? "safety_backed_up" : "staged";
    const token = `${operationId}:${crypto.randomUUID()}`;
    const now = this.#now().toISOString();
    const statements: D1PreparedStatement[] = [];

    // 1. Claim the cutover. Exactly one concurrent call can win this.
    statements.push(
      this.#db
        .prepare(
          `UPDATE workspace_restore_operations
           SET status = 'applied', apply_token = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ?
             AND status = ? AND apply_token IS NULL`,
        )
        .bind(token, now, this.#workspaceId, operationId, requiredStatus),
    );

    // Every write below is conditioned on THIS call holding the claim.
    const claimed = `EXISTS (SELECT 1 FROM workspace_restore_operations o
             WHERE o.workspace_id = ? AND o.id = ? AND o.apply_token = ?)`;

    // 2. Clear the workspace, children strictly before parents.
    for (const collection of [...STAGED_COLLECTIONS].reverse()) {
      const descriptor = TABLES[collection]!;
      statements.push(
        descriptor.ownerScoped === true
          ? this.#db
              .prepare(
                `DELETE FROM ${descriptor.table}
                 WHERE workspace_id = ? AND owner_id = ? AND ${claimed}`,
              )
              .bind(
                this.#workspaceId,
                ownerId,
                this.#workspaceId,
                operationId,
                token,
              )
          : this.#db
              .prepare(
                `DELETE FROM ${descriptor.table}
                 WHERE workspace_id = ? AND ${claimed}`,
              )
              .bind(this.#workspaceId, this.#workspaceId, operationId, token),
      );
    }

    // 3. Insert the backup, parents strictly before children. `workspace_id` is
    //    a bound literal from the server's context — never a value from the
    //    staged row — so a crafted archive cannot name a destination.
    for (const collection of STAGED_COLLECTIONS) {
      const descriptor = TABLES[collection]!;
      statements.push(
        this.#db
          .prepare(
            `INSERT INTO ${descriptor.table} (workspace_id, ${descriptor.columns.join(", ")})
             SELECT ?, ${projection(descriptor)}
             FROM workspace_restore_staged_rows
             WHERE workspace_id = ? AND operation_id = ? AND collection = ?
               AND ${claimed}
             ORDER BY sequence`,
          )
          .bind(
            this.#workspaceId,
            this.#workspaceId,
            operationId,
            collection,
            this.#workspaceId,
            operationId,
            token,
          ),
      );
    }

    // 4. The workspace's own `updated_at` reflects the restore. Its `id` and
    //    `created_at` stay the TARGET's: the backup's workspace identity is
    //    provenance, and adopting it would be exactly the cross-workspace write
    //    this design forbids.
    statements.push(
      this.#db
        .prepare(
          `UPDATE workspaces SET updated_at = ?
           WHERE id = ? AND ${claimed}`,
        )
        .bind(now, this.#workspaceId, this.#workspaceId, operationId, token),
    );

    await this.#db.batch(statements);

    // Whether this call won is a fact about the committed row, not about what
    // was attempted — so it is read back rather than inferred.
    const after = await this.#db
      .prepare(
        `SELECT apply_token FROM workspace_restore_operations
         WHERE workspace_id = ? AND id = ? LIMIT 1`,
      )
      .bind(this.#workspaceId, operationId)
      .first<{ apply_token: string | null }>();
    return after?.apply_token === token;
  }

  /* -- verification ------------------------------------------------------ */

  /**
   * Read the restored workspace back and check it against the STAGED rows.
   *
   * Runs BEFORE the staged rows are purged, which is what lets the identity
   * checks be exact set comparisons in SQL rather than a bounded sample: the
   * backup is still present in the database, so "every id in the backup is in
   * the workspace" costs one query per table instead of shipping thousands of
   * ids into a `WHERE … IN`.
   */
  async verifyRestored(operationId: string): Promise<RestoreVerification> {
    const checks: RestoreCheck[] = [];

    // 1. Every table holds exactly as many rows as the backup staged for it.
    const staged = await this.#db
      .prepare(
        `SELECT collection, COUNT(*) AS n FROM workspace_restore_staged_rows
         WHERE workspace_id = ? AND operation_id = ? GROUP BY collection`,
      )
      .bind(this.#workspaceId, operationId)
      .all<{ collection: string; n: number }>();
    const expectedByCollection = new Map<string, number>(
      (staged.results ?? []).map((row) => [row.collection, row.n]),
    );
    for (const collection of SNAPSHOT_COLLECTION_ORDER) {
      const descriptor = TABLES[collection]!;
      const expected = expectedByCollection.get(collection) ?? 0;
      const row = await this.#db
        .prepare(
          `SELECT COUNT(*) AS n FROM ${descriptor.table} WHERE workspace_id = ?`,
        )
        .bind(this.#workspaceId)
        .first<{ n: number }>();
      const actual = integer(row?.n, -1);
      checks.push({
        name: `count:${collection}`,
        passed: actual === expected,
        detail: `expected ${expected}, found ${actual}`,
      });
    }

    // 2. Identity: every id the backup carried is present, for the three tables
    //    every relationship in the workspace hangs off.
    for (const [collection, idColumn] of [
      ["entities", "id"],
      ["entityLinks", "id"],
      ["activities", "id"],
    ] as const) {
      const descriptor = TABLES[collection]!;
      const missing = await this.#db
        .prepare(
          `SELECT COUNT(*) AS n FROM workspace_restore_staged_rows s
           WHERE s.workspace_id = ? AND s.operation_id = ? AND s.collection = ?
             AND json_extract(s.row_json, '$.${idColumn}') NOT IN (
               SELECT ${idColumn} FROM ${descriptor.table} WHERE workspace_id = ?
             )`,
        )
        .bind(this.#workspaceId, operationId, collection, this.#workspaceId)
        .first<{ n: number }>();
      checks.push({
        name: `identity:${collection}`,
        passed: integer(missing?.n, -1) === 0,
        detail: `${integer(missing?.n, -1)} backup row(s) missing from the workspace`,
      });
    }

    // 3. Referential integrity, verified rather than assumed. The schema's
    //    foreign keys already guarantee it; a restore is exactly the moment to
    //    prove the guarantee held.
    const orphanChecks: readonly [string, string][] = [
      [
        "links",
        `SELECT COUNT(*) AS n FROM entity_links l
         WHERE l.workspace_id = ?1
           AND (NOT EXISTS (SELECT 1 FROM entities e WHERE e.workspace_id = ?1 AND e.id = l.source_entity_id)
             OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.workspace_id = ?1 AND e.id = l.target_entity_id))`,
      ],
      [
        "activitySubjects",
        `SELECT COUNT(*) AS n FROM activity_subjects s
         WHERE s.workspace_id = ?1
           AND (NOT EXISTS (SELECT 1 FROM activities a WHERE a.workspace_id = ?1 AND a.id = s.activity_id)
             OR NOT EXISTS (SELECT 1 FROM entities e WHERE e.workspace_id = ?1 AND e.id = s.entity_id))`,
      ],
      [
        "taskDetails",
        `SELECT COUNT(*) AS n FROM task_details d
         WHERE d.workspace_id = ?1
           AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.workspace_id = ?1 AND e.id = d.entity_id AND e.type = 'task')`,
      ],
      [
        "taskRecurrenceRules",
        `SELECT COUNT(*) AS n FROM task_recurrence_rules r
         WHERE r.workspace_id = ?1
           AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.workspace_id = ?1 AND e.id = r.entity_id AND e.type = 'task')`,
      ],
      [
        "spineRecords",
        `SELECT COUNT(*) AS n FROM spine_records s
         WHERE s.workspace_id = ?1
           AND NOT EXISTS (SELECT 1 FROM entities e WHERE e.workspace_id = ?1 AND e.id = s.entity_id AND e.type = s.kind)`,
      ],
    ];
    for (const [name, sql] of orphanChecks) {
      const row = await this.#db
        .prepare(sql)
        .bind(this.#workspaceId)
        .first<{ n: number }>();
      checks.push({
        name: `integrity:${name}`,
        passed: integer(row?.n, -1) === 0,
        detail: `${integer(row?.n, -1)} orphaned row(s)`,
      });
    }

    // 4. Isolation: nothing the backup carried landed in another workspace.
    //    Structurally impossible — `workspace_id` is bound from the server's
    //    context on every insert — and proved rather than asserted, because
    //    "restore cannot cross the isolation boundary" is a security claim.
    const escaped = await this.#db
      .prepare(
        `SELECT COUNT(*) AS n FROM entities e
         WHERE e.workspace_id <> ?1
           AND e.id IN (
             SELECT json_extract(row_json, '$.id')
             FROM workspace_restore_staged_rows
             WHERE workspace_id = ?1 AND operation_id = ?2 AND collection = 'entities'
           )`,
      )
      .bind(this.#workspaceId, operationId)
      .first<{ n: number }>();
    checks.push({
      name: "isolation:entities",
      passed: integer(escaped?.n, -1) === 0,
      detail: `${integer(escaped?.n, -1)} restored record(s) found outside this workspace`,
    });

    return { passed: checks.every((check) => check.passed), checks };
  }

  /* -- lifecycle --------------------------------------------------------- */

  async discardOperation(operationId: string, reason: string): Promise<void> {
    const now = this.#now().toISOString();
    await this.#db.batch([
      this.#db
        .prepare(
          `DELETE FROM workspace_restore_staged_rows
           WHERE workspace_id = ? AND operation_id = ?`,
        )
        .bind(this.#workspaceId, operationId),
      this.#db
        .prepare(
          `UPDATE workspace_restore_operations
           SET status = 'failed', failure_reason = ?, updated_at = ?
           WHERE workspace_id = ? AND id = ?`,
        )
        // The reason is a structural code written by this application, never
        // record content and never a raw database message.
        .bind(reason.slice(0, 200), now, this.#workspaceId, operationId),
    ]);
  }

  async completeOperation(operationId: string): Promise<void> {
    const now = this.#now().toISOString();
    await this.#db.batch([
      this.#db
        .prepare(
          `DELETE FROM workspace_restore_staged_rows
           WHERE workspace_id = ? AND operation_id = ?`,
        )
        .bind(this.#workspaceId, operationId),
      this.#db
        .prepare(
          `UPDATE workspace_restore_operations
           SET status = 'completed', updated_at = ?
           WHERE workspace_id = ? AND id = ?`,
        )
        .bind(now, this.#workspaceId, operationId),
    ]);
  }
}

/**
 * Construct a workspace-bound restore repository. Mirrors every other D1
 * factory: the workspace is fixed at construction and no method takes one.
 */
export function createWorkspaceRestoreRepository(
  db: D1Database,
  context: WorkspaceContext,
  options: { readonly now?: () => Date } = {},
): D1WorkspaceRestoreRepository {
  return new D1WorkspaceRestoreRepository(db, context, options);
}
