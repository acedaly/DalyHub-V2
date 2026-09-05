/**
 * V2.10 LIFE-00 Obligations kernel — the closed category vocabulary.
 *
 * What kind of commitment this is. A CLOSED set of stable stored keys, never
 * tags (ADR-113's non-goal) and never owner-administered: the set is structure,
 * and structure the owner can extend is a tag vocabulary wearing a different
 * name.
 *
 * THIRTEEN KEYS. The nine `asset_obligations` shipped with are carried across
 * UNCHANGED and UNCOERCED — they drive the Assets module's canonical-fact
 * bridge, so renaming or merging one would silently move an Asset's dates —
 * and V2.10 LIFE-01 adds the four life shapes the nine could not express:
 *
 *   - `bill`         a recurring charge for something already consumed
 *   - `subscription` a standing payment for continued access (a MEMBERSHIP is
 *                    this; its label says so rather than being a fourteenth key)
 *   - `fee`          a charge that is neither consumption nor access — school
 *                    fees, strata, body corporate
 *   - `tax`          a tax payment or lodgement (a FILING is this, for the same
 *                    reason)
 *
 * `appointment` is deliberately absent. A booked appointment is a Meeting or an
 * external calendar event; an appointment that needs booking is already
 * expressible. Adding it would put a fourth surface in front of a question two
 * domains already answer (ADR-118).
 *
 * The set matches `obligation_details_category_valid` in migration 0050
 * exactly, so this vocabulary can never accept a category the store refuses.
 *
 * DISPLAY LABELS ARE HELD SEPARATELY from the persisted keys, on purpose: a
 * label may be widened ("Licence, permit or passport renewal") without a
 * migration, and a wider label is what stops a narrow key from growing a
 * fourteenth sibling.
 */

/** What kind of future commitment this is. Closed, stable stored keys. */
export const OBLIGATION_CATEGORIES = [
  "registration",
  "warranty",
  "insurance",
  "licence",
  "service",
  "inspection",
  "maintenance",
  "replacement",
  "reminder",
  "bill",
  "subscription",
  "fee",
  "tax",
] as const;

export type ObligationCategory = (typeof OBLIGATION_CATEGORIES)[number];

/** Every category, in display order, with its owner-facing label. */
export const OBLIGATION_CATEGORY_OPTIONS: readonly {
  readonly value: ObligationCategory;
  readonly label: string;
}[] = [
  { value: "registration", label: "Registration renewal" },
  { value: "insurance", label: "Insurance renewal" },
  { value: "licence", label: "Licence, permit or passport renewal" },
  { value: "subscription", label: "Subscription or membership" },
  { value: "bill", label: "Bill" },
  { value: "fee", label: "Fee" },
  { value: "tax", label: "Tax or lodgement" },
  { value: "service", label: "Scheduled service" },
  { value: "inspection", label: "Inspection" },
  { value: "maintenance", label: "Maintenance" },
  { value: "warranty", label: "Warranty expiry" },
  { value: "replacement", label: "Replacement" },
  { value: "reminder", label: "Other" },
];

/**
 * The categories that usually cost money, in the sense that a surface may offer
 * an amount field without the owner having asked for one. It is a DISPLAY hint
 * and nothing else: every category accepts an amount, and none requires one — a
 * filing may be free and a service may not.
 */
export const MONEY_BEARING_CATEGORIES: readonly ObligationCategory[] = [
  "bill",
  "subscription",
  "fee",
  "tax",
  "registration",
  "insurance",
  "licence",
  "service",
];

const CATEGORY_LABELS = new Map<string, string>(
  OBLIGATION_CATEGORY_OPTIONS.map((c) => [c.value, c.label]),
);

/** The owner-facing label for a category, or null when unknown. */
export function obligationCategoryLabel(value: string | null): string | null {
  return value ? (CATEGORY_LABELS.get(value) ?? null) : null;
}

/** True when `value` is a supported obligation category. */
export function isObligationCategory(
  value: unknown,
): value is ObligationCategory {
  return (
    typeof value === "string" &&
    (OBLIGATION_CATEGORIES as readonly string[]).includes(value)
  );
}
