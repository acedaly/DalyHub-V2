/**
 * PWA-12 — the offline MUTATION queue model.
 *
 * Pure data and pure transitions: no IndexedDB, no `fetch`, no React. The browser
 * store, the replay engine and the React provider are thin shells around the
 * decisions made here, exactly as they are for the PWA-05 capture queue
 * (`offline-queue.ts`), so every rule below is unit-testable without a DOM or a
 * network.
 *
 * ── This queue stores INTENT, never a second truth ───────────────────────────
 * A queued mutation says "the owner wanted this Task's title to become X". It is
 * NOT a copy of the Task, not a local Task record, and not a second Task domain.
 * There is no `OfflineTask`, no offline recurrence engine and no offline
 * completion logic anywhere in DalyHub: replay posts the SAME canonical intent to
 * the SAME protected route the online control posts to, and the server's answer is
 * the only truth that is ever written anywhere.
 *
 * ── Deliberately narrow ──────────────────────────────────────────────────────
 * Two entity types and eleven operations. For a Task: completion, reopen, the four
 * replace-style field edits the daily driver actually needs (title, priority, due
 * date, planned date) and one checklist tick. For a Meeting: the four APPEND
 * operations that make up capturing during one — an agenda item, a decision, an
 * outcome and an action.
 *
 * Everything else — re-parenting, delegation, waiting, recurrence RULES, bulk
 * actions, delete/restore, editing or removing a meeting item, the meeting's
 * notes body, and every other module — is online-only and stays that way until
 * this contract has proven itself. This is an offline daily-driver slice, not
 * "offline mode".
 *
 * ── Why MEETING APPENDS and not meeting EDITS (MOBILE-03) ────────────────────
 * §35 of the 3.1 brief asks for the meeting operations that "can use clear
 * idempotency and conflict semantics", and an append is the only shape of
 * meeting write that has both for free:
 *
 *   - **Idempotency** is the receipt's, exactly as it is for a Task. One key is
 *     minted when the item is queued, the server claims it before it writes, and
 *     a retry of a claim that already settled writes nothing. That is what stops
 *     a lost response turning one decision into two rows.
 *   - **Conflict cannot arise**, because an append contends over nothing. It
 *     adds a new row with a server-allocated position; it does not overwrite a
 *     value some other device may have moved. `decideConflict` says so
 *     explicitly rather than by omission (`offline-conflict.ts`).
 *
 * The meeting's NOTES body is deliberately excluded and the reason is the one
 * `DALYHUB_MOBILE_FOUNDATION.md` §4.7 already wrote down: `notesMarkdown` is a
 * single long string, the online editor saves it whole under an optimistic
 * version precondition, and two devices appending to it offline would each send
 * a whole document that discards the other's paragraph. An append to a LIST is
 * commutative; an append to a STRING that travels as the whole string is not.
 * Capturing a thought during a meeting with no signal is served by the note's
 * nearest structured neighbours, which are safe.
 */

import { newCaptureId } from "./offline-queue";

/* -------------------------------------------------------------------------- */
/* The operations                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The closed set of Task operations that may be performed offline.
 *
 * The two lifecycle operations are separated from the three replace-style field
 * edits because they obey different rules everywhere below: only replace-style
 * operations coalesce, and only replace-style operations detect conflict by
 * comparing one field.
 */
export const OFFLINE_REPLACE_OPERATIONS = [
  "set_title",
  "set_priority",
  "set_due",
  "set_planned",
  /*
   * TASKS-13 — ticking or unticking ONE checklist item.
   *
   * The seventh operation, and the first that addresses something INSIDE a Task
   * rather than a field of it: `entityId` is still the Task (that is the record
   * the replay posts to, and the record whose existence decides whether the
   * change can still be applied) and `targetId` names the item. It is
   * replace-style rather than lifecycle because it genuinely is one field with
   * two values, and because a queued tick that the server has already applied
   * must resolve as `satisfied` rather than being asked again.
   *
   * It is the only checklist operation that ships offline. See
   * `TASKS_MODULE.md` for why adding, renaming, deleting and reordering did not:
   * each of them needs the checklist's IDENTITY or its whole ORDER to still be
   * what the device last saw, and neither is a single comparable field.
   */
  "set_checklist_completed",
] as const;

export type OfflineReplaceOperation =
  (typeof OFFLINE_REPLACE_OPERATIONS)[number];

export const OFFLINE_LIFECYCLE_OPERATIONS = ["complete", "reopen"] as const;

export type OfflineLifecycleOperation =
  (typeof OFFLINE_LIFECYCLE_OPERATIONS)[number];

/**
 * MOBILE-03 — the closed set of APPEND operations, which are Meeting-only.
 *
 * An append adds one new structured item to a meeting. It is a third shape
 * alongside lifecycle and replace, not a variant of either, and every rule in
 * this module branches on that distinction:
 *
 *   - it carries a VALUE (the item's body) but no BASE, because there is no
 *     prior value it is replacing;
 *   - it never coalesces — two agenda items are two items, and folding the
 *     second into the first would silently discard one
 *     ({@link findCoalesceTarget} already refuses every non-replace operation,
 *     so this needs no new clause and gets no new exception);
 *   - it can never CONFLICT, because it overwrites nothing
 *     (`offline-conflict.ts`).
 *
 * One operation per `MeetingItemKind`, rather than one operation carrying a
 * kind, so the kind is part of the closed vocabulary the receipt table's CHECK
 * and the replay engine's exhaustive switch both police. A queued decision
 * cannot be satisfied by a receipt for a queued action.
 */
