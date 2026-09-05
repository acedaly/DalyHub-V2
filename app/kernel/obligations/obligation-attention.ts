/**
 * V2.10 LIFE-03 — the Today attention projection, and the deduplication rule.
 *
 * One obligation needs the owner today whether it is about an Asset, about a
 * Person, or about nothing at all. This module is where that row is shaped, and
 * it is deliberately SUBJECT-AGNOSTIC: the subject is a field on the row, absent
 * on the ordinary case, and every rule below reads the obligation.
 *
 * ── What was here before ────────────────────────────────────────────────────
 * `app/kernel/assets/asset-today.ts` held the same rule with `assetId`,
 * `assetTitle` and `assetType` REQUIRED, and an href into the Asset record's
 * obligations tab. That shape could not carry a passport renewal, so Today's
 * read filtered every non-Asset obligation out before it reached the rail —
 * a filter LIFE-01 left in place on purpose and this item deletes.
 *
 * Pure: no clock, no storage, no React. The caller supplies the already
 * evaluated state, so Today can never disagree with the record about whether
 * the rego is overdue.
 */

import {
  obligationCategoryLabel,
  type ObligationCategory,
} from "./obligation-category";
import type { ObligationState } from "./obligation";
import { OBLIGATION_STATE_LABELS } from "./obligation-status";

/** The thing an obligation is about, where it is about anything. */
export type AttentionSubject = {
  readonly id: string;
  readonly type: string;
  readonly title: string;
};

/** One obligation as Today renders it. */
export type SerializedAttentionItem = {
  readonly obligationId: string;
  /** The obligation's own title — "Renew registration". */
  readonly title: string;
  /** What it is about, or null. Null is the ordinary case, not a defect. */
  readonly subject: AttentionSubject | null;
  readonly categoryLabel: string;
  readonly state: ObligationState;
  readonly stateLabel: string;
  /** The whole owner-facing line ("Due in 14 days"). */
  readonly text: string;
  readonly href: string;
};

/** What Today shows for obligations: the rows plus the count it deliberately hid. */
export type ObligationAttentionData = {
  /** The rows Today draws — capped at {@link TODAY_OBLIGATION_ROWS}. */
  readonly items: readonly SerializedAttentionItem[];
  /**
   * How many need attention in total, BEFORE the row cap.
   *
   * Today previews and says "N obligations need attention" from this; the
   * digest states the same number. Reading `items.length` instead would report
   * five whenever there were five or more, which is the one figure an owner
   * acts on.
   */
  readonly visibleCount: number;
  /**
   * How many obligations were suppressed because their linked Task already
   * carries them into Today. See {@link dedupeAttention} for the rule.
   */
  readonly trackedAsTasksCount: number;
  readonly overdueCount: number;
};

/** The raw attention input Today's loader hands this module. */
export type AttentionInput = {
  readonly obligationId: string;
  readonly title: string;
  readonly subject: AttentionSubject | null;
  readonly category: ObligationCategory;
  readonly state: ObligationState;
  readonly text: string;
  readonly hasOpenTask: boolean;
};

/** How many obligation rows Today will ever show. Today previews; it never lists. */
export const TODAY_OBLIGATION_ROWS = 5;

/**
 * Where a row goes: the OBLIGATION's own record, always.
 *
 * Before V2.10 it was the Asset record's obligations tab, because that was the
 * only place an obligation could be seen. It has a record of its own now, and
 * that record is where the completion form is — so the row leads to the thing
 * the owner has to do something about rather than to its container. A row about
 * nothing at all could not have had the old destination in any case.
 */
export function obligationAttentionHref(obligationId: string): string {
  return `/obligations/${encodeURIComponent(obligationId)}`;
}

/**
 * THE DEDUPLICATION RULE (§8).
 *
 * When an obligation has an OPEN linked Task, that Task is already the owner's
 * actionable commitment and already appears in Today's task list. Showing the
 * obligation again would be the same job twice on one page — exactly the noise
 * Today is supposed to remove.
 *
 * So: **an open linked Task wins.** The obligation is suppressed from the rail
 * and counted in `trackedAsTasksCount`, which the row states in words ("2 more
 * are tracked as tasks") so nothing silently disappears.
 *
 * The moment the Task is completed, cancelled or deleted, `hasOpenTask` goes
 * false and the obligation reappears — which is precisely the "you ticked the
 * task, now record what actually happened" moment the authority contract
 * describes (§7).
 */
export function dedupeAttention(
  items: readonly AttentionInput[],
): ObligationAttentionData {
  const visible = items.filter((item) => !item.hasOpenTask);
  const suppressed = items.length - visible.length;
  // Overdue first, then due, then everything else — most urgent at the top.
  const RANK: Partial<Record<ObligationState, number>> = {
    overdue: 0,
    due: 1,
    unknown: 2,
  };
  const ordered = [...visible].sort(
    (a, b) => (RANK[a.state] ?? 3) - (RANK[b.state] ?? 3),
  );
  return {
    items: ordered.slice(0, TODAY_OBLIGATION_ROWS).map((item) => ({
      obligationId: item.obligationId,
      title: item.title,
      subject: item.subject,
      categoryLabel: obligationCategoryLabel(item.category) ?? "Reminder",
      state: item.state,
      stateLabel: OBLIGATION_STATE_LABELS[item.state],
      text: item.text,
      href: obligationAttentionHref(item.obligationId),
    })),
    visibleCount: visible.length,
    trackedAsTasksCount: suppressed,
    overdueCount: visible.filter((item) => item.state === "overdue").length,
  };
}
