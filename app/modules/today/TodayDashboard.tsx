/**
 * TODAY-01 — the Today dashboard composition.
 *
 * The first genuinely useful DalyHub screen: the calm surface the owner lands on
 * every morning. It is NOT a reporting dashboard — it is Linear/Things/Craft-calm,
 * focused and minimal. It is composed ENTIRELY from the shared design system over
 * DS-01 tokens — no bespoke visual language:
 *   - the PX-02 CollectionLayout owns the sticky Pane Header (title "Today",
 *     subtitle = the current date, one primary action "Quick capture") and the
 *     pane's scroll + state precedence;
 *   - each section presents its records through the ONE DS-04 Card (identity icon +
 *     accent, status/date/progress as text) in a CardCollection;
 *   - a card opens the DS-03 Drawer hosting a DS-02 Record Layout (the canonical
 *     Card → drawer key → RecordLayout chain);
 *   - the shared EmptyState guards every section and the whole surface, so it can
 *     never render a blank region (PRODUCT_EXPERIENCE Part IV §5).
 *
 * It is a PURE presentation component: it takes typed data and a date label, and
 * owns only optimistic, in-memory UI state (which focus tasks are ticked, the quick
 * capture draft). There is no persistence, parsing or AI (TODAY-01 is fixture-only);
 * "Future implementation will connect Tasks" by swapping the data source, not this
 * composition.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { Card, CardCollection } from "~/shared/card";
import type { CardProps } from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import { useDrawer, withDrawerPushed } from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
// Import the specific modules (not the `~/shared/commands` barrel) so the Today
// route chunk does not eagerly pull the palette controller / DS-08 Search UI.
import { toCardAction, type AppAction } from "~/shared/commands/action";
import { useRegisterContextualActions } from "~/shared/commands/CommandContextProvider";

import { TODAY_CAPTURE_PARAM, TODAY_CAPTURE_VALUE } from "./commands";
import { UPCOMING_KIND } from "./fixtures";
import type {
  ActiveProject,
  FocusTask,
  RecentNote,
  TimelineEntry,
  TodayData,
  UpcomingItem,
} from "./fixtures";
import type { WaitingSummary } from "./task/waiting-view";

export type TodayDashboardProps = {
  /**
   * Today's data. TODAY-02: `focus` is real, workspace-scoped task data (open
   * tasks) supplied by the route loader; the other sections remain fixture-backed
   * until their modules connect (the preserved seam).
   */
  readonly data: TodayData;
  /** The formatted current date, rendered as the pane-header subtitle. */
  readonly date: string;
  /**
   * Persist a focus task's completion (TODAY-02). When provided, completing a task
   * on Today writes through to the same task the Drawer edits, and a revalidation
   * keeps Today and the Drawer consistent. Absent in fixture/demo rendering, where
   * completion is an in-memory optimistic demonstration only.
   */
  readonly onCompleteTask?: (taskId: string, complete: boolean) => void;
  /**
   * The active Waiting summary (TODAY-03): the count of waiting tasks and a small
   * preview. Rendered as a quiet summary section linking to `/today/waiting`; the
   * full Waiting collection is not duplicated on Today. Omitted in fixture/demo
   * rendering (no waiting section shown).
   */
  readonly waiting?: WaitingSummary;
};

const PROJECT_STATUS: Record<ActiveProject["status"], CardProps["status"]> = {
  active: { label: "Active", tone: "info" },
  paused: { label: "Paused", tone: "warning" },
  blocked: { label: "Blocked", tone: "danger" },
};