export const OFFLINE_APPEND_OPERATIONS = [
  "add_agenda_item",
  "add_decision",
  "add_outcome",
  "add_action",
] as const;

export type OfflineAppendOperation = (typeof OFFLINE_APPEND_OPERATIONS)[number];

export const OFFLINE_MUTATION_OPERATIONS = [
  ...OFFLINE_LIFECYCLE_OPERATIONS,
  ...OFFLINE_REPLACE_OPERATIONS,
  ...OFFLINE_APPEND_OPERATIONS,
] as const;

export type OfflineMutationOperation =
  (typeof OFFLINE_MUTATION_OPERATIONS)[number];

/** True when a value names a supported offline operation. */
export function isOfflineMutationOperation(
  value: unknown,
): value is OfflineMutationOperation {
  return (
    typeof value === "string" &&
    (OFFLINE_MUTATION_OPERATIONS as readonly string[]).includes(value)
  );
}

/** True for a replace-style operation (one field, last value wins). */
export function isReplaceOperation(
  operation: OfflineMutationOperation,
): operation is OfflineReplaceOperation {
  return (OFFLINE_REPLACE_OPERATIONS as readonly string[]).includes(operation);
}

/** True for an append-style operation (one new item, contends over nothing). */
export function isAppendOperation(
  operation: OfflineMutationOperation,
): operation is OfflineAppendOperation {
  return (OFFLINE_APPEND_OPERATIONS as readonly string[]).includes(operation);
}

/* -------------------------------------------------------------------------- */
/* Entity types                                                               */
/* -------------------------------------------------------------------------- */

/** The record kinds that can be mutated offline. */
export const OFFLINE_MUTATION_ENTITY_TYPES = ["task", "meeting"] as const;

export type OfflineMutationEntityType =
  (typeof OFFLINE_MUTATION_ENTITY_TYPES)[number];

/**
 * The entity type each operation addresses.
 *
 * MOBILE-03 — the queue holds two entity types now, and the way they stay
 * apart is that an operation DETERMINES its entity type rather than travelling
 * beside one. There is no code path that can queue `add_decision` against a
 * Task or `set_priority` against a Meeting, because nothing chooses the pair:
 * {@link createMutationRecord} reads it from here, and
 * {@link replayEndpointFor}'s caller posts to the route this names. A mismatch
 * is not validated away at the edges; it is unrepresentable.
 */
export const OFFLINE_MUTATION_ENTITY = {
  complete: "task",
  reopen: "task",
  set_title: "task",
  set_priority: "task",
  set_due: "task",
  set_planned: "task",
  set_checklist_completed: "task",
  add_agenda_item: "meeting",
  add_decision: "meeting",
  add_outcome: "meeting",
  add_action: "meeting",
} as const satisfies Record<
  OfflineMutationOperation,
  OfflineMutationEntityType
>;

/**
 * The operations that address a TASK.
 *
 * MOBILE-03 — Task-side code (the Task record route's intent allowlist, the
 * optimistic row patch) is typed against THIS rather than against the whole
 * operation set. Without it, widening the vocabulary to Meetings would have
 * quietly asked the Task route to grow four branches it must never have: a
 * route that accepted `add_decision` would be a second Meeting authority
 * reachable through a Task's URL. The narrowing means the compiler refuses
 * that instead of a reviewer having to notice it.
 */
export const OFFLINE_TASK_OPERATIONS = [
  ...OFFLINE_LIFECYCLE_OPERATIONS,
  ...OFFLINE_REPLACE_OPERATIONS,
] as const;

export type OfflineTaskOperation = (typeof OFFLINE_TASK_OPERATIONS)[number];

/** True for an operation the Task record route may accept. */
export function isTaskOperation(
  operation: OfflineMutationOperation,
): operation is OfflineTaskOperation {
  return (OFFLINE_TASK_OPERATIONS as readonly string[]).includes(operation);
}

/** The record kind one operation addresses. */
export function entityTypeFor(
  operation: OfflineMutationOperation,
): OfflineMutationEntityType {
  return OFFLINE_MUTATION_ENTITY[operation];
}

/**
 * The `MeetingItemKind` an append operation creates.
 *
 * Kept here, beside the operation vocabulary, rather than imported from the
 * Meetings kernel: `app/kernel/offline` is shared by the browser store, the
 * replay engine and the server arbitrator, and none of them should have to pull
 * in a module domain to read a four-value string. The Meetings kernel owns the
 * TYPE; this owns the mapping from one closed set to the other, and
 * `test/unit/offline/offline-mutation.test.ts` asserts the two agree.
 */
