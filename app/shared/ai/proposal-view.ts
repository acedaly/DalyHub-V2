/**
 * V2.15 ASSIST — the React-free view model behind ONE proposal review surface.
 *
 * The roadmap's rule, and the reason this file exists rather than three
 * components with three interaction models:
 *
 *   > Do not create FinanceAiSuggestions, ObligationAiCard and
 *   > ReviewAiDraftCard with three separate action semantics.
 *
 * So every V2.15 suggestion is normalised into ONE shape — a
 * {@link ProposalRowDraft} — and the shared surface renders selection,
 * `current → proposed`, the reason, the edit, accept, reject and undo the same
 * way for all of them. Domain-specific RENDERING is fine; domain-specific
 * ACTION SEMANTICS are not, because that is how a product ends up with three
 * different meanings for a tick box.
 *
 * ## Two rules this file exists to enforce
 *
 * **Nothing starts selected.** A proposal panel that arrives with everything
 * ticked is a panel where "Apply selected" means "apply everything I have not
 * yet read". Selection is an act.
 *
 * **A position resolves to an id HERE, and only here.** The provider answers
 * with `rowIndex` and `categoryIndex` — positions in lists DalyHub sent. This
 * file turns them into ids by looking them up in the SAME lists, and drops any
 * suggestion whose position does not resolve. The validator already refused an
 * out-of-range index; this is the second, structural guarantee that a
 * suggestion the owner sees is one about a record DalyHub actually sent.
 */

import type {
  FinanceCategorisationResult,
  ObligationFollowUpResult,
  ProposalKind,
  ReviewReflectionDraftResult,
  AiResult,
} from "~/kernel/ai";

/* -------------------------------------------------------------------------- */
/* The shared row                                                              */
/* -------------------------------------------------------------------------- */

/** One option the owner may switch a proposal to before accepting it. */
export interface ProposalOption {
  readonly id: string;
  readonly label: string;
  /** A short qualifier rendered beside the label ("Money out"). */
  readonly note?: string;
}

/**
 * ONE reviewable suggestion, normalised.
 *
 * `chosenOptionId` is the owner's working copy. It starts as what AI proposed
 * and becomes theirs the moment they change it — at which point the value being
 * applied is OWNER INPUT, validated on the server exactly as any other owner
 * input is.
 */
export interface ProposalRowDraft {
  /** Stable within one proposal. Used as a React key and a selection id. */
  readonly id: string;
  readonly kind: ProposalKind;
  /** What the change is about: a payee, a commitment, a Review section. */
  readonly subject: string;
  /** Where it lives, in the owner's words: an account and a date. */
  readonly context: string | null;
  /** The value TODAY. `null` where the kind creates rather than changes. */
  readonly currentLabel: string | null;
  /** What AI suggested, before any owner edit. */
  readonly proposedLabel: string;
  /** Why, in one sentence, in the model's words. */
  readonly reason: string;
  /** The facts the suggestion cited, so "why this?" resolves to real figures. */
  readonly factIds: readonly string[];
  /**
   * How the owner may CHANGE the suggestion before accepting it.
   *
   *   - `none` — accept it or do not (an obligation follow-up's title is
   *     editable in a later release; for now the Task is created and then
   *     edited like any other Task, which is one fewer place to get wrong);
   *   - `option` — pick from a closed list DalyHub supplied (a category);
   *   - `text` — edit prose (a Review reflection draft).
   *
   * There is deliberately no `field` mode that would let a surface hand the
   * owner an arbitrary editor over an arbitrary key: what is editable is a
   * property of the KIND, and the server re-validates whatever comes back.
   */
  readonly editable: "none" | "option" | "text";
  /** What the owner may switch it to. Empty unless `editable === "option"`. */
  readonly options: readonly ProposalOption[];
  readonly selected: boolean;
  /** The chosen option id, when `editable === "option"`. */
  readonly chosenOptionId: string;
  /** The owner's working copy of the prose, when `editable === "text"`. */
  readonly draftText: string;
}

