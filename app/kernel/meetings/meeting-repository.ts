import type {
  CreateMeetingInput,
  MarkMeetingHeldResult,
  Meeting,
  MeetingFollowUpLink,
  MeetingItem,
  MeetingItemKind,
  MeetingPage,
  MeetingSearchHit,
  MeetingSort,
  MeetingView,
  UpdateMeetingInput,
} from "./meeting";

/**
 * The meeting named by a request is not available in the bound workspace.
 *
 * Fails CLOSED and discloses nothing: missing, soft-deleted, a different entity
 * type, and a meeting belonging to another workspace are all indistinguishable
 * (AGENTS.md §17, mirroring `PersonNotFoundError`).
 *
 * Defined here — beside the contract that throws it — rather than in a module, so
 * the kernel repository and the MEET-02 module orchestration share ONE error
 * family instead of two identically-named ones drifting apart.
 */
export class MeetingNotFoundError extends Error {
  constructor() {
    super("Meeting not found.");
    this.name = "MeetingNotFoundError";
  }
}

/**
 * The meeting exists but is archived, so it is read-only: no follow-up conversion
 * and no new domain state (including MEET-03's held state). Archiving is
 * reversible, so the message names the recovery.
 */
export class MeetingArchivedError extends Error {
  constructor(
    message = "This meeting is archived — restore it to make changes.",
  ) {
    super(message);
    this.name = "MeetingArchivedError";
  }
}

/**
 * MEET-02 — thrown when a durable source-item → Task mapping would violate the
 * "at most one converted Task per source item" rule (a concurrent conversion won
 * the race). The orchestration treats this as a safe, idempotent duplicate and
 * returns the winning Task rather than creating a second one.
 */
export class MeetingFollowUpConflictError extends Error {
  constructor(readonly itemId: string) {
    super("This meeting item already has a follow-up task.");
    this.name = "MeetingFollowUpConflictError";
  }
}

/**
 * AUDIT-FIX-02 — an unexpected storage failure behind a Meeting operation.
 *
 * The adapter catches the raw D1/SQLite failure and re-raises it as this typed,
 * generic error so no constraint text, table name or SQL fragment can reach a
 * response or a log line the owner sees (AGENTS.md §17). The original failure is
 * preserved as `cause`, so the fault stays fully observable to the runtime and is
 * never silently swallowed. Mirrors `TaskStorageError` / `AssetStorageError`.
 */
export class MeetingStorageError extends Error {
  constructor(
    message = "A meeting storage error occurred.",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MeetingStorageError";
  }
}

/**
 * AUDIT-FIX-02 — a bounded, recoverable contention failure on a structured
 * meeting-item mutation. It always means the same thing: **the mutation did not
 * take effect, and retrying is the recovery.**
 *
 * Two situations reach it.
 *
 * **Position contention on an append.** `addItem` allocates its `position` INSIDE
 * the insert (`MAX(position) + 1` scoped to workspace + meeting + kind), so the
 * ordinary remove-then-add sequence can no longer collide. The
 * `UNIQUE (workspace_id, meeting_id, kind, position)` constraint remains the final
 * integrity boundary; if two same-kind appends still manage to allocate the same
 * slot, the losing batch rolls back ENTIRELY (no item row, no Activity) and is
 * retried a bounded number of times. Only when that budget is exhausted does this
 * surface — never a raw uniqueness exception.
 *
 * **A lifecycle guard that refused and was then reverted.** Both item mutations
 * re-assert in SQL that the meeting is live and unarchived at write time. When
 * that guard blocks the write but the meeting is no longer in the refusing state
 * by the time the refusal is diagnosed — archived, then restored — there is no
 * true `MeetingArchivedError` to raise and no change to report. Rather than invent
 * a reason or, worse, report a removal that did not happen as done, the caller is
 * told plainly that it did not take effect.
 */
export class MeetingItemConflictError extends Error {
  constructor(
    readonly kind: MeetingItemKind,
    message = "That item couldn’t be added. Refresh the meeting and try again.",
  ) {
    super(message);
    this.name = "MeetingItemConflictError";
  }
}

