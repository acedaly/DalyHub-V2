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
 * UX-01 removed the `focus` widget. It had never once shown information: it was a
 * permanent "coming soon" panel listing three unbuilt capabilities, taking a
 * section of the most-used screen in the product every single day. That is the
 * exact reasoning POLISH-01 applied to the Weather and Upcoming-calendar panels
 * (DEBT-53) — an honest absence beats a promise the product keeps failing to keep —
 * and it was applied inconsistently while `focus` survived. In its place the
 * catalogue gains `meetings`, a section backed by real records. A persisted layout
 * that still names `focus` is normalised on read (unknown ids are dropped), so no
 * owner's arrangement breaks.
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
  "task-summary",
  "my-day",
  "recent-activity",
  "diary",
  "notes",
  "projects",
  "areas",
  "goals",
  "meetings",
  "assets",
  "insights",
  "productivity",
  "quick-capture",
] as const;

export type TodayWidgetId = (typeof TODAY_WIDGET_IDS)[number];

/**
 * Which region of the dashboard a widget belongs to (POLISH-02).
 *
 * Today used to be ONE flow of widgets with three hand-placed grid cells and
 * everything else auto-flowed around them. Auto-placement around a five-row span
 * put the surface's tallest sections wherever the packing algorithm happened to
 * land them, so a section could sit in a 20rem column one day and full-width the
 * next, and short cards left ragged holes beside the task list. The arrangement was
 * emergent rather than designed.
 *
 * A widget now DECLARES its region and the surface renders three real containers,
 * so column flow is independent and no card is placed by accident:
 *
 *   hero       the full-width orientation band — greeting, date, day at a glance
 *   primary    what the owner ACTS on: the day's tasks, the schedule, the projects
 *              in motion, what just changed (≈2/3 of the width)
 *   secondary  what the owner REFERS to: signals, capture, goals, areas, notes,
 *              diary, assets (≈1/3)
 *
 * Regions stack in this order on a phone, which is the same order the hierarchy
 * asks for, so the mobile layout is the desktop one with the columns unwrapped.
 */
export type TodayWidgetColumn = "hero" | "primary" | "secondary";

/** A widget's static definition — its title, its region and its description. */
export interface TodayWidgetDefinition {
  readonly id: TodayWidgetId;
  /** The section label / accessible name. */
  readonly title: string;
  /** The dashboard region this widget lives in. */
  readonly column: TodayWidgetColumn;
  /**
   * A one-line description shown in the "Customise" panel so the owner knows what
   * a hidden widget would restore.
   */
  readonly description: string;
}

/**
 * The catalogue in its CANONICAL order — the calm, sensible default arrangement a
 * first-time owner sees. The order is the ATTENTION order the surface is designed
 * around, and it now reads the same way down the page as it does down each column:
 *
 *   orient        the hero brief
 *   act           today's tasks → today's schedule → the projects in motion →
 *                 what just changed
 *   refer         signals → capture → goals → areas → notes → diary → assets
 *
 * Personalisation reorders/toggles over this; a reset returns to exactly this order
 * with everything visible. Reordering is scoped to a widget's own region (see
 * `moveWidget`), so a move never silently teleports a card across the dashboard.
 */
