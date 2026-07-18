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
 * A bounded page of Activity events plus the information needed to request the
 * next page. Events are ordered newest-first by `(occurredAt, id)`. `nextCursor`
 * is null when there are no further events.
 */
export type ActivityPage = {
  readonly items: readonly ActivityRecord[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};
