/**
 * TODAY-01 / TODAY-04 — the Today dashboard composition.
 *
 * The calm surface the owner lands on every morning, and — since TODAY-04 — a
 * deliberate PLANNING workspace: the owner decides what to do today, what can wait
 * and what moves to another day. Planning is the deliberate use of a task's EXISTING
 * scheduled date as the owner's commitment ("I intend to work on this today"); the
 * real tasks are bucketed by that date into Overdue / Today / Upcoming / Anytime /
 * Completed-today sections (the pure `planning-view` view-model), each card offers
 * calm plan quick actions, and a multi-select bulk action bar plans many at once.
 * It is composed ENTIRELY from the shared design system over DS-01 tokens — no
 * bespoke visual language: the PX-02 CollectionLayout (with its selection slot for
 * the bulk bar), DS-04 Cards, the DS-03 Drawer, DS-10 feedback and DS-09 commands.
 *
 * Planning NEVER changes a task's due date, waiting state or completion (ADR-030);
 * waiting tasks are excluded from the planning sections by the loader, and completed
 * tasks appear only under the collapsed "Completed today". Every section on this
 * route reads REAL workspace data — the fixture seam this header once described was
 * retired by TODAY-08 and UX-01 (see `routes/index.tsx`), and Quick Capture is the
 * shared capture surface posting to canonical routes.
 *
 * ── POLISH-02: the composition, restated ─────────────────────────────────────
 * The surface is THREE regions rather than one flow of widgets around three
 * hand-placed grid cells (see `landing/layout.ts` for why auto-placement was the
 * defect, not the spacing):
 *
 *   hero       one full-width band: greeted by name, the date, the day's shape,
 *              today's progress, and the ONE at-a-glance rail;
 *   primary    what the owner acts on — My day, Meetings, Continue working,
 *              Recent activity;
 *   secondary  what they refer to — Insights, Capture, Goals, Areas, Notes,
 *              Diary, Assets.
 *
 * Reading order down the page is the attention order, and it is the same order the
 * regions stack in on a phone, so the mobile layout is the desktop one unwrapped
 * rather than a second arrangement to keep in step.
 *
 * Nothing is counted twice: the planning summary strip that used to sit inside My
 * day repeating the brief's numbers is gone, and each list widget's "see the rest"
 * link is one header affordance rather than a link at the foot of some bodies and
 * not others. No new data is fetched for any of it — every number here comes from
 * the payload the loader already returns.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useNavigate, useSearchParams } from "react-router";

import { Card, CardCollection, closeActiveSwipeTray } from "~/shared/card";
import type { CardAction, CardMetaItem, CardProps } from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import { CAPTURE_TYPE_DESCRIPTORS, useCapture } from "~/shared/capture";
import { useDrawer, withDrawerPushed } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { Region } from "~/shared/region";
import {
  HealthIndicator,
  healthNeedsAttention,
  type ProjectHealth,
} from "~/shared/project-health";
import { useFeedback } from "~/shared/feedback";
import { projectWorkflowStatusLabel } from "~/kernel/project-settings";
// Import the specific modules (not the `~/shared/commands` barrel) so the Today
// route chunk does not eagerly pull the palette controller / DS-08 Search UI.
import { toCardAction, type AppAction } from "~/shared/commands/action";
import { useRegisterContextualActions } from "~/shared/commands/CommandContextProvider";

import {
  TODAY_CAPTURE_PARAM,
  TODAY_CAPTURE_VALUE,
  TODAY_NAV_LIST,
  TODAY_NAV_PARAM,
} from "./commands";
import { HELP_DRAWER_KEY } from "./keyboard/KeyboardHelp";
import {
  buildFocusedTaskCommands,
  buildTodayGlobalCommands,
} from "./keyboard/today-commands";
import {
  firstId,
  flattenOrder,
  sectionFirstIdOf,
  type RovingOrder,
} from "./keyboard/roving-model";
import {
  buildTodayNavTarget,
  isTodayNavValue,
  type TodayNavValue,
} from "./keyboard/nav-target";
import { useTodayRovingFocus } from "./keyboard/useTodayRovingFocus";
import type { RenderEntityLink } from "~/shared/activity-feed";
import type { ResolvedEntity } from "~/shared/activity-feed/model";
import { briefFocusLine } from "./landing/insights";
import { MorningBrief } from "./landing/MorningBrief";
import { RecentActivityWidget } from "./landing/RecentActivityWidget";
import {
  AreasWidget,
  AssetsWidget,
  DiaryWidget,
  GoalsWidget,
  InsightsWidget,
  MeetingsWidget,
  NotesWidget,
} from "./landing/widgets";
import { TodayWidget } from "./landing/TodayWidget";
import { useTodayLayout } from "./landing/useTodayLayout";
import {
  groupVisibleWidgets,
  resolveHiddenWidgets,
  type ResolvedTodayWidget,
  type TodayWidgetId,
} from "./landing/layout";
import type { MorningBriefData, TodayLandingData } from "./landing/types";
import type { BriefStat } from "./landing/MorningBrief";
import type { PlanActionData } from "./routes/plan";
import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";
import { UrgencyChip } from "~/shared/task-record/UrgencyChip";
import type {
  PlanningData,
  PlanningTaskItem,
  PlanTargets,
} from "./task/planning-view";
import type { WaitingSummary } from "./task/waiting-view";

/**
 * A recently-active REAL project for the "Continue working" section (PROJ-05 Slice
 * 4). A plain display shape derived by the loader from the project read model —
 * Today never imports the Projects module (the module import boundary forbids it).
 * Opening one navigates to the canonical `/projects/:id` route, the same record a
 * project opened from the Projects module lands on. Every item here is guaranteed by
 * the loader's query (`state: "open"` + `workflowStatus: "active"`) to be an
 * incomplete, non-archived project whose workflow status is Active — so there is no
 * `completed`/`archivedAt`/`status` field to carry: the section's cards are always
 * presented as Active, never Planned/On hold/Completed/Archived.
 */
export type RecentProjectItem = {
  readonly id: string;
  readonly title: string;
  readonly areaLabel: string | null;
  readonly taskTotal: number;
  readonly taskCompleted: number;
  /** The DERIVED health signal (PROJ-02), or null when unavailable. */
  readonly health: ProjectHealth | null;
};

export type TodayDashboardProps = {
  /** The formatted current date, rendered once — under the hero's greeting. */
  readonly date: string;
  /** The owner's calendar date `YYYY-MM-DD`, for due/overdue comparisons. */
  readonly todayIso?: string;
  /** The server's `now` (ISO), for the Recent Activity feed's relative dates. */
  readonly nowIso?: string;
  /**
   * The command-centre payload (TODAY-08): Morning Brief, real Notes/Diary/Areas/
   * Goals and derived Insights. Omitted in fixture/demo rendering — those widgets
   * then show their calm empty state.
   */
  readonly landing?: TodayLandingData;
  /**
   * The planning payload (TODAY-04): the real tasks bucketed by scheduled date, the
   * calm summary and the quick-plan target dates. Omitted in fixture/demo rendering,
   * where no planning sections are shown.
   */
  readonly planning?: PlanningData;
  /**
   * The active Waiting summary (TODAY-03): the count of waiting tasks and a small
   * preview, rendered as a quiet section linking to `/today/waiting`. Waiting tasks
   * are excluded from the planning sections (blocked work is not planned work).
   */
  readonly waiting?: WaitingSummary;
  /**
   * The recently-active REAL projects for "Continue working" (PROJ-01). Replaces the
   * former fixture seam; opening one navigates to the canonical project record route.
   */
  readonly recentProjects?: readonly RecentProjectItem[];
  /**
   * Persist a task's completion (TODAY-02). Completing a task on Today writes through
   * to the same task the Drawer edits; a revalidation keeps them consistent.
   */
  readonly onCompleteTask?: (taskId: string, complete: boolean) => void;
  /**
   * TEST/demo override for planning mutations. When provided it is called instead of
   * posting to `/today/plan`; production passes nothing and the shared fetcher runs.
   */
  readonly onPlan?: (
    ids: readonly string[],
    scheduledDate: string | null,
  ) => void;
};

