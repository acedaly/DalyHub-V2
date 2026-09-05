/**
 * V2.10 LIFE-02 — the shared Obligation view-model (pure, React-free,
 * server-safe).
 *
 * ONE projection of an obligation for the loader → component boundary, rendered
 * by Life Admin's collection, by the Obligation record, and by the Assets
 * record's Obligations tab. Before this file the Assets module carried its own
 * `SerializedAssetObligation` and its own row markup, which was fine while
 * Assets was the only surface that had obligations and is exactly the fork the
 * shared-row convention exists to prevent now that it is not (ADR-115).
 *
 * ── It knows nothing about Assets, and that is the point ────────────────────
 * A meter belongs to the domain that owns the units, so the meter side of an
 * evaluation and the meter's own words arrive as ARGUMENTS from the caller that
 * has them. Given none, the kernel's date-only evaluation is used, which is the
 * truthful answer for an obligation about a Person, a Project or nothing at
 * all. This module formats; it never re-decides. That is what stops Today, the
 * collection and the record disagreeing about whether the rego is overdue.
 *
 * ── PRIVACY ─────────────────────────────────────────────────────────────────
 * An obligation's description is text the owner wrote and may be private; an
 * amount is money. Both are on this shape because the RECORD and the
 * owner's own collection may show them. Neither may reach a Search excerpt, an
 * Activity descriptor, a notification, telemetry or a log
 * ([D11](../../../docs/roadmap/ROADMAP_V2_10.md)). The Search provider builds
 * its own projection for exactly that reason and never consults this one.
 */

import { formatMinorUnits } from "~/kernel/money";
import {
  OBLIGATION_BANDS,
  OBLIGATION_STATE_LABELS,
  describeObligationRecurrence,
  evaluateObligation,
  obligationBand,
  obligationBandLabel,
  obligationCategoryLabel,
  type Obligation,
  type ObligationBand,
  type ObligationBandCounts,
  type ObligationCategory,
  type ObligationEvaluation,
  type ObligationMeterEvaluation,
  type ObligationState,
} from "~/kernel/obligations";

/* -------------------------------------------------------------------------- */
/* The serialised shape                                                       */
/* -------------------------------------------------------------------------- */

/** What an obligation is ABOUT, resolved for display. Null is legitimate. */
export type SerializedObligationSubject = {
  readonly id: string;
  /** The kernel entity type, which supplies the identity glyph. */
  readonly type: string;
  /**
   * The subject's own subtype where it has one — an Asset's `vehicle` or
   * `appliance`. It is not the entity type, and a surface that draws a glyph
   * from it draws a more specific one.
   */
  readonly subtype: string | null;
  readonly title: string;
  /** The subject's canonical route, or null when it has no destination. */
  readonly href: string | null;
};

/** One obligation, projected with its DERIVED state already resolved. */
export type SerializedObligation = {
  readonly id: string;
  readonly subject: SerializedObligationSubject | null;
  readonly category: ObligationCategory;
  readonly categoryLabel: string;
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly dueDateLabel: string | null;
  readonly leadDays: number;
  readonly recurrenceKind: string;
  readonly recurrenceInterval: number | null;
  readonly recurrenceLabel: string;
  readonly meterThreshold: number | null;
  readonly meterInterval: number | null;
  readonly meterUnit: string | null;
  /** The meter target in the owning domain's own words, where there is one. */
  readonly meterDisplay: string | null;
  readonly status: string;
  readonly state: ObligationState;
  readonly stateLabel: string;
  /** The calm owner-facing sentence ("Registration expires in 14 days"). */
  readonly stateText: string;
  readonly needsAttention: boolean;
  /** Which collection band it belongs to (D10). */
  readonly band: ObligationBand;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
  readonly taskOpen: boolean;
  /** What it is EXPECTED to cost. Never a claim that anything was paid. */
  readonly expectedAmountDisplay: string | null;
  /** What it ACTUALLY cost, recorded at completion. */
  readonly completedAmountDisplay: string | null;
  readonly currencyCode: string | null;
  /** The editable amount, plain digits and a point — for a form, not a label. */
  readonly expectedAmountInput: string;
  readonly completedEventId: string | null;
  readonly completedDate: string | null;
  readonly completedDateLabel: string | null;
  readonly seriesId: string;
  readonly sequence: number;
  readonly href: string;
};

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The semantic tone for each state. Tones map to shared theme tokens, so all
 * five schemes resolve them consistently; the LABEL always accompanies them, so
 * colour is never the only signal (§24).
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
export function formatObligationDate(iso: string | null): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** An amount as plain digits and a point, for an editable field. */
function amountInput(
  minor: number | null,
  currencyCode: string | null,
): string {
  if (minor === null || currencyCode === null) return "";
  // Two decimal places is not universal, so the currency decides its own.
  const formatted = formatMinorUnits(minor, currencyCode, "en-AU");
  return formatted.replace(/[^\d.]/g, "");
}

