/**
 * FND-05 Activity kernel — the shared Activity contract.
 *
 * This module defines the application-facing shape of a DalyHub Activity event:
 * one uniform, append-only historical fact that EVERY module and entity type
 * writes to (ADR-005, concretised by ADR-012). There is exactly one Activity
 * stream per workspace; record Timeline, the workspace Activity Feed and the
 * security audit trail all read this same model at different scopes.
 *
 * It is deliberately independent of any storage technology — nothing here imports
 * D1 or Cloudflare types, and no JSON text, SQL or storage row ever appears in
 * these contracts. The D1 adapter (`app/platform/storage/d1`) implements the read
 * repository and the atomic recording seam and is the only place snake_case rows,
 * JSON serialisation and SQLite specifics are allowed to exist.
 *
 * Append-only semantics: an Activity event is a historical fact. The
 * application-facing contract exposes NO update, delete, soft-delete or restore —
 * once appended, an event is immutable. Retention, archival and administrative
 * purge policy are explicitly OUT OF SCOPE for FND-05.
 */

import type { WorkspaceId } from "~/kernel/workspaces";

/**
 * A machine identifier for the KIND of actor that caused an event.
 *
 * Actor types are an OPEN, REUSABLE contract — a validated string, never a
 * database enum or a hard-coded closed list — so future actors (e.g. an
 * authenticated user at FND-09, an integration, an importer) can appear without a
 * schema migration. Validation rules and limits live in `activity-validation.ts`.
 * Examples: `system`, `user`, `ai`, `import`, `integration`.
 */
export type ActivityActorType = string;

/**
 * The trusted, server-derived actor context carried on every event. It is
 * established at the composition boundary (today a `system` actor; FND-09 will
 * supply an authenticated `user` actor) and NEVER passed through module method
 * parameters — module code cannot spoof an actor. `id` is null for actors that
 * have no stable identifier yet (the current `system` actor) and a non-empty
 * validated identifier otherwise.
 */
export type ActivityActor = {
  readonly type: ActivityActorType;
  readonly id: string | null;
};

/**
 * An Activity event type: a STABLE, branded, lowercase dotted identifier such as
 * `entity.created` or `entity_link.unlinked`.
 *
 * Types are an OPEN contract — a validated string stored verbatim, never a
 * database enum and with no display label stored in the kernel — so future
 * modules add event types without a schema migration (FND-06 may later govern
 * registration). The brand means a plain `string` cannot be used where an
 * `ActivityType` is required: a value only becomes an `ActivityType` by passing
 * `parseActivityType` (`activity-validation.ts`).
 */
declare const activityTypeBrand: unique symbol;
export type ActivityType = string & { readonly [activityTypeBrand]: true };

/**
 * The role an entity plays in an event: a validated, stable machine identifier
 * (e.g. `subject`, `source`, `target`). Like actor and event types it is an open,
 * validated string, not a database enum.
 */
export type ActivitySubjectRole = string;

/**
 * A normalised subject association: which entity an event relates to, and in what
 * role. An event may relate to ONE or MULTIPLE entities — a single
 * `entity_link.created` event, for instance, relates to both its `source` and its
 * `target` endpoint, so the SAME event appears in both entity timelines while
 * remaining one Activity record. Subjects are stored in a separate association
 * table, never embedded as a single entity id on the event row (ADR-012).
 */
export type ActivitySubject = {
  readonly entityId: string;
  readonly role: ActivitySubjectRole;
};

/**
 * A JSON value permitted inside an Activity payload. Deliberately narrow: only
 * the JSON-safe primitives, arrays and plain objects. Functions, symbols,
 * `undefined`, cyclic structures and non-finite numbers are NOT `JsonValue`s and
 * are rejected by `validateActivityPayload` (`activity-validation.ts`).
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * The small structured payload attached to an event. It MUST be a JSON object
 * (not a bare primitive or array) and carries only the information needed to
 * explain the event — never an arbitrary full entity snapshot, and never a
 * replacement for a proper domain table. Bounded in encoded byte size and nesting
 * depth; see `activity-validation.ts`.
 */