/** How ONE reviewed row turned out, as the server reported it. */
export interface ProposalRowOutcome {
  readonly ok: boolean;
  readonly outcome: "created" | "updated" | "unchanged" | "stale" | "failed";
  readonly message: string | null;
  /** The payload that reverses it, when there is something to reverse. */
  readonly undo: Record<string, unknown> | null;
}

/** The owner-facing word for an outcome. Never a colour on its own. */
export function proposalOutcomeLabel(outcome: ProposalRowOutcome): string {
  if (!outcome.ok) {
    return outcome.outcome === "stale" ? "Not applied — changed" : "Refused";
  }
  switch (outcome.outcome) {
    case "created":
      return "Added";
    case "updated":
      return "Applied";
    case "unchanged":
      return "Already done";
    default:
      return "Applied";
  }
}

/* -------------------------------------------------------------------------- */
/* Finance categorisation                                                      */
/* -------------------------------------------------------------------------- */

/** One uncategorised row, as the server sent it with the proposal. */
export interface CategorisationRowContext {
  readonly transactionId: string;
  readonly payeeDisplay: string;
  readonly accountTitle: string;
  readonly amountMinor: number;
  readonly currencyCode: string;
  readonly occurredOn: string;
}

/** One category the batch offered, as the server sent it. */
export interface CategorisationOptionContext {
  readonly categoryId: string;
  readonly name: string;
  readonly kind: "spending" | "income";
}

/** What the assist route returns beside a categorisation result. */
export interface CategorisationContext {
  readonly rows: readonly CategorisationRowContext[];
  readonly options: readonly CategorisationOptionContext[];
  readonly deterministicallyAnswered: number;
}

/**
 * Narrow the route's `proposal` payload, or `null`.
 *
 * Deliberately strict: a payload missing either list is refused rather than
 * rendered as an empty one, because a categorisation surface with no options is
 * a surface that silently cannot be edited.
 */
export function asCategorisationContext(
  value: unknown,
): CategorisationContext | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.rows) || !Array.isArray(record.options)) {
    return null;
  }
  return {
    rows: record.rows as readonly CategorisationRowContext[],
    options: record.options as readonly CategorisationOptionContext[],
    deterministicallyAnswered: Number(record.deterministicallyAnswered ?? 0),
  };
}

/** Narrow a result to the categorisation contract. */
export function asCategorisation(
  result: AiResult,
): FinanceCategorisationResult | null {
  return result.kind === "finance_categorisation" ? result : null;
}

/**
 * Turn a validated categorisation answer into reviewable rows.
 *
 * A suggestion whose `rowIndex` or `categoryIndex` does not resolve is DROPPED,
 * not rendered with a blank. The validator already refused an out-of-range
 * index, so reaching this is a bug rather than an attack — and a bug should
 * lose a suggestion, never invent a target.
 */
export function categorisationRows(
  result: FinanceCategorisationResult,
  context: CategorisationContext,
  formatMoney: (minorUnits: number, currencyCode: string) => string,
): readonly ProposalRowDraft[] {
  const options: readonly ProposalOption[] = context.options.map((option) => ({
    id: option.categoryId,
    label: option.name,
    note: option.kind === "income" ? "Money in" : "Money out",
  }));

  return result.suggestions.flatMap((suggestion) => {
    const row = context.rows[suggestion.rowIndex];
    const option = context.options[suggestion.categoryIndex];
    if (row === undefined || option === undefined) return [];
    return [
      {
        id: row.transactionId,
        kind: "transaction_category" as const,
        subject: row.payeeDisplay,
        context: `${row.accountTitle} · ${row.occurredOn} · ${formatMoney(row.amountMinor, row.currencyCode)}`,
        // Uncategorised is `category_id IS NULL`, which is what uncategorised
        // IS. The word is the label, not a category the owner could pick.
        currentLabel: "Uncategorised",
        proposedLabel: option.name,
        reason: suggestion.reason,
        factIds: suggestion.factIds,
        editable: "option" as const,
        options,
        selected: false,
        chosenOptionId: option.categoryId,
        draftText: "",
      },
    ];
  });
}