/* -------------------------------------------------------------------------- */
/* The projection                                                             */
/* -------------------------------------------------------------------------- */

/** What the caller knows that this module cannot work out for itself. */
export type SerializeObligationOptions = {
  /**
   * The meter side, already evaluated by the domain that owns the units. Null
   * where the obligation has no meter, or where the caller has no reading.
   */
  readonly meter?: ObligationMeterEvaluation | null;
  /** The meter TARGET in that domain's own words ("60,000 km"). */
  readonly meterDisplay?: string | null;
  /**
   * The recurrence sentence, where the domain that owns the units can say it
   * better than "every 10000". Defaults to the kernel's own phrasing.
   */
  readonly recurrenceLabel?: string;
  readonly subject?: SerializedObligationSubject | null;
  readonly taskTitle?: string | null;
  readonly taskOpen?: boolean;
};

/**
 * Project one obligation against the owner-calendar day.
 *
 * The evaluation is the kernel's; this attaches labels and nothing else. Where
 * the caller supplies an evaluated meter side it is passed straight through to
 * that same evaluator, so a meter obligation and a dated one are ranked by one
 * rule rather than two.
 */
export function serializeObligation(
  obligation: Obligation,
  today: string,
  options: SerializeObligationOptions = {},
): SerializedObligation {
  const meter = options.meter ?? null;
  const evaluation: ObligationEvaluation = evaluateObligation(
    obligation,
    today,
    meter,
  );
  return {
    id: obligation.id,
    subject: options.subject ?? null,
    category: obligation.category,
    categoryLabel: obligationCategoryLabel(obligation.category) ?? "Reminder",
    title: obligation.title,
    description: obligation.description,
    dueDate: obligation.dueDate,
    dueDateLabel: formatObligationDate(obligation.dueDate),
    leadDays: obligation.leadDays,
    recurrenceKind: obligation.recurrenceKind,
    recurrenceInterval: obligation.recurrenceInterval,
    recurrenceLabel:
      options.recurrenceLabel ??
      describeObligationRecurrence(
        obligation.recurrenceKind,
        obligation.recurrenceInterval,
        options.meterDisplay ?? null,
      ),
    meterThreshold: obligation.meterThreshold,
    meterInterval: obligation.meterInterval,
    meterUnit: obligation.meterUnit,
    meterDisplay: options.meterDisplay ?? null,
    status: obligation.status,
    state: evaluation.state,
    stateLabel: OBLIGATION_STATE_LABELS[evaluation.state],
    stateText: evaluation.text,
    needsAttention: evaluation.needsAttention,
    band: obligationBand(obligation, today, meter),
    taskId: obligation.taskId,
    taskTitle: options.taskTitle ?? null,
    taskOpen: options.taskOpen ?? false,
    expectedAmountDisplay:
      obligation.expectedAmountMinor !== null && obligation.currencyCode
        ? formatMinorUnits(
            obligation.expectedAmountMinor,
            obligation.currencyCode,
            "en-AU",
          )
        : null,
    completedAmountDisplay:
      obligation.completedAmountMinor !== null && obligation.currencyCode
        ? formatMinorUnits(
            obligation.completedAmountMinor,
            obligation.currencyCode,
            "en-AU",
          )
        : null,
    currencyCode: obligation.currencyCode,
    expectedAmountInput: amountInput(
      obligation.expectedAmountMinor,
      obligation.currencyCode,
    ),
    completedEventId: obligation.completedEventId,
    completedDate: obligation.completedOn,
    completedDateLabel: formatObligationDate(obligation.completedOn),
    seriesId: obligation.seriesId,
    sequence: obligation.sequence,
    href: `/obligations/${encodeURIComponent(obligation.id)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Grouping                                                                   */
/* -------------------------------------------------------------------------- */

/** One band of a rendered collection, with the count of the WHOLE set behind it. */
export type ObligationBandGroup = {
  readonly band: ObligationBand;
  readonly label: string;
  readonly items: readonly SerializedObligation[];
  /**
   * How many obligations are in this band across the whole collection, which is
   * not `items.length` on any page but the last (D10).
   */
  readonly total: number;
};

/**
 * Group a page's rows into the collection's bands, carrying the WHOLE
 * collection's count on each heading.
 *
 * The rows are already in the repository's order (open work first, then soonest
 * due), so a band's rows keep that order rather than being re-sorted here.
 */
export function groupObligationsByBand(
  items: readonly SerializedObligation[],
  counts: ObligationBandCounts,
): readonly ObligationBandGroup[] {
  return OBLIGATION_BANDS.map((band: ObligationBand) => ({
    band,
    label: obligationBandLabel(band),
    items: items.filter((item) => item.band === band),
    total: counts[band],
  }));
}
