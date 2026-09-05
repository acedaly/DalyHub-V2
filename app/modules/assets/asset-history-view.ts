/**
 * ASSET-02 — the Asset history & obligations view-model (pure, React-free,
 * server-safe).
 *
 * Turns kernel `AssetEvent`s and `AssetObligation`s into JSON-safe display shapes
 * for the loader → component boundary, and owns the small pure derivations the UI
 * needs: category labels, calm state phrasings, cost formatting, the timeline
 * ordering and the Today deduplication rule.
 *
 * Every derived state comes from the ONE canonical kernel evaluator
 * (`evaluateObligation` / `evaluateMeterThreshold`) — this module formats, it never
 * re-decides. That is what stops Today, the collection card and the record ever
 * disagreeing about whether the rego is overdue.
 *
 * PRIVACY. An event's description is Markdown the owner wrote and may be private:
 * it reaches the record, never a collection card, a Today row or a search snippet
 * (§17). The compact projections below enforce that by construction.
 */

import {
  ASSET_COST_GROUP_LABELS,
  DEFAULT_CURRENCY,
  assetEventCategoryLabel,
  obligationCategoryLabel,
  describeAssetObligationRecurrence,
  evaluateAssetObligation,
  formatMeterReading,
  type AssetCostGroup,
  type AssetCostSummary,
  type AssetEvent,
  type AssetEventCategory,
  type AssetMeterUnit,
  type AssetObligation,
  type ObligationCategory,
  type ObligationState,
  type AssetValuationPoint,
  type MeterReading,
  OBLIGATION_STATE_LABELS,
} from "~/kernel/assets";
import { formatMinorUnits } from "~/kernel/money";

/* -------------------------------------------------------------------------- */
/* Serialised shapes                                                          */
/* -------------------------------------------------------------------------- */

/** One recorded event, projected for the Asset record's History tab. */
export type SerializedAssetEvent = {
  readonly id: string;
  readonly category: AssetEventCategory;
  readonly categoryLabel: string;
  readonly title: string;
  readonly eventDate: string;
  readonly dateLabel: string;
  readonly description: string | null;
  readonly provider: string | null;
  readonly personId: string | null;
  readonly personName: string | null;
  readonly costDisplay: string | null;
  readonly valueDisplay: string | null;
  readonly currencyCode: string | null;
  readonly meterDisplay: string | null;
  readonly warrantyExpiry: string | null;
  readonly nextDueDate: string | null;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
  readonly noteId: string | null;
  readonly noteTitle: string | null;
  readonly obligationId: string | null;
  readonly archived: boolean;
};

/** One obligation, projected with its DERIVED state already resolved. */
export type SerializedAssetObligation = {
  readonly id: string;
  readonly assetId: string;
  readonly category: ObligationCategory;
  readonly categoryLabel: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly dueDateLabel: string | null;
  readonly leadDays: number;
  readonly recurrenceLabel: string;
  readonly recurrenceKind: string;
  readonly recurrenceInterval: number | null;
  readonly meterThreshold: number | null;
  readonly meterInterval: number | null;
  readonly meterUnit: AssetMeterUnit | null;
  readonly meterDisplay: string | null;
  readonly status: string;
  readonly state: ObligationState;
  readonly stateLabel: string;
  /** The calm owner-facing sentence ("Registration expires in 14 days"). */
  readonly stateText: string;
  readonly needsAttention: boolean;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
  readonly taskOpen: boolean;
  readonly completedEventId: string | null;
  readonly completedDate: string | null;
  readonly seriesId: string;
  readonly sequence: number;
};

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The semantic tone for each state. Tones map to shared theme tokens, so all five
 * themes resolve them consistently; the label above always accompanies them.
 */
export function obligationStateTone(
  state: ObligationState,
): "danger" | "warning" | "info" | "neutral" | "success" {
  switch (state) {
    case "overdue":
      return "danger";
    case "due":
      return "warning";
    case "unknown":
      return "info";
    case "completed":
      return "success";
    default:
      return "neutral";
  }
}