export const OFFLINE_APPEND_ITEM_KIND = {
  add_agenda_item: "agenda",
  add_decision: "decision",
  add_outcome: "outcome",
  add_action: "action",
} as const satisfies Record<OfflineAppendOperation, string>;

/** The meeting item kind an append operation creates. */
export function appendItemKind(operation: OfflineAppendOperation): string {
  return OFFLINE_APPEND_ITEM_KIND[operation];
}

/**
 * The protected route a queued mutation replays to.
 *
 * MOBILE-03 — replay still goes through the CANONICAL route the online control
 * posts to; what changed is that there is now more than one of them, so the
 * choice is made here, once, from the entity type the operation already
 * determines. There is still no `/offline/mutate` endpoint, no second Meeting
 * authority and no replay-only handler: a queued agenda item reaches
 * `scope.meetings.addItem` through the same `intent=add_item` submission the
 * meeting's own add field sends.
 *
 * Pure and in the kernel so the client engine and its test read one rule.
 */
export function replayEndpointFor(record: {
  readonly entityType: OfflineMutationEntityType;
  readonly entityId: string;
}): string {
  const id = encodeURIComponent(record.entityId);
  // The Meetings module's canonical mutation route is `/meeting/:id/mutate`
  // (singular, and a dedicated action route); Tasks' is the record route
  // itself. Both are declared in their module's own route manifest.
  return record.entityType === "meeting"
    ? `/meeting/${id}/mutate`
    : `/tasks/${id}`;
}

/**
 * The Task FIELD each operation reads and writes.
 *
 * This is the whole of the concurrency contract: a queued mutation carries the
 * value of exactly ONE field as it stood when the owner acted, and the server
 * compares exactly that field. An offline priority change and a server title
 * change therefore merge, because they name different fields — they are not a
 * conflict, and PWA-12 must not invent one (§18).
 */
export const OFFLINE_MUTATION_FIELDS = {
  complete: "completedAt",
  reopen: "completedAt",
  set_title: "title",
  set_priority: "priority",
  set_due: "dueDate",
  set_planned: "scheduledDate",
  // TASKS-13 — the field is the ITEM's tick, resolved against `targetId`. Two
  // devices ticking two DIFFERENT items therefore merge, exactly as two edits to
  // two different Task fields do: the contended thing is (item, completed), not
  // "the checklist".
  set_checklist_completed: "checklistItemCompleted",
  /*
   * MOBILE-03 — an append contends over NOTHING, and these four entries say so
   * in the one place a reader looks for the answer.
   *
   * The map is total over the operation set on purpose (`satisfies Record<…>`),
   * so adding an operation without deciding what it contends over does not
   * compile. `meetingItems` is not a field the server ever compares: the
   * conflict rule short-circuits every append to `applied` before it reads one
   * (`offline-conflict.ts`), and nothing constructs an
   * `OfflineMutationConflict` for an append. It exists so the map stays total
   * and so a diagnostic has a truthful noun for what the operation touched.
   */
  add_agenda_item: "meetingItems",
  add_decision: "meetingItems",
  add_outcome: "meetingItems",
  add_action: "meetingItems",
} as const satisfies Record<OfflineMutationOperation, string>;

export type OfflineMutationField =
  (typeof OFFLINE_MUTATION_FIELDS)[OfflineMutationOperation];

/** The field one operation contends over. */
export function fieldFor(
  operation: OfflineMutationOperation,
): OfflineMutationField {
  return OFFLINE_MUTATION_FIELDS[operation];
}

/** The version of the queued PAYLOAD shape, stored on every record. */
export const OFFLINE_MUTATION_PAYLOAD_VERSION = 1;

/* -------------------------------------------------------------------------- */
/* The envelope                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The lifecycle of a queued mutation.
 *
 *   pending   → queued locally, waiting for a reachable, authenticated backend
 *   syncing   → a replay attempt is in flight (leased, so it is recoverable)
 *   synced    → the server applied it, or confirmed it was already applied
 *   conflict  → the server's value for this field changed while this device was
 *               offline; the owner has to choose. NOT an error, and never retried
 *               automatically — retrying would either loop or silently overwrite.
 *   failed    → permanently rejected (the Task is gone, or the domain refused it)
 *   blocked   → cannot be replayed by THIS session: the sign-in expired, or the
 *               signed-in identity/workspace no longer matches the queued record
 *
 * `blocked` and `conflict` are separate from `failed` on purpose. Neither is the
 * owner's mistake, and presenting either as "this failed, try again" would send
 * them to fix the wrong thing.
 */
export const OFFLINE_MUTATION_STATUSES = [
  "pending",
  "syncing",
  "synced",
  "conflict",
  "failed",
  "blocked",
] as const;

export type OfflineMutationStatus = (typeof OFFLINE_MUTATION_STATUSES)[number];

/**
 * The queued value, as a STRING or null.
 *
 * Deliberately not a union of typed shapes. Every supported field is either a
 * short scalar (`p2`) or a canonical date-only `YYYY-MM-DD`, both of which cross
 * the wire as form fields anyway, and `null` means "cleared" for all of them. One
 * representation means one comparison rule in `offline-conflict.ts` and one
 * serialisation everywhere.
 *
 * A relative date is NEVER stored here. The inline date controls resolve
 * "Tomorrow" against the OWNER's calendar day (server-resolved, ADR-022) before
 * the value reaches this queue, so a mutation queued on the 12th and replayed on
 * the 14th still means the 13th — see `plan-targets.ts`.
 */