/** The acceptance payload for one reviewed categorisation row. */
export function categorisationItem(
  row: ProposalRowDraft,
): Record<string, unknown> {
  return {
    kind: "transaction_category",
    transactionId: row.id,
    categoryId: row.chosenOptionId,
    /*
     * What the proposal was generated against. The batch is built from rows
     * whose category is NULL, so this is always null — and it is sent
     * explicitly rather than left out, because the server's stale check
     * compares against what the proposal SAW, and an absent field would mean
     * "no expectation" rather than "expected uncategorised".
     */
    expectedCategoryId: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Obligation follow-up                                                        */
/* -------------------------------------------------------------------------- */

/** What the assist route returns beside a follow-up result. */
export interface FollowUpContext {
  readonly obligationId: string;
  readonly title: string;
  readonly dueDate: string | null;
  readonly daysOverdue: number;
  readonly hasOpenTask: boolean;
}

export function asFollowUpContext(value: unknown): FollowUpContext | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const obligationId = String(record.obligationId ?? "");
  if (obligationId.length === 0) return null;
  return {
    obligationId,
    title: String(record.title ?? ""),
    dueDate: record.dueDate === null ? null : String(record.dueDate ?? ""),
    daysOverdue: Number(record.daysOverdue ?? 0),
    hasOpenTask: record.hasOpenTask === true,
  };
}

export function asFollowUp(result: AiResult): ObligationFollowUpResult | null {
  return result.kind === "obligation_follow_up" ? result : null;
}

/**
 * Turn a validated follow-up answer into reviewable rows.
 *
 * There is no `currentLabel`: this kind CREATES, and rendering "nothing → a
 * Task" as a difference would be noise dressed as information.
 */
export function followUpRows(
  result: ObligationFollowUpResult,
  context: FollowUpContext,
): readonly ProposalRowDraft[] {
  return result.tasks.map((task, index) => ({
    id: `${context.obligationId}:${index}`,
    kind: "obligation_task" as const,
    subject: task.title,
    context:
      context.dueDate === null
        ? context.title
        : `${context.title} · due ${context.dueDate}`,
    currentLabel: null,
    proposedLabel: task.title,
    reason: task.reason,
    factIds: task.factIds,
    editable: "none" as const,
    options: [],
    selected: false,
    chosenOptionId: "",
    draftText: "",
  }));
}

/**
 * The acceptance payload for one reviewed follow-up row.
 *
 * `context` may be `null`, and the item is still built — carrying the KIND and
 * nothing else, which the server refuses as incomplete. That is deliberate and
 * it is why the null case lives here rather than at the call site: a proposal
 * kind is the AI module's vocabulary, and a Finance, Obligations or Reviews
 * surface that typed one would be a module speaking a language that is not its
 * own (asserted by `proposal-apply-authority.test.ts`). Guessing an obligation
 * id from the page instead would be worse still — that is the browser choosing
 * a mutation target.
 */
export function followUpItem(
  row: ProposalRowDraft,
  context: FollowUpContext | null,
): Record<string, unknown> {
  if (context === null) return { kind: "obligation_task" };
  return {
    kind: "obligation_task",
    obligationId: context.obligationId,
    // The owner's own text where they edited it, the model's where they did
    // not. Either way it is re-validated and re-bounded on the server.
    title: row.subject,
  };
}

/* -------------------------------------------------------------------------- */
/* Review reflection                                                           */
/* -------------------------------------------------------------------------- */

/** What the assist route returns beside a reflection draft. */
export interface ReflectionContext {
  readonly reviewId: string;
  readonly sectionId: string;
  readonly currentBody: string;
  /** The section version the draft was generated against. */
  readonly expectedUpdatedAt: string | null;
}

export function asReflectionContext(value: unknown): ReflectionContext | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const reviewId = String(record.reviewId ?? "");
  const sectionId = String(record.sectionId ?? "");
  if (reviewId.length === 0 || sectionId.length === 0) return null;
  return {
    reviewId,
    sectionId,
    currentBody: String(record.currentBody ?? ""),
    expectedUpdatedAt:
      record.expectedUpdatedAt === null ||
      record.expectedUpdatedAt === undefined
        ? null
        : String(record.expectedUpdatedAt),
  };
}

