/**
 * V2.10 LIFE-02 — the ONE bounded obligation read, shared by every surface that
 * shows one.
 *
 * Life Admin's collection, the Obligation record and the Asset record's
 * Obligations tab all come through here, so there is one query shape, one set of
 * bounds and one projection. A surface that read obligations its own way would
 * eventually disagree with another about the same commitment — which is the
 * failure V2.10 exists to end, not to repeat one layer up.
 *
 * ── The query budget, stated so it can be checked ───────────────────────────
 * Every function below is a FIXED number of statements whatever it returns:
 *
 *   readObligationPage    2 — the page (with its subject, meter and open-Task
 *                             joins), then the band counts over the WHOLE
 *                             collection. Never one read per row, and never a
 *                             second read for the meter: the subject's current
 *                             reading rides on the subject projection, because
 *                             it is needed exactly where the subject is.
 *   readObligationRecord  1 — the obligation with its subject.
 *
 * `test/unit/obligations/obligation-query-bounds.test.ts` asserts it.
 *
 * ── Why the meter arrives here and not in the kernel ────────────────────────
 * A meter belongs to the domain that owns its units. The obligation kernel
 * knows a threshold and an unnarrowed unit string; the Assets kernel knows what
 * 60,000 km MEANS against an odometer. So this module — platform, where the
 * adapters meet — asks Assets for the meter side and hands it to the ONE shared
 * evaluator. An obligation about a Person, a Project or nothing at all simply
 * has no meter side, which is the truthful answer rather than a fabricated one.
 */

import {
  assetObligationMeter,
  describeAssetObligationRecurrence,
  formatMeterReading,
  isAssetMeterUnit,
  type MeterReading,
} from "~/kernel/assets";
import {
  OBLIGATION_BANDS,
  obligationBandLabel,
  type Obligation,
  type ObligationBand,
  type ObligationBandCounts,
  type ObligationFilters,
  type ObligationSubject,
} from "~/kernel/obligations";
import { entityDestination } from "~/shared/entity";
import {
  serializeObligation,
  type ObligationBandGroup,
  type SerializedObligation,
  type SerializedObligationSubject,
} from "~/shared/obligations";
import type { WorkspaceScope } from "~/platform/workspaces";

/** One page of obligations, already serialised for the surface that asked. */
export interface ObligationPageResult {
  readonly items: readonly SerializedObligation[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  /** The band counts over the WHOLE collection, not over `items` (D10). */
  readonly counts: ObligationBandCounts;
}

/** What a surface asks for. The three-way subject scope is the repository's. */
export interface ReadObligationPageInput {
  readonly scope: WorkspaceScope;
  readonly today: string;
  readonly filters?: ObligationFilters;
  /** Free text, matched against title, category label and subject title (D11). */
  readonly query?: string;
  readonly subjectEntityId?: string | null;
  readonly limit?: number;
  readonly cursor?: string;
}

/**
 * The subject's current reading, in the Asset vocabulary — or null.
 *
 * The value and unit travel on the subject projection; this is the narrowing
 * from "some unit string" to "a unit the Assets kernel can evaluate against",
 * which is the boundary between the two domains and the only place it happens.
 */
function readingOf(subject: ObligationSubject | null): MeterReading | null {
  if (
    subject === null ||
    subject.meterValue === null ||
    !isAssetMeterUnit(subject.meterUnit)
  ) {
    return null;
  }
  return { value: subject.meterValue, unit: subject.meterUnit };
}

/** Resolve the subject for display, including its route where it has one. */
function serializeSubject(
  subject: ObligationSubject | null,
): SerializedObligationSubject | null {
  if (subject === null) return null;
  const destination = entityDestination(subject.type, subject.id);
  return {
    id: subject.id,
    type: subject.type,
    subtype: subject.subtype,
    title: subject.title,
    href: destination?.kind === "route" ? destination.to : null,
  };
}

/**
 * Project one obligation with everything a surface needs to render it, meter
 * side included where the subject has one.
 */
export function projectObligation(
  obligation: Obligation,
  today: string,
  context: {
    readonly subject?: ObligationSubject | null;
    readonly taskTitle?: string | null;
    readonly taskOpen?: boolean;
  } = {},
): SerializedObligation {
  const subject = context.subject ?? null;
  const meter = assetObligationMeter(obligation, readingOf(subject));
  const unit = isAssetMeterUnit(obligation.meterUnit)
    ? obligation.meterUnit
    : null;
  return serializeObligation(obligation, today, {
    meter,
    meterDisplay: unit
      ? formatMeterReading(obligation.meterThreshold, unit)
      : null,
    recurrenceLabel: describeAssetObligationRecurrence(
      obligation.recurrenceKind,
      obligation.recurrenceInterval,
      obligation.meterInterval,
      unit,
    ),
    subject: serializeSubject(subject),
    taskTitle: context.taskTitle ?? null,
    taskOpen: context.taskOpen ?? false,
  });
}

/** A bounded page of obligations, with the band counts for the whole set. */
export async function readObligationPage(
  input: ReadObligationPageInput,
): Promise<ObligationPageResult> {
  const { scope, today } = input;
  const page = await scope.obligations.list({
    filters: input.filters,
    query: input.query,
    subjectEntityId: input.subjectEntityId,
    limit: input.limit,
    cursor: input.cursor,
    today,
  });
  const counts = await scope.obligations.countByBand({
    filters: input.filters,
    query: input.query,
    subjectEntityId: input.subjectEntityId,
    today,
  });

  return {
    items: page.items.map((obligation) =>
      projectObligation(obligation, today, {
        subject: obligation.subjectEntityId
          ? (page.subjects.get(obligation.subjectEntityId) ?? null)
          : null,
        taskOpen: page.openTaskIds.has(obligation.id),
      }),
    ),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    counts,
  };
}

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
