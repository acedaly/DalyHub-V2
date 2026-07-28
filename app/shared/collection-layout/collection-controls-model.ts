/**
 * MOBILE-01 — the shared mobile collection-controls model (pure, React-free).
 *
 * On a phone a collection cannot afford several permanent rows of chrome: a Pane
 * Header, a view switcher, a system-view chip rail and a filter bar is four rows
 * before a single record appears. MOBILE-01 keeps ONE row on the phone — a Filter
 * button carrying its active count, and a Sort/View menu — and moves the rest into
 * one shared sheet.
 *
 * This module owns the part of that which is genuinely logic, so it is tested
 * without a DOM or a router:
 *   - the DRAFT: the sheet edits a copy, so tapping options does not fire a
 *     navigation per tap and closing without Apply discards nothing already
 *     committed;
 *   - APPLY: the draft becomes exactly ONE URL update (never one per control);
 *   - RESET: an explicit, complete clear of every control the sheet manages —
 *     never a silent partial reset;
 *   - the ACTIVE COUNT shown on the Filter button before the sheet is opened, so
 *     a filtered collection never looks unfiltered.
 *
 * Every control is URL-backed, so filter, sort, grouping and saved-view state stay
 * shareable, restorable and Back/Forward-correct exactly as on desktop — the sheet
 * is a different way to reach the same state, never a second state store.
 */

/** One choice within a control group. */
export type CollectionControlOption = {
  readonly value: string;
  readonly label: string;
  /** Optional supporting line (e.g. what a saved view contains). */
  readonly description?: string;
};

/**
 * What a control group DOES, which decides whether it counts as a "filter" on the
 * Filter button. Sorting or changing density does not make a collection filtered,
 * and pretending otherwise would make the badge meaningless.
 */
export type CollectionControlKind =
  "filter" | "sort" | "group" | "display" | "view";

/** A labelled, single-select group of options bound to one URL search param. */
export type CollectionControlGroup = {
  readonly id: string;
  /** The visible group heading in the sheet. */
  readonly label: string;
  /** The URL search parameter this group writes. */
  readonly param: string;
  readonly options: readonly CollectionControlOption[];
  /**
   * The value that means "not set". Selecting it REMOVES the param, so a default
   * never appears in the URL and never counts toward the active-filter badge.
   * Defaults to the empty string.
   */
  readonly defaultValue?: string;
  /** Defaults to `filter`. */
  readonly kind?: CollectionControlKind;
};

/** The sheet's editable draft: param → selected value (or null for "not set"). */
export type CollectionControlsDraft = Readonly<Record<string, string | null>>;

/** The value a group currently holds, normalised against its default. */
export function currentValue(
  group: CollectionControlGroup,
  params: URLSearchParams,
): string | null {
  const raw = params.get(group.param);
  const fallback = group.defaultValue ?? "";
  if (raw === null || raw.length === 0 || raw === fallback) {
    return null;
  }
  return raw;
}

/** Seed a draft from the committed URL state. */
export function draftFromParams(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
): CollectionControlsDraft {
  const draft: Record<string, string | null> = {};
  for (const group of groups) {
    draft[group.param] = currentValue(group, params);
  }
  return draft;
}

/** Set one group's value in the draft (selecting the active value clears it). */
export function withDraftValue(
  draft: CollectionControlsDraft,
  group: CollectionControlGroup,
  value: string,
): CollectionControlsDraft {
  const fallback = group.defaultValue ?? "";
  const next =
    value === fallback || draft[group.param] === value ? null : value;
  return { ...draft, [group.param]: next };
}

/** A draft with every managed control cleared — the explicit Reset. */
export function emptyDraft(
  groups: readonly CollectionControlGroup[],
): CollectionControlsDraft {
  const draft: Record<string, string | null> = {};
  for (const group of groups) {
    draft[group.param] = null;
  }
  return draft;
}

/**
 * Apply a draft to the committed params, producing the ONE next URL state.
 *
 * Params the sheet does not manage are preserved untouched (a Drawer key, a tab),
 * and pagination is reset because the result set has changed — leaving a stale
 * cursor would show page two of a query that no longer exists.
 */
export function applyDraft(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
  draft: CollectionControlsDraft,
  options: { readonly resetParams?: readonly string[] } = {},
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const group of groups) {
    const value = draft[group.param] ?? null;
    if (value === null) {
      next.delete(group.param);
    } else {
      next.set(group.param, value);
    }
  }
  for (const param of options.resetParams ?? ["cursor"]) {
    next.delete(param);
  }
  return next;
}

/**
 * How many FILTER controls are currently narrowing the collection. Shown on the
 * Filter button so an active filter is visible before the sheet is opened —
 * a phone user must never wonder why a list looks short.
 */
export function activeFilterCount(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
): number {
  return groups.filter(
    (group) =>
      (group.kind ?? "filter") === "filter" &&
      currentValue(group, params) !== null,
  ).length;
}

/** True when the draft differs from what is committed (enables Apply). */
export function draftIsDirty(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
  draft: CollectionControlsDraft,
): boolean {
  return groups.some(
    (group) => (draft[group.param] ?? null) !== currentValue(group, params),
  );
}

/**
 * The concise summary of what is applied, for the Filter button and the phone
 * header's context line (e.g. `Priority: P1 · Sector: This week`). Empty when
 * nothing is applied.
 */
export function activeSummary(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
): readonly string[] {
  const out: string[] = [];
  for (const group of groups) {
    const value = currentValue(group, params);
    if (value === null) {
      continue;
    }
    const option = group.options.find((entry) => entry.value === value);
    out.push(`${group.label}: ${option?.label ?? value}`);
  }
  return out;
}
