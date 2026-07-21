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
 * tasks appear only under the collapsed "Completed today". The non-task sections
 * (calendar, projects, notes, timeline, quick capture) stay fixture-backed until
 * their modules connect — the preserved seam.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher, useSearchParams } from "react-router";

import { Card, CardCollection, closeActiveSwipeTray } from "~/shared/card";
import type { CardAction, CardProps } from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import { useDrawer, withDrawerPushed } from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
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
import { UPCOMING_KIND } from "./fixtures";
import type {
  ActiveProject,
  RecentNote,
  TimelineEntry,
  TodayData,
  UpcomingItem,
} from "./fixtures";
import type { PlanActionData } from "./routes/plan";
import { formatCalendarDate } from "./task/task-view";
import type {
  PlanningData,
  PlanningTaskItem,
  PlanTargets,
} from "./task/planning-view";
import type { WaitingSummary } from "./task/waiting-view";

export type TodayDashboardProps = {
  /**
   * Today's fixture data (the non-task demo sections). The real task data flows
   * through `planning`; the fixture sections remain the preserved seam.
   */
  readonly data: TodayData;
  /** The formatted current date, rendered as the pane-header subtitle. */
  readonly date: string;
  /** The owner's calendar date `YYYY-MM-DD`, for due/overdue comparisons. */
  readonly todayIso?: string;
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

const PROJECT_STATUS: Record<ActiveProject["status"], CardProps["status"]> = {
  active: { label: "Active", tone: "info" },
  paused: { label: "Paused", tone: "warning" },
  blocked: { label: "Blocked", tone: "danger" },
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
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly count?: number;
  readonly children: React.ReactNode;
}) {
  const headingId = `${id}-label`;
  return (
    <section className="dh-today__section" aria-labelledby={headingId}>
      {/* `tabIndex={-1}`: not in the tab order, but a "Go to <section>" command can
          move focus here (announcing the section) without adding a tab stop. */}
      <h2 id={headingId} tabIndex={-1} className="dh-today__section-label">
        {label}
        {count !== undefined ? (
          <span className="dh-today__section-count"> {count}</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

/** The calm planning summary strip — operational awareness, never analytics. */
function PlanningSummary({
  summary,
}: {
  readonly summary: PlanningData["summary"];
}) {
  const stats: readonly {
    readonly id: string;
    readonly value: number;
    readonly label: string;
  }[] = [
    { id: "planned", value: summary.planned, label: "planned" },
    { id: "overdue", value: summary.overdue, label: "overdue" },
    { id: "waiting", value: summary.waiting, label: "waiting" },
    {
      id: "completed",
      value: summary.completedToday,
      label: "completed today",
    },
  ];
  return (
    <div
      className="dh-today__summary"
      role="group"
      aria-label="Today at a glance"
    >
      {stats.map((stat) => (
        <p key={stat.id} className="dh-today__summary-stat">
          <span className="dh-today__summary-value">{stat.value}</span>
          <span className="dh-today__summary-label">{stat.label}</span>
        </p>
      ))}
    </div>
  );
}

export function TodayDashboard({
  data,
  date,
  todayIso,
  planning,
  waiting,
  onCompleteTask,
  onPlan,
}: TodayDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openDrawer, closeDrawer, isOpen: drawerOpen } = useDrawer();
  const { notifySuccess, notifyError } = useFeedback();

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
  const captureRef = useRef<HTMLTextAreaElement>(null);
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
  const [draft, setDraft] = useState("");
  const [captureNotice, setCaptureNotice] = useState("");

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

  // The keyboard-navigable open-task collection, in visual order (TODAY-05). Only
  // the OPEN planning sections are roving members; the collapsed "Completed today"
  // section keeps natural tab behaviour and is not navigated with the arrow keys.
  const rovingOrder = useMemo<RovingOrder>(() => {
    if (!planning) {
      return [];
    }
    return OPEN_BUCKETS.map((bucket) => ({
      id: bucket,
      taskIds: planning[bucket].map((item) => item.id),
    }));
  }, [planning]);

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

  const upcoming = useMemo(
    () => [...data.upcoming].sort((a, b) => a.sortKey - b.sortKey),
    [data.upcoming],
  );
  const timeline = useMemo(
    () => [...data.timeline].sort((a, b) => a.sortKey - b.sortKey),
    [data.timeline],
  );

  const openProps = (key: string) => ({
    href: `?${withDrawerPushed(searchParams, key).toString()}`,
    onOpen: () => openRecord(key),
  });

  const focusCapture = useCallback(() => {
    captureRef.current?.focus();
    captureRef.current?.scrollIntoView({ block: "center" });
  }, []);

  useEffect(() => {
    if (searchParams.get(TODAY_CAPTURE_PARAM) !== TODAY_CAPTURE_VALUE) {
      return;
    }
    focusCapture();
    const next = new URLSearchParams(searchParams);
    next.delete(TODAY_CAPTURE_PARAM);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [searchParams, setSearchParams, focusCapture]);

  const focusCaptureAction = useMemo<AppAction>(
    () => ({
      id: "today.action.focus_capture",
      title: "Focus Quick Capture",
      subtitle: "Jump to the capture field on Today",
      keywords: ["capture", "quick", "add", "new", "inbox"],
      kind: "run",
      run: () => {
        focusCapture();
        return { ok: true };
      },
    }),
    [focusCapture],
  );

  const activateAction = useCallback((action: AppAction) => {
    if (action.kind === "run") {
      void action.run();
    }
  }, []);

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

    return [focusCaptureAction, ...globals, ...taskCommands];
  }, [
    focusCaptureAction,
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

  const onCapture = (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.trim() === "") {
      return;
    }
    setCaptureNotice(
      "Quick Capture is not connected yet. Your draft has not been saved.",
    );
  };

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
    const dueLabel = item.dueDate ? formatCalendarDate(item.dueDate) : null;
    const overdue =
      !done &&
      item.dueDate !== null &&
      referenceIso !== "" &&
      item.dueDate < referenceIso;
    // The SAME state-appropriate actions drive the visible quick actions and the
    // touch swipe tray (TODAY-06) — one identity, one execution path; the tray is an
    // accelerator over the always-available buttons, never a touch-only action.
    const actions = planQuickActions(item, bucket);
    return {
      id: item.id,
      title: item.title,
      typeLabel: "Task",
      icon: <EntityIcon type="task" />,
      accent: "accent",
      headingLevel: 3,
      context: item.parent ? { label: item.parent.title } : undefined,
      status: done ? { label: "Done", tone: "success" } : undefined,
      dateLabel: dueLabel
        ? { label: `Due ${dueLabel}`, tone: overdue ? "danger" : "neutral" }
        : undefined,
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

  const planningSection = (
    id: string,
    label: string,
    bucket: PlanBucket,
    items: readonly PlanningTaskItem[],
  ) => (
    <TodaySection id={id} label={label} count={items.length}>
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

  /* -- Fixture card builders (unchanged) -- */

  const upcomingCard = (item: UpcomingItem): CardProps => {
    const identity = UPCOMING_KIND[item.kind];
    return {
      id: item.id,
      title: item.title,
      typeLabel: identity.label,
      icon: <EntityIcon type={identity.entity} />,
      accent: "accent",
      dateLabel: {
        label: item.when,
        tone: item.kind === "deadline" ? "warning" : "neutral",
      },
      ...(item.context ? { context: { label: item.context } } : {}),
      density: "compact",
      presentation: "list",
      ...openProps(`upcoming:${item.id}`),
    };
  };

  const projectCard = (project: ActiveProject): CardProps => ({
    id: project.id,
    title: project.title,
    typeLabel: "Project",
    icon: <EntityIcon type="project" />,
    accent: "accent",
    status: PROJECT_STATUS[project.status],
    context: { label: project.area },
    progress: { value: project.progress },
    presentation: "grid",
    ...openProps(`project:${project.id}`),
  });

  const noteCard = (note: RecentNote): CardProps => ({
    id: note.id,
    title: note.title,
    typeLabel: "Note",
    icon: <EntityIcon type="note" />,
    accent: "accent",
    subtitle: note.snippet,
    dateLabel: { label: note.lastEdited },
    density: "compact",
    presentation: "list",
    ...openProps(`note:${note.id}`),
  });

  return (
    <CollectionLayout
      title="Today"
      subtitle={date}
      selection={bulkBar}
      primaryAction={
        <button
          type="button"
          className="dh-today__primary"
          onClick={() => activateAction(focusCaptureAction)}
        >
          Quick capture
        </button>
      }
    >
      <div className="dh-today" data-hydrated={hydrated ? "true" : "false"}>
        {planning ? (
          <>
            <PlanningSummary summary={planning.summary} />

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
                    planning.overdue,
                  )
                : null}

              <TodaySection
                id="today-planned"
                label="Today"
                count={planning.today.length}
              >
                {planning.today.length > 0 ? (
                  <CardCollection
                    items={planning.today}
                    getItemId={(item) => item.id}
                    renderCard={(item) => (
                      <Card {...planningCard(item, "today")} />
                    )}
                    ariaLabel="Tasks planned for today"
                    presentation="list"
                    density="compact"
                  />
                ) : (
                  <p className="dh-today__section-empty">
                    Nothing planned yet. Pull a task in from Anytime to commit
                    to your day.
                  </p>
                )}
              </TodaySection>

              {planning.upcoming.length > 0
                ? planningSection(
                    "today-upcoming-tasks",
                    "Upcoming",
                    "upcoming",
                    planning.upcoming,
                  )
                : null}

              {planning.anytime.length > 0
                ? planningSection(
                    "today-anytime",
                    "Anytime",
                    "anytime",
                    planning.anytime,
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
          </>
        ) : null}

        {/* Waiting summary (TODAY-03) — only when something is waiting, so Today
            stays calm. A count + preview + link to the full Waiting view; waiting
            tasks never appear in the planning sections above (ADR-029/030). */}
        {waiting && waiting.count > 0 ? (
          <TodaySection
            id="today-waiting"
            label="Waiting"
            count={waiting.count}
          >
            <ul
              className="dh-today__waiting"
              aria-label="Waiting tasks preview"
            >
              {waiting.preview.map((item) => {
                const key = `task:${item.id}`;
                return (
                  <li key={item.id} className="dh-today__waiting-item">
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

        {/* On your calendar (fixture meetings/reminders/deadlines) */}
        <TodaySection
          id="today-calendar"
          label="On your calendar"
          count={upcoming.length}
        >
          {upcoming.length > 0 ? (
            <CardCollection
              items={upcoming}
              getItemId={(item) => item.id}
              renderCard={(item) => <Card {...upcomingCard(item)} />}
              ariaLabel="Meetings, reminders and deadlines"
              presentation="list"
              density="compact"
            />
          ) : (
            <p className="dh-today__section-empty">Nothing scheduled ahead.</p>
          )}
        </TodaySection>

        {/* Continue working (fixture projects) */}
        <TodaySection
          id="today-projects"
          label="Continue working"
          count={data.projects.length}
        >
          {data.projects.length > 0 ? (
            <CardCollection
              items={data.projects}
              getItemId={(project) => project.id}
              renderCard={(project) => <Card {...projectCard(project)} />}
              ariaLabel="Recently active projects"
              presentation="grid"
            />
          ) : (
            <p className="dh-today__section-empty">
              No recent projects to continue.
            </p>
          )}
        </TodaySection>

        {/* Recent notes (fixture) */}
        <TodaySection
          id="today-notes"
          label="Recent notes"
          count={data.notes.length}
        >
          {data.notes.length > 0 ? (
            <CardCollection
              items={data.notes}
              getItemId={(note) => note.id}
              renderCard={(note) => <Card {...noteCard(note)} />}
              ariaLabel="Recent notes"
              presentation="list"
              density="compact"
            />
          ) : (
            <p className="dh-today__section-empty">No notes edited recently.</p>
          )}
        </TodaySection>

        {/* Daily timeline (fixture) */}
        <TodaySection id="today-timeline" label="Daily timeline">
          {timeline.length > 0 ? (
            <ol className="dh-today__timeline">
              {timeline.map((entry: TimelineEntry) => (
                <li key={entry.id} className="dh-today__timeline-row">
                  <span className="dh-today__timeline-time">{entry.time}</span>
                  <span className="dh-today__timeline-label">
                    {entry.label}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="dh-today__section-empty">
              Your day&rsquo;s timeline will appear here.
            </p>
          )}
        </TodaySection>

        {/* Quick capture (fixture, inert) */}
        <TodaySection id="today-capture" label="Quick capture">
          <form className="dh-today__capture" onSubmit={onCapture}>
            <label className="dh-visually-hidden" htmlFor="today-capture-input">
              What needs your attention?
            </label>
            <textarea
              id="today-capture-input"
              ref={captureRef}
              className="dh-today__capture-input"
              rows={2}
              placeholder="What needs your attention?"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (captureNotice) setCaptureNotice("");
              }}
            />
            <div className="dh-today__capture-row">
              <p className="dh-today__capture-hint">
                Just structure for now — nothing is saved yet.
              </p>
              <button
                type="submit"
                className="dh-today__secondary"
                disabled={draft.trim() === ""}
              >
                Capture
              </button>
            </div>
            <p
              className="dh-today__capture-notice"
              role="status"
              aria-live="polite"
            >
              {captureNotice}
            </p>
          </form>
        </TodaySection>
      </div>
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