export interface MeetingRepository {
  create(input: CreateMeetingInput): Promise<Meeting>;
  get(id: string): Promise<Meeting | null>;
  list(input?: {
    view?: MeetingView;
    query?: string;
    sort?: MeetingSort;
    limit?: number;
    cursor?: string;
  }): Promise<MeetingPage>;
  /**
   * V2.0.1 — the bounded global-search projection, mirroring the dedicated
   * `search*` projections Tasks, Projects, Notes, Goals and Areas already have.
   *
   * Unlike `list`, it applies NO time window: a meeting is findable by its title
   * or location whether it starts next week or happened last month — the
   * recent-only `list` view had made every upcoming meeting unfindable. Archived
   * and soft-deleted meetings stay excluded (the same lifecycle rule as the
   * non-archived collection views), the match fields stay title + location only
   * (never agenda/notes content), and it is ONE query — no overlapping windows,
   * so no duplicate hits by construction. Ordering is deterministic and
   * proximity-useful: upcoming meetings soonest-first, then past meetings
   * newest-first, with `id` as the tiebreaker.
   */
  searchMeetings(input: {
    readonly text: string;
    readonly limit?: number;
  }): Promise<readonly MeetingSearchHit[]>;
  /**
   * DIARY-02 — the non-archived meetings that START inside an explicit instant
   * window, soonest first, bounded.
   *
   * A day-context surface asks "what happened on this day?", which the collection
   * views cannot answer: `upcoming`/`recent` are windows anchored to NOW, so
   * reaching an arbitrary past day through them means paging an unbounded number
   * of pages. This is ONE bounded statement over the existing
   * `meeting_details_collection` index (`workspace_id, archived_at, starts_at,
   * entity_id`), so no migration and no new index is involved.
   *
   * The window is supplied as UTC instants and the caller owns the conversion from
   * an owner-calendar day, exactly as the Diary timeline already does — the
   * repository never guesses a display zone. It is READ-ONLY and workspace-scoped
   * like every other read here; soft-deleted and archived meetings are excluded.
   */
  listStartingBetween(input: {
    /** Inclusive lower bound (UTC instant). */
    readonly from: Date;
    /** Exclusive upper bound (UTC instant). */
    readonly to: Date;
    /** Page size, clamped to a safe maximum. */
    readonly limit?: number;
  }): Promise<readonly MeetingSearchHit[]>;
  update(
    id: string,
    input: UpdateMeetingInput,
  ): Promise<{ meeting: Meeting; changed: boolean }>;
  /**
   * Append one structured item of `kind` to this meeting, and its `meeting.updated`
   * Activity, in ONE atomic batch.
   *
   * **Ordering contract (AUDIT-FIX-02).** `position` is an APPEND-ONLY ordinal,
   * allocated server-side as `MAX(position) + 1` scoped to workspace + meeting +
   * kind, computed inside the insert itself. It is never derived from a row count,
   * never supplied by a caller, and never recomputed from a value read earlier in
   * the request. The allocation is always **strictly greater than every LIVE
   * ordinal of that kind**, which is precisely the condition the UNIQUE index
   * needs — so an existing item is never displaced and a new one always sorts
   * last.
   *
   * Two consequences follow, and both are intended:
   *   - removing an INTERIOR item leaves its ordinal permanently vacant — the
   *     survivors keep the positions they were given and the next append goes past
   *     the tail, so positions are **not contiguous**;
   *   - removing the TAIL lowers the maximum, so the next append reuses that
   *     freed ordinal. That is safe by construction: no live row holds it.
   *
   * Nothing depends on contiguity — items are read `ORDER BY kind, position, id`,
   * and a follow-up mapping is keyed on the stable `meeting_items.id`, never on
   * position (MEETINGS_MODULE.md).
   *
   * Throws {@link MeetingNotFoundError} (missing, soft-deleted, wrong type or
   * another workspace — all indistinguishable), {@link MeetingArchivedError} for a
   * read-only archived meeting, {@link MeetingValidationError} for an unknown kind
   * or empty body, {@link MeetingItemConflictError} when bounded contention
   * retries are exhausted, and {@link MeetingStorageError} for anything else.
   */
  addItem(
    id: string,
    kind: MeetingItemKind,
    bodyMarkdown: string,
  ): Promise<MeetingItem>;
  /**
   * Remove ONE structured item from this meeting, and append its `meeting.updated`
   * Activity in the SAME atomic batch — guarded on the delete's `changes()`, so a
   * repeat removal of an already-removed item is a truthful no-op that returns
   * `false` and writes NO event.
   *
   * `false` means "there was nothing to remove", and ONLY that — it is decided by
   * reading the ITEM row back, not by inspecting the meeting afterwards. A removal
   * refused by the write-time lifecycle guard is reported as
   * {@link MeetingArchivedError} / {@link MeetingNotFoundError}, or, when the
   * refusing condition has since been reverted, {@link MeetingItemConflictError} —
   * never as a `false` a caller could read as a completed removal.
   *
   * Deliberately does NOT renumber the surviving items: their positions are stable
   * identifiers of display order, and `addItem` appends after the gap rather than
   * into it. Only the named item, in the bound workspace, on the named meeting, is
   * deleted; no other item and no other kind is touched. Throws the same
   * not-found / archived / storage errors as {@link MeetingRepository.addItem}.
   */
  removeItem(id: string, itemId: string): Promise<boolean>;
  archive(id: string): Promise<boolean>;
  restore(id: string): Promise<boolean>;