export type OfflineMutationValue = string | null;

/**
 * What the server said when it refused to apply a mutation because the field had
 * moved underneath it. Enough for a field-level choice, and no more: PWA-12 does
 * not build a three-way merge for a Task title.
 */
export interface OfflineMutationConflict {
  /** The field that actually contended. */
  readonly field: OfflineMutationField;
  /** The value the server holds NOW, as a display string, or null when cleared. */
  readonly serverValue: OfflineMutationValue;
  /** Plain-language wording, in the product's voice. Never a status code. */
  readonly message: string;
}

/** Why a mutation is not being retried right now. Bounded and diagnostic-safe. */
export const OFFLINE_ERROR_CATEGORIES = [
  "network",
  "server",
  "auth",
  "conflict",
  "gone",
  "invalid",
  "interrupted",
] as const;

export type OfflineErrorCategory = (typeof OFFLINE_ERROR_CATEGORIES)[number];

/** One queued Task mutation, exactly as it is stored in IndexedDB. */
export interface OfflineMutationRecord {
  /** The collision-safe client identifier; also the server idempotency key. */
  readonly id: string;
  /** The identity + workspace + schema digest this mutation belongs to. */
  readonly namespace: string;
  /**
   * The record kind this mutation addresses.
   *
   * PWA-12 shipped this as the literal `"task"` with a comment saying the shape
   * could widen later; MOBILE-03 is that widening. It is DERIVED from the
   * operation ({@link OFFLINE_MUTATION_ENTITY}) rather than supplied, so a
   * stored record cannot disagree with its own operation, and a record written
   * before MOBILE-03 reads back as `"task"` unchanged — which is what it was.
   */
  readonly entityType: OfflineMutationEntityType;
  readonly entityId: string;
  /**
   * TASKS-13 — the sub-record WITHIN the entity this mutation addresses, when the
   * operation addresses one. Null for every operation that changes the Task
   * itself.
   *
   * It exists because a checklist tick is not a field of the Task: two queued
   * ticks on two different items of the SAME Task are two independent changes,
   * and without this they would look like one field edited twice and coalesce
   * into a single write that lost one of them. It is part of the coalesce key and
   * part of the server's receipt guard for exactly that reason.
   *
   * Optional on the stored shape, so a record queued before TASKS-13 reads back
   * unchanged rather than needing a migration of the owner's un-synced work.
   */
  readonly targetId?: string | null;
  readonly operation: OfflineMutationOperation;
  /** The intended value. Always null for `complete`/`reopen`. */
  readonly value: OfflineMutationValue;
  /**
   * The value this device believed the field held when the owner acted — the
   * BASE of the change, and the whole of the conflict contract.
   */
  readonly baseValue: OfflineMutationValue;
  /**
   * The Task's `updatedAt` when the owner acted, when the surface knew it.
   *
   * Diagnostic only: the DECISION is made on `baseValue`, because `updatedAt`
   * moves for any field and using it would report an unrelated server edit as a
   * conflict — precisely what §18 forbids.
   */
  readonly baseUpdatedAt: string | null;
  readonly payloadVersion: number;
  /** When the owner acted (ISO-8601 UTC, from the device clock). */
  readonly createdAt: string;
  /**
   * The monotonic per-device order this mutation was queued in.
   *
   * Ordering is NOT taken from `createdAt`: two mutations inside the same
   * millisecond are ordinary (tick a task, then set its priority), and a device
   * clock that steps backwards over an offline period would otherwise reorder the
   * owner's intent. A counter cannot do either.
   */
  readonly sequence: number;
  readonly status: OfflineMutationStatus;
  readonly attempts: number;
  readonly lastAttemptAt: string | null;
  /** When the in-flight attempt started, or null when none is. The lease. */
  readonly attemptStartedAt: string | null;
  /** A short, owner-readable explanation of the last failure. Never a stack. */
  readonly lastError: string | null;
  readonly errorCategory: OfflineErrorCategory | null;
  /** Present only in the `conflict` status. */
  readonly conflict: OfflineMutationConflict | null;
  readonly syncedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The most mutations one device may hold at once.
 *
 * Chosen against real DalyHub use rather than as a token limit: 200 is far more
 * Task changes than an owner makes in a day, let alone in one outage, so the
 * bound is reached only by a pathological session (a stuck replay, a script) —
 * which is exactly what a bound is for. When it is reached, DalyHub REFUSES the
 * next change and says so. It never silently drops the oldest: the oldest is the
 * one most likely to be load-bearing for the ones after it.
 */
export const OFFLINE_MAX_QUEUED_MUTATIONS = 200;

/**
 * The largest value one mutation may carry, in UTF-16 code units.
 *
 * The Task domain bounds a title at 512 characters, so this is comfortably above
 * anything the domain will accept and exists only to stop a malformed or hostile
 * caller turning the queue into device storage.
 *
 * MOBILE-03 — a queued meeting item's body is carried by the same field and is
 * bounded by the same number. That is the right bound for what the capture bar
 * is: a one-line decision, action, outcome or agenda point typed on a phone
 * during a meeting. A longer body is a Note, and this queue deliberately does
 * not hold one.
 */
export const OFFLINE_MAX_MUTATION_VALUE_LENGTH = 1_024;

/** Why an enqueue was refused. */
export type OfflineEnqueueRefusal =
  | { readonly kind: "queueFull"; readonly message: string }
  | { readonly kind: "valueTooLarge"; readonly message: string };

/**
 * Check a would-be mutation against the queue's bounds.
 *
 * Returns null when it may be queued. Pure, so the bounds are asserted without a
 * database.
 */
export function checkMutationBounds(input: {
  readonly value: OfflineMutationValue;
  readonly queuedCount: number;
}): OfflineEnqueueRefusal | null {
  if ((input.value?.length ?? 0) > OFFLINE_MAX_MUTATION_VALUE_LENGTH) {
    return {
      kind: "valueTooLarge",
      message: "That value is too long to save while offline.",
    };
  }
  if (input.queuedCount >= OFFLINE_MAX_QUEUED_MUTATIONS) {
    return {
      kind: "queueFull",
      message:
        `This device is already holding ${OFFLINE_MAX_QUEUED_MUTATIONS} unsynchronised changes, ` +
        "which is as many as it will keep. Reconnect to DalyHub to send them before making more.",
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Construction                                                               */
/* -------------------------------------------------------------------------- */

/** Build a fresh mutation record. Pure: the clock, id and sequence are injected. */
export function createMutationRecord(input: {
  readonly namespace: string;
  readonly entityId: string;
  readonly targetId?: string | null;
  readonly operation: OfflineMutationOperation;
  readonly value?: OfflineMutationValue;
  readonly baseValue?: OfflineMutationValue;
  readonly baseUpdatedAt?: string | null;
  readonly now: Date;
  readonly sequence: number;
  readonly id?: string;
}): OfflineMutationRecord {
  const at = input.now.toISOString();
  return {
    id: input.id ?? newCaptureId(),
    namespace: input.namespace,
    entityType: entityTypeFor(input.operation),
    entityId: input.entityId,
    targetId: input.targetId ?? null,
    operation: input.operation,
    // A lifecycle operation carries no value: the operation IS the value, and
    // storing one would invite a caller to invent a second way to say "done".
    // A replace carries the intended value; an APPEND carries the new item's
    // body, which is a value in exactly the same sense — the thing to write.
    value:
      isReplaceOperation(input.operation) || isAppendOperation(input.operation)
        ? (input.value ?? null)
        : null,
    // MOBILE-03 — an append has no base, because it replaces nothing. Forcing
    // one to null here means a caller cannot accidentally give an append a base
    // that the server would then be tempted to compare.
    baseValue: isAppendOperation(input.operation)
      ? null
      : (input.baseValue ?? null),
    baseUpdatedAt: input.baseUpdatedAt ?? null,
    payloadVersion: OFFLINE_MUTATION_PAYLOAD_VERSION,
    createdAt: at,
    sequence: input.sequence,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    attemptStartedAt: null,
    lastError: null,
    errorCategory: null,
    conflict: null,
    syncedAt: null,
  };
}

/** The next sequence number for a namespace. Pure; `[]` starts at 1. */
export function nextSequence(
  records: readonly OfflineMutationRecord[],
): number {
  let highest = 0;
  for (const record of records) {
    if (record.sequence > highest) highest = record.sequence;
  }
  return highest + 1;
}

/* -------------------------------------------------------------------------- */
/* Coalescing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Should a new mutation REPLACE an existing queued one rather than join it?
 *
 * Three edits to one title while offline — `Call mechanic` → `Call Toyota` →
 * `Call Toyota Dubbo` — are three requests to send and three chances to fail, and
 * the first two describe a state the owner has already abandoned. Replaying only
 * the last is not a compression of intent; it IS the intent.
 *
 * The rule is deliberately conservative, and every clause of it is load-bearing:
 *
 *   1. **Same entity, same operation.** Two different fields are two changes.
 *   2. **Replace-style only.** `complete` and `reopen` never coalesce with
 *      anything. Their order is their meaning (complete → reopen is not a no-op:
 *      a recurring completion creates a successor, and a reopen withdraws it),
 *      and a later replace-style edit must not be allowed to jump over one.
 *   3. **The existing record is `pending` AND has never been attempted.** This is
 *      the clause that keeps idempotency honest. A record with `attempts > 0` may
 *      already be sitting in the server's receipt table under its key; rewriting
 *      its payload would make one idempotency key mean two different mutations,
 *      which is the one thing the receipt protocol cannot survive.
 *   4. **Nothing else for this entity was queued in between.** If a `complete`
 *      was queued after the earlier title edit, coalescing into that earlier
 *      record would move the title edit BEFORE the completion, silently
 *      reordering the owner's intent — the exact failure §7 names.
 *
 * The surviving record keeps the earlier record's `id`, `sequence` and
 * `baseValue`: its POSITION and its BASE are facts about when the owner started
 * changing this field, and only the intended value has moved on.
 */
export function findCoalesceTarget(
  queued: readonly OfflineMutationRecord[],
  next: {
    readonly entityId: string;
    readonly operation: OfflineMutationOperation;
    /** TASKS-13 — part of the key: two items of one Task are two changes. */
    readonly targetId?: string | null;
  },
): OfflineMutationRecord | null {
  if (!isReplaceOperation(next.operation)) return null;
  const forEntity = orderMutations(
    queued.filter((record) => record.entityId === next.entityId),
  );
  // Walk BACKWARDS from the newest. The first record for this entity that is not
  // a coalescable match ends the search, which is clause 4 expressed as a loop
  // rather than as a second scan that could disagree with it.
  for (let index = forEntity.length - 1; index >= 0; index -= 1) {
    const record = forEntity[index];
    if (record.status === "synced") continue;
    if (
      record.operation === next.operation &&
      (record.targetId ?? null) === (next.targetId ?? null) &&
      record.status === "pending" &&
      record.attempts === 0
    ) {
      return record;
    }
    return null;
  }
  return null;
}

/** Fold a newer intent into an existing queued record. Pure. */
export function coalesceInto(
  existing: OfflineMutationRecord,
  input: { readonly value: OfflineMutationValue; readonly now: Date },
): OfflineMutationRecord {
  return {
    ...existing,
    value: input.value,
    // `createdAt` moves to the latest expression of the intent, so the sync
    // surface says when the owner last touched it. `sequence` deliberately does
    // NOT: position is causal order, and this change did not become newer than
    // anything that was queued after the record it folds into.
    createdAt: input.now.toISOString(),
    lastError: null,
    errorCategory: null,
    conflict: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

/** Sort mutations into causal order: by `sequence`, oldest first. */
export function orderMutations(
  records: readonly OfflineMutationRecord[],
): readonly OfflineMutationRecord[] {
  return [...records].sort((a, b) => a.sequence - b.sequence);
}

/**
 * Select the mutations one replay pass may send, in order.
 *
 * The rule is **per-entity serial, cross-entity parallel**:
 *
 *   - Within one Task, mutations replay strictly in queue order, and the FIRST
 *     one that is not ready stops that Task. That is what makes "rename, then
 *     set P2, then complete" arrive as the owner meant it, and what stops a retry
 *     of the rename racing the completion that followed it.
 *   - Between Tasks nothing is shared. One Task waiting on a conflict, an expired
 *     backoff or the owner's attention must not hold up an unrelated Task's
 *     changes — a single global serial queue would make one stuck record freeze
 *     the whole device, which §7 explicitly rules out.
 *
 * A record that is not `pending` (a conflict awaiting a decision, a permanent
 * failure, an in-flight attempt) BLOCKS its own entity and only its own entity.
 * The alternative — skipping it and sending the next one — would apply the
 * owner's later intent on top of a base the earlier intent never established.
 */
export function selectReplayBatch(
  records: readonly OfflineMutationRecord[],
  namespace: string,
  now: Date,
  batchSize: number,
): readonly OfflineMutationRecord[] {
  const byEntity = new Map<string, OfflineMutationRecord[]>();
  for (const record of orderMutations(records)) {
    if (record.namespace !== namespace) continue;
    if (record.status === "synced") continue;
    const bucket = byEntity.get(record.entityId);
    if (bucket) bucket.push(record);
    else byEntity.set(record.entityId, [record]);
  }

  const due: OfflineMutationRecord[] = [];
  for (const bucket of byEntity.values()) {
    for (const record of bucket) {
      if (!isMutationReplayable(record, now)) break;
      due.push(record);
    }
  }
  // Across entities, the oldest intent goes first. Within an entity the order is
  // already causal, and a stable sort by `sequence` preserves it.
  return orderMutations(due).slice(0, batchSize);
}

/**
 * True when a record is eligible for an automatic replay attempt now.
 *
 * `syncing` is deliberately NOT eligible even once its lease has expired: a
 * stalled attempt is reclaimed first, so the interruption is recorded as an
 * attempt and shown to the owner rather than being replayed as though it had
 * never been tried.
 *
 * `blocked` IS eligible, and that is the whole of "resume safely after
 * authentication is restored" (§24). A blocked record is waiting on a valid
 * sign-in, not on the owner pressing anything, and DalyHub cannot know the
 * session recovered except by trying: a rule that admitted only `pending` would
 * strand the owner's work behind a Retry button they were never told to press.
 *
 * Trying is cheap and cannot become hammering. A blocked attempt spends no retry
 * budget, the replay pass STOPS at the first one (so an expired session costs
 * one identity-provider redirect per pass, not one per record), passes are
 * event-driven rather than timed, and the unhealthy heartbeat pauses entirely
 * for `authRequired`.
 */
export function isMutationReplayable(
  record: OfflineMutationRecord,
  now: Date,
): boolean {
  if (record.status !== "pending" && record.status !== "blocked") return false;
  if (record.lastAttemptAt === null) return true;
  return (
    now.getTime() - Date.parse(record.lastAttemptAt) >=
    mutationRetryDelayMs(record.attempts)
  );
}

/**
 * Exponential backoff before the next automatic attempt, in milliseconds. Capped
 * so a long-offline device does not wait minutes after it reconnects.
 */
export function mutationRetryDelayMs(attempts: number): number {
  return Math.min(30_000, 1_000 * 2 ** Math.max(0, attempts - 1));
}

/* -------------------------------------------------------------------------- */
/* Attempt lifecycle                                                          */
/* -------------------------------------------------------------------------- */

/** How long an in-flight replay is trusted before it counts as abandoned. */
export const OFFLINE_MUTATION_LEASE_MS = 120_000;

/** Mark a record as having an attempt in flight, stamping its lease. */
export function beginMutationAttempt(
  record: OfflineMutationRecord,
  now: Date,
): OfflineMutationRecord {
  return {
    ...record,
    status: "syncing",
    attemptStartedAt: now.toISOString(),
  };
}

/** True when a record claims an attempt is in flight but nothing is running it. */
export function isStalledMutation(
  record: OfflineMutationRecord,
  now: Date,
): boolean {
  if (record.status !== "syncing") return false;
  if (record.attemptStartedAt === null) return true;
  const startedAt = Date.parse(record.attemptStartedAt);
  if (!Number.isFinite(startedAt)) return true;
  return now.getTime() - startedAt >= OFFLINE_MUTATION_LEASE_MS;
}

/** The maximum automatic attempts before a record waits for the owner. */
export const OFFLINE_MAX_MUTATION_ATTEMPTS = 5;

/** The outcome of one replay attempt, as the replay engine classifies it. */
export type OfflineMutationOutcome =
  /** The server applied it, or confirmed an earlier attempt already had. */
  | { readonly kind: "applied" }
  /** The field moved on the server while this device was offline. */
  | { readonly kind: "conflict"; readonly conflict: OfflineMutationConflict }
  /** Authentication is required, or the identity/workspace no longer matches. */
  | { readonly kind: "blocked"; readonly reason: string }
  /** Permanently refused: the Task is gone, or the domain said no. */
  | {
      readonly kind: "rejected";
      readonly reason: string;
      readonly category: Extract<OfflineErrorCategory, "gone" | "invalid">;
    }
  /** The attempt could not complete (offline, timeout, 5xx). Retry later. */
  | {
      readonly kind: "retryable";
      readonly reason: string;
      readonly category: Extract<
        OfflineErrorCategory,
        "network" | "server" | "interrupted"
      >;
    };

/** Apply a replay outcome to a mutation record. Pure and total. */
export function applyMutationOutcome(
  record: OfflineMutationRecord,
  outcome: OfflineMutationOutcome,
  now: Date,
): OfflineMutationRecord {
  const attempts = record.attempts + 1;
  const lastAttemptAt = now.toISOString();
  // Every outcome ENDS the attempt, so every branch releases the lease. Clearing
  // it once here rather than in five places is what stops a future branch
  // forgetting and stranding a record in `syncing` forever.
  const base = { ...record, attemptStartedAt: null };
  switch (outcome.kind) {
    case "applied":
      return {
        ...base,
        status: "synced",
        attempts,
        lastAttemptAt,
        lastError: null,
        errorCategory: null,
        conflict: null,
        syncedAt: lastAttemptAt,
      };
    case "conflict":
      return {
        ...base,
        status: "conflict",
        attempts,
        lastAttemptAt,
        lastError: outcome.conflict.message,
        errorCategory: "conflict",
        conflict: outcome.conflict,
      };
    case "blocked":
      return {
        ...base,
        // A blocked attempt does NOT consume a retry budget: the owner has not
        // done anything wrong, and burning attempts on an expired sign-in would
        // eventually present valid work as failed.
        status: "blocked",
        lastAttemptAt,
        lastError: outcome.reason,
        errorCategory: "auth",
      };
    case "rejected":
      return {
        ...base,
        status: "failed",
        attempts,
        lastAttemptAt,
        lastError: outcome.reason,
        errorCategory: outcome.category,
      };
    case "retryable":
      return {
        ...base,
        status:
          attempts >= OFFLINE_MAX_MUTATION_ATTEMPTS ? "failed" : "pending",
        attempts,
        lastAttemptAt,
        lastError: outcome.reason,
        errorCategory: outcome.category,
      };
  }
}

/**
 * Recover a record whose attempt was interrupted, so it is queued again.
 *
 * Interruption is treated as a RETRYABLE outcome rather than as a fresh start:
 * the attempt really did happen and really might have reached the server, so it
 * consumes a retry and observes the backoff like any other. Replay is safe to
 * repeat — the receipt keyed on `id` makes a second delivery a no-op — so the
 * cost of reclaiming an attempt that was in fact still in flight is one wasted
 * request, never a duplicated effect.
 */
export function reclaimStalledMutation(
  record: OfflineMutationRecord,
  now: Date,
): OfflineMutationRecord {
  // The backoff is measured from when the attempt STARTED, not from now: the
  // attempt is already at least a lease old, far longer than the backoff
  // ceiling, so dating it now would serve the owner a fresh delay on top of
  // however long the change was already stranded.
  const startedAt = Date.parse(
    record.attemptStartedAt ?? record.lastAttemptAt ?? "",
  );
  const attemptEndedAt = Number.isFinite(startedAt) ? new Date(startedAt) : now;
  return applyMutationOutcome(
    record,
    {
      kind: "retryable",
      category: "interrupted",
      reason: "This device was interrupted while sending this change.",
    },
    attemptEndedAt,
  );
}

/**
 * Re-queue a record the owner has chosen to send again — a manual retry, or
 * "keep my change" on a conflict.
 *
 * The attempt budget is reset because the owner has LOOKED at the failure and
 * decided, which is a different fact from the machine having tried five times.
 * The record's `id` is unchanged, so the retry is still the same mutation to the
 * server's receipt table and still cannot apply twice.
 */
export function requeueMutation(
  record: OfflineMutationRecord,
): OfflineMutationRecord {
  return {
    ...record,
    status: "pending",
    attempts: 0,
    lastAttemptAt: null,
    attemptStartedAt: null,
    lastError: null,
    errorCategory: null,
    conflict: null,
  };
}

/**
 * Rebase a conflicted record onto the server's current value and re-queue it.
 *
 * This is "keep my change" done honestly. The owner's INTENT is unchanged; what
 * changes is the base it is measured against, because they have now seen the
 * server's value and accepted overwriting it. Without the rebase the next replay
 * would detect the same conflict again and loop.
 */
export function overrideMutation(
  record: OfflineMutationRecord,
): OfflineMutationRecord {
  return {
    ...requeueMutation(record),
    baseValue: record.conflict?.serverValue ?? record.baseValue,
  };
}

/* -------------------------------------------------------------------------- */
/* Summaries                                                                  */
/* -------------------------------------------------------------------------- */

/** A compact tally of the mutation queue, for the status surfaces. */
export interface OfflineMutationSummary {
  readonly pending: number;
  readonly syncing: number;
  readonly synced: number;
  readonly conflict: number;
  readonly failed: number;
  readonly blocked: number;
  readonly total: number;
  /** Everything still owed to the server: pending + syncing + blocked. */
  readonly outstanding: number;
  /** Everything waiting on the OWNER: conflicts + permanent failures. */
  readonly needsAttention: number;
}

/** Tally a mutation queue. Pure. */
export function summariseMutations(
  records: readonly OfflineMutationRecord[],
): OfflineMutationSummary {
  const counts = {
    pending: 0,
    syncing: 0,
    synced: 0,
    conflict: 0,
    failed: 0,
    blocked: 0,
  };
  for (const record of records) counts[record.status] += 1;
  return {
    ...counts,
    total: records.length,
    outstanding: counts.pending + counts.syncing + counts.blocked,
    needsAttention: counts.conflict + counts.failed,
  };
}

/** A colour-independent label for each mutation status (`AGENTS.md §15`). */
export function mutationStatusLabel(status: OfflineMutationStatus): string {
  switch (status) {
    case "pending":
      return "Waiting to sync";
    case "syncing":
      return "Synchronising";
    case "synced":
      return "Synced";
    case "conflict":
      return "Needs your decision";
    case "failed":
      return "Needs attention";
    case "blocked":
      return "Waiting for sign-in";
  }
}

/** How the owner's own words describe each operation, for the sync surfaces. */
export function mutationOperationLabel(
  operation: OfflineMutationOperation,
): string {
  switch (operation) {
    case "complete":
      return "Completed";
    case "reopen":
      return "Reopened";
    case "set_title":
      return "Renamed";
    case "set_priority":
      return "Priority changed";
    case "set_due":
      return "Due date changed";
    case "set_planned":
      return "Planned date changed";
    case "set_checklist_completed":
      return "Checklist item changed";
    // MOBILE-03 — the meeting appends. Worded as the thing that was CAPTURED,
    // not as a field that changed, because that is what the owner did.
    case "add_agenda_item":
      return "Agenda item added";
    case "add_decision":
      return "Decision captured";
    case "add_outcome":
      return "Outcome captured";
    case "add_action":
      return "Action captured";
  }
}

/**
 * The bounded diagnostic shape for one mutation.
 *
 * Deliberately carries NO owner content: no title, no note text, no date value.
 * A sync problem is debugged from what KIND of change was attempted, how often
 * and with what category of failure — never from what the change said
 * (`AGENTS.md §17`).
 */
export interface OfflineMutationDiagnostic {
  readonly id: string;
  readonly operation: OfflineMutationOperation;
  readonly status: OfflineMutationStatus;
  readonly attempts: number;
  readonly errorCategory: OfflineErrorCategory | null;
  readonly queuedAt: string;
}

/** Reduce a record to its diagnostic shape. Pure, and content-free by design. */
export function mutationDiagnostic(
  record: OfflineMutationRecord,
): OfflineMutationDiagnostic {
  return {
    id: record.id,
    operation: record.operation,
    status: record.status,
    attempts: record.attempts,
    errorCategory: record.errorCategory,
    queuedAt: record.createdAt,
  };
}
