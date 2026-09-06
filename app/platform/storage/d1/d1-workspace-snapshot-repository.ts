/**
 * X-04 — the D1 implementation of the read-only workspace-snapshot source.
 *
 * Implements the storage-independent `WorkspaceSnapshotRepository` over
 * Cloudflare D1 using prepared, parameterised statements only. Constructed with
 * a single `WorkspaceContext`; every statement constrains `workspace_id = ?`,
 * and no method accepts a `workspaceId` (ADR-010). It performs NO mutations, so
 * an export structurally cannot write data or append Activity.
 *
 * ## Bounded, deterministic reads — not a `SELECT *` dump
 *
 * Every collection is read through ONE parameterised statement per page, with:
 *
 *   - an **explicit column list**, so a column added by a future migration is
 *     never exported by accident and the adapter fails to compile until the
 *     snapshot contract is extended deliberately;
 *   - a **bounded `LIMIT`**, clamped to `SNAPSHOT_PAGE_SIZE`;
 *   - a **keyset cursor** over the collection's documented total ordering (see
 *     {@link COLLECTIONS}), so paging is stable under concurrent writes and two
 *     exports of unchanged data return rows in the same order.
 *
 * Every ordering is served by an existing index — the composite primary keys the
 * detail tables already carry, `entities`' primary key, and
 * `activities_workspace_occurred_idx` for the chronological Activity read — so
 * no migration and no new index is introduced.
 *
 * ## Consistency
 *
 * A snapshot is a SEQUENCE of statements. Each sees a consistent database, but
 * the sequence is not an atomic point-in-time snapshot; the snapshot says so in
 * `meta.consistency` rather than claiming a guarantee D1 does not offer here.
 */

import {
  SNAPSHOT_PAGE_SIZE,
  type JsonValue,
  type SnapshotCollection,
  type SnapshotCollectionRowMap,
  type SnapshotOwnerPreferences,
  type SnapshotPage,
  type SnapshotTaskSavedView,
  type SnapshotWorkspace,
  type WorkspaceSnapshotRepository,
} from "~/kernel/export";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { entityTagsProjection, parseTagProjection } from "./d1-entity-tags";

/** The most saved Tasks views one owner's export will carry. */
const MAX_SAVED_VIEWS = 200;

/* -------------------------------------------------------------------------- */
/* Small conversions                                                          */
/* -------------------------------------------------------------------------- */

/** A stored TEXT value, normalised to `string | null` (never `undefined`). */
function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A stored TEXT value that the schema guarantees is NOT NULL. */
function requiredText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A stored numeric value (INTEGER or REAL), normalised to `number | null`. A
 * non-finite value reads as absent rather than exporting `NaN`, which JSON
 * cannot represent. */
function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A stored numeric value the schema guarantees is NOT NULL. */
function requiredInteger(value: unknown, fallback: number): number {
  const parsed = integer(value);
  return parsed === null ? fallback : parsed;
}

/**
 * Parse a stored JSON object. Returns `null` when the value is absent or does
 * not parse; the builder records the latter as a snapshot limitation.
 */
function jsonValue(value: unknown): JsonValue | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Collection descriptors                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A collection's SQL identity: the table, the explicit column list, the ordering
 * columns (its documented total ordering, and the keyset cursor), and the pure
 * row mapper.
 *
 * Written as data rather than twenty near-identical methods so the ordering
 * rule, the cursor and the column list cannot drift apart per collection — the
 * exact failure mode that would make one collection non-deterministic while the
 * rest stayed correct.
 */
interface CollectionDescriptor<K extends SnapshotCollection> {
  readonly table: string;
  readonly columns: string;
  /** One or two ordering columns. A single column must be unique per workspace. */
  readonly order: readonly [string] | readonly [string, string];
  readonly map: (row: Record<string, unknown>) => SnapshotCollectionRowMap[K];
}

/**
 * A collection whose STORE no longer exists — the ones
 * `RETIRED_SNAPSHOT_COLLECTIONS` names. It is never written, and its key stays
 * in the snapshot's type and order so archives that carry it still validate and
 * still restore. `null` rather than a missing key on purpose: the mapped type
 * below is what makes forgetting a collection a compile error, and an exemption
 * that removed the key would remove that guarantee too.
 */
const RETIRED = null;