  // --- MEET-03: the held state and its attendee interaction event ----------------

  /**
   * Record that this meeting TOOK PLACE, and append the one `meeting.held` event
   * naming the Meeting AND every active attendee Person as Activity subjects.
   *
   * Deliberately takes NO attendee argument. The attendee set is derived inside
   * the repository from the active `meeting.attendee` EntityLinks whose target is
   * a live `person` entity in the bound workspace — so it is server-authoritative
   * by construction, and a crafted client submission has nowhere to inject a
   * subject. There is no parameter to tamper with.
   *
   * Guarantees:
   *   - **Atomic** — the durable `held_at` write and the Activity append (event +
   *     every subject row) run in ONE `D1Database.batch()`. An Activity failure
   *     rolls the domain mutation back; a domain no-op appends nothing.
   *   - **Idempotent / retry-safe** — the domain statement is conditional
   *     (`WHERE held_at IS NULL`), so a repeat call writes nothing and returns
   *     `already_held` with the ORIGINAL facts. There is never a second event.
   *   - **Concurrency-safe** — two simultaneous calls both run the conditional
   *     UPDATE; exactly one changes a row, and the `changes() > 0` guard on the
   *     event insert means the loser appends nothing. No lock, no read-then-write.
   *   - **Snapshot semantics** — the recorded subjects are the attendees as at the
   *     moment the meeting was marked held. Adding or removing an attendee
   *     afterwards never rewrites the event; history is not retroactively edited.
   *
   * Throws {@link MeetingNotFoundError} when the meeting is missing, soft-deleted,
   * the wrong entity type or in another workspace (indistinguishable), and
   * {@link MeetingArchivedError} when it is archived (archived meetings are
   * read-only). Neither error echoes caller content.
   */
  markHeld(id: string): Promise<MarkMeetingHeldResult>;

  // --- MEET-02: follow-up Task mapping ------------------------------------------

  /*
   * AUDIT-13 — `linkFollowUpTask` USED to be here.
   *
   * It durably recorded a Meeting → Task conversion and appended its structural
   * Activity in one batch, which was atomic in itself and useless as a guarantee:
   * the Task it referred to had been created by a DIFFERENT transaction moments
   * earlier, so a failure here left an orphan Task and a retry made a second one.
   * Recording a conversion is not separable from making the thing that was
   * converted, so it is no longer separately callable — it is one statement group
   * inside `MeetingTaskConversionRepository.convert`, which is now the only way to
   * create a follow-up Task.
   */

  /**
   * A Meeting's follow-up mappings, NEWEST first and bounded (default/max applied by
   * the implementation), so a bounded caller always keeps the most recent follow-ups
   * — a freshly-created or just-converted Task can never fall outside the window.
   */
  listFollowUps(
    meetingId: string,
    options?: { readonly limit?: number },
  ): Promise<readonly MeetingFollowUpLink[]>;

  /** The active mapping for a specific source item, or `null` if unconverted. */
  getFollowUpForItem(itemId: string): Promise<MeetingFollowUpLink | null>;

  /**
   * Remove a follow-up mapping by Task id (association removal, or stale-mapping
   * cleanup when a converted Task was deleted). The canonical Task is NEVER touched.
   * Returns whether a row was removed.
   */
  removeFollowUpTask(taskId: string): Promise<boolean>;
}
