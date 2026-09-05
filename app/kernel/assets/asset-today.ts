/**
 * ASSET-02 Assets kernel — the Today attention projection and deduplication rule.
 *
 * Today reads Asset obligations through the workspace-scoped repository and this
 * pure kernel function; it never imports the Assets module's internals (the module
 * import boundary, AGENTS.md §9.1). The deduplication rule below is a DOMAIN rule
 * both the record and Today have to agree on, so it lives in the kernel where
 * neither surface can fork it.
 *
 * Pure: no clock, no storage, no React. The caller supplies the already-evaluated
 * state from `evaluateObligation`, so Today can never disagree with the record
 * about whether the rego is overdue.
 */

import {
  obligationCategoryLabel,
  type ObligationCategory,
  type ObligationState,
} from "~/kernel/obligations";

/** The owner-facing word for each derived state. Always rendered AS TEXT (§24). */
export const OBLIGATION_STATE_LABELS: Record<ObligationState, string> = {
  overdue: "Overdue",
  due: "Due soon",
  upcoming: "Upcoming",
  unknown: "Reading needed",
  completed: "Completed",
  dismissed: "Dismissed",
  on_hold: "On hold",
};

/** One Asset obligation as Today renders it. */
export type SerializedAttentionItem = {
  readonly obligationId: string;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly assetType: string;
  readonly title: string;
  readonly categoryLabel: string;
  readonly state: ObligationState;
  readonly stateLabel: string;
  /** The whole owner-facing line ("Registration expires in 14 days"). */
  readonly text: string;
  readonly href: string;
};

/** What Today shows for Assets: the rows plus the count it deliberately hid. */
export type AssetsTodayData = {
  readonly items: readonly SerializedAttentionItem[];
  /**
   * How many obligations were suppressed because their linked Task already
   * carries them into Today. See `dedupeAttention` for the rule.
   */
  readonly trackedAsTasksCount: number;
  readonly overdueCount: number;
};

/** The raw attention input Today's loader hands this module. */
export type AttentionInput = {
  readonly obligationId: string;
  readonly assetId: string;
  readonly assetTitle: string;
  readonly assetType: string;
  readonly title: string;
  readonly category: ObligationCategory;
  readonly state: ObligationState;
  readonly text: string;
  readonly hasOpenTask: boolean;
};

/** How many Asset rows Today will ever show. Today previews; it never lists. */
export const TODAY_ASSET_ROWS = 5;

/**
 * THE DEDUPLICATION RULE (§8).
 *
 * When an obligation has an OPEN linked Task, that Task is already the owner's
 * actionable commitment and already appears in Today's task list. Showing the
 * obligation again would be the same job twice on one page — exactly the noise
 * Today is supposed to remove.
 *
 * So: **an open linked Task wins.** The obligation is suppressed from the Assets
 * section and counted in `trackedAsTasksCount`, which the section states in words
 * ("2 more are tracked as tasks") so nothing silently disappears.
 *
 * The moment the Task is completed, cancelled or deleted, `hasOpenTask` goes false
 * and the obligation reappears here — which is precisely the "you ticked the task,
 * now record what actually happened" moment the authority contract describes (§7).
 */
export function dedupeAttention(
  items: readonly AttentionInput[],
): AssetsTodayData {
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
    items: ordered.slice(0, TODAY_ASSET_ROWS).map((item) => ({
      obligationId: item.obligationId,
      assetId: item.assetId,
      assetTitle: item.assetTitle,
      assetType: item.assetType,
      title: item.title,
      categoryLabel: obligationCategoryLabel(item.category) ?? "Reminder",
      state: item.state,
      stateLabel: OBLIGATION_STATE_LABELS[item.state],
      text: item.text,
      href: `/asset/${item.assetId}?tab=obligations`,
    })),
    trackedAsTasksCount: suppressed,
    overdueCount: visible.filter((item) => item.state === "overdue").length,
  };
}
