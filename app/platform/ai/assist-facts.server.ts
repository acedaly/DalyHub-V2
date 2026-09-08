/**
 * V2.15 ASSIST — the fact builders behind the two new proposal features.
 *
 * They are builders in exactly the V2.14 sense: deterministic reads through
 * canonical repositories, producing a bounded `FactBlock` that is the WHOLE of
 * what the provider is permitted to know. Nothing here calls a model, nothing
 * here writes, and nothing here accepts a value from a browser.
 *
 * ## What is different about a V2.15 block
 *
 * A V2.14 block exists to be EXPLAINED. A categorisation block exists to be
 * SELECTED FROM, and that changes one thing: the facts are numbered, and the
 * response schema references them by POSITION rather than by id. A model
 * therefore has no field in which to write a DalyHub identifier, which is a
 * stronger guarantee than validating one it wrote.
 *
 * ## The deterministic-first rule lives here
 *
 * `buildFinanceCategorisationFacts` filters out every row the deterministic
 * last-category-for-payee rule already answers, BEFORE the batch is assembled.
 * A payee DalyHub already knows never reaches a provider, is never charged for,
 * and never appears in a proposal — the owner keeps the one-tap deterministic
 * suggestion they already had.
 *
 * ## The third V2.15 feature is deliberately absent
 *
 * A Review reflection draft is grounded by the Weekly Review's OWN fact block,
 * built by `app/modules/ai/review-facts.ts` and unchanged since GROUND-02. The
 * facts a period is explained from and the facts it is reflected on are the
 * same facts; building a second, near-identical block for them would be the
 * kind of duplicate read that eventually disagrees with itself.
 */

import {
  buildFactBlock,
  type FactBlock,
  type FactBound,
  type FactDraft,
  type PrivacyCategory,
} from "~/kernel/ai";
import {
  MONEY_BEARING_CATEGORIES,
  obligationCategoryLabel,
  type Obligation,
} from "~/kernel/obligations";
import { formatMinorUnits } from "~/kernel/money";
import type { WorkspaceScope } from "~/platform/workspaces";
import { readTransactionPage } from "~/platform/finance/finance-facts.server";

/* -------------------------------------------------------------------------- */
/* Finance categorisation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The largest batch one request may carry.
 *
 * Twenty, and the number is a product decision rather than a technical one. It
 * is about as many `current → proposed` rows as an owner can review attentively
 * in one sitting on a phone, and reviewing inattentively is the failure mode
 * this whole architecture exists to prevent. A queue of three hundred rows is
 * cleared in fifteen deliberate passes, not one unread one.
 */
export const MAX_CATEGORISATION_BATCH = 20;

/**
 * The largest category vocabulary one request may carry.
 *
 * Forty. Together with the batch that is exactly the feature's 60-fact ceiling.
 * A workspace with more than forty ACTIVE categories has the excess stated as a
 * bound the answer may not contradict, and the owner keeps the full picker.
 */
export const MAX_CATEGORISATION_OPTIONS = 40;

/**
 * How many uncategorised rows are READ to fill a batch of
 * {@link MAX_CATEGORISATION_BATCH}.
 *
 * More than the batch, because the deterministic filter removes rows: a queue
 * whose first twenty rows are all familiar payees would otherwise produce an
 * empty batch and an honest but useless "nothing to suggest". Bounded all the
 * same — this is one page, not a scan.
 */
const CATEGORISATION_SCAN = 60;

/** One row of the batch, as the SERVER holds it. Never sent as prose. */
export interface CategorisationRow {
  readonly transactionId: string;
  readonly payeeDisplay: string;
  readonly accountTitle: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly occurredOn: string;
}

/** One option of the vocabulary, as the SERVER holds it. */
export interface CategorisationOption {
  readonly categoryId: string;
  readonly name: string;
  readonly kind: "spending" | "income";
}

/** Everything one categorisation request needs, assembled deterministically. */
export interface FinanceCategorisationFacts {
  readonly block: FactBlock;
  /**
   * The batch, IN THE ORDER the facts number it.
   *
   * The response's `rowIndex` is a position in this array, and it is resolved
   * here rather than by the browser — which is what makes a tampered index a
   * refusal rather than a different transaction.
   */
  readonly rows: readonly CategorisationRow[];
  /** The vocabulary, in the order the facts number it. */
  readonly options: readonly CategorisationOption[];
  /**
   * How many rows the deterministic rule already answered and this request
   * therefore did NOT send. Reported to the owner, never hidden: "AI looked at
   * 7 of the 20 rows because DalyHub already knew the other 13" is the honest
   * sentence, and it is also the one that explains the bill.
   */
  readonly deterministicallyAnswered: number;
}