/** Format a `YYYY-MM-DD` for display ("30 September 2026"), or null. */
export function formatHistoryDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map((p) => Number.parseInt(p, 10));
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Format an optional minor-unit amount, or null when unset. */
export function formatAmount(
  minor: number | null,
  currencyCode: string | null,
): string | null {
  if (minor === null) return null;
  return formatMinorUnits(minor, currencyCode ?? DEFAULT_CURRENCY);
}

/* -------------------------------------------------------------------------- */
/* Projections                                                                */
/* -------------------------------------------------------------------------- */

/** The canonical names the loader resolved for an event's related records. */
export type HistoryNameLookup = ReadonlyMap<string, string>;

/** Project one event for the record's History tab. */
export function serializeAssetEvent(
  event: AssetEvent,
  names: HistoryNameLookup = new Map(),
): SerializedAssetEvent {
  return {
    id: event.id,
    category: event.category,
    categoryLabel: assetEventCategoryLabel(event.category) ?? "History entry",
    title: event.title,
    eventDate: event.eventDate,
    dateLabel: formatHistoryDate(event.eventDate) ?? event.eventDate,
    description: event.description,
    provider: event.provider,
    personId: event.personId,
    personName: event.personId ? (names.get(event.personId) ?? null) : null,
    costDisplay: formatAmount(event.costMinor, event.currencyCode),
    valueDisplay: formatAmount(event.valueMinor, event.currencyCode),
    currencyCode: event.currencyCode,
    meterDisplay: formatMeterReading(event.meterValue, event.meterUnit),
    warrantyExpiry: event.warrantyExpiry,
    nextDueDate: event.nextDueDate,
    taskId: event.taskId,
    taskTitle: event.taskId ? (names.get(event.taskId) ?? null) : null,
    noteId: event.noteId,
    noteTitle: event.noteId ? (names.get(event.noteId) ?? null) : null,
    obligationId: event.obligationId,
    archived: event.archivedAt !== null,
  };
}

/**
 * Project one obligation with its DERIVED state resolved against the owner-calendar
 * day and the Asset's current meter reading. The evaluation is the kernel's; this
 * only attaches labels.
 */
export function serializeAssetObligation(
  obligation: AssetObligation,
  today: string,
  reading: MeterReading | null,
  options: {
    readonly taskTitle?: string | null;
    readonly taskOpen?: boolean;
  } = {},
): SerializedAssetObligation {
  const evaluation = evaluateAssetObligation(obligation, today, reading);
  return {
    id: obligation.id,
    assetId: obligation.assetId,
    category: obligation.category,
    categoryLabel: obligationCategoryLabel(obligation.category) ?? "Reminder",
    title: obligation.title,
    description: obligation.description,
    dueDate: obligation.dueDate,
    dueDateLabel: formatHistoryDate(obligation.dueDate),
    leadDays: obligation.leadDays,
    recurrenceLabel: describeAssetObligationRecurrence(
      obligation.recurrenceKind,
      obligation.recurrenceInterval,
      obligation.meterInterval,
      obligation.meterUnit,
    ),
    recurrenceKind: obligation.recurrenceKind,
    recurrenceInterval: obligation.recurrenceInterval,
    meterThreshold: obligation.meterThreshold,
    meterInterval: obligation.meterInterval,
    meterUnit: obligation.meterUnit,
    meterDisplay: formatMeterReading(
      obligation.meterThreshold,
      obligation.meterUnit,
    ),
    status: obligation.status,
    state: evaluation.state,
    stateLabel: OBLIGATION_STATE_LABELS[evaluation.state],
    stateText: evaluation.text,
    needsAttention: evaluation.needsAttention,
    taskId: obligation.taskId,
    taskTitle: options.taskTitle ?? null,
    taskOpen: options.taskOpen ?? false,
    completedEventId: obligation.completedEventId,
    completedDate: obligation.completedAt
      ? obligation.completedAt.toISOString().slice(0, 10)
      : null,
    seriesId: obligation.seriesId,
    sequence: obligation.sequence,
  };
}

