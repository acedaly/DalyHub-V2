/**
 * V2.10 LIFE-00 Obligations kernel — the record, the derived state, and the
 * one urgency evaluator.
 *
 * An Obligation is one thing that must be dealt with: a registration renewed by
 * 30 September, a service every six months, a tax return lodged by 31 October,
 * a school fee paid each term. It is the forward-looking counterpart to a
 * history entry's backward-looking proof, and the two are never confused: an
 * event is proof that something happened, an obligation is a commitment that
 * something must.
 *
 * THE STATUS SPLIT — read this before touching the model. `status` stores only
 * the owner-controlled lifecycle (`obligation-status.ts`); the urgency words
 * are DERIVED here and never stored.
 *
 * THE METER IS INJECTED, NOT COMPUTED. A meter belongs to the thing that has
 * one — an odometer is a property of a vehicle — so the units, the approach
 * windows and the reading live with that domain, and this evaluator receives an
 * already-evaluated meter side. That is what keeps the obligation arithmetic
 * free of any Asset assumption, which is the whole of V2.10 LIFE-00.
 *
 * Everything here is PURE: no clocks, no timezones, no storage, no JSX. The
 * caller supplies the owner-calendar day (ADR-022 §22.7).
 */

import type { ObligationCategory } from "./obligation-category";
import type { ObligationRecurrenceKind } from "./obligation-recurrence";
import { isIsoDate, obligationDaysBetween } from "./obligation-recurrence";
import type { ObligationStatus } from "./obligation-status";

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One commitment.
 *
 * `taskId` is a POINTER to the actionable Task, never ownership: the obligation
 * is authoritative for the due date, the recurrence and the meaning, and
 * survives its Task being completed, cancelled or deleted.
 *
 * A domain that carries more — the Assets module's meter and its proof-event
 * pointer — extends this type rather than redeclaring it.
 */
export type Obligation = {
  readonly id: string;
  readonly workspaceId: string;
  readonly category: ObligationCategory;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly leadDays: number;
  readonly recurrenceKind: ObligationRecurrenceKind;
  readonly recurrenceInterval: number | null;
  readonly status: ObligationStatus;
  readonly taskId: string | null;
  readonly completedAt: Date | null;
  readonly nextObligationId: string | null;
  readonly seriesId: string;
  readonly sequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
  readonly deletedAt: Date | null;
};

/* -------------------------------------------------------------------------- */
/* The injected meter side                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How a meter commitment stands, as the owning domain evaluated it.
 * `incompatible` is a unit mismatch: we never convert, we say so.
 */
export type ObligationMeterState =
  "reached" | "approaching" | "ahead" | "unknown" | "incompatible";

/** The meter side of an answer, supplied by the domain that owns the meter. */
export type ObligationMeterEvaluation = {
  readonly state: ObligationMeterState;
  /** Units remaining; negative when passed, null when unknowable. */
  readonly remaining: number | null;
  /** Owner-facing text. Always word-bearing — never colour alone. */
  readonly text: string;
};

/* -------------------------------------------------------------------------- */
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The urgency an owner actually reads. Derived, never stored.
 *
 *   - `overdue`   — a due date in the past, or a meter threshold already reached.
 *   - `due`       — inside the lead-time window, or approaching the threshold.
 *   - `upcoming`  — committed, but not yet worth thinking about.
 *   - `unknown`   — a meter-only commitment with no current reading. We ask for
 *                   a reading rather than accusing the owner of being late.
 *   - `completed` / `dismissed` / `on_hold` — the stored lifecycle showing through.
 */
export type ObligationState =
  | "overdue"
  | "due"
  | "upcoming"
  | "unknown"
  | "completed"
  | "dismissed"
  | "on_hold";

/** The full derived answer for one obligation at one moment. */
export type ObligationEvaluation = {
  readonly state: ObligationState;
  /** Days until the due date; negative when past. Null for meter-only. */
  readonly daysUntilDue: number | null;
  /** The meter side of the answer, when one was supplied. */
  readonly meterState: ObligationMeterState | null;
  readonly meterRemaining: number | null;
  /** Owner-facing text. Always word-bearing — never colour alone. */
  readonly text: string;
  /** True when this obligation deserves attention on Today. */
  readonly needsAttention: boolean;
};

/** Format a calendar date the calm way ("30 September"). */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** The calm phrase for a date-based obligation. */
function dateText(days: number, iso: string): string {
  if (days < -1) return `Overdue by ${Math.abs(days)} days`;
  if (days === -1) return "Overdue by 1 day";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days <= 30) return `Due in ${days} days`;
  return `Due ${shortDate(iso)}`;
}

/**
 * Evaluate one obligation against the owner-calendar day and, where the domain
 * supplied one, an already-evaluated meter side.
 *
 * When an obligation carries BOTH a date and a meter commitment (a service due
 * at six months OR 10,000 km, whichever comes first), the MORE URGENT side wins
 * — which is what "whichever comes first" means. A meter side that is `unknown`
 * never overrides a known date side; it only shows through when the date side
 * has nothing to say.
 */