export const TODAY_WIDGETS: readonly TodayWidgetDefinition[] = [
  {
    id: "morning-brief",
    /*
     * "Brief", not "Morning brief".
     *
     * The greeting inside it has always been resolved from the owner-local hour
     * ("Good morning" / "Good afternoon" / "Good evening"), but the LABEL above it
     * claimed the morning all day — so at 9pm the surface read "Morning brief /
     * Good evening, Aidan." The product should not tell the owner the time of day
     * incorrectly on the one screen they open most.
     *
     * The id stays `morning-brief`: it is the persistence key for every owner's
     * saved arrangement, and `normaliseTodayLayout` drops ids it does not know, so
     * renaming it would silently reset the layout of anyone who has customised
     * theirs. The internal type and component names (`MorningBriefData`,
     * `MorningBrief`) likewise keep the TODAY-08 vocabulary — this is a label
     * change, not a concept change.
     */
    title: "Brief",
    column: "hero",
    description: "Greeting, date, focus and what needs attention right now.",
  },
  {
    /*
     * M3-01 — the day's tasks as one figure.
     *
     * It sits in the hero beside the brief because it answers the same question
     * the brief asks in words ("how is today shaped?") with the one number a
     * dashboard is for. Everything on it is derived from counts the loader had
     * already read, so it costs no query.
     */
    id: "task-summary",
    title: "Task summary",
    column: "hero",
    description: "Today's tasks as one figure: to do, waiting and done.",
  },
  {
    id: "my-day",
    title: "My day",
    column: "primary",
    description: "Today’s planned, overdue, upcoming and backlog tasks.",
  },
  {
    id: "meetings",
    // "Meetings", not "Schedule": the product speaks in its own nouns everywhere
    // (AGENTS.md §7), and a synonym on the most-visited screen is where vocabulary
    // drift starts. What makes it read as the day's schedule is its POSITION —
    // directly under the day's tasks — and its timeline treatment, not a rename.
    title: "Meetings",
    column: "primary",
    description: "Today’s meetings, in order, with what is still to come.",
  },
  {
    id: "projects",
    title: "Continue working",
    column: "primary",
    description: "Active projects, most recently touched first.",
  },
  {
    id: "recent-activity",
    title: "Recent activity",
    column: "primary",
    description: "A unified timeline of recent changes across DalyHub.",
  },
  {
    id: "insights",
    title: "Insights",
    column: "secondary",
    description: "Overdue, waiting, stalled and at-risk signals at a glance.",
  },
  {
    /*
     * M3-01 — one honest score for the day, from two facts.
     *
     * In the secondary column with the other summaries rather than in the hero:
     * it is a reflection on the day, not an instruction for it, and the hero is
     * where the day's instructions live.
     */
    id: "productivity",
    title: "Productivity score",
    column: "secondary",
    description:
      "A 0-100 score for the day, from completions and overdue work.",
  },
  {
    id: "quick-capture",
    // "Capture" (not "Quick capture") so the widget heading never collides with the
    // pane header's one primary "Quick capture" action.
    title: "Capture",
    column: "secondary",
    description: "Capture a task, note or thought without leaving Today.",
  },
  {
    id: "goals",
    title: "Goals",
    column: "secondary",
    description: "Goals in progress and whether recent action matches them.",
  },
  {
    id: "areas",
    title: "Areas",
    column: "secondary",
    description: "A calm health summary across your areas of life.",
  },
  {
    id: "notes",
    title: "Notes",
    column: "secondary",
    description: "Recently created notes to continue writing.",
  },
  {
    id: "diary",
    title: "Diary",
    column: "secondary",
    description: "Today’s journal entry and recent moments.",
  },
  {
    id: "assets",
    title: "Assets",
    column: "secondary",
    description:
      "Maintenance and renewals that are overdue or due soon on things you own.",
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

/** The region a widget id renders in (`null` for an unknown id). */
function columnOf(id: TodayWidgetId): TodayWidgetColumn | null {
  return WIDGET_BY_ID.get(id)?.column ?? null;
}

/**
 * The RENDERED (visible) sequence of widget ids in the SAME rendered group as `id`
 * — i.e. the sequence a Move up/down actually reorders. A group is one region
 * (`column`) and one pin state, because those are exactly the two things that
 * decide where a widget is drawn: regions are separate containers, and within a
 * region pinned widgets always float above the rest. Hidden widgets are not
 * rendered and so are skipped. Returns `null` for a hidden or unknown id (nothing
 * to move).
 */
function visibleGroupOf(
  layout: TodayLayout,
  id: TodayWidgetId,
): readonly TodayWidgetId[] | null {
  const hidden = new Set(layout.hidden);
  const column = columnOf(id);
  if (hidden.has(id) || column === null || !layout.order.includes(id)) {
    return null;
  }
  const pinned = new Set(layout.pinned);
  const samePin = pinned.has(id);
  return layout.order.filter(
    (member) =>
      !hidden.has(member) &&
      pinned.has(member) === samePin &&
      columnOf(member) === column,
  );
}

/**
 * Move a widget one step earlier/later **within the rendered sequence** (its region
 * and pin group), by swapping it with its adjacent VISIBLE, same-group neighbour in
 * `order`. Operating on the rendered sequence — not raw `order` — means a Move
 * up/down always produces a visible change (or is a clamped no-op at a group
 * boundary), never a silent no-op caused by an intervening pinned, hidden or
 * other-column widget, and never a card jumping between columns.
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
 *
 * The sequence is still FLAT and region-agnostic; `groupVisibleWidgets` splits it
 * into the three rendered containers. Keeping both means the move-boundary flags
 * (`isFirst`/`isLast`) are computed once, against the same groups `moveWidget`
 * reorders, rather than twice in two places that can disagree.
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
    // `isFirst`/`isLast` reflect movability WITHIN the widget's rendered group —
    // its region AND its pin state, the two things a move never crosses — so the
    // Move up/down controls are disabled exactly when they could not change the
    // rendered order.
    const group = (pinned.has(id) ? pinnedGroup : unpinnedGroup).filter(
      (member) => columnOf(member) === columnOf(id),
    );
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

/** The visible widgets split into the three rendered dashboard regions. */
export interface TodayWidgetRegions {
  readonly hero: readonly ResolvedTodayWidget[];
  readonly primary: readonly ResolvedTodayWidget[];
  readonly secondary: readonly ResolvedTodayWidget[];
}

/**
 * Split the resolved widgets into the containers the dashboard renders. Order
 * within each region is preserved from `resolveVisibleWidgets`, so pinned widgets
 * still lead their own column.
 */
export function groupVisibleWidgets(layout: TodayLayout): TodayWidgetRegions {
  const visible = resolveVisibleWidgets(layout);
  const of = (column: TodayWidgetColumn) =>
    visible.filter((widget) => widget.definition.column === column);
  return {
    hero: of("hero"),
    primary: of("primary"),
    secondary: of("secondary"),
  };
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