/** The planning section a card belongs to (drives its contextual quick actions). */
type PlanBucket =
  "overdue" | "today" | "upcoming" | "anytime" | "completedToday";

/** The open (keyboard-navigable) planning buckets, in visual order (TODAY-05). */
const OPEN_BUCKETS: readonly Exclude<PlanBucket, "completedToday">[] = [
  "overdue",
  "today",
  "upcoming",
  "anytime",
];

/** The DOM id of each planning section's heading, so a command can focus it. */
const SECTION_HEADING_ID: Record<string, string> = {
  overdue: "today-overdue-label",
  today: "today-planned-label",
  upcoming: "today-upcoming-tasks-label",
  anytime: "today-anytime-label",
};

/**
 * How many rows the DISCRETIONARY planning sections preview on Today (POLISH-02).
 * Overdue and Today have no limit — see `shownTasks`. The overflow is never
 * hidden: the heading count is the true total and each section links to the same
 * tasks in the canonical `/tasks` system view.
 */
const UPCOMING_PREVIEW = 8;
const ANYTIME_PREVIEW = 8;

/**
 * The `deriveInsights` signal ids the hero's at-a-glance rail already states, and
 * which the Insights widget therefore drops while the hero is on screen. Keyed by
 * signal id so the relationship is explicit: adding a stat to the rail without
 * adding its id here is what would put the same number on the page twice.
 */
const HERO_COVERED_SIGNALS: ReadonlySet<string> = new Set([
  "overdue",
  "waiting",
  "projects-attention",
]);

/** Where a truncated section's full list lives — a real `/tasks` system view. */
const BUCKET_ALL_HREF: Partial<Record<PlanBucket, string>> = {
  upcoming: "/tasks?system=upcoming",
  anytime: "/tasks?system=inbox",
};

/** Human labels for the open planning buckets (for "Go to <section>" commands). */
const BUCKET_LABEL: Record<string, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  anytime: "Anytime",
};

/**
 * A labelled Today section: a quiet `xs`-muted heading + optional count over its
 * content. A real `section`/heading keeps the pane's document outline correct and
 * lets assistive tech jump between the morning's regions.
 */
