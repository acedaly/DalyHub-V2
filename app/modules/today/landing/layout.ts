/**
 * TODAY-08 — the Today landing personalisation model (pure, React-free).
 *
 * Today is DalyHub's command centre: a set of widgets the owner can collapse,
 * hide, pin and reorder, with the arrangement remembered between visits. This
 * module owns the WIDGET CATALOGUE and the pure state transitions over a
 * `TodayLayout`; the React hook (`useTodayLayout`) and the widget chrome
 * (`TodayWidget`) consume it. Keeping the model here (no React, no storage, no
 * DOM) means every rule — the canonical order, that pinned widgets lead, that an
 * unknown persisted id is dropped and a newly-shipped widget is appended — is
 * unit-testable in isolation and can never drift between surfaces.
 *
 * The layout is a UI PREFERENCE, not workspace data: it is per-device and holds
 * no entity content, so it is persisted client-side (localStorage) rather than in
 * the server-derived workspace (ADR-016 §5.6 keeps the *workspace* server-derived;
 * a cosmetic per-device arrangement is deliberately not workspace state). Nothing
 * here reads or writes storage — persistence is the hook's concern.
 */

/** Every personalisable widget on the Today landing surface. Stable ids. */
export const TODAY_WIDGET_IDS = [
  "morning-brief",
  "my-day",
  "recent-activity",
  "diary",
  "notes",
  "projects",
  "areas",
  "goals",
  "focus",
  "insights",
  "quick-capture",
] as const;

export type TodayWidgetId = (typeof TODAY_WIDGET_IDS)[number];

/** A widget's static definition — its title and whether it may be hidden. */
export interface TodayWidgetDefinition {
  readonly id: TodayWidgetId;
  /** The section label / accessible name. */
  readonly title: string;
  /**
   * A one-line description shown in the "Customise" panel so the owner knows what
   * a hidden widget would restore.
   */
  readonly description: string;
}

/**
 * The catalogue in its CANONICAL order — the calm, sensible default arrangement a
 * first-time owner sees, top to bottom: orient (brief), execute (my day), then the
 * surrounding context and capture surfaces. Personalisation reorders/toggles over
 * this; a reset returns to exactly this order with everything visible.
 */
export const TODAY_WIDGETS: readonly TodayWidgetDefinition[] = [
  {
    id: "morning-brief",
    title: "Morning brief",
    description: "Greeting, date, focus and what needs attention right now.",
  },
  {
    id: "my-day",
    title: "My day",
    description: "Today's planned, overdue, upcoming and backlog tasks.",
  },
  {
    id: "recent-activity",
    title: "Recent activity",
    description: "A unified timeline of recent changes across DalyHub.",
  },
  {
    id: "diary",
    title: "Diary",
    description: "Today's journal entry and recent moments.",
  },
  {
    id: "notes",
    title: "Notes",
    description: "Recently created notes to continue writing.",
  },
  {
    id: "projects",
    title: "Continue working",
    description: "Active projects, most recently touched first.",
  },
  {
    id: "areas",
    title: "Areas",
    description: "A calm health summary across your areas of life.",
  },
  {
    id: "goals",
    title: "Goals",
    description: "Goals in progress and whether recent action matches them.",
  },
  {
    id: "focus",
    title: "Focus",
    description: "Deep-work, focus mode and a Pomodoro timer (coming soon).",
  },
  {
    id: "insights",
    title: "Insights",
    description: "Overdue, waiting, stalled and at-risk signals at a glance.",
  },
  {
    id: "quick-capture",
    // "Capture" (not "Quick capture") so the widget heading never collides with the
    // pane header's one primary "Quick capture" action.
    title: "Capture",
    description: "Capture a task, note or thought without leaving Today.",
  },
];

const WIDGET_BY_ID: ReadonlyMap<TodayWidgetId, TodayWidgetDefinition> = new Map(
  TODAY_WIDGETS.map((widget) => [widget.id, widget]),
);

/** Look up a widget definition by id (null for an unknown id). */
export function getTodayWidget(id: string): TodayWidgetDefinition | null {
  return WIDGET_BY_ID.get(id as TodayWidgetId) ?? null;
}

/**
 * The owner's arrangement of the Today surface. `order` is the full set of widget
 * ids in display order; `hidden`, `collapsed` and `pinned` are subsets by id.
 * Pinned widgets are floated to the top (in their relative order) at render time —
 * the underlying `order` is preserved so unpinning restores the prior position.
 */
