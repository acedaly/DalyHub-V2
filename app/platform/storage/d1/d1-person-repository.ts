/**
 * PEOPLE-01 People — D1 implementation of the authoritative, workspace-bound
 * `PersonRepository`.
 *
 * Implements the storage-independent People contract over Cloudflare D1 (SQLite)
 * using prepared, parameterised statements only. Constructed with a single
 * `WorkspaceContext`; every statement constrains `workspace_id = ?` and no method
 * accepts a `workspaceId` (ADR-010). No caller value is ever interpolated into
 * SQL (AGENTS.md §17) — the only inlined literal is the trusted kernel constant
 * `'person'`, and the trusted column-name constants used to build partial-update
 * statements (every VALUE stays bound).
 *
 * Atomicity (ADR-012): `create` writes the `entities` row, the `person_details`
 * row and one `person.created` Activity event in ONE `D1Database.batch()` — a
 * single transaction that rolls back entirely on any failure, so a Person can
 * never exist without its detail slice. `update`/`archive`/`restore` fold their
 * precondition and change-detection into the mutating SQL, atomic with their
 * Activity append via the shared `recordAtomicMutation` seam — an idempotent
 * no-op appends nothing, and an Activity-insert failure rolls the write back too.
 *
 * Activity payloads carry ONLY structural metadata (which field names changed),
 * NEVER a Person's private field values — People are the most sensitive data in
 * the system (AGENTS.md §5, §17).
 */

import {
  ActivityError,
  buildActivityWriteModel,
  createSystemActorContext,
  secureIdGenerator as activitySecureIdGenerator,
  type ActivityActorContext,
  type NewActivityEvent,
} from "~/kernel/activity";
import {
  systemClock,
  secureIdGenerator,
  type Clock,
  type IdGenerator,
} from "~/kernel/entities";
import {
  PERSON_ARCHIVED,
  PERSON_CREATED,
  PERSON_ENTITY_TYPE,
  PERSON_RESTORED,
  PERSON_SCALAR_FIELDS,
  PERSON_UPDATED,
  PersonConflictError,
  PersonError,
  PersonNotFoundError,
  PersonStorageError,
  decodePersonCursorForScope,
  encodePersonCursor,
  normaliseQuery,
  validatePeopleLimit,
  validatePersonDetails,
  validatePersonId,
  validatePersonStatus,
  validatePersonTitle,
  type ContactMethod,
  type CreatePersonInput,
  type FollowUpFrequency,
  type GetPersonOptions,
  type ListPeopleInput,
  type Person,
  type PersonChangeResult,
  type PersonCursorScope,
  type PersonLifecycleResult,
  type PersonPage,
  type PersonRelationship,
  type PersonRepository,
  type PersonScalarField,
  type UpdatePersonInput,
} from "~/kernel/people";
import { canonicalTagKey, tagLabels, type WorkspaceTag } from "~/kernel/tags";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";
import { D1ActivityRecorder } from "./d1-activity-recorder";
import {
  recordAtomicMutation,
  type AtomicMutationFault,
} from "./d1-atomic-mutation";
import {
  buildEntityTagStatements,
  entityTagsProjection,
  parseTagProjection,
  tagSearchPredicate,
} from "./d1-entity-tags";
import { likeContains } from "./like-pattern";

/** TEST-ONLY deterministic create-batch failure injection. Never set in production. */
export type D1PersonCreateFault = "after-entity" | "after-details";

export interface D1PersonRepositoryOptions {
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly actorContext?: ActivityActorContext;
  readonly activityIdGenerator?: IdGenerator;
  /** TEST-ONLY create-batch fault (proves the whole create rolls back). */
  readonly createFault?: D1PersonCreateFault;
  /** TEST-ONLY mutation-batch fault (proves the detail write + event roll back). */
  readonly mutationFault?: AtomicMutationFault;
}

const SUBJECT_ROLE = "subject";

/** The DB column for each scalar detail field. Trusted identifiers, never caller
 * data, so they may be interpolated into a dynamic partial-update statement while
 * every VALUE stays bound. */
const SCALAR_COLUMN: Record<PersonScalarField, string> = {
  preferredName: "preferred_name",
  firstName: "first_name",
  middleName: "middle_name",
  lastName: "last_name",
  pronouns: "pronouns",
  organisation: "organisation",
  role: "role",
  department: "department",
  email: "email",
  secondaryEmail: "secondary_email",
  mobile: "mobile",
  workPhone: "work_phone",
  address: "address",
  website: "website",
  birthday: "birthday",
  relationship: "relationship",
  notes: "notes",
  favouriteContactMethod: "favourite_contact_method",
  followUpFrequency: "follow_up_frequency",
  nextFollowUp: "next_follow_up",
  lastInteraction: "last_interaction",
  photoUrl: "photo_url",
};

