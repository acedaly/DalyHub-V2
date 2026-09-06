/**
 * V2.12 FIN-00 — the Finance category vocabulary.
 *
 * Categories are STRUCTURE, not tags (ADR-113's non-goal). A tag is a word the
 * owner sprinkles; a category is the axis every money question in this product
 * is asked along, and it has to be closed enough that a total means something.
 *
 * ## One level, and no parent column
 *
 * The V2.9 strategy proposed "one level of parent". This pass cut the parent
 * entirely, because nothing in V2.12 rolls a child into a parent: the month
 * reads flat categories, the budget is per category, the picker is one list. A
 * column no code reads is exactly the debt AGENTS.md §9.8 refuses. Adding a
 * parent later is additive and is recorded as a later item.
 *
 * ## What is NOT a category
 *
 *   - **Transfer.** A transfer is `transfer_group_id` on both legs. A category
 *     can be applied to one leg and not the other, which is precisely how spend
 *     gets inflated by exactly one leg with nothing noticing; a group id written
 *     to both legs in one statement cannot be half-applied.
 *   - **Uncategorised.** Uncategorised is `category_id IS NULL`. A row can be
 *     renamed, archived or deleted, and each of those makes "what is
 *     uncategorised?" a different question. `NULL` cannot be edited.
 *
 * ## `kind` is what makes the totals structural
 *
 * A category is `spending` or `income`, and that one field is why "income is not
 * spending" and "a refund reduces spend" are properties of the query rather than
 * a name check somebody has to remember. It is IMMUTABLE after creation:
 * changing it would silently rewrite every month the category appears in.
 *
 * Pure: no storage, no clock, no JSX.
 */

/** What kind of money a category describes. */
export const FINANCE_CATEGORY_KINDS = ["spending", "income"] as const;

export type FinanceCategoryKind = (typeof FINANCE_CATEGORY_KINDS)[number];

/** Narrow an untrusted value to a category kind. */
export function isFinanceCategoryKind(
  value: unknown,
): value is FinanceCategoryKind {
  return (
    typeof value === "string" &&
    (FINANCE_CATEGORY_KINDS as readonly string[]).includes(value)
  );
}

export const FINANCE_CATEGORY_KIND_LABELS: Readonly<
  Record<FinanceCategoryKind, string>
> = {
  spending: "Money out",
  income: "Money in",
};

/** One category. */
export interface FinanceCategory {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  /** Case-folded, unique per workspace. Never rendered. */
  readonly nameKey: string;
  readonly kind: FinanceCategoryKind;
  readonly isBuiltin: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * The case-folded key two spellings of one word share.
 *
 * The same rule the tag vocabulary uses (ADR-113): lower-cased, whitespace
 * collapsed, trimmed. `Groceries`, `groceries` and ` GROCERIES ` are one
 * category, and the owner's own spelling is what is stored and shown.
 */
export function financeCategoryKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

/**
 * The starter set, seeded in the SAME batch as the first account a workspace
 * ever creates, and never again.
 *
 * Twelve categories. Small, unopinionated, entirely renameable and entirely
 * deletable. It exists so a first import has somewhere to land — the alternative
 * is an owner who imports 300 rows and then has to invent a taxonomy before they
 * can categorise one — and it is deliberately not a lifestyle taxonomy baked
 * into the kernel.
 */
export const FINANCE_STARTER_CATEGORIES: readonly {
  readonly name: string;
  readonly kind: FinanceCategoryKind;
}[] = [
  { name: "Groceries", kind: "spending" },
  { name: "Dining", kind: "spending" },
  { name: "Transport", kind: "spending" },
  { name: "Housing", kind: "spending" },
  { name: "Utilities", kind: "spending" },
  { name: "Insurance", kind: "spending" },
  { name: "Health", kind: "spending" },
  { name: "Entertainment", kind: "spending" },
  { name: "Shopping", kind: "spending" },
  { name: "Education", kind: "spending" },
  { name: "Fees", kind: "spending" },
  { name: "Income", kind: "income" },
];

/** Input to create a category. `kind` is required and can never change. */
export interface CreateFinanceCategoryInput {
  readonly name: string;
  readonly kind: string;
}

/**
 * Input to edit a category.
 *
 * `kind` is absent on purpose: flipping Groceries from spending to income would
 * silently rewrite every month it appears in, turning historical spend into
 * historical income with no record that anything happened. An owner who
 * created it with the wrong kind archives it and creates the right one.
 */
export interface UpdateFinanceCategoryInput {
  readonly name?: string;
  readonly sortOrder?: number;
}
