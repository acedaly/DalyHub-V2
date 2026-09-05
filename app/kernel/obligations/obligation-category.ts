/**
 * V2.10 LIFE-00 Obligations kernel — the closed category vocabulary.
 *
 * What kind of commitment this is. A CLOSED set of stable stored keys, never
 * tags (ADR-113's non-goal) and never owner-administered: the set is structure,
 * and structure the owner can extend is a tag vocabulary wearing a different
 * name.
 *
 * The keys are the nine `asset_obligations` shipped with, carried across
 * UNCHANGED and UNCOERCED — they drive the Assets module's canonical-fact
 * bridge, so renaming or merging one would silently move an Asset's dates.
 * V2.10 LIFE-01 adds the four life shapes (`bill`, `subscription`, `fee`,
 * `tax`) together with the database CHECK that admits them, so this vocabulary
 * can never accept a category the store refuses.
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
] as const;

export type ObligationCategory = (typeof OBLIGATION_CATEGORIES)[number];

/** Every category, in display order, with its owner-facing label. */
export const OBLIGATION_CATEGORY_OPTIONS: readonly {
  readonly value: ObligationCategory;
  readonly label: string;
}[] = [
  { value: "service", label: "Scheduled service" },
  { value: "registration", label: "Registration renewal" },
  { value: "insurance", label: "Insurance renewal" },
  { value: "warranty", label: "Warranty expiry" },
  { value: "licence", label: "Licence or permit renewal" },
  { value: "inspection", label: "Inspection" },
  { value: "maintenance", label: "Maintenance" },
  { value: "replacement", label: "Replacement" },
  { value: "reminder", label: "Custom reminder" },
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
