/**
 * V2.12 FIN-00 — the budget, and variance in words.
 *
 * A budget is ONE amount, for ONE spending category, for ONE month. That is the
 * whole model.
 *
 * ## What a budget is not
 *
 * Budgets do NOT repeat. There is no template, no rollover, no envelope, no
 * carry-forward and no "budget period" object. The budget screen offers "Copy
 * from <previous month>" as one explicit action that writes rows — simpler than
 * a repetition engine, and it never surprises an owner by having quietly
 * assumed August's grocery budget still applies in December.
 *
 * An INCOME category cannot carry one. "I budget to earn $6,000" is a goal, and
 * DalyHub already has Goals.
 *
 * ## Variance is words and figures, never a score
 *
 *     $420 of $600 · $180 remaining · $75 over
 *
 * No percentage of health, no grade, no composite financial score, no colour
 * carrying meaning on its own (AGENTS.md §15). The figures that produced the
 * sentence are always shown beside it.
 *
 * Pure: no storage, no clock, no JSX.
 */

import { formatMinorUnits } from "~/kernel/money";

/** One budget. */
export interface FinanceBudget {
  readonly id: string;
  readonly workspaceId: string;
  readonly categoryId: string;
  /** `YYYY-MM`. */
  readonly periodMonth: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Input to set (create or replace) one budget. */
export interface SetFinanceBudgetInput {
  readonly categoryId: string;
  readonly periodMonth: string;
  readonly amount: string | number;
  readonly currencyCode: string;
}

/** Where a category's actual spend sits against its budget, in one month. */
export interface BudgetVariance {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly currencyCode: string;
  readonly budgetedMinor: number;
  /** The magnitude of spend, in the budget's currency. Never negative. */
  readonly spentMinor: number;
  /** Positive when under, negative when over. */
  readonly remainingMinor: number;
  readonly state: BudgetState;
  /**
   * Spend in this category in OTHER currencies, which the comparison excluded
   * and which the surface must name. Never converted, never folded in.
   */
  readonly excluded: readonly {
    readonly currencyCode: string;
    readonly minorUnits: number;
    readonly count: number;
  }[];
}

/** How a budget stands. A word, never a colour and never a score. */
export type BudgetState = "under" | "exactly_on" | "over";

/** Where the spend sits. `exactly_on` is its own state, because $600 of $600 is
 * not "over" and calling it over is the kind of small lie that erodes trust. */
export function budgetState(
  budgetedMinor: number,
  spentMinor: number,
): BudgetState {
  if (spentMinor > budgetedMinor) return "over";
  if (spentMinor === budgetedMinor) return "exactly_on";
  return "under";
}

/**
 * The sentence beside a budget: `$420 of $600 · $180 remaining`.
 *
 * Both figures always appear, so the sentence can be checked against the
 * numbers that produced it rather than believed.
 */
export function budgetSentence(
  variance: BudgetVariance,
  locale = "en-AU",
): string {
  const spent = formatMinorUnits(
    variance.spentMinor,
    variance.currencyCode,
    locale,
  );
  const budgeted = formatMinorUnits(
    variance.budgetedMinor,
    variance.currencyCode,
    locale,
  );
  const head = `${spent} of ${budgeted}`;
  if (variance.state === "over") {
    const over = formatMinorUnits(
      -variance.remainingMinor,
      variance.currencyCode,
      locale,
    );
    return `${head} · ${over} over`;
  }
  if (variance.state === "exactly_on") {
    return `${head} · exactly on budget`;
  }
  const remaining = formatMinorUnits(
    variance.remainingMinor,
    variance.currencyCode,
    locale,
  );
  return `${head} · ${remaining} remaining`;
}
