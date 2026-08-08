/**
 * X-04 — explicit validation of a built workspace snapshot.
 *
 * A malformed or incomplete snapshot must FAIL, loudly, before a single byte
 * reaches the owner. A download that looks valid and is not is the worst
 * possible outcome for a data-portability feature: it is discovered later, when
 * the original is gone. So the builder runs every snapshot through
 * {@link assertValidWorkspaceSnapshot} before serialisation, and the route turns
 * a failure into an honest error rather than a file.
 *
 * The validator is PURE and storage-free — it checks the value, not the
 * database — and it checks four kinds of property:
 *
 *   1. **Shape.** Required fields present, of the right type, with explicit
 *      nulls rather than `undefined`.
 *   2. **Format.** Timestamps are ISO-8601 UTC instants; date-only values are
 *      `YYYY-MM-DD`.
 *   3. **Determinism.** Every collection is sorted by its documented key.
 *   4. **Referential integrity.** Every detail row, link endpoint and Activity
 *      subject names an entity the snapshot actually contains.
 *
 * It deliberately does NOT validate domain rules the database already enforces
 * (a Task's priority set, a Review's period ordering). Re-encoding those here
 * would create a second authority that can disagree with the schema.
 */

import {
  SNAPSHOT_COLLECTION_ORDER,
  SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS,
  SNAPSHOT_SCHEMA_NAME,
  SNAPSHOT_SCHEMA_VERSION,
  type SnapshotCollection,
  type WorkspaceSnapshotV1,
} from "./workspace-snapshot";

/** One thing wrong with a snapshot, located precisely enough to fix. */
export interface SnapshotValidationIssue {
  /** A dotted path into the snapshot, e.g. `records.taskDetails[3].entityId`. */
  readonly path: string;
  readonly message: string;
}

/** Thrown when a snapshot fails validation. Never echoes record content. */
export class SnapshotValidationError extends Error {
  readonly issues: readonly SnapshotValidationIssue[];

  constructor(issues: readonly SnapshotValidationIssue[]) {
    // The message names paths and rules only — never a title, a body or any
    // other record content, so a validation failure cannot become a data leak
    // through a log line.
    const summary = issues
      .slice(0, 5)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    super(
      `Workspace snapshot failed validation (${issues.length} issue${
        issues.length === 1 ? "" : "s"
      }): ${summary}${issues.length > 5 ? "; …" : ""}`,
    );
    this.name = "SnapshotValidationError";
    this.issues = issues;
  }
}

/* -------------------------------------------------------------------------- */
/* Primitive checks                                                           */
/* -------------------------------------------------------------------------- */

/**
 * An ISO-8601 UTC instant with millisecond precision — the exact shape
 * `Date.prototype.toISOString` produces and the only timestamp form DalyHub
 * stores. Anything else (a local offset, a missing `Z`, a bare date) is a bug
 * worth failing on, not a value to coerce.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** A calendar date with no time and no timezone. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoInstant(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_INSTANT.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

/**
 * Field names an export must NEVER carry, checked as a defence-in-depth net
 * over the whole serialised snapshot.
 *
 * The real defence is that the snapshot contract simply has no such field and
 * the D1 adapter selects named columns. This pattern exists so that ADDING one
 * by accident — in this contract, in a future module's detail row, or in an
 * Activity payload written by a future feature — fails a test instead of
 * shipping a secret in a download.
 */
export const FORBIDDEN_EXPORT_KEY_PATTERN =
  /(^|_|\.)(secret|secrets|token|tokens|jwt|jwts|password|passwords|credential|credentials|cookie|cookies|session|sessions|api_?key|apikey|access_?key|private_?key|binding|bindings|authorization|auth_?header)($|_|\.)/i;

/**
 * Values whose presence anywhere in an export would mean an infrastructure
 * identifier leaked. Checked against the SERIALISED snapshot by the export
 * tests, not at runtime — a runtime scan of every string would be a per-byte
 * cost for a property the contract already guarantees structurally.
 */
export const INFRASTRUCTURE_KEY_HINTS: readonly string[] = [
  "cf_access",
  "cf-access",
  "CF_ACCESS",
  "ACCESS_AUD",
  "ACCESS_TEAM_DOMAIN",
  "DEFAULT_WORKSPACE_ID",
  "OWNER_EMAIL",
  "database_id",
  "account_id",
];

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The documented total ordering key of every collection, as the string the rows
 * must be sorted by. Deterministic ordering is a contract property, not an
 * accident of how the database happened to return rows, so the validator checks
 * it — a reordering regression fails here rather than producing two exports of
 * unchanged data that differ.
 *
 * A composite key joins its parts with `\u0000`. That is not decoration: NUL
 * sorts below every other character and cannot occur in an id, so comparing the
 * joined strings is exactly equivalent to comparing the tuples — which is what
 * the adapter's `ORDER BY a, b` does. Any printable separator (a space, a dash)
 * would compare differently the moment a value contained a character below it.
 */