/**
 * Build the facts for one categorisation batch.
 *
 * Statement budget: `readTransactionPage` is two bounded statements (the page,
 * and ONE grouped suggestion read for the whole page — never one per row), plus
 * one for the category list. Three, whatever the batch size.
 */
export async function buildFinanceCategorisationFacts(
  scope: WorkspaceScope,
  input: {
    readonly maxFacts: number;
    /** The owner's allowed privacy categories, for the amount disclosure. */
    readonly allowedCategories: ReadonlySet<PrivacyCategory>;
  },
): Promise<FinanceCategorisationFacts> {
  const finance = scope.finance;

  const [page, categories] = await Promise.all([
    readTransactionPage(finance, {
      categoryId: null,
      limit: CATEGORISATION_SCAN,
    }),
    finance.listCategories({ includeArchived: false }),
  ]);

  /*
   * The deterministic filter, and the whole point of it.
   *
   * `suggestedCategoryId` is the most recent category the OWNER manually
   * confirmed for this payee key. Where it exists, DalyHub already has the
   * answer, offers it as a one-tap button on the row, and learns from the tap.
   * Asking a provider to rediscover it would cost money, disclose a payee and
   * an amount, and arrive at the same answer more slowly and less reliably.
   */
  const unknown = page.items.filter(
    (item) => item.suggestedCategoryId === null,
  );
  const deterministicallyAnswered = page.items.length - unknown.length;

  const rows: readonly CategorisationRow[] = unknown
    .slice(0, MAX_CATEGORISATION_BATCH)
    .map((item) => ({
      transactionId: item.id,
      payeeDisplay: item.payeeDisplay,
      accountTitle: item.accountTitle,
      amountMinor: item.amountMinor,
      currencyCode: item.currencyCode,
      occurredOn: item.occurredOn,
    }));

  const options: readonly CategorisationOption[] = categories
    .slice(0, MAX_CATEGORISATION_OPTIONS)
    .map((category) => ({
      categoryId: category.id,
      name: category.name,
      kind: category.kind,
    }));

  const bounds: FactBound[] = [
    {
      code: "selection",
      text: `Suggest only from the ${options.length} categories listed. There is no other category, and you cannot make one.`,
    },
  ];
  if (deterministicallyAnswered > 0) {
    bounds.push({
      code: "excluded",
      text: `${deterministicallyAnswered} further rows are not listed because DalyHub already knows their category from the owner's own past choices.`,
    });
  }
  if (categories.length > options.length) {
    bounds.push({
      code: "bounded",
      text: "The category list above is not the complete one. Do not say a transaction has no suitable category.",
    });
  }

  /*
   * The facts, in two numbered runs.
   *
   * Categories FIRST, so their positions are stable regardless of how many rows
   * survived the filter — a vocabulary whose numbering moved with the queue
   * would be a vocabulary the owner could not reason about when reading a
   * refusal.
   */
  const facts: FactDraft[] = [
    ...options.map((option, index) => ({
      label: `Category ${index} — ${option.name}`,
      value: {
        kind: "state" as const,
        state: option.kind === "income" ? "Money in" : "Money out",
      },
      display: option.kind === "income" ? "Money in" : "Money out",
    })),
    ...rows.map((row, index) => ({
      label: `Row ${index} — ${row.payeeDisplay} (${row.accountTitle})`,
      value: {
        kind: "money" as const,
        minorUnits: row.amountMinor,
        currencyCode: row.currencyCode,
      },
      display: `${formatMinorUnits(row.amountMinor, row.currencyCode)} on ${row.occurredOn}`,
      reference: {
        kind: "account" as const,
        id: row.transactionId,
        href: `/finance/transactions?open=${encodeURIComponent(row.transactionId)}`,
        label: row.payeeDisplay,
      },
    })),
  ];

  const block = buildFactBlock({
    intent: "finance_categorisation",
    question: "Which category does each of these transactions belong to?",
    subject: "Uncategorised transactions",
    facts,
    bounds,
    currencies: [...new Set(rows.map((row) => row.currencyCode))].sort(),
    /*
     * `financial`, unconditionally.
     *
     * A payee, an account name and an amount are financial content whatever
     * else is true, so the block says so and `runAiRequest` refuses to send it
     * unless the owner has ticked that category. There is no reduced form of
     * this feature that avoids the disclosure — a categorisation request IS the
     * payee — so the honest behaviour when consent is absent is to report the
     * feature unavailable, which is what the surface does.
     */
    categories: ["general", "financial"],
    consideredCount: page.total,
    maxFacts: input.maxFacts,
  });

  // The allowance is read only to assert the block declares what it discloses.
  // The runtime is the enforcer; a builder that enforced it too would be a
  // second consent rule, and two consent rules eventually disagree.
  void input.allowedCategories;

  return { block, rows, options, deterministicallyAnswered };
}

