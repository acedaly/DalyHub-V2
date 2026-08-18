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

/**
 * CONTROL-01 — a decorative MARK a control option carries, as pure data.
 *
 * A priority filter that lists "Priority 1 … Priority 4" as four identical rows
 * of text is not the priority system the rest of the product speaks: everywhere
 * else a priority is a coloured flag beside a P1–P4 tag, and a picker that drops
 * both is a fifth way of saying the same thing.
 *
 * It is a discriminated DESCRIPTOR rather than a `ReactNode` so this module (and
 * every module that builds control groups) stays React-free and directly
 * testable. The shared control surfaces map the descriptor to the one shared
 * component; nothing here knows what a flag looks like.
 */
export type CollectionControlMark = {
  readonly kind: "priority";
  /** A `TaskPriority` — validated by the surface that renders it. */
  readonly value: string;
};

/** One choice within a control group. */
export type CollectionControlOption = {
  readonly value: string;
  readonly label: string;
  /** Optional supporting line (e.g. what a saved view contains). */
  readonly description?: string;
  /** An optional decorative mark rendered before the label. */
  readonly mark?: CollectionControlMark;
  /**
   * CONTROL-01 — a shorter label for the APPLIED CHIP, where the group heading
   * has already named the dimension.
   *
   * A chip prints "<group>: <value>", so an option whose own label repeats the
   * group's word reads twice: the priority filter drew "Priority: Priority 1".
   * The menu keeps the full label, because there the option stands alone and
   * "P1" beside "P2" is a code rather than a name; the chip takes the short tag,
   * because "Priority: P1" says the same thing once.
   *
   * Optional, and unset means "the label is already the right length".
   */
  readonly chipLabel?: string;
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
  /**
   * SMART-01 — the group accepts MORE THAN ONE of its options at once.
   *
   * Every group was single-select, and one real filter could not be expressed at
   * all: "Priority 1 and 2", which is the first thing an owner reaches for when
   * they save a view called "Work priorities". A multi-select group is still ONE
   * dimension bound to ONE parameter — the selected values are comma-joined, in
   * the group's own option order, so the URL stays legible and two equivalent
   * selections always produce the same link.
   *
   * It is deliberately NOT a general expression builder: there is no operator, no
   * nesting and no second dimension, so nothing about the persisted, declarative
   * filter contract changes (`DESIGN_SYSTEM.md → Shared Filters`).
   *
   * Defaults to single-select, so every existing group is untouched.
   */
  readonly multiple?: boolean;
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

/**
 * The values a group currently holds, as a list.
 *
 * One member for a single-select group, zero or more for a multi-select one.
 * Members that are not options of the group are dropped, so a hand-typed URL
 * cannot put an unknown value into a chip row — the same lenient-degradation rule
 * the view configuration's own parse follows.
 */
export function currentValues(
  group: CollectionControlGroup,
  params: URLSearchParams,
): readonly string[] {
  const raw = currentValue(group, params);
  if (raw === null) return [];
  if (group.multiple !== true) return [raw];
  return splitValues(group, raw);
}

/** Split and canonicalise a multi-select parameter against the group's options. */
function splitValues(
  group: CollectionControlGroup,
  raw: string,
): readonly string[] {
  const wanted = new Set(
    raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  );
  // Ordered by the GROUP's option order, not the URL's, so two equivalent
  // selections are one selection.
  return group.options
    .map((option) => option.value)
    .filter((value) => value.length > 0 && wanted.has(value));
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

/**
 * Set one group's value in the draft.
 *
 * Single-select: selecting the active value clears it (the option row is a toggle,
 * which is how "Any priority" is reachable without a separate control).
 *
 * Multi-select: the value is ADDED to the selection, or removed when it is already
 * in it, and choosing the group's "any" value clears the whole selection. An empty
 * selection is stored as `null`, so it leaves the URL entirely rather than writing
 * an empty parameter that would count as a filter matching nothing.
 */
export function withDraftValue(
  draft: CollectionControlsDraft,
  group: CollectionControlGroup,
  value: string,
): CollectionControlsDraft {
  const fallback = group.defaultValue ?? "";
  if (group.multiple !== true) {
    const next =
      value === fallback || draft[group.param] === value ? null : value;
    return { ...draft, [group.param]: next };
  }
  if (value === fallback) return { ...draft, [group.param]: null };
  const committed = draft[group.param];
  const selected = new Set(
    committed === null || committed === undefined
      ? []
      : splitValues(group, committed),
  );
  if (selected.has(value)) selected.delete(value);
  else selected.add(value);
  const ordered = group.options
    .map((option) => option.value)
    .filter((candidate) => candidate.length > 0 && selected.has(candidate));
  return {
    ...draft,
    [group.param]: ordered.length === 0 ? null : ordered.join(","),
  };
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
    const values = currentValues(group, params);
    if (values.length === 0) continue;
    // A multi-select group summarises as ONE entry naming every value —
    // "Priority: P1, P2" — because the dimension is applied once.
    const labels = values.map((value) => {
      const option = group.options.find((entry) => entry.value === value);
      return option?.chipLabel ?? option?.label ?? value;
    });
    out.push(`${group.label}: ${labels.join(", ")}`);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* TASKS-03 — the SAME model, driving removable chips on the desktop bar        */
/* -------------------------------------------------------------------------- */

/**
 * One applied control, resolved for display. This is what a removable chip renders
 * from, so the desktop chip bar and the phone sheet are two presentations of ONE
 * control model rather than two independent filter surfaces.
 */
export type ActiveCollectionControl = {
  readonly groupId: string;
  readonly param: string;
  /** The group heading, e.g. "Priority". */
  readonly label: string;
  /** The raw applied value (what is in the URL). */
  readonly value: string;
  /** The option's human label, falling back to the raw value. */
  readonly valueLabel: string;
  readonly kind: CollectionControlKind;
  /**
   * SMART-01 — the parameter value REMAINING after this chip is removed, or null
   * when removing it clears the parameter.
   *
   * A single-select chip removes its whole dimension, which is what
   * `withoutControl` does. One of three selected priorities must remove only
   * ITSELF, so the chip carries the value the parameter should be set to instead —
   * the model computes it, so no chip row has to know how a set is encoded.
   */
  readonly remainingValue: string | null;
};

/**
 * Every control currently narrowing or shaping the collection, in group order.
 *
 * `kinds` restricts the result — a chip row usually shows only `filter` controls,
 * because a chip saying "Sort: Due date" invites the user to "remove" their sort,
 * which is not a thing a sort can be.
 */
export function activeControls(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
  kinds: readonly CollectionControlKind[] = ["filter"],
): readonly ActiveCollectionControl[] {
  const out: ActiveCollectionControl[] = [];
  for (const group of groups) {
    const kind = group.kind ?? "filter";
    if (!kinds.includes(kind)) continue;
    const values = currentValues(group, params);
    for (const value of values) {
      const option = group.options.find((entry) => entry.value === value);
      const remaining = values.filter((other) => other !== value);
      out.push({
        groupId: group.id,
        param: group.param,
        label: group.label,
        value,
        valueLabel: option?.chipLabel ?? option?.label ?? value,
        kind,
        remainingValue: remaining.length === 0 ? null : remaining.join(","),
      });
    }
  }
  return out;
}

/**
 * The params with ONE control removed — what a chip's remove control navigates to.
 * Pagination is cleared because the result set widens.
 */
export function withoutControl(
  params: URLSearchParams,
  param: string,
  options: {
    readonly resetParams?: readonly string[];
    /**
     * SMART-01 — what the parameter should hold INSTEAD of being deleted, for a
     * multi-select group where one chip removes one value rather than the whole
     * dimension. Omit (or pass null) to delete the parameter, which is what every
     * single-select chip does and what this function did before.
     */
    readonly remainingValue?: string | null;
  } = {},
): URLSearchParams {
  const next = new URLSearchParams(params);
  const remaining = options.remainingValue ?? null;
  if (remaining === null) next.delete(param);
  else next.set(param, remaining);
  for (const extra of options.resetParams ?? ["cursor"]) {
    next.delete(extra);
  }
  return next;
}

/**
 * The params with EVERY control of the given kinds removed — the explicit "Reset
 * filters" action. Defaults to clearing filters only, so a reset never silently
 * throws away the presentation or the sort the user deliberately chose.
 */
export function withoutControls(
  groups: readonly CollectionControlGroup[],
  params: URLSearchParams,
  kinds: readonly CollectionControlKind[] = ["filter"],
  options: { readonly resetParams?: readonly string[] } = {},
): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const group of groups) {
    if (kinds.includes(group.kind ?? "filter")) {
      next.delete(group.param);
    }
  }
  for (const extra of options.resetParams ?? ["cursor"]) {
    next.delete(extra);
  }
  return next;
}