/** The reverse map (column → domain field) for building Activity payloads. */
const COLUMN_FIELD: ReadonlyMap<string, PersonScalarField> = new Map(
  PERSON_SCALAR_FIELDS.map((field) => [SCALAR_COLUMN[field], field] as const),
);

/**
 * All editable detail columns, in a stable order.
 *
 * FIND-02 removed `tags` from this list, and from the column-diff machinery
 * below, because a tag is no longer a column: it lives in the workspace
 * vocabulary and is written by `buildEntityTagStatements` in the SAME atomic
 * batch. Tag changes still reach the Activity payload's `fields` — they are
 * computed separately and merged, so `person.updated` still says `tags` changed
 * when they did.
 */
const DETAIL_COLUMNS: readonly string[] = PERSON_SCALAR_FIELDS.map(
  (field) => SCALAR_COLUMN[field],
);

/** The full ordered detail-column list a create INSERT writes. */
const CREATE_COLUMNS: readonly string[] = [
  ...DETAIL_COLUMNS,
  "archived_at",
  "updated_at",
];

/** The entity columns a create returns, matching the `entities` row shape. */
const ENTITY_RETURNING =
  "id, workspace_id, type, title, created_at, updated_at, deleted_at";

/** The joined columns every read selects. */
const READ_COLUMNS = `
  e.id AS id,
  e.workspace_id AS workspace_id,
  e.title AS title,
  e.created_at AS created_at,
  e.deleted_at AS deleted_at,
  d.preferred_name AS preferred_name,
  d.first_name AS first_name,
  d.middle_name AS middle_name,
  d.last_name AS last_name,
  d.pronouns AS pronouns,
  d.organisation AS organisation,
  d.role AS role,
  d.department AS department,
  d.email AS email,
  d.secondary_email AS secondary_email,
  d.mobile AS mobile,
  d.work_phone AS work_phone,
  d.address AS address,
  d.website AS website,
  d.birthday AS birthday,
  d.relationship AS relationship,
  ${entityTagsProjection("d")} AS tags,
  d.notes AS notes,
  d.favourite_contact_method AS favourite_contact_method,
  d.follow_up_frequency AS follow_up_frequency,
  d.next_follow_up AS next_follow_up,
  d.last_interaction AS last_interaction,
  d.photo_url AS photo_url,
  d.archived_at AS archived_at,
  CASE WHEN e.updated_at >= d.updated_at THEN e.updated_at ELSE d.updated_at END
    AS effective_updated_at`;

/** The raw joined row a read returns. Never escapes this adapter. */
interface PersonJoinedRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly title: string;
  readonly created_at: string;
  readonly deleted_at: string | null;
  readonly preferred_name: string | null;
  readonly first_name: string | null;
  readonly middle_name: string | null;
  readonly last_name: string | null;
  readonly pronouns: string | null;
  readonly organisation: string | null;
  readonly role: string | null;
  readonly department: string | null;
  readonly email: string | null;
  readonly secondary_email: string | null;
  readonly mobile: string | null;
  readonly work_phone: string | null;
  readonly address: string | null;
  readonly website: string | null;
  readonly birthday: string | null;
  readonly relationship: string | null;
  readonly tags: string | null;
  readonly notes: string | null;
  readonly favourite_contact_method: string | null;
  readonly follow_up_frequency: string | null;
  readonly next_follow_up: string | null;
  readonly last_interaction: string | null;
  readonly photo_url: string | null;
  readonly archived_at: string | null;
  readonly effective_updated_at: string;
}

interface CreatedEntityRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/** A statement guaranteed to fail at execution, aborting/rolling back the batch. */
function forcedFailure(db: D1Database): D1PreparedStatement {
  return db.prepare("SELECT 1 FROM __dalyhub_person_forced_fault__");
}