export function asReflection(
  result: AiResult,
): ReviewReflectionDraftResult | null {
  return result.kind === "review_reflection_draft" ? result : null;
}

/**
 * Turn a validated reflection draft into ONE reviewable row.
 *
 * One row, not a list: the draft is whole prose, and a "list of drafts" would
 * be asking the owner to choose between two pieces of writing about their own
 * week, which is a worse question than "is this a useful starting point?".
 *
 * `currentLabel` is a BOUNDED preview of what is there now — enough to see that
 * something would be replaced, short enough that the review surface stays a
 * review surface rather than becoming a diff viewer. The full text is in the
 * editor the owner is already looking at.
 */
export function reflectionRows(
  result: ReviewReflectionDraftResult,
  context: ReflectionContext,
  sectionLabel: string,
): readonly ProposalRowDraft[] {
  if (result.status !== "ok" || result.draft.trim().length === 0) return [];
  const current = context.currentBody.trim();
  return [
    {
      id: `${context.reviewId}:${context.sectionId}`,
      kind: "review_reflection" as const,
      subject: sectionLabel,
      context: null,
      currentLabel:
        current.length === 0
          ? null
          : current.length <= 120
            ? current
            : `${current.slice(0, 119)}…`,
      proposedLabel: result.draft,
      reason:
        current.length === 0
          ? "Your reflection is empty, so nothing would be replaced."
          : "Accepting replaces what is written here. Edit the draft first if you would rather keep some of it.",
      factIds: result.factIds,
      editable: "text" as const,
      options: [],
      selected: false,
      chosenOptionId: "",
      draftText: result.draft,
    },
  ];
}

/**
 * The acceptance payload for a reviewed reflection draft.
 *
 * `body` is what the owner left the editor with. `expectedUpdatedAt` is the
 * version the draft was generated against, and it travels unchanged: the
 * server compares it to what is stored and refuses if the owner has typed since
 * — which is the whole guard, and it must not be recomputed here from anything
 * the browser saw more recently.
 */
export function reflectionItem(
  context: ReflectionContext | null,
  body: string,
): Record<string, unknown> {
  // See `followUpItem` for why the null case is answered here rather than at
  // the call site.
  if (context === null) return { kind: "review_reflection" };
  return {
    kind: "review_reflection",
    reviewId: context.reviewId,
    sectionId: context.sectionId,
    body,
    expectedUpdatedAt: context.expectedUpdatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

/** Apply a patch to one row, by id. Pure. */
export function patchRow(
  rows: readonly ProposalRowDraft[],
  id: string,
  patch: Partial<ProposalRowDraft>,
): readonly ProposalRowDraft[] {
  return rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
}

/** Select or clear EVERY row. An explicit action, never a default. */
export function setAllSelected(
  rows: readonly ProposalRowDraft[],
  selected: boolean,
): readonly ProposalRowDraft[] {
  return rows.map((row) => ({ ...row, selected }));
}

/** The rows the owner has actually chosen. */
export function selectedRows(
  rows: readonly ProposalRowDraft[],
): readonly ProposalRowDraft[] {
  return rows.filter((row) => row.selected);
}

/**
 * The sentence under the Apply control.
 *
 * It states the COUNT, always, because "Apply selected" over a list the owner
 * has scrolled past is exactly where a bulk action becomes an accident.
 */
export function applySummary(rows: readonly ProposalRowDraft[]): string {
  const count = selectedRows(rows).length;
  if (count === 0) return "Nothing selected.";
  return count === 1 ? "1 change selected." : `${count} changes selected.`;
}
