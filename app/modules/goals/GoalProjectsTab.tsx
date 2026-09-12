/**
 * AREA-02 / DEBT-22 — the Goal record's Projects tab.
 *
 * The Projects directly advancing this Goal, rendered as shared DS-04 Cards, with a
 * real interactive "Load more" affordance (the shared `LoadMore` control) that
 * reaches EVERY contributing Project through bounded keyset pagination — never a
 * single silent first page. It mirrors `ProjectTasksTab` exactly: a fetcher hits the
 * dedicated `/goals/:goalId/projects` endpoint, so "Load more" NEVER navigates and
 * the record route's `?tab=`/`?drawer=` state, scroll position and focus stay
 * undisturbed. Pagination state and drawer/tab state are wholly independent.
 *
 * The tab badge stays the EXACT, complete `contribution.total`
 * (`GoalRepository.getGoalProjectContribution`) supplied by the parent — never this
 * page's array length — so a Goal with more Projects than one page still reports the
 * true total while only a bounded number of rows load.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLocation } from "react-router";

import { DrawerTrigger } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { NEW_PROJECT_FOR_GOAL_KEY } from "~/shared/project-creation";
import { LoadMore } from "~/shared/load-more";
import { ProjectSummaryList } from "~/shared/project-list";
import type { ProjectSummaryItem } from "~/shared/project-list";

import { goalProjectStateLabel } from "./goal-view";
import type { SerializedGoalProjectItem } from "./goal-view";
import { buttonClassName } from "~/shared/ui";

interface GoalProjectsTabProps {
  readonly goalId: string;
  /** The loader's bounded first page of contributing Projects. */
  readonly projects: readonly SerializedGoalProjectItem[];
  /** Opaque cursor for the next Project page, or null when exhausted. */
  readonly nextCursor: string | null;
}

/** The subset of the projects endpoint's payload a "Load more" fetch reads back. */
type ProjectsPageData = {
  readonly projects: readonly SerializedGoalProjectItem[];
  readonly nextCursor: string | null;
};

/**
 * True when two location searches differ ONLY in the `?drawer=` param — i.e. the
 * navigation opened, closed or swapped a Task Drawer (from the Alignment evidence
 * links) and changed nothing about which Projects the list should show. Everything
 * else (a fully-identical URL — the signature of an in-place mutation revalidation)
 * is NOT drawer-only, so the accumulation is reconciled from the fresh first page.
 */
function isDrawerOnlyChange(prev: string, next: string): boolean {
  if (prev === next) {
    return false;
  }
  const a = new URLSearchParams(prev);
  const b = new URLSearchParams(next);
  const drawerDiffers = a.get("drawer") !== b.get("drawer");
  a.delete("drawer");
  b.delete("drawer");
  return drawerDiffers && a.toString() === b.toString();
}

/**
 * Accumulate keyset pages of a Goal's contributing Projects behind "Load more"
 * WITHOUT navigating — a fetcher hits the dedicated `/goals/:id/projects` endpoint,
 * so the record route's tab/drawer state, scroll position and focus are never
 * disturbed. The loader's first page seeds the list; duplicate ids are collapsed
 * defensively so a Project card can never render twice, and a Project sitting exactly
 * on a page boundary appears once.
 *
 * Reset policy mirrors `ProjectTasksTab`: the accumulation is dropped ONLY when the
 * record loader actually re-ran with the URL otherwise unchanged (a mutation
 * revalidation — e.g. the Goal was completed/reopened, or its details edited), so a
 * changed Project set is reconciled from the authoritative fresh first page. It is
 * NOT dropped when the ONLY change was the `?drawer=` param, so opening an Alignment
 * evidence Task Drawer keeps the loaded pages. A late/stale fetch response is guarded
 * by the `processed` marker so it can never be merged after a reset.
 */