/* -------------------------------------------------------------------------- */
/* The Asset overview projection                                              */
/* -------------------------------------------------------------------------- */

/** One line of the recorded-cost summary. */
export type SerializedCostLine = {
  readonly group: AssetCostGroup;
  readonly label: string;
  readonly amount: string;
  readonly minor: number;
};

/** The recorded-cost summary, formatted and honestly labelled (§15). */
export type SerializedCostSummary = {
  readonly currencyCode: string | null;
  readonly lines: readonly SerializedCostLine[];
  readonly ongoingTotal: string | null;
  readonly purchasePrice: string | null;
  readonly lifetimeTotal: string | null;
  readonly costedEventCount: number;
  readonly mixedCurrency: boolean;
  readonly excludedCurrencies: readonly string[];
  /** True when there is nothing recorded at all — the UI shows an empty state. */
  readonly isEmpty: boolean;
};

/** Format a kernel cost summary for display. */
export function serializeCostSummary(
  summary: AssetCostSummary,
): SerializedCostSummary {
  const lines = (Object.keys(ASSET_COST_GROUP_LABELS) as AssetCostGroup[])
    .filter((group) => summary.byGroup[group] > 0)
    .map((group) => ({
      group,
      label: ASSET_COST_GROUP_LABELS[group],
      amount: formatAmount(summary.byGroup[group], summary.currencyCode) ?? "",
      minor: summary.byGroup[group],
    }));
  return {
    currencyCode: summary.currencyCode,
    lines,
    ongoingTotal:
      summary.ongoingTotalMinor > 0
        ? formatAmount(summary.ongoingTotalMinor, summary.currencyCode)
        : null,
    purchasePrice: formatAmount(
      summary.purchasePriceMinor,
      summary.currencyCode,
    ),
    lifetimeTotal:
      summary.purchasePriceMinor !== null
        ? formatAmount(summary.lifetimeTotalMinor, summary.currencyCode)
        : null,
    costedEventCount: summary.costedEventCount,
    mixedCurrency: summary.mixedCurrency,
    excludedCurrencies: summary.excludedCurrencies,
    isEmpty:
      summary.costedEventCount === 0 && summary.purchasePriceMinor === null,
  };
}

/** One point of the recorded value history, formatted. */
export type SerializedValuationPoint = {
  readonly eventId: string;
  readonly date: string;
  readonly dateLabel: string;
  readonly amount: string;
  readonly minor: number;
  readonly source: string | null;
};

/**
 * Format the value history, and say honestly whether it can support a trend.
 *
 * Two points are two points, not a trajectory (§16). `hasTrend` is false below
 * three, and the UI renders the numbers without a shape when it is.
 */
export type SerializedValueHistory = {
  readonly points: readonly SerializedValuationPoint[];
  readonly currentAmount: string | null;
  readonly hasTrend: boolean;
  /** A plain-text summary, so the history is legible without the chart (§16). */
  readonly summary: string | null;
};

export function serializeValueHistory(
  points: readonly AssetValuationPoint[],
): SerializedValueHistory {
  const formatted = points.map((point) => ({
    eventId: point.eventId,
    date: point.date,
    dateLabel: formatHistoryDate(point.date) ?? point.date,
    amount: formatAmount(point.valueMinor, point.currencyCode) ?? "",
    minor: point.valueMinor,
    source: point.source,
  }));
  const last = formatted.at(-1) ?? null;
  const first = formatted[0] ?? null;
  let summary: string | null = null;
  if (formatted.length === 1 && last) {
    summary = `One valuation recorded: ${last.amount} on ${last.dateLabel}.`;
  } else if (formatted.length === 2 && first && last) {
    summary = `Two valuations recorded, ${first.amount} on ${first.dateLabel} and ${last.amount} on ${last.dateLabel}. That is too few to show a trend.`;
  } else if (formatted.length > 2 && first && last) {
    const direction =
      last.minor > first.minor
        ? "risen"
        : last.minor < first.minor
          ? "fallen"
          : "stayed level";
    summary = `${formatted.length} valuations recorded between ${first.dateLabel} and ${last.dateLabel}. The recorded value has ${direction} from ${first.amount} to ${last.amount}.`;
  }
  return {
    points: formatted,
    currentAmount: last?.amount ?? null,
    hasTrend: formatted.length > 2,
    summary,
  };
}