/**
 * A labelled Today section: a quiet `xs`-muted heading + optional count over its
 * content (PRODUCT_EXPERIENCE Part V, "Today" — "quiet section label, xs muted").
 * A real `section`/heading keeps the pane's document outline correct and lets
 * assistive tech jump between the morning's regions.
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
      <h2 id={headingId} className="dh-today__section-label">
        {label}
        {count !== undefined ? (
          <span className="dh-today__section-count"> {count}</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

export function TodayDashboard({
  data,
  date,
  waiting,
  onCompleteTask,
}: TodayDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { openDrawer, topKey } = useDrawer();
  const captureRef = useRef<HTMLTextAreaElement>(null);

  // Optimistic completion overrides, keyed by task id → intended done state. The
  // server's `done` is the base truth; an override reflects an in-flight toggle and
  // is cleared once fresh data arrives (a revalidation reconciles).
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(
    new Map(),
  );
  const [draft, setDraft] = useState("");
  const [captureNotice, setCaptureNotice] = useState("");

  // A hydration marker so tests can wait for client interactivity before driving
  // controlled inputs (React resets a controlled value on hydration, so typing
  // before then is lost). Mirrors the design fixtures' `data-hydrated` hook.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Reconcile: once the loader returns fresh focus data, drop optimistic overrides.
  useEffect(() => {
    setOverrides((prev) => (prev.size === 0 ? prev : new Map()));
  }, [data.focus]);

  const isDone = useCallback(
    (task: FocusTask) =>
      overrides.has(task.id) ? overrides.get(task.id)! : task.done,
    [overrides],
  );

  const upcoming = useMemo(
    () => [...data.upcoming].sort((a, b) => a.sortKey - b.sortKey),
    [data.upcoming],
  );
  const timeline = useMemo(
    () => [...data.timeline].sort((a, b) => a.sortKey - b.sortKey),
    [data.timeline],
  );

  // A shareable drawer deep link (href) paired with an in-app SPA open (onOpen) —
  // the ideal DS-03 integration. Filter params (none here) would be preserved.
  const openProps = (key: string) => ({
    href: `?${withDrawerPushed(searchParams, key).toString()}`,
    onOpen: () => openDrawer(key),
  });

  const toggleDone = useCallback(
    (task: FocusTask) => {
      const willBeDone = !(overrides.has(task.id)
        ? overrides.get(task.id)!
        : task.done);
      setOverrides((prev) => {
        const next = new Map(prev);
        next.set(task.id, willBeDone);
        return next;
      });
      // Persist through to the real task (TODAY-02); optimistic UI above shows the
      // change immediately and a revalidation reconciles with the server result.
      onCompleteTask?.(task.id, willBeDone);
    },
    [overrides, onCompleteTask],
  );

  const focusCapture = useCallback(() => {
    captureRef.current?.focus();
    captureRef.current?.scrollIntoView({ block: "center" });
  }, []);

  // "Focus Quick Capture" navigates to /today?capture=1; on arrival we focus the
  // existing textarea and then clean the param (replace, no Back-button trap),
  // preserving any other params and WITHOUT clearing the draft or claiming a save.
  useEffect(() => {
    if (searchParams.get(TODAY_CAPTURE_PARAM) !== TODAY_CAPTURE_VALUE) {
      return;
    }
    focusCapture();
    const next = new URLSearchParams(searchParams);
    next.delete(TODAY_CAPTURE_PARAM);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [searchParams, setSearchParams, focusCapture]);

  // ONE shared action drives the pane-header button, the palette "Current context"
  // entry and the keyboard path — one identity, one execution path (ADR-024 §24.14).
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

  // Run any shared action's client callback (the SAME path the palette uses).
  const activateAction = useCallback((action: AppAction) => {
    if (action.kind === "run") {
      void action.run();
    }
  }, []);

  // A task's Complete/Reopen as ONE shared action instance — reused by the Card
  // quick action and, when that task's Drawer is open, by the palette (below). It
  // is an IN-MEMORY UI demonstration only: it toggles session state and says so —
  // it never persists a Task or claims one was saved (ADR-024 §24.15).
  const taskToggleAction = useCallback(
    (task: FocusTask): AppAction => {
      const done = isDone(task);
      return {
        id: `today.action.task.${task.id}.toggle`,
        title: done ? "Reopen" : "Complete",
        subtitle: task.title,
        keywords: ["task", "done", "complete", "reopen"],
        kind: "run",
        run: () => {
          toggleDone(task);
          return {
            ok: true,
            message: done ? "Task reopened." : "Task completed.",
          };
        },
      };
    },
    [isDone, toggleDone],
  );

  // Context-aware palette: "Focus Quick Capture" is always relevant on Today, and a
  // task-specific action appears ONLY while that task's Drawer is open — the Today
  // surface owns the opaque `task:<id>` parsing; the shared infrastructure never
  // learns what it means (ADR-024 §24.16). Closing the Drawer removes it.
  const contextualActions = useMemo<readonly AppAction[]>(() => {
    const actions: AppAction[] = [focusCaptureAction];
    if (topKey?.startsWith("task:")) {
      const id = topKey.slice("task:".length);
      const task = data.focus.find((t) => t.id === id);
      if (task !== undefined) {
        actions.push(taskToggleAction(task));
      }
    }
    return actions;
  }, [focusCaptureAction, topKey, data.focus, taskToggleAction]);

  useRegisterContextualActions(contextualActions);

  const onCapture = (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.trim() === "") {
      return;
    }
    // TODAY-01 is fixture-only: Quick Capture is NOT connected — nothing is
    // persisted, parsed or sent to AI. Crucially we do NOT clear the draft (that
    // would silently discard the owner's unsaved text) and we never claim it was
    // captured/saved. We just tell the truth; the field stays editable. The
    // future persistence implementation (Tasks/Inbox) plugs in here.
    setCaptureNotice(
      "Quick Capture is not connected yet. Your draft has not been saved.",
    );
  };

  const taskCard = (task: (typeof data.focus)[number]): CardProps => {
    const done = isDone(task);
    return {
      id: task.id,
      title: task.title,
      typeLabel: "Task",
      icon: <EntityIcon type="task" />,
      accent: "accent",
      context: { label: task.context },
      status: done ? { label: "Done", tone: "success" } : undefined,
      // The Card quick action is the SAME shared action the palette runs when the
      // task's Drawer is open — one identity, one execution path (ADR-024 §24.14).
      quickActions: [
        toCardAction(taskToggleAction(task), { onActivate: activateAction }),
      ],
      density: "compact",
      presentation: "list",
      className: done ? "dh-today__task--done" : undefined,
      ...openProps(`task:${task.id}`),
    };
  };

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
    // The Today dashboard is a multi-section surface, not a single filtered
    // collection: each section renders its own gentle empty note (so nothing is
    // ever blank) and Quick Capture stays mounted and usable even when every data
    // section is empty — so we do NOT gate the whole surface behind an empty slot
    // (which would unmount the capture field and strand a first-time owner).
    <CollectionLayout
      title="Today"
      subtitle={date}
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
        {/* Section 1 — Today's Focus */}
        <TodaySection
          id="today-focus"
          label="Today's focus"
          count={data.focus.length}
        >
          {data.focus.length > 0 ? (
            <CardCollection
              items={data.focus}
              getItemId={(task) => task.id}
              renderCard={(task) => <Card {...taskCard(task)} />}
              ariaLabel="Today's focus tasks"
              presentation="list"
              density="compact"
            />
          ) : (
            <p className="dh-today__section-empty">
              Nothing pinned. Pull a task in to focus your day.
            </p>
          )}
        </TodaySection>

        {/* Waiting summary (TODAY-03) — only when something is waiting, so Today
            stays calm. A count + preview + link to the full Waiting view; the
            collection itself is not duplicated here. */}
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
                        openDrawer(key);
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

        {/* Section 2 — Upcoming */}
        <TodaySection
          id="today-upcoming"
          label="Upcoming"
          count={upcoming.length}
        >
          {upcoming.length > 0 ? (
            <CardCollection
              items={upcoming}
              getItemId={(item) => item.id}
              renderCard={(item) => <Card {...upcomingCard(item)} />}
              ariaLabel="Upcoming meetings, reminders and deadlines"
              presentation="list"
              density="compact"
            />
          ) : (
            <p className="dh-today__section-empty">Nothing scheduled ahead.</p>
          )}
        </TodaySection>

        {/* Section 3 — Continue working */}
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

        {/* Section 4 — Recent notes */}
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

        {/* Section 5 — Daily timeline */}
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

        {/* Section 6 — Quick capture */}
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