function useGoalProjectPagination(
  goalId: string,
  firstPage: readonly SerializedGoalProjectItem[],
  initialCursor: string | null,
) {
  const fetcher = useFetcher<ProjectsPageData>();
  const location = useLocation();
  const [appended, setAppended] = useState<SerializedGoalProjectItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadFailed, setLoadFailed] = useState(false);
  const processed = useRef<ProjectsPageData | null>(null);
  const prevFirstPage = useRef(firstPage);
  const prevSearch = useRef(location.search);
  // A monotonic pagination generation, bumped on every reset (Goal change or
  // mutation revalidation). Each "Load more" captures the immutable request scope
  // `{ gen, goalId }` at dispatch; a response is applied ONLY if that scope still
  // matches the active Goal and generation — so a late response from a "Load more"
  // on Goal A that resolves AFTER navigating to Goal B is discarded, never
  // appended into Goal B. Object identity alone is insufficient: a stale response
  // arrives as a NEW payload.
  const generation = useRef(0);
  const pending = useRef<{ gen: number; goalId: string } | null>(null);

  useEffect(() => {
    // `firstPage` is a loader-provided prop, so a new identity means the record
    // loader actually re-ran; a plain local re-render (load-more state) leaves it
    // unchanged and must not reset anything.
    if (prevFirstPage.current === firstPage) {
      prevSearch.current = location.search;
      return;
    }
    const drawerOnly = isDrawerOnlyChange(prevSearch.current, location.search);
    prevFirstPage.current = firstPage;
    prevSearch.current = location.search;
    if (drawerOnly) {
      return;
    }
    // A filter/Goal change or a mutation revalidation — start a NEW generation so
    // any in-flight request's response is discarded on arrival, and forget the
    // pending scope entirely.
    generation.current += 1;
    pending.current = null;
    setAppended([]);
    setCursor(initialCursor);
    setLoadFailed(false);
    // Mark the current fetcher payload as already consumed rather than clearing
    // the marker, so a stale response from a prior "Load more" cannot be
    // re-appended after this reset.
    processed.current = fetcher.data ?? null;
  }, [firstPage, location.search, initialCursor, fetcher.data]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) {
      return;
    }
    const data = fetcher.data;
    if (processed.current === data) {
      return;
    }
    processed.current = data;
    // Bind the response to the request scope: discard a stale response whose Goal
    // or pagination generation no longer matches the active one.
    const scope = pending.current;
    pending.current = null;
    if (!scope || scope.goalId !== goalId || scope.gen !== generation.current) {
      return;
    }
    // The endpoint returns `{ projects, nextCursor }` on success; a 4xx JSON body
    // has neither, so treat a missing `projects` array as a calm, retryable failure.
    if (!Array.isArray(data.projects)) {
      setLoadFailed(true);
      return;
    }
    setAppended((prev) => [...prev, ...data.projects]);
    setCursor(data.nextCursor ?? null);
    setLoadFailed(false);
  }, [fetcher.state, fetcher.data, goalId]);

  const loadMore = useCallback(() => {
    if (cursor === null) {
      return;
    }
    setLoadFailed(false);
    pending.current = { gen: generation.current, goalId };
    fetcher.load(
      `/goals/${encodeURIComponent(goalId)}/projects?cursor=${encodeURIComponent(cursor)}`,
    );
  }, [cursor, fetcher, goalId]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: SerializedGoalProjectItem[] = [];
    for (const project of [...firstPage, ...appended]) {
      if (seen.has(project.id)) {
        continue;
      }
      seen.add(project.id);
      out.push(project);
    }
    return out;
  }, [firstPage, appended]);

  return {
    items,
    hasMore: cursor !== null,
    loading: fetcher.state !== "idle",
    loadFailed,
    loadMore,
  };
}

/**
 * One contributing Project, as the SHARED summary row needs it.
 *
 * UNTITLED-05 — this tab used to build its own `CardProps` for the generic
 * `Card`, which drew a 12px monochrome glyph, a mini bar inlined mid-sentence
 * and a status chip floated to the far right. An Area's Projects tab did the
 * same thing differently, and neither resembled the Project `/projects` draws.
 * Both are now the one shared table, so a Project is one object wherever it is
 * reached from.
 *
 * `signal` is `null` because this projection carries no health facts — the
 * Goal's contributing-Project read is a lighter one — so the tab declares
 * `showSignal={false}` and the column is not drawn at all, rather than drawn
 * empty. An absent fact is never rendered as a blank cell under a heading.
 *
 * `iconKey`/`colourSlot`/`colourRank` are likewise absent from this projection,
 * so the mark is the Project's neutral entity glyph. That is a deliberate
 * narrowing of what this surface knows, not a different drawing of what it
 * knows: extending `SerializedGoalProjectItem` belongs to the Goals migration.
 */