export function evaluateObligation(
  obligation: Pick<Obligation, "status" | "dueDate" | "leadDays">,
  today: string,
  meter: ObligationMeterEvaluation | null,
): ObligationEvaluation {
  if (obligation.status !== "open") {
    const text =
      obligation.status === "completed"
        ? "Completed"
        : obligation.status === "dismissed"
          ? "Dismissed"
          : "On hold";
    return {
      state: obligation.status === "on_hold" ? "on_hold" : obligation.status,
      daysUntilDue:
        obligation.dueDate && isIsoDate(obligation.dueDate)
          ? obligationDaysBetween(today, obligation.dueDate)
          : null,
      meterState: null,
      meterRemaining: null,
      text,
      needsAttention: false,
    };
  }

  const hasDate = obligation.dueDate !== null && isIsoDate(obligation.dueDate);
  const days = hasDate
    ? obligationDaysBetween(today, obligation.dueDate as string)
    : null;

  // Rank each side independently, then take the more urgent.
  const dateState: ObligationState | null =
    days === null
      ? null
      : days < 0
        ? "overdue"
        : days <= obligation.leadDays
          ? "due"
          : "upcoming";

  const meterState: ObligationState | null =
    meter === null
      ? null
      : meter.state === "reached"
        ? "overdue"
        : meter.state === "approaching"
          ? "due"
          : meter.state === "ahead"
            ? "upcoming"
            : "unknown";

  const RANK: Record<ObligationState, number> = {
    overdue: 0,
    due: 1,
    unknown: 2,
    upcoming: 3,
    on_hold: 4,
    dismissed: 5,
    completed: 6,
  };

  let state: ObligationState;
  let text: string;
  if (dateState !== null && meterState !== null) {
    // "Whichever comes first", with the honest caveat that an unknown meter
    // never silences a known date.
    if (meterState === "unknown") {
      state = dateState;
      text =
        `${dateText(days as number, obligation.dueDate as string)} · ${meter?.text ?? ""}`.trim();
    } else if (RANK[meterState] < RANK[dateState]) {
      state = meterState;
      text = meter?.text ?? "";
    } else {
      state = dateState;
      text = dateText(days as number, obligation.dueDate as string);
    }
  } else if (dateState !== null) {
    state = dateState;
    text = dateText(days as number, obligation.dueDate as string);
  } else if (meterState !== null) {
    state = meterState;
    text = meter?.text ?? "";
  } else {
    // The schema forbids this (an obligation must commit to a date or a meter),
    // but the domain stays total rather than throwing at render time.
    state = "upcoming";
    text = "No due date set";
  }

  return {
    state,
    daysUntilDue: days,
    meterState: meter?.state ?? null,
    meterRemaining: meter?.remaining ?? null,
    text,
    // "Needs attention" drives Today. `unknown` qualifies — a meter obligation
    // we cannot evaluate is exactly the thing worth a quiet nudge for a reading.
    needsAttention:
      state === "overdue" || state === "due" || state === "unknown",
  };
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** The editable obligation fields. `undefined` leaves unchanged; `null` clears. */
export type ObligationInput = {
  readonly category?: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly leadDays?: number | string | null;
  readonly recurrenceKind?: string | null;
  readonly recurrenceInterval?: number | string | null;
};

/** Input to create an obligation. */
export type CreateObligationInput = ObligationInput & {
  readonly category: string;
  readonly title: string;
};

/** Input to edit an obligation. Completion goes through `complete`, never here. */
export type UpdateObligationInput = ObligationInput;

/** Result of an obligation edit. */
export type ObligationChangeResult<T extends Obligation = Obligation> = {
  readonly obligation: T;
  readonly changed: boolean;
};

/**
 * Input to complete an obligation — the moment history and obligations meet.
 *
 * A domain that records more at completion (the Assets module's cost, provider,
 * person, meter reading and note) extends this rather than redeclaring it.
 */
export type CompleteObligationInput = {
  /** The day the work was actually done. Defaults to the owner-calendar day. */
  readonly completedOn?: string;
  /** Overrides the auto-derived proof title. */
  readonly title?: string;
  readonly description?: string | null;
  /**
   * An explicit next due date, overriding the recurrence calculation. Lets the
   * owner enter the date printed on the new certificate rather than trusting
   * arithmetic.
   */
  readonly nextDueDate?: string | null;
  /** When false, no successor is created even for a recurring obligation. */
  readonly createSuccessor?: boolean;
};

/**
 * What happened to the obligation's linked Task during a completion.
 *   - `none`           — there was no linked Task.
 *   - `completed`      — the open linked Task was completed in the same transaction.
 *   - `already_closed` — the Task was already complete (the owner ticked it first).
 *   - `missing`        — the Task no longer exists; the pointer was cleared.
 */
export type ObligationTaskOutcome =
  "none" | "completed" | "already_closed" | "missing";

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Which obligations to read. */
export type ObligationFilters = {
  readonly categories?: readonly string[];
  readonly statuses?: readonly string[];
};

/** A bounded obligations read. */
export type ListObligationsInput = {
  readonly filters?: ObligationFilters;
  readonly limit?: number;
  readonly cursor?: string;
  /** Owner-calendar day, so derived state resolves in the owner's timezone. */
  readonly today?: string;
};

/** A bounded page of obligations plus the next-page cursor. */
export type ObligationPage<T extends Obligation = Obligation> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export const DEFAULT_OBLIGATIONS_PAGE_SIZE = 25;
export const MAX_OBLIGATIONS_PAGE_SIZE = 100;

/**
 * The workspace-wide "what needs attention" read that Today consumes. Bounded
 * by a horizon in days and a hard item cap — Today shows what matters now,
 * never every future obligation.
 */
export type ObligationAttentionInput = {
  /** Owner-calendar day. */
  readonly today: string;
  /** How far ahead to look. Defaults to `DEFAULT_ATTENTION_HORIZON_DAYS`. */
  readonly horizonDays?: number;
  readonly limit?: number;
};

/** How far ahead Today looks for obligations, in owner-calendar days. */
export const DEFAULT_ATTENTION_HORIZON_DAYS = 30;
/** The hard cap on obligations Today will ever consider. */
export const MAX_ATTENTION_ITEMS = 50;