export const SNAPSHOT_ORDER_KEYS: Readonly<
  Record<SnapshotCollection, (row: never) => string>
> = {
  entities: (row: { id: string }) => row.id,
  spineRecords: (row: { entityId: string }) => row.entityId,
  areaDetails: (row: { entityId: string }) => row.entityId,
  goalDetails: (row: { entityId: string }) => row.entityId,
  projectDetails: (row: { entityId: string }) => row.entityId,
  taskDetails: (row: { entityId: string }) => row.entityId,
  taskRecurrenceRules: (row: { entityId: string }) => row.entityId,
  noteDetails: (row: { entityId: string }) => row.entityId,
  diaryEntryDetails: (row: { entityId: string }) => row.entityId,
  personDetails: (row: { entityId: string }) => row.entityId,
  meetingDetails: (row: { entityId: string }) => row.entityId,
  meetingItems: (row: { id: string }) => row.id,
  meetingItemTasks: (row: { taskId: string }) => row.taskId,
  assetDetails: (row: { entityId: string }) => row.entityId,
  assetEvents: (row: { id: string }) => row.id,
  assetObligations: (row: { id: string }) => row.id,
  reviewDetails: (row: { entityId: string }) => row.entityId,
  reviewSections: (row: { reviewId: string; sectionId: string }) =>
    `${row.reviewId}\u0000${row.sectionId}`,
  reviewWorkflowState: (row: { reviewId: string }) => row.reviewId,
  reviewStepAcknowledgements: (row: { reviewId: string; stepId: string }) =>
    `${row.reviewId}\u0000${row.stepId}`,
  reviewInsightSnapshots: (row: { reviewId: string }) => row.reviewId,
  entityLinks: (row: { id: string }) => row.id,
  activities: (row: { occurredAt: string; id: string }) =>
    `${row.occurredAt}\u0000${row.id}`,
  activitySubjects: (row: { activityId: string; entityId: string }) =>
    `${row.activityId}\u0000${row.entityId}`,
  workspaceMembers: (row: { subject: string }) => row.subject,
} as unknown as Readonly<Record<SnapshotCollection, (row: never) => string>>;

/** The collections whose rows reference an entity by `entityId`. */
const ENTITY_SCOPED_COLLECTIONS: readonly SnapshotCollection[] = [
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
  "assetDetails",
  "reviewDetails",
];

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

interface Collector {
  readonly issues: SnapshotValidationIssue[];
  add(path: string, message: string): void;
}

function collector(): Collector {
  const issues: SnapshotValidationIssue[] = [];
  return {
    issues,
    add(path, message) {
      // A snapshot with thousands of identical issues is no more actionable
      // than one with fifty, and an unbounded list is its own memory risk.
      if (issues.length < 200) issues.push({ path, message });
    },
  };
}

function requireInstant(
  c: Collector,
  path: string,
  value: unknown,
  { nullable = false } = {},
): void {
  if (value === null) {
    if (!nullable) c.add(path, "must be an ISO-8601 UTC instant, not null");
    return;
  }
  if (!isIsoInstant(value)) {
    c.add(path, "must be an ISO-8601 UTC instant (YYYY-MM-DDTHH:MM:SS.sssZ)");
  }
}

function requireDate(c: Collector, path: string, value: unknown): void {
  if (value === null) return;
  if (!isIsoDate(value)) c.add(path, "must be a YYYY-MM-DD calendar date");
}

function requireNonEmptyString(
  c: Collector,
  path: string,
  value: unknown,
): void {
  if (typeof value !== "string" || value.length === 0) {
    c.add(path, "must be a non-empty string");
  }
}

/** Every key in a row must be present (explicit `null`), never `undefined`. */
function requireNoUndefined(
  c: Collector,
  path: string,
  row: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(row)) {
    if (value === undefined) {
      c.add(`${path}.${key}`, "must be an explicit null, not undefined");
    }
    if (FORBIDDEN_EXPORT_KEY_PATTERN.test(key)) {
      c.add(`${path}.${key}`, "is a forbidden field name for an export");
    }
  }
}

/**
 * Validate a snapshot, returning every issue found (empty when it is valid).
 *
 * Total: it never throws on malformed input, so it can be pointed at an
 * untrusted value (a snapshot read back from a file) as safely as at one just
 * built.
 */