function toProjectSummary(
  project: SerializedGoalProjectItem,
): ProjectSummaryItem {
  const hasTasks = project.taskTotal > 0;
  return {
    id: project.id,
    title: project.title,
    status: goalProjectStateLabel(project),
    /*
     * UIX-03 — the task count is stated ONCE, and a Project with no tasks draws
     * no bar at all rather than an empty track at 0%: "nothing done" and
     * "nothing planned" are different facts.
     */
    progress: hasTasks
      ? {
          percent: Math.round(
            (project.taskCompleted / project.taskTotal) * 100,
          ),
          summary: `${project.taskCompleted} of ${project.taskTotal} ${
            project.taskTotal === 1 ? "task" : "tasks"
          }`,
        }
      : null,
    signal: null,
    context: null,
    /*
     * UNTITLED-07 — the Project's OWN identity, so the row's mark here is the
     * mark the Projects collection and the Area record already draw for it.
     *
     * Phase 6 deferred this ("`SerializedGoalProjectItem` carries no identity
     * or health, so a Project drawn inside a GOAL record has a neutral mark…
     * extending that projection is Goals' migration, not this one"). The
     * projection now carries it, from the `project_details` join that read was
     * already making plus the rank expression `d1-project-repository.ts` uses.
     *
     * HEALTH is still absent, and that stays a decision rather than an
     * oversight: a Project's health needs its per-Project fact set, and a
     * bounded page inside a record must not start reading one per row — the
     * same boundary Areas' collection holds.
     */
    iconKey: project.iconKey,
    colourSlot: project.colourSlot,
    colourRank: project.colourRank,
    muted: project.archivedAt !== null,
  };
}

export function GoalProjectsTab({
  goalId,
  projects,
  nextCursor,
}: GoalProjectsTabProps) {
  const { items, hasMore, loading, loadFailed, loadMore } =
    useGoalProjectPagination(goalId, projects, nextCursor);

  // An empty list means the COMPLETE result is empty (the first bounded page was
  // empty, so no cursor and no further pages exist) — never merely the current
  // accumulated page.
  if (items.length === 0) {
    return (
      // RECORD-01 — a record-level absence is one calm line, not a collection's
      // icon + headline + sentence block. The Goal's summary band directly above
      // already states the contribution as "No Projects contributing yet".
      <EmptyState
        size="inline"
        headingLevel={2}
        title="No Projects advancing this Goal yet."
        /*
         * STEER-04 (DEBT-210) — the empty state names a path that EXISTS.
         *
         * It used to read "Projects created for this Goal appear here." — a
         * sentence describing a route the owner had no way to take from here,
         * on the surface that had just told them the Goal has no path. The
         * remedy is one door to the ONE shared Project form, with this Goal as
         * its decided, server-verified parent.
         *
         * `AGENTS.md` §6: every empty state teaches the next action.
         */
        description="Give it one, and its Tasks will start moving this Goal."
        primaryAction={
          <DrawerTrigger
            drawerKey={NEW_PROJECT_FOR_GOAL_KEY}
            className={buttonClassName({ variant: "primary" })}
            data-testid="goal-projects-new-project"
          >
            New Project for this Goal
          </DrawerTrigger>
        }
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h2 className="dh-visually-hidden">Projects</h2>
      {/*
       * UNTITLED-05 — the SHARED Project summary table, the same one an Area
       * record draws and the same column vocabulary `/projects?present=table`
       * uses. "Load more" rides in the table card's own footer band, so the
       * keyset affordance sits inside the surface it extends rather than
       * floating beneath it.
       */}
      <ProjectSummaryList
        projects={items.map(toProjectSummary)}
        label="Projects advancing this Goal, with their status and progress."
        data-testid="goal-projects-table"
        footer={
          hasMore ? (
            <LoadMore
              loading={loading}
              loadFailed={loadFailed}
              onLoadMore={loadMore}
              label="Load more Projects"
            />
          ) : undefined
        }
      />
    </div>
  );
}