export type ActivityPayload = { readonly [key: string]: JsonValue };

/**
 * A stored Activity event: one uniform, append-only historical fact.
 *
 * Field notes:
 *   - `id` is application-generated, globally unique, stable and never reused.
 *   - `workspaceId` scopes the event; Activity is workspace-isolated.
 *   - `type` is the validated, branded event type, stored verbatim.
 *   - `actor` is the trusted server-derived actor context.
 *   - `occurredAt` is the single UTC timestamp of the mutation that produced the
 *     event, derived from the same clock call as the domain record's timestamp.
 *   - `payload` is the parsed, validated structured payload.
 *   - `subjects` are the entities this event relates to (one or many).
 *
 * Every field is `readonly`: an Activity record is an immutable snapshot. There
 * is no mutation method anywhere in the contract.
 */
export type ActivityRecord = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly type: ActivityType;
  readonly actor: ActivityActor;
  readonly occurredAt: Date;
  readonly payload: ActivityPayload;
  readonly subjects: readonly ActivitySubject[];
};

/**
 * Input to list the whole workspace Activity Feed, using bounded cursor
 * pagination. There is deliberately NO `workspaceId` field — scope comes from the
 * repository's bound `WorkspaceContext` (ADR-010/ADR-012).
 */
export type ListWorkspaceActivityInput = {
  /** Optional filter to a single Activity event type. */
  readonly type?: string;
  /**
   * Maximum number of events to return. Clamped to `[1, MAX_ACTIVITY_PAGE_SIZE]`;
   * defaults to `DEFAULT_ACTIVITY_PAGE_SIZE` when omitted. Never unbounded.
   */
  readonly limit?: number;
  /**
   * Opaque cursor from a previous page's `nextCursor`. Must be a cursor this
   * kernel issued for the workspace feed under the SAME type filter; anything
   * else is rejected as an invalid cursor.
   */
  readonly cursor?: string;
};

/**
 * Input to list one entity's Timeline (the events it is a subject of), using
 * bounded cursor pagination. There is no `workspaceId` field — scope comes from
 * the repository's bound `WorkspaceContext`.
 */
export type ListEntityActivityInput = {
  /** Optional filter to a single Activity event type. */
  readonly type?: string;
  /**
   * Maximum number of events to return. Clamped to `[1, MAX_ACTIVITY_PAGE_SIZE]`;
   * defaults to `DEFAULT_ACTIVITY_PAGE_SIZE` when omitted. Never unbounded.
   */
  readonly limit?: number;
  /**
   * Opaque cursor from a previous page's `nextCursor`. Must be a cursor this
   * kernel issued for the SAME anchor entity under the SAME type filter; anything
   * else is rejected as an invalid cursor.
   */
  readonly cursor?: string;
};

/**
 * Input to list the events of a bounded SET of anchor entities as ONE stream
 * (`listForEntities`), using bounded cursor pagination. Identical in shape to a
 * single-entity Timeline listing — the anchor set is passed alongside, not here,
 * and there is no `workspaceId` field.
 *
 * This exists so a record whose history is genuinely the history of a
 * RELATIONSHIP — a Person and the records they are linked to — can be read as one
 * correctly-ordered, correctly-paginated stream instead of N interleaved queries
 * merged in application code. It reads the SAME one Activity stream at a wider
 * scope; it is not a second event model.
 */
export type ListEntitiesActivityInput = ListEntityActivityInput;

/**
 * A bounded page of Activity events plus the information needed to request the
 * next page. Events are ordered newest-first by `(occurredAt, id)`. `nextCursor`
 * is null when there are no further events.
 */
