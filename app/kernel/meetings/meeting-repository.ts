import type {
  CreateMeetingInput,
  LinkFollowUpTaskInput,
  MarkMeetingHeldResult,
  Meeting,
  MeetingFollowUpLink,
  MeetingItem,
  MeetingItemKind,
  MeetingPage,
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

export interface MeetingRepository {
  create(input: CreateMeetingInput): Promise<Meeting>;
  get(id: string): Promise<Meeting | null>;
  list(input?: {
    view?: MeetingView;
    query?: string;
    limit?: number;
    cursor?: string;
  }): Promise<MeetingPage>;
  update(
    id: string,
    input: UpdateMeetingInput,
  ): Promise<{ meeting: Meeting; changed: boolean }>;
  addItem(
    id: string,
    kind: MeetingItemKind,
    bodyMarkdown: string,
  ): Promise<MeetingItem>;
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

  /**
   * Durably record a Meeting → Task conversion AND append its structural Activity
   * (`meeting.item_converted_to_task` for an item, `meeting.follow_up_created` for a
   * direct follow-up) in ONE atomic `D1Database.batch()` — the conversion's commit
   * point. Both the Meeting and the Task are Activity subjects, so the event shows
   * on both timelines; the payload carries only the item kind, never item content.
   * Rejects a second active mapping for the same source item with
   * `MeetingFollowUpConflictError`. It never creates or mutates the Task itself.
   */
  linkFollowUpTask(input: LinkFollowUpTaskInput): Promise<MeetingFollowUpLink>;

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
