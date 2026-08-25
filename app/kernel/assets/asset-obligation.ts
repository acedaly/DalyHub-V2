/**
 * ASSET-02 Assets kernel — the Asset Obligation contract (storage-independent).
 *
 * An Obligation is one thing an Asset WILL need: registration renewed by 30
 * September, a service every six months, new tyres at 60,000 km. It is the
 * forward-looking counterpart to the Asset Event's backward-looking history, and
 * the two are never confused (§3): an event is proof that something happened, an
 * obligation is a commitment that something must.
 *
 * THE STATUS SPLIT — read this before touching the model.
 *
 * `status` stores ONLY the owner-controlled lifecycle: `open`, `completed`,
 * `dismissed`, `on_hold`. The urgency words the owner actually reads — `upcoming`,
 * `due`, `overdue` — are DERIVED at read time by `evaluateObligation` from the due
 * date, the lead time, the meter and the owner-calendar day. They are never
 * stored, because a stored "overdue" flag is wrong the moment the clock ticks past
 * it and would need a background scheduler DalyHub deliberately does not have.
 *
 * Task status values are NOT reused. A Task is done or not; an obligation can be
 * on hold, dismissed as no-longer-relevant, or waiting on a meter reading that has
 * not been taken. Forcing one vocabulary onto the other would lose meaning (§4).
 *
 * Everything here is PURE and calendar-only: no clocks, no timezones, no storage.
 * The caller supplies the owner-calendar day (ADR-022 §22.7).
 */

import { calendarDaysBetween } from "~/kernel/datetime";
import type { WorkspaceId } from "~/kernel/workspaces";

import { AssetValidationError } from "./asset-errors";
import {
  evaluateMeterThreshold,
  formatMeterReading,
  nextMeterThreshold,
  type AssetMeterUnit,
  type MeterReading,
  type MeterThresholdState,
} from "./asset-meter";

/* -------------------------------------------------------------------------- */
/* Category vocabulary                                                        */
/* -------------------------------------------------------------------------- */

/** What kind of future commitment this is. Closed, stable stored keys. */
export const ASSET_OBLIGATION_CATEGORIES = [
  "registration",
  "warranty",
  "insurance",
  "licence",
  "service",
  "inspection",
  "maintenance",
  "replacement",
  "reminder",
] as const;

export type AssetObligationCategory =
  (typeof ASSET_OBLIGATION_CATEGORIES)[number];

/** Every obligation category, in display order, with an owner-facing label. */
export const ASSET_OBLIGATION_CATEGORY_OPTIONS: readonly {
  readonly value: AssetObligationCategory;
  readonly label: string;
}[] = [
  { value: "service", label: "Scheduled service" },
  { value: "registration", label: "Registration renewal" },
  { value: "insurance", label: "Insurance renewal" },
  { value: "warranty", label: "Warranty expiry" },
  { value: "licence", label: "Licence or permit renewal" },
  { value: "inspection", label: "Inspection" },
  { value: "maintenance", label: "Maintenance" },
  { value: "replacement", label: "Replacement" },
  { value: "reminder", label: "Custom reminder" },
];

const OBLIGATION_CATEGORY_LABELS = new Map<string, string>(
  ASSET_OBLIGATION_CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
);

/** The owner-facing label for an obligation category, or null when unknown. */
export function assetObligationCategoryLabel(
  value: string | null,
): string | null {
  return value ? (OBLIGATION_CATEGORY_LABELS.get(value) ?? null) : null;
}