export type ActivityPage = {
  readonly items: readonly ActivityRecord[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

/**
 * V2.9 INS-01 — input to count events by type across a series of buckets
 * (DEBT-238).
 *
 * The buckets are the CALLER's: `~/kernel/history` cut them from a window at a
 * grain, resolving owner-local midnights to instants once, so this contract
 * carries no timezone rule of its own (AUDIT-14) and the surface's buckets and
 * the database's cannot drift apart.
 *
 * There is deliberately no `workspaceId` — scope comes from the repository's
 * bound `WorkspaceContext` (ADR-010/ADR-012).
 */
export type CountActivityByTypeInput = {
  /**
   * The event types to count. Non-empty and bounded; an empty list is a caller
   * bug rather than "count everything", because an unfiltered count over the
   * whole stream is a different and unbounded question.
   */
  readonly types: readonly string[];
  /**
   * Oldest first, non-overlapping, each with its half-open instant range.
   * Bounded by the repository; the bucket count is stated back on the result so
   * a truncated series can never be presented as a complete one.
   */
  readonly buckets: readonly ActivityBucketWindow[];
};

/**
 * One bucket to count inside: the caller's key and the half-open instant range
 * the events are matched against.
 *
 * Structurally the same shape as `CompletedTaskWindow` (`~/kernel/tasks`) and
 * for the same reason — the caller computes the boundaries because only the
 * caller knows the owner's timezone.
 */
export type ActivityBucketWindow = {
  /** The caller's own identifier for this bucket; echoed back on the count. */
  readonly key: string;
  /** Inclusive lower bound. */
  readonly startsAt: Date;
  /** Exclusive upper bound. */
  readonly endsAt: Date;
};

/**
 * How many events of each requested type occurred inside one bucket.
 *
 * Every requested bucket comes back, and every requested type appears in
 * `counts` — with zero when nothing happened, because an absent bucket is
 * indistinguishable from a quiet one.
 *
 * The count is of DISTINCT PRIMARY-SUBJECT ENTITIES per type, not of raw event
 * rows: a `task.completed` event carries the Task as its subject, and one Task
 * completed twice inside one bucket is one completion of one Task. That is the
 * semantics `countPeriodCompletions` already has (ADR-079 decision 2) and this
 * read preserves it rather than inventing a second answer to the same question.
 *
 * "Primary subject" is the role a mutation writes its own entity under; the
 * endpoints of a relationship event (`source`, `target`) are deliberately not
 * counted. So this read answers *"how many distinct things had this happen to
 * them in this bucket?"* — which is the entity-centric question every V2.9
 * series asks. A caller wanting "how many link events occurred" is asking a
 * different question and would read zero here rather than a wrong number.
 */
export type ActivityTypeBucketCount = {
  readonly key: string;
  /** Keyed by the requested event type. */
  readonly counts: Readonly<Record<string, number>>;
};

/**
 * V2.9 INS-01 — input to list the events inside one window, newest first
 * (DEBT-238).
 *
 * The kernel's first WINDOWED list. `listForWorkspace` pages the whole stream
 * from now backwards; this pages the stream inside a named period, which is the
 * question "what changed in this fortnight?" actually asks.
 */
export type ListActivityInWindowInput = {
  /** Inclusive lower bound. */
  readonly startsAt: Date;
  /** Exclusive upper bound. */
  readonly endsAt: Date;
  /**
   * Optional filter to a set of event types. Omitted means every type — which
   * is legitimate here, unlike in the counting read, because the page is
   * bounded by `limit` whatever the filter.
   */
  readonly types?: readonly string[];
  /**
   * Maximum number of events to return. Clamped to `[1, MAX_ACTIVITY_PAGE_SIZE]`;
   * defaults to `DEFAULT_ACTIVITY_PAGE_SIZE` when omitted. Never unbounded.
   */
  readonly limit?: number;
  /**
   * Opaque cursor from a previous page's `nextCursor`. Must be a cursor this
   * kernel issued for the SAME window under the SAME type filter; anything else
   * is rejected as an invalid cursor, so a page of one window can never be
   * continued into another.
   */
  readonly cursor?: string;
};