export class D1PersonRepository implements PersonRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #actor: ActivityActorContext;
  readonly #newActivityId: IdGenerator;
  readonly #recorder: D1ActivityRecorder;
  readonly #createFault?: D1PersonCreateFault;
  readonly #mutationFault?: AtomicMutationFault;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1PersonRepositoryOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options.clock ?? systemClock;
    this.#newId = options.idGenerator ?? secureIdGenerator;
    this.#actor = options.actorContext ?? createSystemActorContext();
    this.#newActivityId =
      options.activityIdGenerator ?? activitySecureIdGenerator;
    this.#recorder = new D1ActivityRecorder(db);
    this.#createFault = options.createFault;
    this.#mutationFault = options.mutationFault;
  }

  /* ---------------------------------------------------------------------- */
  /* Create                                                                 */
  /* ---------------------------------------------------------------------- */

  async create(input: CreatePersonInput): Promise<Person> {
    const title = validatePersonTitle(input.title);
    const validated = validatePersonDetails(input, "create");
    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const id = this.#newId();

    const entityStmt = this.#db
      .prepare(
        `INSERT INTO entities
           (id, workspace_id, type, title, created_at, updated_at, deleted_at)
         VALUES (?, ?, '${PERSON_ENTITY_TYPE}', ?, ?, ?, NULL)
         RETURNING ${ENTITY_RETURNING}`,
      )
      .bind(id, this.#workspaceId, title, nowTs, nowTs);

    const detailValues: (string | null)[] = [
      ...PERSON_SCALAR_FIELDS.map(
        (field) => validated.scalars.get(field) ?? null,
      ),
      null, // archived_at
      nowTs, // updated_at
    ];
    const detailsStmt = this.#db
      .prepare(
        `INSERT INTO person_details
           (workspace_id, entity_id, ${CREATE_COLUMNS.join(", ")})
         VALUES (?, ?, ${CREATE_COLUMNS.map(() => "?").join(", ")})`,
      )
      .bind(this.#workspaceId, id, ...detailValues);

    const event: NewActivityEvent = {
      type: PERSON_CREATED,
      subjects: [{ entityId: id, role: SUBJECT_ROLE }],
      payload: {},
    };

    let model;
    try {
      model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
    } catch (cause) {
      if (cause instanceof PersonError || cause instanceof ActivityError)
        throw cause;
      throw new PersonStorageError({ cause });
    }
    const append = this.#recorder.buildAppendStatements(
      this.#workspaceId,
      model,
    );

    const batch: D1PreparedStatement[] = [entityStmt];
    if (this.#createFault === "after-entity")
      batch.push(forcedFailure(this.#db));
    batch.push(detailsStmt);
    if (this.#createFault === "after-details")
      batch.push(forcedFailure(this.#db));
    batch.push(...append);
    // FIND-02 — the tags land in the SAME transaction, guarded on the Activity
    // event this batch appends, so a Person can never exist with tags that were
    // not recorded (or be created with tags after a rolled-back insert).
    batch.push(
      ...buildEntityTagStatements({
        db: this.#db,
        workspaceId: this.#workspaceId,
        entityId: id,
        tags: validated.tags,
        now: nowTs,
        activityId: model.id,
      }),
    );

    let entityRow: CreatedEntityRow | null;
    try {
      const results = await this.#db.batch<CreatedEntityRow>(batch);
      entityRow = results[0]?.results?.[0] ?? null;
    } catch (cause) {
      throw new PersonStorageError({ cause });
    }
    if (!entityRow) {
      throw new PersonStorageError();
    }

    const scalar = (field: PersonScalarField): string | null =>
      validated.scalars.get(field) ?? null;

    return {
      id,
      workspaceId: parseWorkspaceId(this.#workspaceId),
      title: entityRow.title,
      preferredName: scalar("preferredName"),
      firstName: scalar("firstName"),
      middleName: scalar("middleName"),
      lastName: scalar("lastName"),
      pronouns: scalar("pronouns"),
      organisation: scalar("organisation"),
      role: scalar("role"),
      department: scalar("department"),
      email: scalar("email"),
      secondaryEmail: scalar("secondaryEmail"),
      mobile: scalar("mobile"),
      workPhone: scalar("workPhone"),
      address: scalar("address"),
      website: scalar("website"),
      birthday: scalar("birthday"),
      relationship: scalar("relationship") as PersonRelationship | null,
      tags: tagLabels(validated.tags),
      notes: scalar("notes"),
      favouriteContactMethod: scalar(
        "favouriteContactMethod",
      ) as ContactMethod | null,
      followUpFrequency: scalar(
        "followUpFrequency",
      ) as FollowUpFrequency | null,
      nextFollowUp: scalar("nextFollowUp"),
      lastInteraction: scalar("lastInteraction"),
      photoUrl: scalar("photoUrl"),
      createdAt: fromStorageTimestamp(entityRow.created_at),
      updatedAt: fromStorageTimestamp(entityRow.updated_at),
      deletedAt: null,
      archivedAt: null,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Read                                                                   */
  /* ---------------------------------------------------------------------- */

  async get(
    id: string,
    options: GetPersonOptions = {},
  ): Promise<Person | null> {
    const personId = validatePersonId(id);
    const deletedClause = options.includeDeleted
      ? ""
      : " AND e.deleted_at IS NULL";
    let row: PersonJoinedRow | null;
    try {
      row = await this.#db
        .prepare(
          `SELECT ${READ_COLUMNS}
           FROM entities e
           JOIN person_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE e.workspace_id = ? AND e.id = ? AND e.type = '${PERSON_ENTITY_TYPE}'${deletedClause}
           LIMIT 1`,
        )
        .bind(this.#workspaceId, personId)
        .first<PersonJoinedRow>();
    } catch (cause) {
      throw new PersonStorageError({ cause });
    }
    return row ? this.#rowToPerson(row) : null;
  }

  /* ---------------------------------------------------------------------- */
  /* List                                                                   */
  /* ---------------------------------------------------------------------- */

  async list(input: ListPeopleInput = {}): Promise<PersonPage> {
    const status = validatePersonStatus(input.status);
    const limit = validatePeopleLimit(input.limit);
    const query = normaliseQuery(input.query);

    const scope: PersonCursorScope = {
      workspaceId: this.#workspaceId,
      status,
      query,
    };

    const conditions: string[] = [
      "e.workspace_id = ?",
      `e.type = '${PERSON_ENTITY_TYPE}'`,
      "e.deleted_at IS NULL",
    ];
    const params: unknown[] = [this.#workspaceId];

    if (status === "active") {
      conditions.push("d.archived_at IS NULL");
    } else if (status === "archived") {
      conditions.push("d.archived_at IS NOT NULL");
    }

    if (query !== null) {
      const like = likeContains(query);
      conditions.push(
        `(lower(e.title) LIKE ? ESCAPE '\\'
          OR lower(d.preferred_name) LIKE ? ESCAPE '\\'
          OR lower(d.organisation) LIKE ? ESCAPE '\\'
          OR lower(d.role) LIKE ? ESCAPE '\\'
          OR lower(d.email) LIKE ? ESCAPE '\\'
          OR ${tagSearchPredicate("d")})`,
      );
      params.push(like, like, like, like, like, like);
    }

    if (input.cursor !== undefined) {
      const position = decodePersonCursorForScope(input.cursor, scope);
      conditions.push("(e.created_at < ? OR (e.created_at = ? AND e.id < ?))");
      params.push(position.createdAt, position.createdAt, position.id);
    }

    const fetchLimit = limit + 1;
    params.push(fetchLimit);

    let rows: PersonJoinedRow[];
    try {
      const result = await this.#db
        .prepare(
          `SELECT ${READ_COLUMNS}
           FROM entities e
           JOIN person_details d
             ON d.workspace_id = e.workspace_id AND d.entity_id = e.id
           WHERE ${conditions.join(" AND ")}
           ORDER BY e.created_at DESC, e.id DESC
           LIMIT ?`,
        )
        .bind(...params)
        .all<PersonJoinedRow>();
      rows = result.results;
    } catch (cause) {
      if (cause instanceof PersonError) throw cause;
      throw new PersonStorageError({ cause });
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => this.#rowToPerson(row));
    const last = pageRows.at(-1);
    const nextCursor =
      hasMore && last
        ? encodePersonCursor(scope, {
            createdAt: last.created_at,
            id: last.id,
          })
        : null;

    return { items, nextCursor, hasMore };
  }

  /* ---------------------------------------------------------------------- */
  /* Update                                                                 */
  /* ---------------------------------------------------------------------- */

  async update(
    id: string,
    changes: UpdatePersonInput,
  ): Promise<PersonChangeResult> {
    const personId = validatePersonId(id);
    const validated = validatePersonDetails(changes, "update");

    const current = await this.get(personId);
    if (!current) throw new PersonNotFoundError();

    // Desired vs current value for each column the caller touched.
    const desired = new Map<string, string | null>();
    for (const field of PERSON_SCALAR_FIELDS) {
      if (validated.scalars.has(field)) {
        desired.set(SCALAR_COLUMN[field], validated.scalars.get(field) ?? null);
      }
    }
    const currentCol = (column: string): string | null => {
      const field = COLUMN_FIELD.get(column) as PersonScalarField;
      const value = current[field];
      return value === undefined ? null : (value as string | null);
    };

    const changed = [...desired.keys()].filter(
      (column) => desired.get(column) !== currentCol(column),
    );
    // FIND-02 — tags are compared as a canonical LIST, not as a column. Both
    // sides are ordered by canonical key, so "the same set typed in a different
    // order" is correctly no change and appends no Activity event.
    const tagsChanged =
      validated.tagsProvided && !sameTagSet(validated.tags, current.tags);
    if (changed.length === 0 && !tagsChanged) {
      return { person: current, changed: false };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);

    const setSql = changed.map((column) => `${column} = ?`).join(", ");
    // A TAGS-ONLY edit changes no column, so it has no column guard to offer.
    // It still touches the record — `updated_at` moves — so the statement stays
    // the record's own conditional UPDATE and the guard reduces to "the Person
    // is still here", which is the only thing there is to lose a race against.
    const guardSql =
      changed.length > 0
        ? changed.map((column) => `${column} IS NOT ?`).join(" OR ")
        : "1 = 1";
    const domainStatement = this.#db
      .prepare(
        `UPDATE person_details
            SET ${changed.length > 0 ? `${setSql}, ` : ""}updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ? AND type = '${PERSON_ENTITY_TYPE}'
                        AND deleted_at IS NULL
                )
            AND (${guardSql})
          RETURNING entity_id`,
      )
      .bind(
        ...changed.map((column) => desired.get(column) ?? null),
        nowTs,
        this.#workspaceId,
        personId,
        this.#workspaceId,
        personId,
        ...changed.map((column) => desired.get(column) ?? null),
      );

    const changedFields: (PersonScalarField | "tags")[] = changed
      .map((column) => COLUMN_FIELD.get(column))
      .filter((field): field is PersonScalarField => field !== undefined);
    if (tagsChanged) changedFields.push("tags");

    const event: NewActivityEvent = {
      type: PERSON_UPDATED,
      subjects: [{ entityId: personId, role: SUBJECT_ROLE }],
      payload: { fields: changedFields },
    };

    let result;
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      result = await recordAtomicMutation<{ entity_id: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        trailingStatements: tagsChanged
          ? buildEntityTagStatements({
              db: this.#db,
              workspaceId: this.#workspaceId,
              entityId: personId,
              tags: validated.tags,
              now: nowTs,
              activityId: model.id,
            })
          : undefined,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof PersonError || cause instanceof ActivityError)
        throw cause;
      throw new PersonStorageError({ cause });
    }

    if (result.changed) {
      const refreshed = await this.get(personId);
      if (!refreshed) throw new PersonStorageError();
      return { person: refreshed, changed: true };
    }

    // The gate matched nothing. Reconcile honestly (mirrors the Diary/Note
    // repositories): the Person became unavailable, or a concurrent racer already
    // wrote exactly the columns we intended (benign no-op), or a real conflict.
    const refreshed = await this.get(personId);
    if (!refreshed) throw new PersonNotFoundError();
    if (
      changed.every(
        (column) => currentColOf(refreshed, column) === desired.get(column),
      ) &&
      (!tagsChanged || sameTagSet(validated.tags, refreshed.tags))
    ) {
      return { person: refreshed, changed: false };
    }
    throw new PersonConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Archive lifecycle                                                      */
  /* ---------------------------------------------------------------------- */

  async archive(id: string): Promise<PersonLifecycleResult> {
    return this.#setArchived(id, true);
  }

  async restore(id: string): Promise<PersonLifecycleResult> {
    return this.#setArchived(id, false);
  }

  async #setArchived(
    id: string,
    archived: boolean,
  ): Promise<PersonLifecycleResult> {
    const personId = validatePersonId(id);
    const current = await this.get(personId);
    if (!current) throw new PersonNotFoundError();

    const isArchived = current.archivedAt !== null;
    if (isArchived === archived) {
      return {
        person: current,
        outcome: archived ? "already_archived" : "already_active",
        changed: false,
      };
    }

    const now = this.#clock();
    const nowTs = toStorageTimestamp(now);
    const archivedValue = archived ? nowTs : null;
    const guard = archived ? "archived_at IS NULL" : "archived_at IS NOT NULL";

    const domainStatement = this.#db
      .prepare(
        `UPDATE person_details
            SET archived_at = ?, updated_at = ?
          WHERE workspace_id = ? AND entity_id = ?
            AND EXISTS (
                  SELECT 1 FROM entities
                  WHERE workspace_id = ? AND id = ? AND type = '${PERSON_ENTITY_TYPE}'
                        AND deleted_at IS NULL
                )
            AND ${guard}
          RETURNING entity_id`,
      )
      .bind(
        archivedValue,
        nowTs,
        this.#workspaceId,
        personId,
        this.#workspaceId,
        personId,
      );

    const event: NewActivityEvent = {
      type: archived ? PERSON_ARCHIVED : PERSON_RESTORED,
      subjects: [{ entityId: personId, role: SUBJECT_ROLE }],
      payload: {},
    };

    let result;
    try {
      const model = buildActivityWriteModel(
        event,
        this.#actor.actor,
        this.#newActivityId(),
        now,
      );
      result = await recordAtomicMutation<{ entity_id: string }>({
        db: this.#db,
        workspaceId: this.#workspaceId,
        domainStatement,
        recorder: this.#recorder,
        model,
        fault: this.#mutationFault,
      });
    } catch (cause) {
      if (cause instanceof PersonError || cause instanceof ActivityError)
        throw cause;
      throw new PersonStorageError({ cause });
    }

    if (result.changed) {
      const refreshed = await this.get(personId);
      if (!refreshed) throw new PersonStorageError();
      return {
        person: refreshed,
        outcome: archived ? "archived" : "restored",
        changed: true,
      };
    }

    // The gate matched nothing: reconcile against fresh state.
    const refreshed = await this.get(personId);
    if (!refreshed) throw new PersonNotFoundError();
    const nowArchived = refreshed.archivedAt !== null;
    if (nowArchived === archived) {
      return {
        person: refreshed,
        outcome: archived ? "already_archived" : "already_active",
        changed: false,
      };
    }
    throw new PersonConflictError();
  }

  /* ---------------------------------------------------------------------- */
  /* Internals                                                              */
  /* ---------------------------------------------------------------------- */

  #rowToPerson(row: PersonJoinedRow): Person {
    try {
      return {
        id: row.id,
        workspaceId: parseWorkspaceId(row.workspace_id),
        title: row.title,
        preferredName: row.preferred_name,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        pronouns: row.pronouns,
        organisation: row.organisation,
        role: row.role,
        department: row.department,
        email: row.email,
        secondaryEmail: row.secondary_email,
        mobile: row.mobile,
        workPhone: row.work_phone,
        address: row.address,
        website: row.website,
        birthday: row.birthday,
        relationship: row.relationship as PersonRelationship | null,
        tags: parseTagProjection(row.tags),
        notes: row.notes,
        favouriteContactMethod:
          row.favourite_contact_method as ContactMethod | null,
        followUpFrequency: row.follow_up_frequency as FollowUpFrequency | null,
        nextFollowUp: row.next_follow_up,
        lastInteraction: row.last_interaction,
        photoUrl: row.photo_url,
        createdAt: fromStorageTimestamp(row.created_at),
        updatedAt: fromStorageTimestamp(row.effective_updated_at),
        deletedAt:
          row.deleted_at === null ? null : fromStorageTimestamp(row.deleted_at),
        archivedAt:
          row.archived_at === null
            ? null
            : fromStorageTimestamp(row.archived_at),
      };
    } catch (cause) {
      if (cause instanceof PersonError) throw cause;
      throw new PersonStorageError({ cause });
    }
  }
}

/**
 * True when a record already carries exactly this set of tags.
 *
 * Compared by canonical KEY, never by label, and the distinction is load-bearing:
 * a record carries tag IDENTITIES, and the label it displays belongs to the
 * workspace vocabulary. Re-submitting `READING` for a record already tagged
 * `Reading` therefore changes nothing -- same tag, and the vocabulary keeps the
 * first spelling -- so it must not record a change the owner did not make.
 */
function sameTagSet(
  desired: readonly WorkspaceTag[],
  current: readonly string[],
): boolean {
  if (desired.length !== current.length) return false;
  const carried = new Set(current.map((label) => canonicalTagKey(label)));
  return desired.every((tag) => carried.has(tag.key));
}

/** Read a column's current value from a Person record, for update reconciliation. */
function currentColOf(person: Person, column: string): string | null {
  const field = COLUMN_FIELD.get(column) as PersonScalarField;
  const value = person[field];
  return value === undefined ? null : (value as string | null);
}
