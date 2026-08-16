/**
 * PROJ-01 — the Projects collection route (`/projects`).
 *
 * The trusted server boundary for the bounded, workspace-scoped project collection:
 * it reads the project projection and the Area/Goal parent options for the create
 * form through the authenticated composition boundary
 * (`resolveAuthenticatedWorkspaceScope`), then renders the presentational
 * `ProjectsCollectionView`. A scope/list failure degrades to a calm error state so
 * the shell stays usable — never a 500.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { evaluateProjectHealth } from "~/kernel/project-health";
import type { ProjectLifecycleCounts } from "~/kernel/projects";
import { InvalidSpineCursorError } from "~/kernel/spine";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import {
  parseCollectionPresentation,
  type CollectionPresentation,
} from "~/shared/collection-layout";
import type { SelectOption } from "~/shared/forms/types";
import { loadGoalSummaries, type GoalSummary } from "~/shared/goal-progress";
import { createOwnerHealthContext } from "~/shared/project-health";

import {
  ProjectsCollectionView,
  type ProjectState,
} from "../ProjectsCollection";
import {
  serializeProjectListItem,
  type SerializedProjectListItem,
} from "../project-view";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Projects · DalyHub" },
    {
      name: "description",
      content: "The finite bodies of work you run under an Area or a Goal.",
    },
  ];
}

/** Bounded page size for the parent (Area/Goal) options in the create form. */
const PARENT_OPTIONS_LIMIT = 100;

function parseState(value: string | null): ProjectState {
  return value === "open" || value === "completed" || value === "archived"
    ? value
    : "all";
}

/**
 * REDESIGN-04 — how many Goals the compact section on this page shows.
 *
 * Three, which is what `mockup3.png` draws in both the desktop panel and the
 * phone frame. It is a SUMMARY beside the gallery, not a second collection; the
 * `View all` beside its heading is the route to the real one.
 */