type CollectionDescriptors = {
  readonly [K in SnapshotCollection]: CollectionDescriptor<K> | typeof RETIRED;
};

const COLLECTIONS: CollectionDescriptors = {
  entities: {
    table: "entities",
    columns: "id, type, title, created_at, updated_at, deleted_at",
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      type: requiredText(row.type),
      title: requiredText(row.title),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
      deletedAt: text(row.deleted_at),
    }),
  },
  /*
   * V2.6 FIND-02 — the tag vocabulary and its attachments.
   *
   * Read as their own collections so an entry NOTHING carries still survives a
   * round trip, and so a tagged Task (FIND-03) needs no new collection of its
   * own. Ordered by their primary keys, which is what makes two exports of
   * unchanged data byte-identical.
   */
  workspaceTags: {
    table: "workspace_tags",
    columns: "tag_key, label, created_at, updated_at",
    order: ["tag_key"],
    map: (row) => ({
      key: requiredText(row.tag_key),
      label: requiredText(row.label),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  entityTags: {
    table: "entity_tags",
    columns: "entity_id, tag_key, created_at",
    order: ["entity_id", "tag_key"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      tagKey: requiredText(row.tag_key),
      createdAt: requiredText(row.created_at),
    }),
  },
  spineRecords: {
    table: "spine_records",
    columns: "entity_id, kind, completed_at",
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      kind: requiredText(row.kind),
      completedAt: text(row.completed_at),
    }),
  },
  areaDetails: {
    table: "area_details",
    columns: "entity_id, archived_at, icon_key, colour_slot, updated_at",
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      archivedAt: text(row.archived_at),
      // Verbatim, not normalised: an export records what the database holds, so
      // a key whose catalogue entry has since been removed still survives the
      // round trip. Normalising belongs on the read path, not here.
      iconKey: text(row.icon_key),
      // IDENTITY-01 — the chosen colour, on the same terms. An export that
      // dropped it would restore a workspace with every chosen identity reset
      // to its derived default, which is a silent loss of something the owner
      // deliberately set.
      colourSlot: text(row.colour_slot),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  goalDetails: {
    table: "goal_details",
    columns: `entity_id, target_date, definition_of_done, measurement_type,
      measurement_unit, measurement_direction, baseline_value, target_value,
      icon_key, colour_slot, condition, updated_at`,
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      targetDate: text(row.target_date),
      definitionOfDone: text(row.definition_of_done),
      // Verbatim, exactly as the Area/Project `iconKey` precedent: an export
      // records what the database holds, so a measurement type this build no
      // longer recognises still survives the round trip.
      measurementType: text(row.measurement_type),
      measurementUnit: text(row.measurement_unit),
      measurementDirection: text(row.measurement_direction),
      baselineValue: integer(row.baseline_value),
      targetValue: integer(row.target_value),
      // IDENTITY-01 — a Goal's OWN identity, which it did not have before this
      // release and which is the owner's choice rather than a derivation.
      iconKey: text(row.icon_key),
      colourSlot: text(row.colour_slot),
      // STEER-02 — the OWNER's condition, the one owner-authored Goal state.
      // Verbatim, like every other value here: the export records what the
      // database holds, never what this build would prefer it to hold.
      condition: text(row.condition),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  goalMeasurements: {
    table: "goal_measurements",
    columns: "id, entity_id, value, measured_on, note, created_at, updated_at",
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      goalId: requiredText(row.entity_id),
      value: requiredInteger(row.value, 0),
      measuredOn: requiredText(row.measured_on),
      note: text(row.note),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  goalMilestones: {
    table: "goal_milestones",
    columns:
      "id, entity_id, title, weight, position, completed_at, created_at, updated_at",
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      goalId: requiredText(row.entity_id),
      title: requiredText(row.title),
      weight: requiredInteger(row.weight, 1),
      position: requiredInteger(row.position, 0),
      completedAt: text(row.completed_at),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  habitDetails: {
    table: "habit_details",
    columns:
      "entity_id, notes, archived_at, archived_on, created_at, updated_at",
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      notes: text(row.notes),
      archivedAt: text(row.archived_at),
      archivedOn: text(row.archived_on),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  habitSchedules: {
    table: "habit_schedules",
    columns:
      "id, habit_id, kind, weekdays, target_count, effective_from, effective_to, created_at",
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      habitId: requiredText(row.habit_id),
      // Verbatim, exactly as an Area's `iconKey`: an export records what the
      // database holds, so a schedule kind this build no longer recognises still
      // survives the round trip — and the CHAIN is what makes the owner's past
      // expectations restorable at all.
      kind: requiredText(row.kind),
      weekdays: text(row.weekdays),
      targetCount: integer(row.target_count),
      effectiveFrom: requiredText(row.effective_from),
      effectiveTo: text(row.effective_to),
      createdAt: requiredText(row.created_at),
    }),
  },
  habitCompletions: {
    table: "habit_completions",
    columns: "habit_id, completed_on, recorded_at",
    // The check-in's identity is the (habit, date) pair the table's primary key
    // already is; there is no surrogate id to order by and none is invented.
    order: ["habit_id", "completed_on"],
    map: (row) => ({
      habitId: requiredText(row.habit_id),
      completedOn: requiredText(row.completed_on),
      recordedAt: requiredText(row.recorded_at),
    }),
  },
  projectDetails: {
    table: "project_details",
    columns:
      "entity_id, status, archived_at, icon_key, colour_slot, updated_at",
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      status: requiredText(row.status),
      archivedAt: text(row.archived_at),
      iconKey: text(row.icon_key),
      colourSlot: text(row.colour_slot),
      updatedAt: requiredText(row.updated_at),
    }),
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
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      status: requiredText(row.status),
      priority: text(row.priority),
      dueDate: text(row.due_date),
      scheduledDate: text(row.scheduled_date),
      timeSector: text(row.time_sector),
      commitmentState: requiredText(row.commitment_state),
      delegateTo: text(row.delegate_to),
      delegatedOn: text(row.delegated_on),
      followUpOn: text(row.follow_up_on),
      delegateNote: text(row.delegate_note),
      description: text(row.description),
      waitingSince: text(row.waiting_since),
      waitingNote: text(row.waiting_note),
      updatedAt: requiredText(row.updated_at),
    }),
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
      "mode",
      "series_anchor_date",
      "ordinal",
      "weekend_rule",
      "ends_after_count",
      "ends_on_date",
      "series_id",
      "sequence",
      "created_at",
      "updated_at",
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      dateKind: requiredText(row.date_kind),
      frequency: requiredText(row.frequency),
      interval: requiredInteger(row.interval, 1),
      weekdays: text(row.weekdays),
      anchorDay: integer(row.anchor_day),
      anchorMonth: integer(row.anchor_month),
      // TASKS-07's two columns and TASKS-12's four, so a restored rule is the
      // rule that was exported rather than a fixed-schedule approximation of it.
      mode: text(row.mode) ?? "fixed",
      seriesAnchorDate: text(row.series_anchor_date),
      ordinal: text(row.ordinal),
      weekendRule: text(row.weekend_rule) ?? "allow",
      endsAfterCount: integer(row.ends_after_count),
      endsOnDate: text(row.ends_on_date),
      seriesId: requiredText(row.series_id),
      sequence: requiredInteger(row.sequence, 0),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  taskChecklistItems: {
    table: "task_checklist_items",
    columns: "id, task_id, title, position, completed, created_at, updated_at",
    // The item's own id is the only stable identity it has, and the read order
    // must be deterministic independently of `position` -- which a reorder
    // rewrites, and which two exports of the same data must not disagree about.
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      taskId: requiredText(row.task_id),
      title: requiredText(row.title),
      position: requiredInteger(row.position, 0),
      completed: requiredInteger(row.completed, 0) === 1,
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  projectTemplateDetails: {
    table: "project_template_details",
    columns:
      "entity_id, description, icon_key, colour_slot, default_parent_id, " +
      "default_parent_kind, created_at, updated_at",
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      description: text(row.description),
      iconKey: text(row.icon_key),
      colourSlot: text(row.colour_slot),
      // Exported verbatim, never resolved: a hint that no longer names a live
      // Area or Goal is a legitimate stored state, and a restore must put back
      // exactly what was there.
      defaultParentId: text(row.default_parent_id),
      defaultParentKind: text(row.default_parent_kind),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  projectTemplateTasks: {
    table: "project_template_tasks",
    columns:
      "id, template_id, title, description, priority, position, created_at, updated_at",
    // The row's own id, for the reason `taskChecklistItems` gives: the read
    // order must be deterministic independently of `position`, which a reorder
    // rewrites and which two exports of the same data must not disagree about.
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      templateId: requiredText(row.template_id),
      title: requiredText(row.title),
      description: text(row.description),
      priority: text(row.priority),
      position: requiredInteger(row.position, 0),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  projectTemplateChecklistItems: {
    table: "project_template_checklist_items",
    columns: "id, template_task_id, title, position, created_at, updated_at",
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      templateTaskId: requiredText(row.template_task_id),
      title: requiredText(row.title),
      position: requiredInteger(row.position, 0),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  noteDetails: {
    table: "note_details",
    columns: `entity_id, content, archived_at, updated_at,
      ${entityTagsProjection("note_details")} AS tags`,
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      // The EXACT canonical Markdown source, byte for byte (ADR-015). Nothing
      // here trims, normalises line endings or renders.
      content: requiredText(row.content),
      tags: parseTagProjection(row.tags as string | null),
      archivedAt: text(row.archived_at),
      updatedAt: requiredText(row.updated_at),
    }),
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
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      entryType: requiredText(row.entry_type),
      body: text(row.body),
      occurredAt: requiredText(row.occurred_at),
      timezone: requiredText(row.timezone),
      sourceChannel: requiredText(row.source_channel),
      sourceReference: text(row.source_reference),
      updatedAt: requiredText(row.updated_at),
    }),
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
      "notes",
      "favourite_contact_method",
      "follow_up_frequency",
      "next_follow_up",
      "last_interaction",
      "photo_url",
      "archived_at",
      "updated_at",
      `${entityTagsProjection("person_details")} AS tags`,
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      preferredName: text(row.preferred_name),
      firstName: text(row.first_name),
      middleName: text(row.middle_name),
      lastName: text(row.last_name),
      pronouns: text(row.pronouns),
      organisation: text(row.organisation),
      role: text(row.role),
      department: text(row.department),
      email: text(row.email),
      secondaryEmail: text(row.secondary_email),
      mobile: text(row.mobile),
      workPhone: text(row.work_phone),
      address: text(row.address),
      website: text(row.website),
      birthday: text(row.birthday),
      relationship: text(row.relationship),
      tags: parseTagProjection(row.tags as string | null),
      notes: text(row.notes),
      favouriteContactMethod: text(row.favourite_contact_method),
      followUpFrequency: text(row.follow_up_frequency),
      nextFollowUp: text(row.next_follow_up),
      lastInteraction: text(row.last_interaction),
      photoUrl: text(row.photo_url),
      archivedAt: text(row.archived_at),
      updatedAt: requiredText(row.updated_at),
    }),
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
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      startsAt: requiredText(row.starts_at),
      endsAt: text(row.ends_at),
      timezone: requiredText(row.timezone),
      location: text(row.location),
      mode: text(row.mode),
      meetingUrl: text(row.meeting_url),
      status: requiredText(row.status),
      agendaMarkdown: requiredText(row.agenda_markdown),
      notesMarkdown: requiredText(row.notes_markdown),
      heldAt: text(row.held_at),
      archivedAt: text(row.archived_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  meetingItems: {
    table: "meeting_items",
    columns:
      "id, meeting_id, kind, body_markdown, position, created_at, updated_at",
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      meetingId: requiredText(row.meeting_id),
      kind: requiredText(row.kind),
      bodyMarkdown: requiredText(row.body_markdown),
      position: requiredInteger(row.position, 0),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  meetingItemTasks: {
    table: "meeting_item_tasks",
    columns: "meeting_id, item_id, task_id, created_at",
    order: ["task_id"],
    map: (row) => ({
      meetingId: requiredText(row.meeting_id),
      itemId: text(row.item_id),
      taskId: requiredText(row.task_id),
      createdAt: requiredText(row.created_at),
    }),
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
      `${entityTagsProjection("asset_details")} AS tags`,
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      assetType: requiredText(row.asset_type),
      status: requiredText(row.status),
      description: text(row.description),
      manufacturer: text(row.manufacturer),
      model: text(row.model),
      serialNumber: text(row.serial_number),
      referenceCode: text(row.reference_code),
      tags: parseTagProjection(row.tags as string | null),
      ownerPersonId: text(row.owner_person_id),
      responsiblePersonId: text(row.responsible_person_id),
      location: text(row.location),
      areaId: text(row.area_id),
      acquisitionDate: text(row.acquisition_date),
      purchasePriceMinor: integer(row.purchase_price_minor),
      currencyCode: text(row.currency_code),
      supplier: text(row.supplier),
      replacementValueMinor: integer(row.replacement_value_minor),
      disposalDate: text(row.disposal_date),
      disposalNotes: text(row.disposal_notes),
      warrantyExpiry: text(row.warranty_expiry),
      serviceInterval: text(row.service_interval),
      lastServiceDate: text(row.last_service_date),
      nextServiceDate: text(row.next_service_date),
      serviceProvider: text(row.service_provider),
      maintenanceNotes: text(row.maintenance_notes),
      issuer: text(row.issuer),
      referenceNumber: text(row.reference_number),
      issueDate: text(row.issue_date),
      renewalDate: text(row.renewal_date),
      url: text(row.url),
      documentNotes: text(row.document_notes),
      currentMeterValue: integer(row.current_meter_value),
      currentMeterUnit: text(row.current_meter_unit),
      currentMeterDate: text(row.current_meter_date),
      archivedAt: text(row.archived_at),
      updatedAt: requiredText(row.updated_at),
    }),
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
    ].join(", "),
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      assetId: requiredText(row.asset_id),
      category: requiredText(row.category),
      title: requiredText(row.title),
      eventDate: requiredText(row.event_date),
      completedAt: text(row.completed_at),
      description: text(row.description),
      provider: text(row.provider),
      personId: text(row.person_id),
      costMinor: integer(row.cost_minor),
      valueMinor: integer(row.value_minor),
      currencyCode: text(row.currency_code),
      meterValue: integer(row.meter_value),
      meterUnit: text(row.meter_unit),
      warrantyExpiry: text(row.warranty_expiry),
      nextDueDate: text(row.next_due_date),
      taskId: text(row.task_id),
      noteId: text(row.note_id),
      obligationId: text(row.obligation_id),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
      archivedAt: text(row.archived_at),
      deletedAt: text(row.deleted_at),
    }),
  },
  /*
   * V2.10 LIFE-01 — RETIRED. `asset_obligations` was migrated into
   * `obligation_details` and dropped by migration 0050, so an export written
   * from now on carries no `assetObligations` collection at all.
   *
   * The KEY stays in the snapshot's type and in its order, and the collection
   * stays optional-on-read, because every archive an owner already has carries
   * one and restoring those is the difference between "export always possible"
   * and a backup with an expiry date (AGENTS.md §7). `null` here means "never
   * written"; the restore side still knows how to read it.
   */
  assetObligations: RETIRED,
  obligations: {
    table: "obligation_details",
    columns: [
      "entity_id",
      "subject_entity_id",
      "subject_entity_type",
      "category",
      "description",
      "due_date",
      "lead_days",
      "recurrence_kind",
      "recurrence_interval",
      "meter_threshold",
      "meter_interval",
      "meter_unit",
      "expected_amount_minor",
      "completed_amount_minor",
      "currency_code",
      "status",
      "task_id",
      "completed_event_id",
      "completed_at",
      "completed_on",
      "next_obligation_id",
      "series_id",
      "sequence",
      "created_at",
      "updated_at",
      "archived_at",
      "deleted_at",
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      subjectEntityId: text(row.subject_entity_id),
      subjectEntityType: text(row.subject_entity_type),
      category: requiredText(row.category),
      description: text(row.description),
      dueDate: text(row.due_date),
      leadDays: requiredInteger(row.lead_days, 0),
      recurrenceKind: requiredText(row.recurrence_kind),
      recurrenceInterval: integer(row.recurrence_interval),
      meterThreshold: integer(row.meter_threshold),
      meterInterval: integer(row.meter_interval),
      meterUnit: text(row.meter_unit),
      expectedAmountMinor: integer(row.expected_amount_minor),
      completedAmountMinor: integer(row.completed_amount_minor),
      currencyCode: text(row.currency_code),
      status: requiredText(row.status),
      taskId: text(row.task_id),
      completedEventId: text(row.completed_event_id),
      completedAt: text(row.completed_at),
      completedOn: text(row.completed_on),
      nextObligationId: text(row.next_obligation_id),
      seriesId: requiredText(row.series_id),
      sequence: requiredInteger(row.sequence, 0),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
      archivedAt: text(row.archived_at),
      deletedAt: text(row.deleted_at),
    }),
  },
  /*
   * V2.11 FILE-00 — the attachment METADATA. The bytes are read separately, by
   * the archive assembler, through the object store: a snapshot is JSON and a
   * 10 MiB file has no business in one.
   *
   * `storage_key` is deliberately NOT in the column list. It is this
   * deployment's own bucket layout, and an archive that carried it would either
   * be ignored on restore or honoured — and honoured means a restore that
   * depends on the shape of the bucket it came from. The key is derived on the
   * way back in, from the id that does travel.
   */
  attachments: {
    table: "attachments",
    columns: [
      "id",
      "owner_entity_id",
      "filename",
      "media_type",
      "byte_size",
      "checksum_sha256",
      "upload_operation_id",
      "uploaded_by",
      "created_at",
    ].join(", "),
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      ownerEntityId: requiredText(row.owner_entity_id),
      filename: requiredText(row.filename),
      mediaType: requiredText(row.media_type),
      byteSize: integer(row.byte_size) ?? 0,
      checksumSha256: requiredText(row.checksum_sha256),
      uploadOperationId: requiredText(row.upload_operation_id),
      uploadedBy: text(row.uploaded_by),
      createdAt: requiredText(row.created_at),
    }),
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
    ].join(", "),
    order: ["entity_id"],
    map: (row) => ({
      entityId: requiredText(row.entity_id),
      reviewType: requiredText(row.review_type),
      periodStart: requiredText(row.period_start),
      periodEnd: requiredText(row.period_end),
      status: requiredText(row.status),
      templateId: requiredText(row.template_id),
      completedAt: text(row.completed_at),
      archivedAt: text(row.archived_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  reviewSections: {
    table: "review_sections",
    columns: "review_id, section_id, body_markdown, updated_at",
    order: ["review_id", "section_id"],
    map: (row) => ({
      reviewId: requiredText(row.review_id),
      sectionId: requiredText(row.section_id),
      bodyMarkdown: requiredText(row.body_markdown),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  // REVIEW-02 — the guided flow's resume bookmark and the owner's explicit
  // step decisions. Owner-scoped product state, exported on the same footing as
  // `taskSavedViews`; the acknowledgements in particular record intent that no
  // calculation can reproduce (ADR-072).
  reviewWorkflowState: {
    table: "review_workflow_state",
    columns: "review_id, current_step, revision, updated_at",
    order: ["review_id"],
    map: (row) => ({
      reviewId: requiredText(row.review_id),
      currentStep: requiredText(row.current_step),
      revision: requiredInteger(row.revision, 1),
      updatedAt: requiredText(row.updated_at),
    }),
  },
  reviewStepAcknowledgements: {
    table: "review_step_acknowledgements",
    columns: "review_id, step_id, acknowledged_at",
    order: ["review_id", "step_id"],
    map: (row) => ({
      reviewId: requiredText(row.review_id),
      stepId: requiredText(row.step_id),
      acknowledgedAt: requiredText(row.acknowledged_at),
    }),
  },
  // REVIEW-03 — the derived-facts row a completed Review captured. It is the
  // one insight artefact a restore cannot rebuild (ADR-079), so it travels with
  // the workspace; `facts_json` is carried verbatim under its own version.
  reviewInsightSnapshots: {
    table: "review_insight_snapshots",
    columns:
      "review_id, version, period_start, period_end, captured_at, facts_json",
    order: ["review_id"],
    map: (row) => ({
      reviewId: requiredText(row.review_id),
      version: requiredInteger(row.version, 1),
      periodStart: requiredText(row.period_start),
      periodEnd: requiredText(row.period_end),
      capturedAt: requiredText(row.captured_at),
      factsJson: requiredText(row.facts_json),
    }),
  },
  entityLinks: {
    table: "entity_links",
    columns:
      "id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at",
    order: ["id"],
    map: (row) => ({
      id: requiredText(row.id),
      sourceEntityId: requiredText(row.source_entity_id),
      targetEntityId: requiredText(row.target_entity_id),
      type: requiredText(row.type),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
      deletedAt: text(row.deleted_at),
    }),
  },
  activities: {
    table: "activities",
    columns: "id, type, actor_type, actor_id, occurred_at, payload_json",
    // Chronological, tie-broken by id: the ordering the Activity feed already
    // uses and the one `activities_workspace_occurred_idx` serves.
    order: ["occurred_at", "id"],
    map: (row) => ({
      id: requiredText(row.id),
      type: requiredText(row.type),
      actorType: requiredText(row.actor_type),
      actorId: text(row.actor_id),
      occurredAt: requiredText(row.occurred_at),
      payload: jsonValue(row.payload_json),
    }),
  },
  activitySubjects: {
    table: "activity_subjects",
    columns: "activity_id, entity_id, role",
    order: ["activity_id", "entity_id"],
    map: (row) => ({
      activityId: requiredText(row.activity_id),
      entityId: requiredText(row.entity_id),
      role: requiredText(row.role),
    }),
  },
  // SET-02 / IDENT-01 — the membership rows that make the exported actor ids
  // interpretable after a restore. `email` and `last_seen_at` are deliberately
  // NOT selected: the first is an authentication-adjacent identifier the request
  // boundary refreshes on every sign-in, the second is operational telemetry.
  // Selecting named columns is what makes that exclusion structural.
  workspaceMembers: {
    table: "workspace_members",
    columns:
      "subject, display_name, auth_display_name, person_entity_id, created_at, updated_at",
    order: ["subject"],
    map: (row) => ({
      subject: requiredText(row.subject),
      displayName: text(row.display_name),
      authDisplayName: text(row.auth_display_name),
      personEntityId: text(row.person_entity_id),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }),
  },
};

/* -------------------------------------------------------------------------- */
/* Cursor                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Encode/decode the keyset cursor. Opaque to callers: it is only ever produced
 * by this adapter and handed straight back to it, so the encoding is an
 * implementation detail and never a wire contract.
 */
function encodeCursor(values: readonly string[]): string {
  return JSON.stringify(values);
}

function decodeCursor(
  cursor: string,
  expected: number,
): readonly string[] | null {
  try {
    const parsed: unknown = JSON.parse(cursor);
    if (!Array.isArray(parsed) || parsed.length !== expected) return null;
    if (!parsed.every((value) => typeof value === "string")) return null;
    return parsed as string[];
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Repository                                                                 */
/* -------------------------------------------------------------------------- */

export class D1WorkspaceSnapshotRepository implements WorkspaceSnapshotRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async readWorkspace(): Promise<SnapshotWorkspace | null> {
    const row = await this.#db
      .prepare(
        "SELECT id, created_at, updated_at FROM workspaces WHERE id = ? LIMIT 1",
      )
      .bind(this.#workspaceId)
      .first<Record<string, unknown>>();
    if (row === null) return null;
    return {
      id: requiredText(row.id),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    };
  }

  /**
   * The owner's preferences.
   *
   * `owner_id` is bound as a query predicate ONLY; it never reaches the returned
   * value, because the authenticated subject is an identity artefact of
   * Cloudflare Access rather than workspace data (AGENTS.md §17).
   */
  async readOwnerPreferences(
    ownerId: string,
  ): Promise<SnapshotOwnerPreferences> {
    const row = await this.#db
      .prepare(
        `SELECT timezone, date_format, first_day_of_week,
                default_landing_destination, default_tasks_view,
                default_task_view_id, default_task_destination,
                default_task_capture_parent_id, default_task_capture_parent_kind,
                default_diary_mode, appearance, color_scheme,
                navigation_config, version,
                created_at, updated_at
         FROM owner_app_preferences
         WHERE workspace_id = ? AND owner_id = ?
         LIMIT 1`,
      )
      .bind(this.#workspaceId, ownerId)
      .first<Record<string, unknown>>();

    if (row === null) {
      // No stored row: report the DEFAULTS at version 0, exactly as the SET-01
      // contract does, so an export never claims a value the owner never set.
      return {
        timezone: "Australia/Sydney",
        dateFormat: "d_mmm_yyyy",
        firstDayOfWeek: "monday",
        defaultLandingDestination: "today",
        defaultTasksView: "focus",
        defaultTaskViewId: null,
        defaultTaskDestination: "inbox",
        defaultTaskCaptureParentId: null,
        defaultTaskCaptureParentKind: null,
        defaultDiaryMode: "day",
        appearance: "system",
        colorScheme: "violet",
        navigationConfig: { version: 1, hiddenModuleIds: [] },
        version: 0,
        createdAt: null,
        updatedAt: null,
      };
    }

    return {
      timezone: requiredText(row.timezone),
      dateFormat: requiredText(row.date_format),
      firstDayOfWeek: requiredText(row.first_day_of_week),
      defaultLandingDestination: requiredText(row.default_landing_destination),
      defaultTasksView: requiredText(row.default_tasks_view),
      defaultTaskViewId: text(row.default_task_view_id),
      defaultTaskDestination: requiredText(row.default_task_destination),
      defaultTaskCaptureParentId: text(row.default_task_capture_parent_id),
      defaultTaskCaptureParentKind: text(row.default_task_capture_parent_kind),
      defaultDiaryMode: requiredText(row.default_diary_mode),
      appearance: requiredText(row.appearance),
      colorScheme: requiredText(row.color_scheme),
      navigationConfig: jsonValue(row.navigation_config),
      version: requiredInteger(row.version, 1),
      createdAt: text(row.created_at),
      updatedAt: text(row.updated_at),
    };
  }

  async readTaskSavedViews(
    ownerId: string,
  ): Promise<readonly SnapshotTaskSavedView[]> {
    const result = await this.#db
      .prepare(
        `SELECT id, kind, name, config_version, config, created_at, updated_at
         FROM task_saved_views
         WHERE workspace_id = ? AND owner_id = ?
         ORDER BY id
         LIMIT ?`,
      )
      .bind(this.#workspaceId, ownerId, MAX_SAVED_VIEWS)
      .all<Record<string, unknown>>();
    return (result.results ?? []).map((row) => ({
      id: requiredText(row.id),
      kind: requiredText(row.kind),
      name: requiredText(row.name),
      configVersion: requiredInteger(row.config_version, 1),
      config: jsonValue(row.config),
      createdAt: requiredText(row.created_at),
      updatedAt: requiredText(row.updated_at),
    }));
  }

  async listPage<K extends SnapshotCollection>(
    collection: K,
    cursor: string | null,
    limit: number,
  ): Promise<SnapshotPage<SnapshotCollectionRowMap[K]>> {
    const descriptor = COLLECTIONS[
      collection
    ] as CollectionDescriptor<K> | null;
    // A retired collection is never written: an export carries the stores the
    // product HAS, and the archive stays readable for the ones it had.
    if (descriptor === null) {
      return { rows: [], nextCursor: null } as never;
    }
    // Hard clamp: an export can ask for less than a page, never for more.
    const size = Math.max(1, Math.min(Math.trunc(limit), SNAPSHOT_PAGE_SIZE));

    const [first, second] = descriptor.order;
    const orderBy = second ? `${first}, ${second}` : first;

    const binds: unknown[] = [this.#workspaceId];
    let keyset = "";
    if (cursor !== null) {
      const values = decodeCursor(cursor, descriptor.order.length);
      if (values === null) {
        throw new RangeError("Malformed workspace snapshot cursor");
      }
      if (second) {
        // (a, b) > (?, ?) expressed portably, so SQLite uses the composite index.
        keyset = ` AND (${first} > ? OR (${first} = ? AND ${second} > ?))`;
        binds.push(values[0], values[0], values[1]);
      } else {
        keyset = ` AND ${first} > ?`;
        binds.push(values[0]);
      }
    }
    // Read one extra row to learn whether another page exists without a COUNT.
    binds.push(size + 1);

    const result = await this.#db
      .prepare(
        `SELECT ${descriptor.columns}
         FROM ${descriptor.table}
         WHERE workspace_id = ?${keyset}
         ORDER BY ${orderBy}
         LIMIT ?`,
      )
      .bind(...binds)
      .all<Record<string, unknown>>();

    const raw = result.results ?? [];
    const hasMore = raw.length > size;
    const page = hasMore ? raw.slice(0, size) : raw;
    const rows = page.map((row) => descriptor.map(row));

    let nextCursor: string | null = null;
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1] as Record<string, unknown>;
      nextCursor = encodeCursor(
        descriptor.order.map((column) => requiredText(last[column])),
      );
    }

    return { rows, nextCursor };
  }
}

/**
 * Construct a workspace-bound, read-only snapshot repository. Mirrors every
 * other D1 factory: the workspace is fixed at construction and no method takes
 * one.
 */
export function createWorkspaceSnapshotRepository(
  db: D1Database,
  context: WorkspaceContext,
): WorkspaceSnapshotRepository {
  return new D1WorkspaceSnapshotRepository(db, context);
}
