/**
 * UIX-05 — the People CIRCLE: the one lens the People collection is read through.
 *
 * People has thirteen relationship values (`PERSON_RELATIONSHIPS`), which is the
 * right vocabulary for a record — "Mentee" and "Supplier" are genuinely different
 * things to be — and exactly the wrong one for a collection. Thirteen tabs is not
 * a view rail, and a thirteen-value select is a filter nobody opens. Before this
 * pass the relationship reached the screen as one grey word in a run of metadata,
 * so the People list answered "who is in my life?" with an alphabetised directory
 * and no shape at all.
 *
 * A CIRCLE is the same vocabulary at collection altitude: which part of a life
 * this person belongs to. Three of them, plus the honest fourth case:
 *
 *   Personal   family, friend                       — the people, not the roles
 *   Work       colleague, manager, direct report,   — the working relationships,
 *              mentor, mentee, customer, supplier     in both directions
 *   Services   professional, government, emergency, — the people a life needs
 *              volunteer                              rather than chooses
 *   —          no relationship recorded             — an ABSENCE, never a circle
 *
 * Two rules, both of which the rest of the product already follows:
 *
 * 1. **The circle is derived, never stored.** It is a pure function of the
 *    relationship the owner already chose, so there is no second vocabulary to
 *    keep in step, no migration, and no way for the two to disagree. Change the
 *    relationship and the circle follows.
 * 2. **An absence is not a circle.** A Person with no relationship recorded is
 *    not "Other" — they are someone the owner has not classified, which is a
 *    different fact and is stated as one. They appear under All and nowhere else,
 *    and the row says nothing rather than inventing a category for them.
 *
 * The circle also supplies the row's identity accent (see `PersonAvatar`), which
 * is the same rule a Goal follows for its Area (D21/D22): identity comes from a
 * real classification the owner made, never from a hash of an id.
 */

import type { PersonRelationship } from "~/kernel/people";

/** The three circles. `null` is the absence, and is deliberately not a member. */
export type PersonCircle = "personal" | "work" | "services";

export const PERSON_CIRCLES: readonly {
  readonly value: PersonCircle;
  readonly label: string;
  /** The collection rail's wording — a place, not a category name. */
  readonly railLabel: string;
  /**
   * The identity rank this circle paints with, on the shared `area-accent-*`
   * identity ramp (D22). Fixed rather than positional, so a circle keeps its
   * colour whatever order the rail is drawn in.
   */
  readonly colourRank: number;
}[] = [
  {
    value: "personal",
    label: "Personal",
    railLabel: "Personal",
    colourRank: 3,
  },
  { value: "work", label: "Work", railLabel: "Work", colourRank: 0 },
  {
    value: "services",
    label: "Services",
    railLabel: "Services",
    colourRank: 4,
  },
];

/*
 * Exhaustive over `PersonRelationship`, so adding a relationship value fails the
 * build here rather than silently dropping the People who hold it out of every
 * circle.
 *
 * `other` maps to `null` on purpose. It is a real choice the owner made and it
 * is not a place: "Other" means "none of these", so putting it in a circle would
 * be inventing the classification the owner declined to make. Those People
 * appear under All, which is exactly where "I have not decided" belongs.
 */
const CIRCLE_OF: Readonly<Record<PersonRelationship, PersonCircle | null>> = {
  family: "personal",
  friend: "personal",
  colleague: "work",
  manager: "work",
  direct_report: "work",
  mentor: "work",
  mentee: "work",
  customer: "work",
  supplier: "work",
  professional: "services",
  government: "services",
  emergency: "services",
  volunteer: "services",
  other: null,
};

const CIRCLE_LABELS = new Map<PersonCircle, string>(
  PERSON_CIRCLES.map((circle) => [circle.value, circle.label]),
);

const CIRCLE_RANKS = new Map<PersonCircle, number>(
  PERSON_CIRCLES.map((circle) => [circle.value, circle.colourRank]),
);

/** The circle a relationship belongs to, or `null` when none was recorded. */
export function personCircle(
  relationship: PersonRelationship | null,
): PersonCircle | null {
  return relationship === null ? null : (CIRCLE_OF[relationship] ?? null);
}

/** The circle's display label, or `null` for the absence. */
export function personCircleLabel(circle: PersonCircle | null): string | null {
  return circle === null ? null : (CIRCLE_LABELS.get(circle) ?? null);
}

/**
 * The identity rank the circle paints with, or `null` for the absence — which
 * renders the neutral container rather than an arbitrary colour, exactly as an
 * Area-less Project does.
 */
export function personCircleRank(circle: PersonCircle | null): number | null {
  return circle === null ? null : (CIRCLE_RANKS.get(circle) ?? null);
}

/** Narrow an untrusted query-string value to a circle, or `null`. */
export function parsePersonCircle(value: string | null): PersonCircle | null {
  return PERSON_CIRCLES.some((circle) => circle.value === value)
    ? (value as PersonCircle)
    : null;
}