export function validateWorkspaceSnapshot(
  value: unknown,
): readonly SnapshotValidationIssue[] {
  const c = collector();
  if (typeof value !== "object" || value === null) {
    c.add("", "must be an object");
    return c.issues;
  }
  const snapshot = value as Partial<WorkspaceSnapshotV1>;

  /* meta ------------------------------------------------------------------ */
  const meta = snapshot.meta;
  if (typeof meta !== "object" || meta === null) {
    c.add("meta", "must be an object");
  } else {
    if (meta.schema !== SNAPSHOT_SCHEMA_NAME) {
      c.add("meta.schema", `must be "${SNAPSHOT_SCHEMA_NAME}"`);
    }
    if (meta.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      c.add("meta.schemaVersion", `must be ${SNAPSHOT_SCHEMA_VERSION}`);
    }
    requireInstant(c, "meta.exportedAt", meta.exportedAt);
    if (meta.consistency !== "per-statement-read-committed") {
      c.add(
        "meta.consistency",
        "must state the real read-consistency guarantee",
      );
    }
    const app = meta.application;
    if (typeof app !== "object" || app === null) {
      c.add("meta.application", "must be an object");
    } else {
      requireNonEmptyString(c, "meta.application.name", app.name);
      requireNonEmptyString(c, "meta.application.version", app.version);
      requireNonEmptyString(c, "meta.application.environment", app.environment);
      if (app.buildCommit !== null && typeof app.buildCommit !== "string") {
        c.add("meta.application.buildCommit", "must be a string or null");
      }
    }
  }

  /* workspace ------------------------------------------------------------- */
  const workspace = snapshot.workspace;
  if (typeof workspace !== "object" || workspace === null) {
    c.add("workspace", "must be an object");
  } else {
    requireNonEmptyString(c, "workspace.id", workspace.id);
    requireInstant(c, "workspace.createdAt", workspace.createdAt);
    requireInstant(c, "workspace.updatedAt", workspace.updatedAt);
  }

  /* owner ----------------------------------------------------------------- */
  const owner = snapshot.owner;
  if (typeof owner !== "object" || owner === null) {
    c.add("owner", "must be an object");
  } else {
    const preferences = owner.preferences;
    if (typeof preferences !== "object" || preferences === null) {
      c.add("owner.preferences", "must be an object");
    } else {
      requireNonEmptyString(
        c,
        "owner.preferences.timezone",
        preferences.timezone,
      );
      if (typeof preferences.version !== "number") {
        c.add("owner.preferences.version", "must be a number");
      }
      requireNoUndefined(
        c,
        "owner.preferences",
        preferences as unknown as Record<string, unknown>,
      );
    }
    if (!Array.isArray(owner.taskSavedViews)) {
      c.add("owner.taskSavedViews", "must be an array");
    }
  }

  /* records --------------------------------------------------------------- */
  const records = snapshot.records;
  if (typeof records !== "object" || records === null) {
    c.add("records", "must be an object");
    return c.issues;
  }

  for (const collection of SNAPSHOT_COLLECTION_ORDER) {
    const rows = (records as Record<string, unknown>)[collection];
    if (Array.isArray(rows)) continue;
    /*
     * A collection added AFTER an archive was written is absent from that
     * archive, and that is not corruption — it is an older, still-valid file
     * (see SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS). It is normalised to an empty
     * array in place so every check below, and every consumer downstream, can go
     * on assuming the collection exists. Every OTHER collection is still
     * required, so a genuinely truncated snapshot is still rejected.
     */
    if (
      rows === undefined &&
      SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS.includes(collection)
    ) {
      (records as Record<string, unknown>)[collection] = [];
      continue;
    }
    c.add(`records.${collection}`, "must be an array");
  }
  if (c.issues.length > 0) return c.issues;

  const entityIds = new Set(records.entities.map((entity) => entity.id));
  const activityIds = new Set(
    records.activities.map((activity) => activity.id),
  );

  /* entities -------------------------------------------------------------- */
  records.entities.forEach((entity, index) => {
    const path = `records.entities[${index}]`;
    requireNoUndefined(c, path, entity as unknown as Record<string, unknown>);
    requireNonEmptyString(c, `${path}.id`, entity.id);
    requireNonEmptyString(c, `${path}.type`, entity.type);
    if (typeof entity.title !== "string") {
      c.add(`${path}.title`, "must be a string");
    }
    requireInstant(c, `${path}.createdAt`, entity.createdAt);
    requireInstant(c, `${path}.updatedAt`, entity.updatedAt);
    requireInstant(c, `${path}.deletedAt`, entity.deletedAt, {
      nullable: true,
    });
  });

  /* entity-scoped details ------------------------------------------------- */
  for (const collection of ENTITY_SCOPED_COLLECTIONS) {
    const rows = records[collection] as readonly { entityId: string }[];
    rows.forEach((row, index) => {
      const path = `records.${collection}[${index}]`;
      requireNoUndefined(c, path, row as unknown as Record<string, unknown>);
      requireNonEmptyString(c, `${path}.entityId`, row.entityId);
      if (!entityIds.has(row.entityId)) {
        c.add(`${path}.entityId`, "references an entity not in this snapshot");
      }
    });
  }

  /* date-only fields ------------------------------------------------------ */
  records.taskDetails.forEach((row, index) => {
    const path = `records.taskDetails[${index}]`;
    requireDate(c, `${path}.dueDate`, row.dueDate);
    requireDate(c, `${path}.scheduledDate`, row.scheduledDate);
    requireInstant(c, `${path}.updatedAt`, row.updatedAt);
  });
  records.reviewDetails.forEach((row, index) => {
    const path = `records.reviewDetails[${index}]`;
    requireDate(c, `${path}.periodStart`, row.periodStart);
    requireDate(c, `${path}.periodEnd`, row.periodEnd);
  });
  records.assetEvents.forEach((row, index) => {
    requireDate(c, `records.assetEvents[${index}].eventDate`, row.eventDate);
  });

  /* Markdown-bearing fields must be strings, never re-rendered HTML -------- */
  records.noteDetails.forEach((row, index) => {
    const path = `records.noteDetails[${index}]`;
    if (typeof row.content !== "string") {
      c.add(`${path}.content`, "must be the canonical Markdown source string");
    }
    if (!Array.isArray(row.tags)) c.add(`${path}.tags`, "must be an array");
  });

  /* children -------------------------------------------------------------- */
  records.meetingItems.forEach((row, index) => {
    const path = `records.meetingItems[${index}]`;
    requireNoUndefined(c, path, row as unknown as Record<string, unknown>);
    if (!entityIds.has(row.meetingId)) {
      c.add(`${path}.meetingId`, "references a meeting not in this snapshot");
    }
  });
  records.meetingItemTasks.forEach((row, index) => {
    const path = `records.meetingItemTasks[${index}]`;
    if (!entityIds.has(row.meetingId)) {
      c.add(`${path}.meetingId`, "references a meeting not in this snapshot");
    }
    if (!entityIds.has(row.taskId)) {
      c.add(`${path}.taskId`, "references a task not in this snapshot");
    }
  });
  records.assetEvents.forEach((row, index) => {
    if (!entityIds.has(row.assetId)) {
      c.add(
        `records.assetEvents[${index}].assetId`,
        "references an asset not in this snapshot",
      );
    }
  });
  records.assetObligations.forEach((row, index) => {
    if (!entityIds.has(row.assetId)) {
      c.add(
        `records.assetObligations[${index}].assetId`,
        "references an asset not in this snapshot",
      );
    }
  });
  records.reviewSections.forEach((row, index) => {
    if (!entityIds.has(row.reviewId)) {
      c.add(
        `records.reviewSections[${index}].reviewId`,
        "references a review not in this snapshot",
      );
    }
  });
  // REVIEW-02 — the guided flow's own rows hang off a Review exactly as its
  // sections do, and are held to the same referential rule.
  records.reviewWorkflowState.forEach((row, index) => {
    const path = `records.reviewWorkflowState[${index}]`;
    requireNoUndefined(c, path, row as unknown as Record<string, unknown>);
    requireNonEmptyString(c, `${path}.currentStep`, row.currentStep);
    requireInstant(c, `${path}.updatedAt`, row.updatedAt);
    if (!Number.isInteger(row.revision) || row.revision < 1) {
      c.add(`${path}.revision`, "must be a positive integer");
    }
    if (!entityIds.has(row.reviewId)) {
      c.add(`${path}.reviewId`, "references a review not in this snapshot");
    }
  });
  records.reviewStepAcknowledgements.forEach((row, index) => {
    const path = `records.reviewStepAcknowledgements[${index}]`;
    requireNoUndefined(c, path, row as unknown as Record<string, unknown>);
    requireNonEmptyString(c, `${path}.stepId`, row.stepId);
    requireInstant(c, `${path}.acknowledgedAt`, row.acknowledgedAt);
    if (!entityIds.has(row.reviewId)) {
      c.add(`${path}.reviewId`, "references a review not in this snapshot");
    }
  });

  // REVIEW-03 — one derived-facts row per completed Review, held to the same
  // referential rule as its sections.
  records.reviewInsightSnapshots.forEach((row, index) => {
    const path = `records.reviewInsightSnapshots[${index}]`;
    requireNoUndefined(c, path, row as unknown as Record<string, unknown>);
    requireNonEmptyString(c, `${path}.periodStart`, row.periodStart);
    requireNonEmptyString(c, `${path}.periodEnd`, row.periodEnd);
    requireNonEmptyString(c, `${path}.factsJson`, row.factsJson);
    requireInstant(c, `${path}.capturedAt`, row.capturedAt);
    if (!Number.isInteger(row.version) || row.version < 1) {
      c.add(`${path}.version`, "must be a positive integer");
    }
    if (!entityIds.has(row.reviewId)) {
      c.add(`${path}.reviewId`, "references a review not in this snapshot");
    }
  });

  /* relationships --------------------------------------------------------- */
  records.entityLinks.forEach((link, index) => {
    const path = `records.entityLinks[${index}]`;
    requireNoUndefined(c, path, link as unknown as Record<string, unknown>);
    requireNonEmptyString(c, `${path}.id`, link.id);
    requireNonEmptyString(c, `${path}.type`, link.type);
    requireInstant(c, `${path}.createdAt`, link.createdAt);
    requireInstant(c, `${path}.deletedAt`, link.deletedAt, { nullable: true });
    if (!entityIds.has(link.sourceEntityId)) {
      c.add(
        `${path}.sourceEntityId`,
        "references an entity not in this snapshot",
      );
    }
    if (!entityIds.has(link.targetEntityId)) {
      c.add(
        `${path}.targetEntityId`,
        "references an entity not in this snapshot",
      );
    }
  });

  /* history --------------------------------------------------------------- */
  records.activities.forEach((activity, index) => {
    const path = `records.activities[${index}]`;
    requireNoUndefined(c, path, activity as unknown as Record<string, unknown>);
    requireNonEmptyString(c, `${path}.id`, activity.id);
    requireNonEmptyString(c, `${path}.type`, activity.type);
    requireInstant(c, `${path}.occurredAt`, activity.occurredAt);
  });
  records.activitySubjects.forEach((subject, index) => {
    const path = `records.activitySubjects[${index}]`;
    if (!activityIds.has(subject.activityId)) {
      c.add(
        `${path}.activityId`,
        "references an activity not in this snapshot",
      );
    }
    if (!entityIds.has(subject.entityId)) {
      c.add(`${path}.entityId`, "references an entity not in this snapshot");
    }
  });

  /* identity -------------------------------------------------------------- */
  // SET-02 — the membership rows that make the exported actor ids interpretable.
  // Held to the same referential rule as everything else: a linked Person must be
  // an entity this snapshot contains, so a restore cannot produce a dangling
  // identity link.
  records.workspaceMembers.forEach((member, index) => {
    const path = `records.workspaceMembers[${index}]`;
    requireNoUndefined(c, path, member as unknown as Record<string, unknown>);
    requireNonEmptyString(c, `${path}.subject`, member.subject);
    requireInstant(c, `${path}.createdAt`, member.createdAt);
    requireInstant(c, `${path}.updatedAt`, member.updatedAt);
    if (
      member.personEntityId !== null &&
      !entityIds.has(member.personEntityId)
    ) {
      c.add(
        `${path}.personEntityId`,
        "references an entity not in this snapshot",
      );
    }
  });

  /* determinism ----------------------------------------------------------- */
  for (const collection of SNAPSHOT_COLLECTION_ORDER) {
    const key = SNAPSHOT_ORDER_KEYS[collection] as (row: unknown) => string;
    const rows = records[collection] as readonly unknown[];
    let previous: string | null = null;
    for (let index = 0; index < rows.length; index += 1) {
      const current = key(rows[index]);
      if (previous !== null && current < previous) {
        c.add(
          `records.${collection}[${index}]`,
          "breaks the collection's documented ordering (export is not deterministic)",
        );
        break;
      }
      previous = current;
    }
  }

  /* limitations ----------------------------------------------------------- */
  if (!Array.isArray(snapshot.limitations)) {
    c.add("limitations", "must be an array (use [] when there are none)");
  }

  return c.issues;
}

/** Validate, or throw a {@link SnapshotValidationError}. */
export function assertValidWorkspaceSnapshot(
  value: unknown,
): asserts value is WorkspaceSnapshotV1 {
  const issues = validateWorkspaceSnapshot(value);
  if (issues.length > 0) throw new SnapshotValidationError(issues);
}