export interface TodayLayout {
  readonly order: readonly TodayWidgetId[];
  readonly hidden: readonly TodayWidgetId[];
  readonly collapsed: readonly TodayWidgetId[];
  readonly pinned: readonly TodayWidgetId[];
}

/** The default layout: canonical order, everything visible, nothing pinned. */
export function defaultTodayLayout(): TodayLayout {
  return {
    order: TODAY_WIDGETS.map((widget) => widget.id),
    hidden: [],
    collapsed: [],
    pinned: [],
  };
}

/**
 * Normalise an arbitrary (possibly stale or hand-edited) layout into a valid one:
 * drop unknown ids, de-duplicate, and APPEND any widget the running build ships
 * that the persisted order lacks (so a new widget appears rather than vanishing).
 * Subsets are filtered to ids that survive in `order`. This is the single guard
 * every load path runs through, so the rest of the model can assume validity.
 */
export function normaliseTodayLayout(
  input: Partial<TodayLayout> | null | undefined,
): TodayLayout {
  const known = new Set(TODAY_WIDGET_IDS);
  const seen = new Set<TodayWidgetId>();
  const order: TodayWidgetId[] = [];
  for (const id of input?.order ?? []) {
    if (known.has(id as TodayWidgetId) && !seen.has(id as TodayWidgetId)) {
      seen.add(id as TodayWidgetId);
      order.push(id as TodayWidgetId);
    }
  }
  // Append newly-shipped widgets (present in the catalogue, absent from storage)
  // in their canonical position so the surface never silently loses a section.
  for (const widget of TODAY_WIDGETS) {
    if (!seen.has(widget.id)) {
      order.push(widget.id);
    }
  }
  const subset = (ids: readonly TodayWidgetId[] | undefined): TodayWidgetId[] =>
    [...new Set(ids ?? [])].filter((id) => seen.has(id) || order.includes(id));
  return {
    order,
    hidden: subset(input?.hidden),
    collapsed: subset(input?.collapsed),
    pinned: subset(input?.pinned),
  };
}

/** Toggle membership of `id` in a subset, returning a new array. */
function toggleMember(
  subset: readonly TodayWidgetId[],
  id: TodayWidgetId,
): TodayWidgetId[] {
  return subset.includes(id)
    ? subset.filter((member) => member !== id)
    : [...subset, id];
}

export function toggleCollapsed(
  layout: TodayLayout,
  id: TodayWidgetId,
): TodayLayout {
  return { ...layout, collapsed: toggleMember(layout.collapsed, id) };
}

export function toggleHidden(
  layout: TodayLayout,
  id: TodayWidgetId,
): TodayLayout {
  // Hiding a widget also drops it from `pinned` (a hidden widget can't lead the
  // surface); showing it again keeps its place in `order`.
  const hidden = toggleMember(layout.hidden, id);
  const nowHidden = hidden.includes(id);
  return {
    ...layout,
    hidden,
    pinned: nowHidden
      ? layout.pinned.filter((member) => member !== id)
      : layout.pinned,
  };
}

export function togglePinned(
  layout: TodayLayout,
  id: TodayWidgetId,
): TodayLayout {
  // Pinning a hidden widget shows it (you can't pin what you can't see).
  const pinned = toggleMember(layout.pinned, id);
  const nowPinned = pinned.includes(id);
  return {
    ...layout,
    pinned,
    hidden: nowPinned
      ? layout.hidden.filter((member) => member !== id)
      : layout.hidden,
  };
}

/**
 * The RENDERED (visible) sequence of widget ids in the SAME pin group as `id` —
 * i.e. the sequence a Move up/down actually reorders. Because pinned widgets always
 * float above non-pinned ones, a move only ever changes order WITHIN a group;
 * hidden widgets are not rendered and so are skipped. Returns `null` for a hidden or
 * unknown id (nothing to move).
 */
function visibleGroupOf(
  layout: TodayLayout,
  id: TodayWidgetId,
): readonly TodayWidgetId[] | null {
  const hidden = new Set(layout.hidden);
  if (hidden.has(id) || !layout.order.includes(id)) {
    return null;
  }
  const pinned = new Set(layout.pinned);
  const sameGroup = pinned.has(id);
  return layout.order.filter(
    (member) => !hidden.has(member) && pinned.has(member) === sameGroup,
  );
}