const PROJECTS_GOAL_SUMMARY_LIMIT = 3;

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const params = new URL(request.url).searchParams;
  const state = parseState(params.get("state"));
  // REDESIGN-04 — the collection's free-text narrowing and its presentation.
  // Both are ordinary URL state, so a narrowed or tabular collection is
  // shareable, bookmarkable and Back/Forward-correct.
  const query = params.get("q") ?? "";
  const presentation = parseCollectionPresentation(params.get("present"));
  // An opaque keyset cursor for the NEXT page, echoed back from a prior page's
  // `nextCursor`. It is validated (and scope-checked) in the repository; an absent
  // or malformed value simply yields the first page or a calm error — never an
  // unbounded query.
  const cursor = params.get("cursor") ?? undefined;

  let scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>;
  try {
    scope = await resolveAuthenticatedWorkspaceScope(env, session);
  } catch {
    return {
      projects: [] as SerializedProjectListItem[],
      nextCursor: null as string | null,
      parentOptions: [] as SelectOption[],
      parentOptionsFailed: true,
      counts: null as ProjectLifecycleCounts | null,
      goals: [] as readonly GoalSummary[],
      goalsFailed: true,
      query,
      presentation,
      state,
      failed: true,
    };
  }

  // The project list is the primary failure domain: its own failure degrades the
  // whole collection to the calm "couldn't load your projects" state.
  let projects: SerializedProjectListItem[] = [];
  let nextCursor: string | null = null;
  let failed = false;
  try {
    /*
     * A cursor is bound to the collection's whole scope, INCLUDING the search
     * term (`PROJECT_CURSOR_VERSION` 4). Typing into the search field while a
     * "Load more" cursor is in the URL therefore hands the repository a cursor
     * from a different result set, which it correctly rejects. That is a reset,
     * not an error: the narrowed collection simply starts at its first page.
     */
    let page;
    try {
      page = await scope.projects.listProjects({
        state,
        search: query,
        cursor,
      });
    } catch (error) {
      if (error instanceof InvalidSpineCursorError) {
        page = await scope.projects.listProjects({ state, search: query });
      } else {
        throw error;
      }
    }

    // Derive health for the WHOLE bounded page in one facts gather (no N+1), then
    // evaluate each with the SAME owner-calendar clock the facts used.
    // AUDIT-14 — the OWNER's day, from the one scope-level authority, so this
    // collection's health agrees with every Project and Task record it links to.
    const healthContext = createOwnerHealthContext(
      new Date(),
      await scope.ownerTimeZone(),
    );
    const factsById = await scope.projectHealth.listProjectHealthFacts(
      page.items.map((item) => item.id),
      healthContext.todayIso,
    );
    projects = page.items.map((item) => {
      // Facts are gathered for the whole page; a project always has an entry, but
      // fall back to its list-item counts if a concurrent delete removed it between
      // reads (a calm, derived result either way — never a crash).
      const facts = factsById.get(item.id) ?? {
        projectId: item.id,
        completedAt: item.completedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        taskTotal: item.taskTotal,
        taskCompleted: item.taskCompleted,
        waitingOpen: 0,
        overdueOpen: 0,
        slippedOpen: 0,
        upcomingDueOpen: 0,
        upcomingScheduledOpen: 0,
        oldestWaitingSince: null,
        lastMeaningfulActivityAt: null,
      };
      return serializeProjectListItem(
        item,
        evaluateProjectHealth(facts, healthContext),
      );
    });
    nextCursor = page.nextCursor;
  } catch {
    failed = true;
  }

  // The Area/Goal parent options for the create form are a SEPARATE failure
  // domain (PROJ-05 §8/§2 follow-up): a failure here must never masquerade as
  // "the project list failed to load", and an empty result here must never
  // masquerade as "this workspace has no Areas or Goals" — the create form
  // needs to tell those two states apart.
  let parentOptions: SelectOption[] = [];
  let parentOptionsFailed = false;
  try {
    const [areas, goals] = await Promise.all([
      scope.entities.list({ type: "area", limit: PARENT_OPTIONS_LIMIT }),
      scope.entities.list({ type: "goal", limit: PARENT_OPTIONS_LIMIT }),
    ]);
    parentOptions = [
      ...areas.items.map((a) => ({
        value: a.id,
        label: a.title,
        description: "Area",
      })),
      ...goals.items.map((g) => ({
        value: g.id,
        label: g.title,
        description: "Goal",
      })),
    ];
  } catch {
    parentOptionsFailed = true;
  }

  /*
   * REDESIGN-04 §5.5 — the header's "8 active · 2 archived".
   *
   * ONE grouped statement over the same two lifecycle columns the list query
   * filters on. It describes the WORKSPACE, which is why it cannot be counted
   * from the loaded rows, and it is a separate failure domain: a count that
   * fails degrades the line to the loaded-row wording rather than taking the
   * gallery down with it.
   */
  let counts: ProjectLifecycleCounts | null;
  try {
    counts = await scope.projects.countProjectsByLifecycle();
  } catch {
    counts = null;
  }

  /*
   * REDESIGN-04 §5.3 — the compact Goals section beneath the gallery.
   *
   * The SHARED summary read Today already makes for its own Goal rail
   * (`loadGoalSummaries`): a bounded page of Goals, then three GROUPED reads
   * over that page's ids (configuration, measurement summaries, milestone
   * weights). No history, and no query per Goal — the brief's hard rule. It is
   * its own failure domain for the same reason the counts are: a summary rail
   * is never worth the gallery.
   */
  let goals: readonly GoalSummary[] = [];
  let goalsFailed = false;
  try {
    const timeZone = await scope.ownerTimeZone();
    const { evaluation, recentBoundaryStartIso } = createOwnerAlignmentContext(
      new Date(),
      timeZone,
    );
    goals = (
      await loadGoalSummaries(scope, {
        now: new Date(),
        timezone: timeZone,
        todayIso: evaluation.todayIso,
        recentBoundaryStartIso,
      })
    ).slice(0, PROJECTS_GOAL_SUMMARY_LIMIT);
  } catch {
    goalsFailed = true;
  }

  return {
    projects,
    nextCursor,
    parentOptions,
    parentOptionsFailed,
    counts,
    goals,
    goalsFailed,
    query,
    presentation,
    state,
    failed,
  };
}

export default function ProjectsRoute({ loaderData }: Route.ComponentProps) {
  return (
    <ProjectsCollectionView
      projects={loaderData.projects}
      nextCursor={loaderData.nextCursor}
      parentOptions={loaderData.parentOptions}
      parentOptionsFailed={loaderData.parentOptionsFailed}
      counts={loaderData.counts}
      goals={loaderData.goals}
      goalsFailed={loaderData.goalsFailed}
      query={loaderData.query}
      presentation={loaderData.presentation}
      state={loaderData.state}
      failed={loaderData.failed}
    />
  );
}

export type { CollectionPresentation };