function TodaySection({
  id,
  label,
  count,
  level = 2,
  action,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly count?: number;
  /**
   * The heading level. Planning sub-sections nest one level below the "My day"
   * widget heading (`h3`); stand-alone sections stay `h2` — so the pane keeps a
   * single, non-skipping outline under the CollectionLayout `h1`.
   */
  readonly level?: 2 | 3;
  /**
   * The section's one trailing affordance, on the HEADING row — the same place a
   * widget puts its destination, so a section and a widget read alike.
   *
   * It sits in the header rather than after the rows for a keyboard reason as
   * well as a visual one: the planning sections live inside ONE roving container
   * (TODAY-05), which is a single tab stop for every task card. A control placed
   * after the last card would sit between the owner and the exit from a
   * thirty-row list; in the header it precedes the cards, so Tab from a task still
   * leaves the collection.
   */
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  const headingId = `${id}-label`;
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <section className="dh-today__section" aria-labelledby={headingId}>
      <div className="dh-today__section-head">
        {/* `tabIndex={-1}`: not in the tab order, but a "Go to <section>" command
            can move focus here (announcing the section) without adding a tab stop. */}
        <Heading
          id={headingId}
          tabIndex={-1}
          className="dh-today__section-label"
        >
          {label}
          {count !== undefined ? (
            <span className="dh-today__section-count"> {count}</span>
          ) : null}
        </Heading>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * The hero's "at a glance" rail (POLISH-02).
 *
 * This is the ONE place the day is counted. It used to be a strip inside My day
 * repeating three of the numbers the Morning Brief had already shown in the column
 * beside it; the counts are now stated once, at the top, where the eye lands first,
 * and My day opens directly on the owner's tasks.
 *
 * Colour is spent deliberately (AGENTS.md §15, PRODUCT_EXPERIENCE): only slipped
 * work is `attention` and only finished work is `positive`. Meetings, waiting and
 * projects-in-motion are facts, not alarms, and stay neutral. A count with an
 * in-app answer carries an `href`; the rest are plain text rather than dead links.
 *
 * Cross-module counts are omitted entirely (rather than shown as `0`) when the
 * landing payload is absent — a fixture render must not claim "0 meetings" for a
 * module it never read.
 */
function heroStats(input: {
  readonly summary: PlanningData["summary"] | undefined;
  readonly meetingsRemaining: number | null;
  readonly projectsNeedingAttention: number | null;
}): readonly BriefStat[] {
  const stats: BriefStat[] = [
    { id: "planned", value: input.summary?.planned ?? 0, label: "planned" },
    {
      id: "overdue",
      value: input.summary?.overdue ?? 0,
      label: "overdue",
      tone: (input.summary?.overdue ?? 0) > 0 ? "attention" : "neutral",
    },
  ];
  if (input.meetingsRemaining !== null) {
    stats.push({
      id: "meetings",
      value: input.meetingsRemaining,
      label: input.meetingsRemaining === 1 ? "meeting left" : "meetings left",
      href: "/meetings",
    });
  }
  stats.push({
    id: "waiting",
    value: input.summary?.waiting ?? 0,
    label: "waiting",
    href: "/today/waiting",
  });
  if (input.projectsNeedingAttention !== null) {
    stats.push({
      id: "attention",
      value: input.projectsNeedingAttention,
      label: "need a look",
      href: "/projects",
      tone: input.projectsNeedingAttention > 0 ? "attention" : "neutral",
    });
  }
  stats.push({
    id: "completed",
    value: input.summary?.completedToday ?? 0,
    label: "completed today",
    tone: (input.summary?.completedToday ?? 0) > 0 ? "positive" : "neutral",
  });
  return stats;
}

export function TodayDashboard({
  date,
  todayIso,
  nowIso,
  planning,
  waiting,
  recentProjects = [],
  landing,
  onCompleteTask,
  onPlan,
}: TodayDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openDrawer, closeDrawer, isOpen: drawerOpen } = useDrawer();
  const { notifySuccess, notifyError } = useFeedback();
  const navigate = useNavigate();

  // Opening any record closes an open swipe action tray (TODAY-06): a revealed tray
  // must never linger behind the Drawer that a tap on it (or a keyboard command)
  // opens. Every record-open path routes through here.
  const openRecord = useCallback(
    (key: string) => {
      closeActiveSwipeTray();
      openDrawer(key);
    },
    [openDrawer],
  );
  // The first Quick Capture entry — the focus target for the PX-03 "Focus Quick
  // Capture" command and Morning Brief's capture link.
  const captureRef = useRef<HTMLButtonElement>(null);
  // The ONE shared capture surface (MOBILE-01). Null outside the AppShell (a
  // fixture render), in which case the entries simply do nothing.
  const capture = useCapture();
  const planFetcher = useFetcher<PlanActionData>();

  const targets: PlanTargets | undefined = planning?.targets;
  const referenceIso = todayIso ?? targets?.today ?? "";

  // Optimistic completion overrides, keyed by task id → intended done state. The
  // server truth is the base; an override reflects an in-flight toggle and clears
  // once fresh data arrives (a revalidation reconciles).
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pendingPlan, setPendingPlan] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Reconcile: once the loader returns fresh planning data, drop optimistic
  // completion overrides AND the multi-select (the cards have re-bucketed).
  useEffect(() => {
    setOverrides((prev) => (prev.size === 0 ? prev : new Map()));
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, [planning]);

  // A planning submit is in flight until the fetcher returns to idle.
  useEffect(() => {
    if (planFetcher.state === "idle") {
      setPendingPlan((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, [planFetcher.state]);

  // Announce planning results once (success with a change, or a calm error).
  const lastPlanData = useRef<PlanActionData | undefined>(undefined);
  useEffect(() => {
    const result = planFetcher.data;
    if (!result || result === lastPlanData.current) {
      return;
    }
    lastPlanData.current = result;
    if (result.status === "success") {
      if (result.changed > 0) {
        notifySuccess(
          result.changed === 1
            ? "Plan updated."
            : `${result.changed} tasks planned.`,
        );
      }
    } else {
      notifyError(result.message);
    }
  }, [planFetcher.data, notifySuccess, notifyError]);

  const isDone = useCallback(
    (item: PlanningTaskItem) =>
      overrides.has(item.id) ? overrides.get(item.id)! : item.completed,
    [overrides],
  );

  const toggleDone = useCallback(
    (id: string, willBeDone: boolean) => {
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(id, willBeDone);
        return next;
      });
      onCompleteTask?.(id, willBeDone);
    },
    [onCompleteTask],
  );

  const toggleSelected = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // Plan (or clear) one or many tasks. Production posts to the trusted /today/plan
  // action (which revalidates the loader); a test/demo override intercepts instead.
  const submitPlan = useCallback(
    (ids: readonly string[], scheduledDate: string | null) => {
      if (ids.length === 0) {
        return;
      }
      if (onPlan) {
        onPlan(ids, scheduledDate);
        return;
      }
      setPendingPlan(new Set(ids));
      const form = new FormData();
      form.set("intent", scheduledDate === null ? "clear_plan" : "plan");
      for (const id of ids) {
        form.append("id", id);
      }
      if (scheduledDate !== null) {
        form.set("scheduledDate", scheduledDate);
      }
      void planFetcher.submit(form, { method: "post", action: "/today/plan" });
    },
    [onPlan, planFetcher],
  );

  /**
   * What each open section actually RENDERS (POLISH-02).
   *
   * The planning query bounds its bands at 100–200 rows, which is right for a
   * query and wrong for a landing page: on a real workspace the unscheduled
   * backlog is the biggest band by an order of magnitude, so Today opened with
   * eighty "Anytime" rows between the day's tasks and everything else on the page.
   * The screen answering "what should I do now?" became a place to read the whole
   * backlog, and Recent activity ended up four screens below the fold.
   *
   * So the two DISCRETIONARY bands preview, and say so. Nothing is silently
   * dropped: the section heading keeps the true count and a "View all" link goes
   * to the same tasks in the canonical `/tasks` system view.
   *
   * Overdue and Today are NEVER truncated. They are the owner's commitments, and a
   * commitment you can only see by following a link is one the product has hidden.
   */
  const shownTasks = useMemo(() => {
    const preview = (
      items: readonly PlanningTaskItem[],
      limit: number | null,
    ) => (limit === null ? items : items.slice(0, limit));
    return {
      overdue: preview(planning?.overdue ?? [], null),
      today: preview(planning?.today ?? [], null),
      upcoming: preview(planning?.upcoming ?? [], UPCOMING_PREVIEW),
      anytime: preview(planning?.anytime ?? [], ANYTIME_PREVIEW),
      completedToday: preview(planning?.completedToday ?? [], null),
    } satisfies Record<PlanBucket, readonly PlanningTaskItem[]>;
  }, [planning]);

  // The keyboard-navigable open-task collection, in visual order (TODAY-05). Only
  // the OPEN planning sections are roving members; the collapsed "Completed today"
  // section keeps natural tab behaviour and is not navigated with the arrow keys.
  // It is built from the RENDERED slice, so an arrow key can never travel to a row
  // that is not on the page.
  const rovingOrder = useMemo<RovingOrder>(() => {
    if (!planning) {
      return [];
    }
    return OPEN_BUCKETS.map((bucket) => ({
      id: bucket,
      taskIds: shownTasks[bucket].map((item) => item.id),
    }));
  }, [planning, shownTasks]);

  const roving = useTodayRovingFocus({
    order: rovingOrder,
    onOpen: (id) => openRecord(`task:${id}`),
    onToggleSelect: (id) => toggleSelected(id, !selected.has(id)),
    onEscape: () => {
      if (selected.size > 0) {
        clearSelection();
      }
    },
  });

  const selectAll = useCallback(() => {
    setSelected(new Set(flattenOrder(rovingOrder)));
  }, [rovingOrder]);

  // "Focus task list" / "Go to <section>" are NAVIGATE commands: they carry a bounded
  // `today-nav` param on a `/today?…` target built from the current params with the
  // ENTIRE Drawer stack REMOVED (the shared `withAllDrawersRemoved` helper — never a
  // hand-deleted param), while preserving every unrelated param. Running the command
  // from inside an open drawer therefore navigates the Drawer stack away cleanly
  // (leaving the provider's own history entry + push token intact, so Back reopens
  // the drawer and Forward returns with it closed). Navigating naturally closes the
  // palette AND the drawer stack; the effect below moves focus after they unmount.
  const navTarget = useCallback(
    (value: TodayNavValue): string => buildTodayNavTarget(searchParams, value),
    [searchParams],
  );

  // On arrival with a `today-nav` param, move keyboard focus to the target task (the
  // list's first task, or the section's first task), scroll its heading into view,
  // then clean the param — so it never traps Back and never re-fires. This runs after
  // the palette closed + restored focus, so it wins deterministically. The effect
  // depends ONLY on the search params + stable callbacks (the order is read through a
  // ref) so it fires once per navigation — not every render — exactly like the
  // Focus-Quick-Capture effect; that keeps the cleanup navigation from racing itself.
  const rovingFocusTask = roving.focusTask;
  const rovingOrderRef = useRef(rovingOrder);
  rovingOrderRef.current = rovingOrder;
  useEffect(() => {
    const nav = searchParams.get(TODAY_NAV_PARAM);
    if (nav === null) {
      return;
    }
    // Only an ACCEPTED bounded value focuses a task — an arbitrary/unknown value never
    // resolves to a task (and is still cleaned below, so it can't linger or loop).
    if (isTodayNavValue(nav)) {
      const order = rovingOrderRef.current;
      const target =
        nav === TODAY_NAV_LIST ? firstId(order) : sectionFirstIdOf(order, nav);
      if (target !== null) {
        const heading = document.getElementById(SECTION_HEADING_ID[nav] ?? "");
        heading?.scrollIntoView({ block: "start" });
        rovingFocusTask(target);
      }
    }
    // Clean the param with `replace` (no new history entry) regardless of whether the
    // section was empty or the value was unknown; preserve every unrelated param and
    // recreate no drawer.
    const next = new URLSearchParams(searchParams);
    next.delete(TODAY_NAV_PARAM);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [searchParams, setSearchParams, rovingFocusTask]);

  const openHelp = useCallback(() => openRecord(HELP_DRAWER_KEY), [openRecord]);

  // TODAY-08 personalisation: the remembered per-device widget arrangement, plus a
  // "Customise" toggle that reveals each widget's move/pin/hide controls.
  const layoutController = useTodayLayout();
  const {
    layout,
    toggleHidden: toggleWidgetHidden,
    toggleCollapsed: toggleWidgetCollapsed,
  } = layoutController;
  const [customising, setCustomising] = useState(false);
  // The three rendered regions (POLISH-02). Each column flows independently, so a
  // short card never leaves a hole beside the task list and no widget is placed by
  // grid auto-flow.
  const regions = useMemo(() => groupVisibleWidgets(layout), [layout]);
  const hiddenWidgets = useMemo(() => resolveHiddenWidgets(layout), [layout]);

  const openProps = (key: string) => ({
    href: `?${withDrawerPushed(searchParams, key).toString()}`,
    onOpen: () => openRecord(key),
  });

  // Quick Capture can be hidden or collapsed by the owner, yet the pane-header
  // "Quick capture" action and Morning Brief's capture entry stay visible — so
  // focusing must first RESTORE the widget (un-hide, expand), then focus once it is
  // in the DOM and visible. A deferred focus (pendingCaptureFocus) waits for the
  // layout change to render; when the widget is already available it focuses
  // synchronously (so no perceptible delay and existing tests still see focus).
  const [pendingCaptureFocus, setPendingCaptureFocus] = useState(false);
  const captureHidden = layout.hidden.includes("quick-capture");
  const captureCollapsed = layout.collapsed.includes("quick-capture");
  const focusCapture = useCallback(() => {
    if (captureHidden) {
      toggleWidgetHidden("quick-capture");
    }
    if (captureCollapsed) {
      toggleWidgetCollapsed("quick-capture");
    }
    if (!captureHidden && !captureCollapsed) {
      captureRef.current?.focus();
      captureRef.current?.scrollIntoView({ block: "center" });
    } else {
      // Restore is in flight — focus once the widget renders (effect below).
      setPendingCaptureFocus(true);
    }
  }, [
    captureHidden,
    captureCollapsed,
    toggleWidgetHidden,
    toggleWidgetCollapsed,
  ]);

  // Complete a deferred capture focus once the widget is visible and expanded.
  useEffect(() => {
    if (!pendingCaptureFocus || captureHidden || captureCollapsed) {
      return;
    }
    captureRef.current?.focus();
    captureRef.current?.scrollIntoView({ block: "center" });
    setPendingCaptureFocus(false);
  }, [pendingCaptureFocus, captureHidden, captureCollapsed]);

  useEffect(() => {
    if (searchParams.get(TODAY_CAPTURE_PARAM) !== TODAY_CAPTURE_VALUE) {
      return;
    }
    focusCapture();
    const next = new URLSearchParams(searchParams);
    next.delete(TODAY_CAPTURE_PARAM);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [searchParams, setSearchParams, focusCapture]);

  // PX-03: "Focus Quick Capture" is NOT also registered as a contextual `run`
  // action here (it was, until PX-03 made `/` land on `/today` and exposed the
  // bug this note explains). The module's registered NAVIGATE command
  // (`today.focus_quick_capture`, `app/modules/today/commands.ts`) is global —
  // always present in the Command Palette catalogue, on or off Today — and is
  // the ONE authoritative way to reach Quick Capture from the palette: it
  // navigates to `TODAY_CAPTURE_PATH`, which closes the palette (restoring the
  // background from `inert`) before the effect above focuses the field. A
  // contextual `run` action, by contrast, executes while the palette is still
  // open and modal — the background (including this field) is `inert`, so
  // `captureRef.current?.focus()` would silently no-op, and having BOTH also
  // meant two identically-titled palette entries, one of them dead. The plain
  // "Quick capture" button below calls `focusCapture()` directly — no palette
  // involved, so no `inert` background and no duplicate registration needed.
  // See `docs/development/COMMAND_PALETTE.md` "Contextual actions" for the
  // general rule this establishes.

  const activateAction = useCallback((action: AppAction) => {
    if (action.kind === "run") {
      void action.run();
    }
  }, []);

  // Render a referenced Activity record: a task opens in the SAME shared Task Drawer
  // Today already hosts; every other kind links to its canonical record route. Never
  // a fake link for a kind without a route.
  const canonicalRouteFor = useCallback(
    (entityType: ResolvedEntity["entityType"], id: string): string | null => {
      switch (entityType) {
        case "project":
          return `/projects/${encodeURIComponent(id)}`;
        case "goal":
          return `/goals/${encodeURIComponent(id)}`;
        case "area":
          return `/areas/${encodeURIComponent(id)}`;
        case "note":
          return `/notes/${encodeURIComponent(id)}`;
        case "diary":
          return `/diary/${encodeURIComponent(id)}`;
        default:
          return null;
      }
    },
    [],
  );
  const renderActivityEntityLink = useCallback<RenderEntityLink>(
    (entity, label) => {
      if (entity.drawerKey) {
        const key = entity.drawerKey;
        return (
          <a
            href={`?${withDrawerPushed(searchParams, key).toString()}`}
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.button !== 0
              )
                return;
              event.preventDefault();
              openRecord(key);
            }}
          >
            {label}
          </a>
        );
      }
      const route = canonicalRouteFor(entity.entityType, entity.entityId);
      return route ? <Link to={route}>{label}</Link> : <span>{label}</span>;
    },
    [searchParams, openRecord, canonicalRouteFor],
  );

  // A flat lookup of every planning task, so a Drawer-open task can be found for its
  // contextual planning commands (TODAY-04 exposes commands; TODAY-05 owns palette).
  const planningById = useMemo(() => {
    const map = new Map<string, PlanningTaskItem>();
    if (planning) {
      for (const bucket of [
        planning.overdue,
        planning.today,
        planning.upcoming,
        planning.anytime,
        planning.completedToday,
      ]) {
        for (const item of bucket) {
          map.set(item.id, item);
        }
      }
    }
    return map;
  }, [planning]);

  // A task's Complete/Reopen as ONE shared action — reused by the Card quick action
  // and, when that task's Drawer is open, by the palette (below), so the Card, the
  // keyboard path and the palette share one identity and one execution path
  // (ADR-024 §24.14). It persists through `onCompleteTask` (TODAY-02) when provided.
  const taskToggleAction = useCallback(
    (item: PlanningTaskItem): AppAction => {
      const done = isDone(item);
      return {
        id: `today.action.task.${item.id}.toggle`,
        title: done ? "Reopen" : "Complete",
        subtitle: item.title,
        keywords: ["task", "done", "complete", "reopen"],
        kind: "run",
        run: () => {
          toggleDone(item.id, !done);
          return {
            ok: true,
            message: done ? "Task reopened." : "Task completed.",
          };
        },
      };
    },
    [isDone, toggleDone],
  );

  // The full TODAY-05 contextual command set the Today surface registers with the
  // shared command system: the global keyboard commands (focus the list, jump to a
  // section, select all, clear selection, keyboard help) plus the per-task commands
  // for the PRIMARY task — the one open in the Drawer, or, when no Drawer is open, the
  // roving-focused task. Every command drives the SAME trusted path the visible cards
  // and bulk bar use (ADR-024 §24.14 / ADR-030); availability is by omission.
  // Dashboard-level task shortcuts (C / P / Shift+P) target the roving task ONLY when
  // both are true: (1) NO Drawer/overlay is open, and (2) keyboard focus is currently
  // WITHIN the open task collection. This prevents a stale task from being completed
  // or replanned behind an unrelated surface — e.g. after opening the keyboard-help,
  // a project/note/upcoming Drawer, or after Tabbing out to Quick Capture, the last
  // roving task must NOT still own those keys. When a TASK Drawer is open,
  // `TaskDrawerContent` owns that task's commands (it has the refresh path); when a
  // NON-task Drawer is open, no background task owns them. `roving.focusedId` is still
  // retained as the tab stop for focus restoration — but `roving.activeId` (the
  // command target) is null unless focus is inside the collection.
  const dashboardTaskId = drawerOpen ? null : roving.activeId;

  const contextualActions = useMemo<readonly AppAction[]>(() => {
    const hasOpenTasks = flattenOrder(rovingOrder).length > 0;
    const globals = buildTodayGlobalCommands({
      sections: OPEN_BUCKETS.map((bucket) => ({
        bucket,
        label: BUCKET_LABEL[bucket],
        count: planning ? planning[bucket].length : 0,
        navTarget: navTarget(bucket),
      })),
      hasOpenTasks,
      selectionCount: selected.size,
      targets,
      taskListTarget: hasOpenTasks ? navTarget(TODAY_NAV_LIST) : null,
      selectAll,
      clearSelection,
      openHelp,
      bulkPlan: (date) => {
        submitPlan([...selected], date);
        clearSelection();
      },
    });

    const focusedTask = dashboardTaskId
      ? planningById.get(dashboardTaskId)
      : undefined;
    const taskCommands = focusedTask
      ? buildFocusedTaskCommands({
          task: focusedTask,
          done: isDone(focusedTask),
          targets,
          isOpen: false,
          onToggleDone: () => toggleDone(focusedTask.id, !isDone(focusedTask)),
          onOpen: () => openRecord(`task:${focusedTask.id}`),
          onClose: () => closeDrawer(),
          onPlan: (date) => submitPlan([focusedTask.id], date),
        })
      : [];

    return [...globals, ...taskCommands];
  }, [
    planning,
    rovingOrder,
    selected,
    navTarget,
    selectAll,
    clearSelection,
    openHelp,
    dashboardTaskId,
    planningById,
    isDone,
    targets,
    toggleDone,
    openRecord,
    closeDrawer,
    submitPlan,
  ]);

  useRegisterContextualActions(contextualActions);

  /* -- Planning card + section rendering -- */

  const planQuickActions = (
    item: PlanningTaskItem,
    bucket: PlanBucket,
  ): CardAction[] => {
    const busy = pendingPlan.has(item.id);
    // The completion quick action IS the shared toggle action (one identity, one
    // execution path with the palette contextual action, ADR-024 §24.14).
    const complete = toCardAction(taskToggleAction(item), {
      onActivate: activateAction,
    });
    if (bucket === "completedToday" || !targets) {
      return [complete];
    }
    const plan = (
      id: string,
      label: string,
      date: string | null,
    ): CardAction => ({
      id: `${item.id}-${id}`,
      label,
      ariaLabel: `${label}: ${item.title}`,
      disabled: busy,
      onSelect: () => submitPlan([item.id], date),
    });
    const actions: CardAction[] = [complete];
    if (bucket === "today") {
      actions.push(plan("tomorrow", "Tomorrow", targets.tomorrow));
      actions.push(plan("clear", "Remove", null));
    } else if (bucket === "anytime") {
      actions.push(plan("today", "Plan today", targets.today));
      actions.push(plan("tomorrow", "Tomorrow", targets.tomorrow));
    } else {
      // overdue or upcoming
      actions.push(plan("today", "Plan today", targets.today));
      actions.push(plan("clear", "Clear", null));
    }
    return actions;
  };

  const planningCard = (
    item: PlanningTaskItem,
    bucket: PlanBucket,
  ): CardProps => {
    const done = isDone(item);
    // The SAME state-appropriate actions drive the visible quick actions and the
    // touch swipe tray (TODAY-06) — one identity, one execution path; the tray is an
    // accelerator over the always-available buttons, never a touch-only action.
    const actions = planQuickActions(item, bucket);
    // Priority ≠ urgency ≠ display-state as three separable slots (TASKS-02): the
    // shared coloured indicators now appear on Today's cards too, so priority is no
    // longer absent from the daily execution surface (DEBT-28), and overdue/due-today
    // carry a WORD, not just a red date (DEBT-27).
    const metadata: CardMetaItem[] = [];
    if (item.priority) {
      metadata.push({
        id: "priority",
        value: <PriorityIndicator priority={item.priority} />,
      });
    }
    if ((item.dueDate || item.scheduledDate) && referenceIso !== "") {
      metadata.push({
        id: "urgency",
        value: (
          <UrgencyChip
            task={{
              completedAt: done ? "done" : null,
              dueDate: item.dueDate,
              scheduledDate: item.scheduledDate,
            }}
            todayIso={referenceIso}
          />
        ),
      });
    }
    return {
      id: item.id,
      title: item.title,
      typeLabel: "Task",
      icon: <EntityIcon type="task" />,
      accent: "accent",
      // My day (h2) → planning section (h3) → task card title (h4): a correct,
      // non-skipping outline under the CollectionLayout h1 (TODAY-08).
      headingLevel: 4,
      context: item.parent ? { label: item.parent.title } : undefined,
      status: done ? { label: "Done", tone: "success" } : undefined,
      metadata: metadata.length > 0 ? metadata : undefined,
      selection:
        bucket === "completedToday"
          ? undefined
          : {
              selected: selected.has(item.id),
              onSelectedChange: (on) => toggleSelected(item.id, on),
              label: `Select ${item.title}`,
            },
      quickActions: actions,
      swipeActions: actions,
      density: "compact",
      presentation: "list",
      className: done ? "dh-today__task--done" : undefined,
      // Roving membership (TODAY-05): the open planning sections are ONE tab stop and
      // are arrow-navigable; the collapsed "Completed today" keeps natural tabbing.
      rovingTabIndex:
        bucket === "completedToday" ? undefined : roving.tabIndexFor(item.id),
      ...openProps(`task:${item.id}`),
    };
  };

  /**
   * One planning section. The heading count is the TRUE total; the collection
   * renders the previewed slice, and when those differ the section says so in
   * words and links to the rest. A truncation the owner cannot see is a lie about
   * how much work there is.
   */
  const planningSection = (
    id: string,
    label: string,
    bucket: PlanBucket,
    total: number,
  ) => {
    const items = shownTasks[bucket];
    const hidden = total - items.length;
    const href = BUCKET_ALL_HREF[bucket];
    return (
      <TodaySection
        id={id}
        label={label}
        count={total}
        level={3}
        action={
          hidden > 0 && href ? (
            <Link className="dh-today__section-all" to={href}>
              {`View all ${total} ${label.toLowerCase()}`}
            </Link>
          ) : null
        }
      >
        <CardCollection
          items={items}
          getItemId={(item) => item.id}
          renderCard={(item) => <Card {...planningCard(item, bucket)} />}
          ariaLabel={`${label} tasks`}
          presentation="list"
          density="compact"
        />
      </TodaySection>
    );
  };

  const bulkBar =
    planning && targets && selected.size > 0 ? (
      <PlanningBulkBar
        count={selected.size}
        targets={targets}
        pending={planFetcher.state !== "idle"}
        onPlan={(date) => {
          submitPlan([...selected], date);
          clearSelection();
        }}
        onCancel={clearSelection}
      />
    ) : undefined;

  /* -- Real project card (Continue working) -- */

  // A real project card (PROJ-05 Slice 4): opens the canonical `/projects/:id`
  // record route through normal client navigation (a real link + SPA open) — the
  // SAME record a project opened from the Projects module lands on, never a fixture
  // drawer. Every project the loader hands to this section is already known to be
  // Active (the query filters on `workflowStatus: "active"`), so the status pill
  // reuses the SAME shared workflow-status vocabulary the Project Settings tab and
  // collection use — never a second "Open"/generic label, and never a status this
  // section could otherwise show (Planned/On hold/Completed/Archived never reach it).
  const projectCard = (project: RecentProjectItem): CardProps => {
    const href = `/projects/${encodeURIComponent(project.id)}`;
    const needsAttention =
      project.health !== null && healthNeedsAttention(project.health);
    const metadata: CardMetaItem[] = [];
    // POLISH-02 — the health signal is now shown for EVERY project, not only for
    // the ones in trouble. Showing it only on at-risk projects made the absence of
    // a pill ambiguous: it could mean "on track" or "health unknown", and a card
    // that says nothing about a project's state is a card the owner has to open to
    // learn anything. The REASON is still reserved for projects that need a look,
    // so an on-track project stays a single quiet word rather than a sentence.
    if (project.health) {
      metadata.push({
        id: "health",
        value: (
          <HealthIndicator
            health={project.health}
            showReason={needsAttention}
          />
        ),
      });
    }
    // What is actually left to do, when there is anything — the number the owner
    // is deciding on. Supporting detail, so it de-emphasises on a phone card.
    const openCount = Math.max(0, project.taskTotal - project.taskCompleted);
    if (openCount > 0) {
      metadata.push({
        id: "open",
        value: `${openCount} open`,
        priority: "low",
      });
    }
    return {
      id: project.id,
      title: project.title,
      typeLabel: "Project",
      icon: <EntityIcon type="project" />,
      accent: "accent",
      status: { label: projectWorkflowStatusLabel("active"), tone: "neutral" },
      context: project.areaLabel ? { label: project.areaLabel } : undefined,
      metadata,
      progress:
        project.taskTotal > 0
          ? {
              value: project.taskCompleted,
              max: project.taskTotal,
              label: `${project.taskCompleted} of ${project.taskTotal} tasks`,
            }
          : undefined,
      presentation: "grid",
      href,
      onOpen: () => navigate(href),
      openAriaLabel: `Open ${project.title}`,
    };
  };

  /* -- My Day (the preserved planning + waiting execution core) -- */

  const myDayBody = planning ? (
    <>
      {/* The roving task collection (TODAY-05): ONE tab stop for every open
                task, arrow-navigable across sections. The keyboard handler owns
                Arrow/Home/End/Enter/Space; the direct action shortcuts (P/Shift+P/C)
                ride the shared command dispatcher against the focused task. */}
      <div
        ref={roving.containerRef}
        className="dh-today__tasklist"
        data-today-tasklist=""
      >
        {planning.overdue.length > 0
          ? planningSection(
              "today-overdue",
              "Overdue",
              "overdue",
              planning.overdue.length,
            )
          : null}

        <TodaySection
          id="today-planned"
          label="Today"
          count={planning.today.length}
          level={3}
        >
          {planning.today.length > 0 ? (
            <CardCollection
              items={planning.today}
              getItemId={(item) => item.id}
              renderCard={(item) => <Card {...planningCard(item, "today")} />}
              ariaLabel="Tasks planned for today"
              presentation="list"
              density="compact"
            />
          ) : (
            // PX-06: the SHARED EmptyState, not a bare paragraph — Today was
            // the last surface in the product still rendering its own. Every
            // quiet section now carries an entity glyph, a heading and (where
            // one exists) the next action, exactly like every other module.
            <EmptyState
              size="compact"
              headingLevel={3}
              icon={<EntityIcon type="task" />}
              title="Nothing planned yet"
              description="Pull a Task in from Anytime to commit to your day, or capture a new one."
              primaryAction={
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary"
                  onClick={focusCapture}
                >
                  Capture a Task
                </button>
              }
            />
          )}
        </TodaySection>

        {planning.upcoming.length > 0
          ? planningSection(
              "today-upcoming-tasks",
              "Upcoming",
              "upcoming",
              planning.upcoming.length,
            )
          : null}

        {planning.anytime.length > 0
          ? planningSection(
              "today-anytime",
              "Anytime",
              "anytime",
              planning.anytime.length,
            )
          : null}
      </div>

      {planning.completedToday.length > 0 ? (
        <section
          className="dh-today__section"
          aria-labelledby="today-completed-label"
        >
          <details className="dh-today__completed">
            <summary
              id="today-completed-label"
              className="dh-today__section-label"
            >
              Completed today
              <span className="dh-today__section-count">
                {" "}
                {planning.completedToday.length}
              </span>
            </summary>
            <CardCollection
              items={planning.completedToday}
              getItemId={(item) => item.id}
              renderCard={(item) => (
                <Card {...planningCard(item, "completedToday")} />
              )}
              ariaLabel="Tasks completed today"
              presentation="list"
              density="compact"
            />
          </details>
        </section>
      ) : null}

      {/* Waiting summary (TODAY-03) — only when something is waiting, so Today
                stays calm. A count + preview + link to the full Waiting view; waiting
                tasks never appear in the planning sections above (ADR-029/030). */}
      {waiting && waiting.count > 0 ? (
        <TodaySection
          id="today-waiting"
          label="Waiting"
          count={waiting.count}
          level={3}
        >
          <ul className="dh-today__waiting" aria-label="Waiting tasks preview">
            {waiting.preview.map((item) => {
              const key = `task:${item.id}`;
              return (
                <li
                  key={item.id}
                  className="dh-region-row dh-today__waiting-item"
                >
                  <a
                    className="dh-today__waiting-link"
                    href={`?${withDrawerPushed(searchParams, key).toString()}`}
                    onClick={(event) => {
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.button !== 0
                      )
                        return;
                      event.preventDefault();
                      openRecord(key);
                    }}
                  >
                    <span className="dh-today__waiting-title">
                      {item.title}
                    </span>
                    <span className="dh-today__waiting-meta">
                      Waiting for {item.subjectLabel} · {item.elapsedLabel}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
          <Link className="dh-today__waiting-all" to="/today/waiting">
            View all waiting ({waiting.count})
          </Link>
        </TodaySection>
      ) : null}
    </>
  ) : (
    <EmptyState
      size="compact"
      headingLevel={3}
      icon={<EntityIcon type="task" />}
      title="No Tasks yet"
      description="Your day’s tasks will appear here once you capture or plan one."
      primaryAction={
        <button
          type="button"
          className="dh-btn dh-btn--secondary"
          onClick={focusCapture}
        >
          Capture a Task
        </button>
      }
    />
  );

  /* -- Continue working (real active projects) body -- */

  const projectsBody =
    recentProjects.length > 0 ? (
      <CardCollection
        items={recentProjects}
        getItemId={(project) => project.id}
        renderCard={(project) => <Card {...projectCard(project)} />}
        ariaLabel="Recently active projects"
        presentation="grid"
      />
    ) : (
      <EmptyState
        size="compact"
        headingLevel={3}
        icon={<EntityIcon type="project" />}
        title="Nothing to continue"
        description="A Project appears here once its workflow status is set to Active in its Settings."
        primaryAction={
          <Link className="dh-btn dh-btn--secondary" to="/projects">
            Browse Projects
          </Link>
        }
      />
    );

  /*
   * Quick capture (TODAY-07, delivered by MOBILE-01).
   *
   * This was an honest fixture — a textarea that saved nothing and said so.
   * It is now the SHARED Quick Capture surface: each entry opens the one capture
   * sheet on that type, which posts to the module's canonical creation route.
   * Today therefore has no capture path of its own to keep in step, and the same
   * flow is reached from the phone bottom bar, the Command Palette and here.
   */
  const captureBody = (
    <div className="dh-today__capture" role="group" aria-label="Quick capture">
      <p className="dh-today__capture-hint">
        Capture it now; organise it later.
      </p>
      <div className="dh-today__capture-types">
        {CAPTURE_TYPE_DESCRIPTORS.map((descriptor, index) => (
          <button
            key={descriptor.type}
            type="button"
            className="dh-today__capture-type"
            // The first entry is the focus target for the "Focus Quick Capture"
            // command and Morning Brief's capture link, preserving PX-03's
            // keyboard route into capture.
            ref={index === 0 ? captureRef : undefined}
            onClick={(event) =>
              capture?.openCapture(descriptor.type, event.currentTarget)
            }
            data-testid={`today-capture-${descriptor.type}`}
          >
            <span className="dh-today__capture-type-icon" aria-hidden="true">
              <EntityIcon type={descriptor.entityType} />
            </span>
            {descriptor.label}
          </button>
        ))}
      </div>
    </div>
  );

  /* -- The widget registry → body map (null = the widget does not render) -- */

  /**
   * The hero's payload. When the landing read succeeded it is the server-derived
   * brief; otherwise it is composed from the planning data this component already
   * has, so the top of Today is never an empty band — the same "degrade, never
   * blank" rule the loader applies section by section (see `routes/index.tsx`).
   */
  const briefData: MorningBriefData = landing?.morningBrief ?? {
    // No time-of-day greeting without the landing read (the owner-local hour is
    // resolved server-side), and no name — so the hero leads with the day itself
    // rather than guessing at either.
    greeting: "Here’s your day",
    ownerName: null,
    dateLong: date,
    focusLine: briefFocusLine({
      overdueCount: planning?.summary.overdue ?? 0,
      plannedTodayCount: planning?.summary.planned ?? 0,
      inboxCount: planning?.anytime.length ?? 0,
      waitingCount: waiting?.count ?? 0,
      completedTodayCount: planning?.summary.completedToday ?? 0,
      activeProjectCount: recentProjects.length,
      projectsNeedingAttentionCount: 0,
      areasNeedingReviewCount: 0,
      goalsAtRiskCount: 0,
      hasDiaryToday: false,
    }),
    plannedTodayCount: planning?.summary.planned ?? 0,
    overdueCount: planning?.summary.overdue ?? 0,
    inboxCount: planning?.anytime.length ?? 0,
  };

  const stats = heroStats({
    summary: planning?.summary,
    meetingsRemaining: landing ? landing.meetings.remainingCount : null,
    projectsNeedingAttention: landing
      ? recentProjects.filter(
          (project) =>
            project.health !== null && healthNeedsAttention(project.health),
        ).length
      : null,
  });

  // Today's completion: what has been finished against everything committed to the
  // day (planned + already done). Overdue work is deliberately excluded — a day's
  // progress bar that can never reach the end is a guilt meter, not a measure.
  const committedToday =
    (planning?.summary.planned ?? 0) + (planning?.summary.completedToday ?? 0);

  /**
   * Insights, minus whatever the hero rail already states (POLISH-02).
   *
   * The two surfaces were derived from the same facts, so the page said "12
   * overdue", "5 waiting" and "3 projects needing attention" twice — once in the
   * hero and once in a panel a few hundred pixels away. Insights is now what the
   * hero does NOT carry: areas to review, goals at risk, the inbox. Whatever
   * remains is genuinely additional.
   *
   * The subtraction is conditional on the hero actually being rendered. The owner
   * can hide any widget, and a signal must not disappear from the product because
   * the surface that was covering it is switched off.
   */
  const heroVisible = regions.hero.length > 0;
  const insightSignals = useMemo(() => {
    const signals = landing?.insights.signals ?? [];
    if (!heroVisible) {
      return signals;
    }
    return signals.filter((signal) => !HERO_COVERED_SIGNALS.has(signal.id));
  }, [landing, heroVisible]);

  const renderWidgetBody = (id: TodayWidgetId): React.ReactNode => {
    switch (id) {
      case "morning-brief":
        return (
          <MorningBrief
            data={briefData}
            onCapture={focusCapture}
            stats={stats}
            progress={{
              done: planning?.summary.completedToday ?? 0,
              total: committedToday,
            }}
          />
        );
      case "my-day":
        return myDayBody;
      case "recent-activity":
        // Only mount the live feed once the server `now` is present (the route
        // provides it); the fixture/demo render omits it rather than fetching.
        return nowIso ? (
          <RecentActivityWidget
            nowIso={nowIso}
            renderEntityLink={renderActivityEntityLink}
          />
        ) : null;
      case "diary":
        return landing ? <DiaryWidget data={landing.diary} /> : null;
      case "notes":
        return <NotesWidget notes={landing?.notes ?? []} />;
      case "projects":
        return projectsBody;
      case "areas":
        return <AreasWidget areas={landing?.areas ?? []} />;
      case "goals":
        return <GoalsWidget data={landing?.goals ?? { goals: [] }} />;
      case "assets":
        return (
          <AssetsWidget
            data={
              landing?.assets ?? {
                items: [],
                trackedAsTasksCount: 0,
                overdueCount: 0,
              }
            }
          />
        );
      case "meetings":
        return (
          <MeetingsWidget
            data={landing?.meetings ?? { meetings: [], remainingCount: 0 }}
          />
        );
      case "insights":
        return <InsightsWidget signals={insightSignals} />;
      case "quick-capture":
        return captureBody;
      default:
        return null;
    }
  };

  const widgetCountFor = (id: TodayWidgetId): number | undefined => {
    switch (id) {
      case "notes":
        return landing?.notes.length;
      case "projects":
        return recentProjects.length;
      case "areas":
        return landing?.areas.length;
      case "goals":
        return landing?.goals.goals.length;
      case "meetings":
        return landing?.meetings.meetings.length;
      case "assets":
        return landing?.assets.items.length;
      case "insights":
        // The count is of what the widget RENDERS, not of what was derived —
        // the hero has already taken some of the signals.
        return landing ? insightSignals.length : undefined;
      default:
        return undefined;
    }
  };

  /**
   * A widget's ONE trailing destination, in the header (POLISH-02).
   *
   * Each list widget previews a bounded slice of a module, so each needs a way to
   * reach the rest. Those links used to be scattered — some at the foot of a body,
   * some absent, some duplicated by the empty state's own action — which is exactly
   * the inconsistency that makes a dashboard read as assembled rather than
   * designed. They are now one affordance in one place with one treatment.
   *
   * It is omitted when the widget is EMPTY, because an empty state already carries
   * its own next action and two links to the same module is one too many.
   */
  const widgetActionFor = (id: TodayWidgetId): React.ReactNode => {
    const link = (to: string, label: string, when: boolean) =>
      when ? (
        <Link className="dh-today-widget__link" to={to}>
          {label}
        </Link>
      ) : null;
    const count = widgetCountFor(id) ?? 0;
    switch (id) {
      case "notes":
        return link("/notes", "All notes", count > 0);
      case "projects":
        return link("/projects", "All projects", count > 0);
      case "areas":
        return link("/areas", "All areas", count > 0);
      case "goals":
        return link("/goals", "All goals", count > 0);
      case "meetings":
        return link("/meetings", "All meetings", count > 0);
      case "assets":
        return link("/assets", "All assets", count > 0);
      case "diary":
        return link(
          "/diary",
          "Open diary",
          (landing?.diary.today.length ?? 0) +
            (landing?.diary.recent.length ?? 0) >
            0,
        );
      default:
        return null;
    }
  };

  const renderWidget = (widget: ResolvedTodayWidget): React.ReactNode => {
    const id = widget.definition.id;
    const body = renderWidgetBody(id);
    if (body === null) {
      return null;
    }
    return (
      <TodayWidget
        key={id}
        definition={widget.definition}
        count={widgetCountFor(id)}
        action={widgetActionFor(id)}
        variant={widget.definition.column === "hero" ? "hero" : "panel"}
        // A widget alone in its region has nothing to reorder against, so the
        // move/pin controls would be permanently dead chrome.
        reorderable={widget.definition.column !== "hero"}
        collapsed={widget.collapsed}
        pinned={widget.pinned}
        isFirst={widget.isFirst}
        isLast={widget.isLast}
        customising={customising}
        onToggleCollapsed={layoutController.toggleCollapsed}
        onTogglePinned={layoutController.togglePinned}
        onHide={layoutController.toggleHidden}
        onMove={layoutController.move}
      >
        {body}
      </TodayWidget>
    );
  };

  return (
    <CollectionLayout
      title="Today"
      // POLISH-02 — the date is stated ONCE, in the hero, where it sits under the
      // greeting as part of the orientation the owner actually reads. It used to
      // be here as the pane subtitle AS WELL, so the surface opened with the same
      // long date twice, forty pixels apart. The pane header keeps the screen's
      // name and its one primary action.
      // POLISH-02 — Today opts into the WIDE dashboard measure. DS-14 caps a
      // collection at 90rem because a single list at 1440px becomes one row with a
      // title at one end and a pill at the other. That reasoning is about ROW
      // LENGTH, and it still binds here: Today is two columns, so at 108rem its
      // primary column is ~66rem — SHORTER than a capped single-column list, while
      // the secondary column stops a widescreen monitor from ending in 800px of
      // empty canvas. The measure is still capped; it is capped for this shape.
      className="dh-collection--dashboard"
      selection={bulkBar}
      primaryAction={
        <button
          type="button"
          className="dh-today__primary"
          onClick={focusCapture}
        >
          Quick capture
        </button>
      }
    >
      {/* DS-14 reference implementation — Today is a COLLECTION region.
          Everything on it is scanned rather than read: widgets of task rows,
          counts, statuses and links. The preset supplies the 14px/1.4 body, the
          tabular figures, the 12px section gap, the 9px row padding and the
          hairline between every row; nothing here restates any of those. */}
      <Region
        density="collection"
        className="dh-today"
        data-hydrated={hydrated ? "true" : "false"}
      >
        {/* Personalisation (TODAY-08): a calm "Customise" toggle reveals each
            widget’s move/pin/hide controls; the arrangement is remembered per device.
            Rendered only after hydration so the server markup stays stable. */}
        {layoutController.hydrated ? (
          <div className="dh-today__toolbar">
            <button
              type="button"
              className="dh-today__secondary"
              aria-pressed={customising}
              onClick={() => setCustomising((value) => !value)}
            >
              {customising ? "Done customising" : "Customise"}
            </button>
            {customising ? (
              <button
                type="button"
                className="dh-today__ghost"
                onClick={layoutController.reset}
              >
                Reset layout
              </button>
            ) : null}
            {customising && hiddenWidgets.length > 0 ? (
              <div
                className="dh-today__hidden"
                role="group"
                aria-label="Hidden widgets"
              >
                <span className="dh-today__hidden-label">Hidden:</span>
                {hiddenWidgets.map((widget) => (
                  <button
                    key={widget.id}
                    type="button"
                    className="dh-today__ghost"
                    onClick={() => layoutController.toggleHidden(widget.id)}
                  >
                    Show {widget.title}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* The three rendered regions (POLISH-02). The hero spans the surface;
            the two columns flow independently so neither leaves a hole waiting
            for the other, and they unwrap into one stack on a phone in the same
            order — orient, act, refer. A region with nothing visible in it
            renders NOTHING, so hiding every widget in a column can never leave an
            empty container holding a gap open. */}
        {regions.hero.map(renderWidget)}

        {regions.primary.length > 0 || regions.secondary.length > 0 ? (
          <div className="dh-today__columns">
            {regions.primary.length > 0 ? (
              <div className="dh-today__column dh-today__column--primary">
                {regions.primary.map(renderWidget)}
              </div>
            ) : null}
            {regions.secondary.length > 0 ? (
              <div className="dh-today__column dh-today__column--secondary">
                {regions.secondary.map(renderWidget)}
              </div>
            ) : null}
          </div>
        ) : null}
      </Region>
    </CollectionLayout>
  );
}

/**
 * The multi-select bulk planning action bar (TODAY-04), shown in the CollectionLayout
 * selection slot while tasks are selected. It plans many tasks at once — Today,
 * Tomorrow, Next week, a custom date, or Clear plan — through ONE atomic operation.
 * Keyboard-complete, labelled, and no modal-in-modal: the custom date is an inline
 * native date input.
 */
function PlanningBulkBar({
  count,
  targets,
  pending,
  onPlan,
  onCancel,
}: {
  readonly count: number;
  readonly targets: PlanTargets;
  readonly pending: boolean;
  readonly onPlan: (scheduledDate: string | null) => void;
  readonly onCancel: () => void;
}) {
  const [customDate, setCustomDate] = useState("");
  return (
    <div
      className="dh-today__bulk"
      role="group"
      aria-label={`Plan ${count} selected ${count === 1 ? "task" : "tasks"}`}
    >
      <p className="dh-today__bulk-count" aria-live="polite">
        {count} selected
      </p>
      <div className="dh-today__bulk-actions">
        <button
          type="button"
          className="dh-today__secondary"
          disabled={pending}
          onClick={() => onPlan(targets.today)}
        >
          Plan today
        </button>
        <button
          type="button"
          className="dh-today__secondary"
          disabled={pending}
          onClick={() => onPlan(targets.tomorrow)}
        >
          Tomorrow
        </button>
        <button
          type="button"
          className="dh-today__secondary"
          disabled={pending}
          onClick={() => onPlan(targets.nextWeek)}
        >
          Next week
        </button>
        <button
          type="button"
          className="dh-today__secondary"
          disabled={pending}
          onClick={() => onPlan(null)}
        >
          Clear plan
        </button>
        <span className="dh-today__bulk-custom">
          <label
            className="dh-visually-hidden"
            htmlFor="today-bulk-custom-date"
          >
            Choose a date for the selected tasks
          </label>
          <input
            id="today-bulk-custom-date"
            type="date"
            className="dh-today__bulk-date"
            value={customDate}
            disabled={pending}
            onChange={(event) => {
              const value = event.target.value;
              setCustomDate(value);
              if (value !== "") {
                onPlan(value);
              }
            }}
          />
        </span>
        <button
          type="button"
          className="dh-today__bulk-cancel"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
