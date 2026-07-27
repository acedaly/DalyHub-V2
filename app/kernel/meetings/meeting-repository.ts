import type {
  CreateMeetingInput,
  LinkFollowUpTaskInput,
  Meeting,
  MeetingFollowUpLink,
  MeetingItem,
  MeetingItemKind,
  MeetingPage,
  MeetingView,
  UpdateMeetingInput,
} from "./meeting";

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