/* -------------------------------------------------------------------------- */
/* Collection signal                                                          */
/* -------------------------------------------------------------------------- */

/** The compact obligation signal an Assets collection card renders. */
export type SerializedObligationSignal = {
  readonly openCount: number;
  readonly overdueCount: number;
  readonly dueSoonCount: number;
  /** The one calm line a card shows ("Service overdue", "Rego due 30 September"). */
  readonly text: string;
  readonly tone: "danger" | "warning" | "info" | "neutral";
  /**
   * UIX-05 — the next obligation's due date, formatted, or `null`.
   *
   * The COUNTING forms of `text` ("1 obligation overdue", "2 obligations due
   * soon") deliberately say how many rather than when, which left the UIX-05
   * card's commitment block with no date at all on exactly the Assets that most
   * needed one — the card said something was overdue and refused to say since
   * when. This carries the date so the card can state it beneath the line,
   * without turning one urgent line into two (§12).
   */
  readonly dueLabel: string | null;
};

/**
 * Reduce a per-Asset obligation summary to ONE line for a card. A card shows the
 * most urgent thing, never a maintenance history (§12).
 */
export function obligationSignal(summary: {
  readonly openCount: number;
  readonly overdueCount: number;
  readonly dueSoonCount: number;
  readonly nextDueDate: string | null;
  readonly nextTitle: string | null;
  readonly needsMeterReading: boolean;
}): SerializedObligationSignal | null {
  if (summary.openCount === 0) return null;
  if (summary.overdueCount > 0) {
    return {
      ...counts(summary),
      text:
        summary.overdueCount === 1
          ? "1 obligation overdue"
          : `${summary.overdueCount} obligations overdue`,
      tone: "danger",
    };
  }
  if (summary.dueSoonCount > 0) {
    return {
      ...counts(summary),
      text:
        summary.dueSoonCount === 1
          ? "1 obligation due soon"
          : `${summary.dueSoonCount} obligations due soon`,
      tone: "warning",
    };
  }
  if (summary.needsMeterReading) {
    return {
      ...counts(summary),
      text: "Current meter reading needed",
      tone: "info",
    };
  }
  const when = formatHistoryDate(summary.nextDueDate);
  return {
    ...counts(summary),
    text: when
      ? `Next: ${summary.nextTitle ?? "obligation"} ${when}`
      : `${summary.openCount} upcoming`,
    tone: "neutral",
  };
}

function counts(summary: {
  readonly openCount: number;
  readonly overdueCount: number;
  readonly dueSoonCount: number;
  readonly nextDueDate: string | null;
}) {
  return {
    openCount: summary.openCount,
    overdueCount: summary.overdueCount,
    dueSoonCount: summary.dueSoonCount,
    dueLabel: formatHistoryDate(summary.nextDueDate),
  };
}

/* -------------------------------------------------------------------------- */
/* Today                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The Today deduplication rule lives in the KERNEL, not here — Today must never
 * import a module's internals (the module import boundary), and "an open linked
 * Task wins" is a domain rule both surfaces have to agree on. Re-exported so the
 * Assets module's own components keep a single import.
 */
export {
  dedupeAttention,
  OBLIGATION_STATE_LABELS,
  TODAY_ASSET_ROWS,
  type AssetsTodayData,
  type AttentionInput,
  type SerializedAttentionItem,
} from "~/kernel/assets";