/* -------------------------------------------------------------------------- */
/* Obligation follow-up                                                        */
/* -------------------------------------------------------------------------- */

/** What an obligation follow-up request was assembled from. */
export interface ObligationFollowUpFacts {
  readonly block: FactBlock;
  readonly obligation: Obligation;
  /** Whole days past due, by the owner's calendar. Never negative here. */
  readonly daysOverdue: number;
  /** True when a Task is already open for this obligation. */
  readonly hasOpenTask: boolean;
}

/** Whole days between two owner-calendar days. Pure. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00.000Z`);
  const to = Date.parse(`${toIso}T00:00:00.000Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Build the facts for ONE overdue obligation.
 *
 * Returns `null` when the obligation is not a legitimate subject for a
 * follow-up: missing, in another workspace, deleted, archived, or **not open**.
 * A completed or dismissed obligation needs no follow-up, and V2.14 already
 * fixed the class of bug where one was described as overdue — this reuses that
 * truth rather than restating it.
 *
 * Statement budget: ONE read (`getWithSubject` resolves the subject and the
 * linked Task's open state in the same statement).
 */
export async function buildObligationFollowUpFacts(
  scope: WorkspaceScope,
  input: {
    readonly obligationId: string;
    readonly todayIso: string;
    readonly maxFacts: number;
    readonly allowedCategories: ReadonlySet<PrivacyCategory>;
  },
): Promise<ObligationFollowUpFacts | null> {
  const found = await scope.obligations.getWithSubject(input.obligationId);
  if (found === null) return null;
  const obligation = found.obligation;
  if (obligation.status !== "open") return null;
  if (obligation.deletedAt !== null || obligation.archivedAt !== null) {
    return null;
  }
  if (obligation.dueDate === null) return null;

  const daysOverdue = daysBetween(obligation.dueDate, input.todayIso);
  if (daysOverdue <= 0) return null;

  /*
   * The expected amount is FINANCIAL content, so it travels only when the owner
   * has allowed that category — and the block declares the category only when
   * it actually carries one. A feature that declared `financial` unconditionally
   * would be unavailable to an owner who has not ticked it, for a fact it was
   * not going to send anyway.
   */
  const mayDiscloseMoney =
    input.allowedCategories.has("financial") &&
    obligation.expectedAmountMinor !== null &&
    obligation.currencyCode !== null;

  const facts: FactDraft[] = [
    {
      label: `Obligation — ${obligation.title}`,
      value: { kind: "date", iso: obligation.dueDate },
      display: `due ${obligation.dueDate}`,
      reference: {
        kind: "obligation",
        id: obligation.id,
        href: `/obligations/${encodeURIComponent(obligation.id)}`,
        label: obligation.title,
      },
    },
    {
      label: "Days past due",
      value: { kind: "count", count: daysOverdue },
      display: `${daysOverdue}`,
    },
    {
      label: "What it is",
      value: {
        kind: "state",
        state: obligationCategoryLabel(obligation.category) ?? "Commitment",
      },
      display: obligationCategoryLabel(obligation.category) ?? "Commitment",
    },
    {
      label: "A Task is already open for it",
      value: { kind: "state", state: found.hasOpenTask ? "yes" : "no" },
      display: found.hasOpenTask ? "yes" : "no",
    },
  ];

  if (found.subject !== null) {
    facts.push({
      label: "What it is about",
      value: { kind: "state", state: found.subject.title },
      display: found.subject.title,
    });
  }

  if (mayDiscloseMoney) {
    facts.push({
      label: "Expected amount",
      value: {
        kind: "money",
        minorUnits: obligation.expectedAmountMinor as number,
        currencyCode: obligation.currencyCode as string,
      },
      display: formatMinorUnits(
        obligation.expectedAmountMinor as number,
        obligation.currencyCode as string,
      ),
      note: "Expected, not paid. Nothing here says it has been paid.",
    });
  }

  const bounds: FactBound[] = [
    {
      code: "selection",
      text: "These are the only facts about this commitment. Nothing about who to contact, what was said before, or what has been paid is known.",
    },
  ];
  if (
    !mayDiscloseMoney &&
    MONEY_BEARING_CATEGORIES.includes(obligation.category)
  ) {
    bounds.push({
      code: "excluded",
      text: "Any amount this commitment carries has been withheld. Do not state, guess or ask for one.",
    });
  }

  const categories: readonly PrivacyCategory[] = mayDiscloseMoney
    ? ["general", "financial"]
    : ["general"];

  return {
    block: buildFactBlock({
      intent: "obligation_follow_up",
      question: "What should be done about this overdue commitment?",
      subject: obligation.title,
      facts,
      bounds,
      categories,
      consideredCount: 1,
      maxFacts: input.maxFacts,
    }),
    obligation,
    daysOverdue,
    hasOpenTask: found.hasOpenTask,
  };
}
