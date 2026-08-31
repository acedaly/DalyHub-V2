/**
 * TODAY-03 — the Waiting collection view-model (pure, React-free, testable).
 *
 * The seam between the workspace-scoped `WaitingTaskListItem` a loader reads and
 * the display-ready shape the Waiting cards render. It owns JSON serialisation
 * (Dates → ISO strings) and the small display derivations — the waiting subject
 * label, the "since" date and elapsed duration, and the due/overdue label — so the
 * card is a pure function of typed data and the derivations can be unit-tested
 * directly. Elapsed duration is computed against an INJECTED `nowMs` so the output
 * is deterministic (an accepted test clock in tests, the server clock in loaders).
 */

import type {
  CommitmentState,
  TaskPriority,
  TaskRelation,
  TaskStatus,
  WaitingTaskListItem,
} from "~/kernel/tasks";

import {
  formatWaitingElapsed,
  formatWaitingSince,
  relativeCalendarDate,
  taskDateLabel,
  waitingSubjectLabel,
  type SerializedTaskWaiting,
} from "~/shared/task-record/task-view";

/** A waiting task, resolved to the strings the Waiting card renders. */
export interface WaitingCardData {
  readonly id: string;
  readonly title: string;
  readonly priority: TaskPriority | null;
  /** The structural parent (Project/Area) context line, or null. */
  readonly parent: TaskRelation | null;
  /** "Waiting for" subject label (entity title, free text, or calm fallback). */
  readonly subjectLabel: string;
  /** The entity type of an entity subject (for the glyph), or null. */
  readonly subjectType: string | null;
  /** The "since" calendar date, e.g. "18 Jul 2026", or null when unparseable. */
  readonly sinceLabel: string | null;
  /** The elapsed duration, e.g. "3 days", "today". */
  readonly elapsedLabel: string;
  /** The due/scheduled date label with an optional overdue `danger` tone. */
  readonly dateLabel: {
    readonly label: string;
    readonly tone?: "danger";
  } | null;
  /**
   * V2.7 RECALL-03 — the delegation group's chase date, in the owner's words
   * ("Today", "Yesterday", "Friday", "12 Sep 2026"), or null when none is set.
   *
   * The card states it so a follow-up-filtered page says WHY each row is in it,
   * and so the unfiltered page surfaces a commitment the owner recorded and had
   * no way of seeing. `overdue` is the relative-date vocabulary's own judgement
   * against the owner's calendar day — the same one the due label uses — so the
   * two dates on a row cannot disagree about what "today" means.
   */
  readonly followUpLabel: {
    readonly label: string;
    readonly overdue: boolean;
  } | null;
}

/**
 * Build the display data for one waiting task. `nowMs` is the reference instant for
 * the elapsed duration; `todayIso` (`YYYY-MM-DD`) is the owner's calendar date for
 * the overdue comparison — both supplied by the caller so the derivation is pure.
 */
export function toWaitingCardData(
  item: {
    readonly id: string;
    readonly title: string;
    readonly status: TaskStatus;
    readonly commitmentState: CommitmentState;
    readonly priority: TaskPriority | null;
    readonly dueDate: string | null;
    readonly scheduledDate: string | null;
    readonly parent: TaskRelation | null;
    readonly waiting: SerializedTaskWaiting;
    readonly followUpOn: string | null;
  },
  nowMs: number,
  todayIso: string,
): WaitingCardData {
  const subject = item.waiting.subject;
  const followUp = relativeCalendarDate(item.followUpOn, todayIso);
  return {
    id: item.id,
    title: item.title,
    priority: item.priority,
    parent: item.parent,
    subjectLabel: waitingSubjectLabel(subject),
    subjectType: subject.kind === "entity" ? subject.type : null,
    sinceLabel: formatWaitingSince(item.waiting.since),
    elapsedLabel: formatWaitingElapsed(item.waiting.since, nowMs),
    /*
     * A waiting task is never complete, so `completedAt` is always null here.
     *
     * V2.4-GATE-02 — the other two commitment facts are NOT assumed. The waiting
     * query already excludes Someday/Maybe, but a `cancelled` Task can still
     * carry a waiting state, and its passed deadline must not read "Overdue"
     * here when it does not on `/tasks`. One rule, every surface.
     */
    dateLabel: taskDateLabel(
      {
        completedAt: null,
        status: item.status,
        commitmentState: item.commitmentState,
        dueDate: item.dueDate,
        scheduledDate: item.scheduledDate,
      },
      todayIso,
    ),
    followUpLabel:
      followUp === null
        ? null
        : { label: followUp.label, overdue: followUp.urgency === "overdue" },
  };
}

/** The JSON-serialised waiting list item a loader returns to the browser. */
export interface SerializedWaitingTaskItem {
  readonly id: string;
  readonly title: string;
  readonly status: TaskStatus;
  readonly commitmentState: CommitmentState;
  readonly priority: TaskPriority | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly parent: TaskRelation | null;
  readonly waiting: SerializedTaskWaiting;
  /** V2.7 RECALL-03 — the delegation group's chase date (`YYYY-MM-DD`), or null. */
  readonly followUpOn: string | null;
}

/** Serialise a kernel `WaitingTaskListItem` for a JSON loader response. */
export function serializeWaitingItem(
  item: WaitingTaskListItem,
): SerializedWaitingTaskItem {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    commitmentState: item.commitmentState,
    priority: item.priority,
    dueDate: item.dueDate,
    scheduledDate: item.scheduledDate,
    parent: item.parent,
    waiting: {
      since: item.waiting.since.toISOString(),
      subject: item.waiting.subject,
    },
    followUpOn: item.followUpOn,
  };
}

/** A single preview row in the Today Waiting summary (display strings only). */
export interface WaitingPreviewItem {
  readonly id: string;
  readonly title: string;
  readonly subjectLabel: string;
  readonly subjectType: string | null;
  readonly sinceLabel: string | null;
  readonly elapsedLabel: string;
}

/** The Today Waiting summary: the active waiting count and a bounded preview. */
export interface WaitingSummary {
  readonly count: number;
  readonly preview: readonly WaitingPreviewItem[];
}

/** Reduce a waiting card-data row to the compact Today-summary preview shape. */
export function toWaitingPreviewItem(
  card: WaitingCardData,
): WaitingPreviewItem {
  return {
    id: card.id,
    title: card.title,
    subjectLabel: card.subjectLabel,
    subjectType: card.subjectType,
    sinceLabel: card.sinceLabel,
    elapsedLabel: card.elapsedLabel,
  };
}