/**
 * Move a widget one step earlier/later **within the rendered sequence** (its pin
 * group), by swapping it with its adjacent VISIBLE, same-group neighbour in `order`.
 * Operating on the rendered sequence — not raw `order` — means a Move up/down always
 * produces a visible change (or is a clamped no-op at a group boundary), never a
 * silent no-op caused by an intervening pinned or hidden widget.
 */
export function moveWidget(
  layout: TodayLayout,
  id: TodayWidgetId,
  direction: "up" | "down",
): TodayLayout {
  const group = visibleGroupOf(layout, id);
  if (group === null) {
    return layout;
  }
  const withinGroup = group.indexOf(id);
  const neighbourIndex = direction === "up" ? withinGroup - 1 : withinGroup + 1;
  if (neighbourIndex < 0 || neighbourIndex >= group.length) {
    return layout;
  }
  const neighbour = group[neighbourIndex]!;
  const order = [...layout.order];
  const a = order.indexOf(id);
  const b = order.indexOf(neighbour);
  [order[a], order[b]] = [order[b]!, order[a]!];
  return { ...layout, order };
}

/** A widget resolved for rendering: its definition plus its live UI state. */
export interface ResolvedTodayWidget {
  readonly definition: TodayWidgetDefinition;
  readonly collapsed: boolean;
  readonly pinned: boolean;
  /** Its index within the visible list (for "move up/down" boundaries). */
  readonly position: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}

/**
 * Resolve a layout into the ORDERED, VISIBLE widgets to render: pinned widgets
 * first (in their relative `order`), then the rest (in `order`), with hidden
 * widgets removed. Pure — the render order is a deterministic function of the
 * layout, so it is stable across renders and reproducible in tests.
 */
export function resolveVisibleWidgets(
  layout: TodayLayout,
): readonly ResolvedTodayWidget[] {
  const hidden = new Set(layout.hidden);
  const pinned = new Set(layout.pinned);
  const collapsed = new Set(layout.collapsed);
  const visible = layout.order.filter((id) => !hidden.has(id));
  const pinnedGroup = visible.filter((id) => pinned.has(id));
  const unpinnedGroup = visible.filter((id) => !pinned.has(id));
  const ordered = [...pinnedGroup, ...unpinnedGroup];
  return ordered.map((id, position) => {
    // `isFirst`/`isLast` reflect movability WITHIN the widget's pin group (a move
    // never crosses the pin boundary), so the Move up/down controls are disabled
    // exactly when they could not change the rendered order.
    const group = pinned.has(id) ? pinnedGroup : unpinnedGroup;
    const withinGroup = group.indexOf(id);
    return {
      definition: WIDGET_BY_ID.get(id)!,
      collapsed: collapsed.has(id),
      pinned: pinned.has(id),
      position,
      isFirst: withinGroup === 0,
      isLast: withinGroup === group.length - 1,
    };
  });
}

/** The widgets currently hidden (for the "Customise" restore list), in order. */
export function resolveHiddenWidgets(
  layout: TodayLayout,
): readonly TodayWidgetDefinition[] {
  const hidden = new Set(layout.hidden);
  return layout.order
    .filter((id) => hidden.has(id))
    .map((id) => WIDGET_BY_ID.get(id)!);
}

/** The current persistence schema version — bump to invalidate old snapshots. */
export const TODAY_LAYOUT_VERSION = 1;

/** The localStorage key the hook persists under (per device). */
export const TODAY_LAYOUT_STORAGE_KEY = "dh.today.layout.v1";

interface StoredLayout {
  readonly version: number;
  readonly layout: TodayLayout;
}

/** Serialise a layout for storage (with its schema version). */
export function serialiseTodayLayout(layout: TodayLayout): string {
  return JSON.stringify({
    version: TODAY_LAYOUT_VERSION,
    layout,
  } satisfies StoredLayout);
}

/**
 * Parse a stored snapshot back into a normalised layout. Any malformed JSON,
 * wrong version, or partial shape falls back to the default (never throws) — a
 * corrupt preference must never break the landing page.
 */
export function parseTodayLayout(raw: string | null): TodayLayout {
  if (!raw) {
    return defaultTodayLayout();
  }
  try {
    const parsed = JSON.parse(raw) as StoredLayout | null;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== TODAY_LAYOUT_VERSION
    ) {
      return defaultTodayLayout();
    }
    return normaliseTodayLayout(parsed.layout);
  } catch {
    return defaultTodayLayout();
  }
}