/** True when `value` is a supported obligation category. */
export function isAssetObligationCategory(
  value: unknown,
): value is AssetObligationCategory {
  return (
    typeof value === "string" &&
    (ASSET_OBLIGATION_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Which canonical Asset fact a completed obligation of this category updates.
 * This is the bridge between history and current facts (§3): completing a
 * registration renewal moves the Asset's `renewalDate`; completing a service moves
 * `nextServiceDate` and `lastServiceDate`; a warranty obligation moves
 * `warrantyExpiry`. Categories with no canonical home update nothing.
 */
export function canonicalFactForCategory(
  category: AssetObligationCategory,
): "renewalDate" | "warrantyExpiry" | "nextServiceDate" | null {
  switch (category) {
    case "registration":
    case "insurance":
    case "licence":
      return "renewalDate";
    case "warranty":
      return "warrantyExpiry";
    case "service":
    case "inspection":
    case "maintenance":
      return "nextServiceDate";
    default:
      return null;
  }
}

/**
 * The Asset Event category recorded when an obligation of this category is
 * completed — so "renewed the rego" lands in history as a `registration` event,
 * not as an untyped note.
 */
export function completionEventCategory(
  category: AssetObligationCategory,
): string {
  switch (category) {
    case "registration":
      return "registration";
    case "insurance":
      return "insurance";
    case "warranty":
      return "warranty";
    case "licence":
      return "renewal";
    case "service":
    case "maintenance":
      return "service";
    case "inspection":
      return "inspection";
    case "replacement":
      return "upgrade";
    default:
      return "history";
  }
}

/* -------------------------------------------------------------------------- */
/* Stored lifecycle status                                                    */
/* -------------------------------------------------------------------------- */

/** The owner-controlled lifecycle. See the module header for why this is small. */
export const ASSET_OBLIGATION_STATUSES = [
  "open",
  "completed",
  "dismissed",
  "on_hold",
] as const;

export type AssetObligationStatus = (typeof ASSET_OBLIGATION_STATUSES)[number];

/** True when `value` is a supported stored obligation status. */
export function isAssetObligationStatus(
  value: unknown,
): value is AssetObligationStatus {
  return (
    typeof value === "string" &&
    (ASSET_OBLIGATION_STATUSES as readonly string[]).includes(value)
  );
}

/* -------------------------------------------------------------------------- */
/* Recurrence                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How an obligation repeats. `none` is a one-off. The four date kinds advance a
 * calendar date by a bounded interval; `meter` advances a meter threshold. There
 * is no expression language and no cron — a rule is a (kind, interval) pair, which
 * is enough for "every six months" and "every 10,000 km" and stops well short of
 * a scheduling engine.
 */
export const ASSET_RECURRENCE_KINDS = [
  "none",
  "days",
  "weeks",
  "months",
  "years",
  "meter",
] as const;

export type AssetRecurrenceKind = (typeof ASSET_RECURRENCE_KINDS)[number];

/** Every recurrence kind, in display order, with an owner-facing label. */
export const ASSET_RECURRENCE_OPTIONS: readonly {
  readonly value: AssetRecurrenceKind;
  readonly label: string;
}[] = [
  { value: "none", label: "Does not repeat" },
  { value: "days", label: "Every N days" },
  { value: "weeks", label: "Every N weeks" },
  { value: "months", label: "Every N months" },
  { value: "years", label: "Every N years" },
  { value: "meter", label: "Every N kilometres, hours or cycles" },
];

/** True when `value` is a supported recurrence kind. */
export function isAssetRecurrenceKind(
  value: unknown,
): value is AssetRecurrenceKind {
  return (
    typeof value === "string" &&
    (ASSET_RECURRENCE_KINDS as readonly string[]).includes(value)
  );
}

/** The largest recurrence interval accepted for a date-based rule. */
export const MAX_RECURRENCE_INTERVAL = 999;

/** A plain-words description of a recurrence rule ("Every 6 months"). */
export function describeRecurrence(
  kind: AssetRecurrenceKind,
  interval: number | null,
  meterInterval: number | null,
  meterUnit: AssetMeterUnit | null,
): string {
  if (kind === "none") return "Does not repeat";
  if (kind === "meter") {
    const reading = formatMeterReading(meterInterval, meterUnit);
    return reading ? `Every ${reading}` : "Repeats by meter";
  }
  const n = interval ?? 1;
  const unit =
    kind === "days"
      ? "day"
      : kind === "weeks"
        ? "week"
        : kind === "months"
          ? "month"
          : "year";
  return n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
}

/* -------------------------------------------------------------------------- */
/* Calendar arithmetic (pure, zone-free)                                      */
/* -------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a well-formed `YYYY-MM-DD` calendar date. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map((p) => Number.parseInt(p, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function toIso(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Add whole days to a calendar date. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Add whole months to a calendar date, CLAMPING into short months (31 January +
 * 1 month = 28 February). The requested day-of-month is not remembered across
 * hops here — an Asset obligation advances one step at a time from its own due
 * date, so there is no multi-hop drift to correct for.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return toIso(year, month, Math.min(d, daysInMonth(year, month)));
}

/**
 * Whole days from `from` to `to`; positive when `to` is later.
 *
 * DEBT-52 — the kernel's ONE calendar-day implementation, worded for assets.
 */
export function daysBetween(from: string, to: string): number {
  return calendarDaysBetween(from, to);
}

/**
 * The next due date after `from`, advancing by one recurrence step.
 *
 * Anchored on the date supplied by the caller — which on completion is the date
 * the work was ACTUALLY done, not the date it was originally due. A service done
 * two months late therefore schedules the next one a full interval after the work,
 * which is what a person means by "every six months", rather than compounding the
 * lateness forever.
 *
 * Returns null for a non-recurring or meter-only rule (a meter rule advances a
 * threshold, not a date — see `nextMeterThreshold`).
 */
export function nextObligationDate(
  from: string,
  kind: AssetRecurrenceKind,
  interval: number | null,
): string | null {
  if (kind === "none" || kind === "meter") return null;
  if (!isIsoDate(from)) {
    throw new AssetValidationError("dueDate", "must be a real calendar date");
  }
  const n = interval ?? 1;
  if (!Number.isInteger(n) || n < 1 || n > MAX_RECURRENCE_INTERVAL) {
    throw new AssetValidationError(
      "recurrenceInterval",
      "must be between 1 and 999",
    );
  }
  switch (kind) {
    case "days":
      return addDays(from, n);
    case "weeks":
      return addDays(from, n * 7);
    case "months":
      return addMonths(from, n);
    case "years":
      return addMonths(from, n * 12);
  }
}

export { nextMeterThreshold };

/* -------------------------------------------------------------------------- */
/* The record                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One future commitment against an Asset.
 *
 * `taskId` is a POINTER to the actionable Task, never ownership: the obligation is
 * authoritative for the due date, the recurrence and the maintenance meaning, and
 * survives its Task being completed, cancelled or deleted (§7, §18).
 */
export type AssetObligation = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly assetId: string;
  readonly category: AssetObligationCategory;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly leadDays: number;
  readonly recurrenceKind: AssetRecurrenceKind;
  readonly recurrenceInterval: number | null;
  readonly meterThreshold: number | null;
  readonly meterInterval: number | null;
  readonly meterUnit: AssetMeterUnit | null;
  readonly status: AssetObligationStatus;
  readonly taskId: string | null;
  readonly completedEventId: string | null;
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
/* Derived state                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The urgency an owner actually reads. Derived, never stored.
 *
 *   - `overdue`   — a due date in the past, or a meter threshold already reached.
 *   - `due`       — inside the lead-time window, or approaching the meter threshold.
 *   - `upcoming`  — committed, but not yet worth thinking about.
 *   - `unknown`   — a meter-only obligation with no current reading. We ask for a
 *                   reading rather than accusing the owner of being late (§5).
 *   - `completed` / `dismissed` / `on_hold` — the stored lifecycle showing through.
 */
export type AssetObligationState =
  | "overdue"
  | "due"
  | "upcoming"
  | "unknown"
  | "completed"
  | "dismissed"
  | "on_hold";

/** The full derived answer for one obligation at one moment. */
export type AssetObligationEvaluation = {
  readonly state: AssetObligationState;
  /** Days until the due date; negative when past. Null for meter-only. */
  readonly daysUntilDue: number | null;
  /** The meter side of the answer, when the obligation has a meter commitment. */
  readonly meterState: MeterThresholdState | null;
  readonly meterRemaining: number | null;
  /** Owner-facing text. Always word-bearing — never colour alone (§24). */
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
 * Evaluate one obligation against the owner-calendar day and the Asset's current
 * meter reading.
 *
 * When an obligation carries BOTH a date and a meter commitment (a service due at
 * six months OR 10,000 km, whichever comes first), the MORE URGENT side wins —
 * which is what "whichever comes first" means. A meter side that is `unknown`
 * never overrides a known date side; it only shows through when the date side has
 * nothing to say.
 */
export function evaluateObligation(
  obligation: Pick<
    AssetObligation,
    "status" | "dueDate" | "leadDays" | "meterThreshold" | "meterUnit"
  >,
  today: string,
  reading: MeterReading | null,
): AssetObligationEvaluation {
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
          ? daysBetween(today, obligation.dueDate)
          : null,
      meterState: null,
      meterRemaining: null,
      text,
      needsAttention: false,
    };
  }

  const hasDate = obligation.dueDate !== null && isIsoDate(obligation.dueDate);
  const days = hasDate
    ? daysBetween(today, obligation.dueDate as string)
    : null;

  const meter =
    obligation.meterThreshold !== null && obligation.meterUnit !== null
      ? evaluateMeterThreshold(
          {
            threshold: obligation.meterThreshold,
            unit: obligation.meterUnit,
          },
          reading,
        )
      : null;

  // Rank each side independently, then take the more urgent.
  const dateState: AssetObligationState | null =
    days === null
      ? null
      : days < 0
        ? "overdue"
        : days <= obligation.leadDays
          ? "due"
          : "upcoming";

  const meterState: AssetObligationState | null =
    meter === null
      ? null
      : meter.state === "reached"
        ? "overdue"
        : meter.state === "approaching"
          ? "due"
          : meter.state === "ahead"
            ? "upcoming"
            : "unknown";

  const RANK: Record<AssetObligationState, number> = {
    overdue: 0,
    due: 1,
    unknown: 2,
    upcoming: 3,
    on_hold: 4,
    dismissed: 5,
    completed: 6,
  };

  let state: AssetObligationState;
  let text: string;
  if (dateState !== null && meterState !== null) {
    // "Whichever comes first", with the honest caveat that an unknown meter never
    // silences a known date.
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
    // "Needs attention" drives Today. `unknown` qualifies — a meter obligation we
    // cannot evaluate is exactly the thing worth a quiet nudge for a reading.
    needsAttention:
      state === "overdue" || state === "due" || state === "unknown",
  };
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** The editable obligation fields. `undefined` leaves unchanged; `null` clears. */
export type AssetObligationInput = {
  readonly category?: string;
  readonly title?: string;
  readonly description?: string | null;
  readonly dueDate?: string | null;
  readonly leadDays?: number | string | null;
  readonly recurrenceKind?: string | null;
  readonly recurrenceInterval?: number | string | null;
  readonly meterThreshold?: number | string | null;
  readonly meterInterval?: number | string | null;
  readonly meterUnit?: string | null;
};

/** Input to create an obligation against an Asset. */
export type CreateAssetObligationInput = AssetObligationInput & {
  readonly category: string;
  readonly title: string;
};

/** Input to edit an obligation. Completion goes through `complete`, never here. */
export type UpdateAssetObligationInput = AssetObligationInput;

/** Result of an obligation edit. */
export type AssetObligationChangeResult = {
  readonly obligation: AssetObligation;
  readonly changed: boolean;
};

/**
 * Input to complete an obligation — the moment history and obligations meet.
 *
 * Completing records WHAT ACTUALLY HAPPENED as an Asset Event, closes this
 * occurrence, advances the Asset's canonical fact, creates at most ONE successor,
 * and reconciles the linked Task — all atomically (§6).
 */
export type CompleteAssetObligationInput = {
  /** The day the work was actually done. Defaults to the owner-calendar day. */
  readonly completedOn?: string;
  /** Overrides the auto-derived event title. */
  readonly title?: string;
  readonly cost?: string | null;
  readonly currencyCode?: string | null;
  readonly provider?: string | null;
  readonly personId?: string | null;
  readonly meterValue?: string | number | null;
  readonly meterUnit?: string | null;
  readonly description?: string | null;
  readonly noteId?: string | null;
  /**
   * An explicit next due date, overriding the recurrence calculation. Lets the
   * owner enter the date printed on the new registration certificate rather than
   * trusting arithmetic.
   */
  readonly nextDueDate?: string | null;
  /** When false, no successor is created even for a recurring obligation. */
  readonly createSuccessor?: boolean;
};

/** What completing an obligation actually produced. */
export type CompleteAssetObligationResult = {
  readonly obligation: AssetObligation;
  /** The history entry proving the work happened. */
  readonly event: AssetEventRef;
  /** The single next occurrence, when the obligation recurs. */
  readonly successor: AssetObligation | null;
  /** How the linked Task was reconciled. */
  readonly taskOutcome: AssetTaskOutcome;
};

/** A light reference to the event a completion created. */
export type AssetEventRef = {
  readonly id: string;
  readonly title: string;
  readonly eventDate: string;
};

/**
 * What happened to the obligation's linked Task during a completion.
 *   - `none`          — there was no linked Task.
 *   - `completed`     — the open linked Task was completed in the same transaction.
 *   - `already_closed`— the Task was already complete (the owner ticked it first).
 *   - `missing`       — the Task no longer exists; the pointer was cleared.
 */
export type AssetTaskOutcome =
  "none" | "completed" | "already_closed" | "missing";

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

/** Which obligations to read for an Asset. */
export type AssetObligationFilters = {
  readonly categories?: readonly string[];
  readonly statuses?: readonly string[];
};

/** A bounded obligations read for one Asset. */
export type ListAssetObligationsInput = {
  readonly assetId: string;
  readonly filters?: AssetObligationFilters;
  readonly limit?: number;
  readonly cursor?: string;
  /** Owner-calendar day, so derived state resolves in the owner's timezone. */
  readonly today?: string;
};

/** A bounded page of obligations plus the next-page cursor. */
export type AssetObligationPage = {
  readonly items: readonly AssetObligation[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
};

export const DEFAULT_ASSET_OBLIGATIONS_PAGE_SIZE = 25;
export const MAX_ASSET_OBLIGATIONS_PAGE_SIZE = 100;

/**
 * The workspace-wide "what needs attention" read that Today consumes. Bounded by
 * a horizon in days and a hard item cap — Today shows what matters now, never
 * every future obligation (§8).
 */
export type AssetAttentionInput = {
  /** Owner-calendar day. */
  readonly today: string;
  /** How far ahead to look. Defaults to `DEFAULT_ATTENTION_HORIZON_DAYS`. */
  readonly horizonDays?: number;
  readonly limit?: number;
};

/** How far ahead Today looks for asset obligations, in owner-calendar days. */
export const DEFAULT_ATTENTION_HORIZON_DAYS = 30;
/** The hard cap on obligations Today will ever consider. */
export const MAX_ATTENTION_ITEMS = 50;

/** One obligation that needs attention, with the Asset context Today needs. */
export type AssetAttentionItem = {
  readonly obligation: AssetObligation;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly assetType: string;
  /** The Asset's current reading, so meter state resolves without a second read. */
  readonly reading: MeterReading | null;
  /** True when the linked Task exists and is still open. */
  readonly hasOpenTask: boolean;
};
