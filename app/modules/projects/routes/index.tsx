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
  resolveCollectionPresentation,
  type CollectionPresentation,
} from "~/shared/collection-layout";
import type { SelectOption } from "~/shared/forms/types";
import { loadGoalSummaries, type GoalSummary } from "~/shared/goal-progress";
import { createOwnerHealthContext } from "~/shared/project-health";

import {
  ProjectsCollectionView,
  type ProjectState,
  type TemplateOption,
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

/** The two presentations Projects draws. The first is its default. */
const PROJECT_PRESENTATIONS = ["grid", "table"] as const;

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const params = new URL(request.url).searchParams;
  const state = parseState(params.get("state"));
  // REDESIGN-04 — the collection's free-text narrowing and its presentation.
  // Both are ordinary URL state, so a narrowed or tabular collection is
  // shareable, bookmarkable and Back/Forward-correct.
  const query = params.get("q") ?? "";
  /*
   * ADR-100 — the presentation is resolved AFTER the lifecycle counts, because
   * a collection this large defaults to the table. The raw param travels until
   * then; `resolveCollectionPresentation` is the one place the rule lives.
   */
  const presentParam = params.get("present");
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
      templates: [] as TemplateOption[],
      query,
      // No scope resolved, so no count: an unknown size falls to the gallery,
      // and an explicit choice is still honoured.
      presentation: resolveCollectionPresentation({
        param: presentParam,
        allowed: PROJECT_PRESENTATIONS,
        total: null,
        large: "table",
      }),
      state,
      failed: true,
    };
  }

  /*
   * PERF-01 — the five reads below run CONCURRENTLY.
   *
   * They were written one after another, and each was independent of every one
   * before it: the list does not need the counts, the counts do not need the
   * templates, and the Goals rail needs none of them. Measured on a workspace of
   * 24 Projects, that sequence was EIGHT serial D1 round trips for two round
   * trips' worth of dependency.
   *
   * Nothing about the failure domains changes, and that is the point of doing it
   * this way rather than with one big `Promise.all` over bare reads: each block
   * keeps its own `try`, so a template read that fails still leaves the gallery
   * standing, a count that fails still degrades only the header line, and the
   * project list is still the one failure that degrades the collection. The
   * blocks are started together and awaited together; what each one MEANS is
   * unchanged.
   */
  // The project list is the primary failure domain: its own failure degrades the
  // whole collection to the calm "couldn't load your projects" state.
  let projects: SerializedProjectListItem[] = [];
  let nextCursor: string | null = null;
  let failed = false;
  const listRead = (async () => {
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
  })();

  // The Area/Goal parent options for the create form are a SEPARATE failure
  // domain (PROJ-05 §8/§2 follow-up): a failure here must never masquerade as
  // "the project list failed to load", and an empty result here must never
  // masquerade as "this workspace has no Areas or Goals" — the create form
  // needs to tell those two states apart.
  let parentOptions: SelectOption[] = [];
  let parentOptionsFailed = false;
  const parentOptionsRead = (async () => {
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
  })();

  /*
   * REDESIGN-04 §5.5 — the header's "8 active · 2 archived".
   *
   * ONE grouped statement over the same two lifecycle columns the list query
   * filters on. It describes the WORKSPACE, which is why it cannot be counted
   * from the loaded rows, and it is a separate failure domain: a count that
   * fails degrades the line to the loaded-row wording rather than taking the
   * gallery down with it.
   */
  const countsRead = (async (): Promise<ProjectLifecycleCounts | null> => {
    try {
      return await scope.projects.countProjectsByLifecycle();
    } catch {
      return null;
    }
  })();

  /*
   * ADR-100 / CONVERGE-01 §4 — a large collection opens as a TABLE.
   *
   * The audit left "does the table become the default at ~40+ projects?" open;
   * it is answered on the record in ADR-100 and enforced by the one shared rule
   * in `resolveCollectionPresentation`, so a second collection adopting it
   * cannot adopt a different arithmetic.
   *
   * The size that decides it is the CURRENT lifecycle scope's, not the
   * workspace's: an owner on "Archived" with three archived Projects is looking
   * at a collection of three, whatever the other two hundred are doing. A count
   * that failed (`null`) leaves the gallery alone rather than guessing.
   *
   * The counts are already read for the header's "20 active · 62 completed"
   * line, so this adds no query.
   */
  let templates: TemplateOption[] = [];
  const templatesRead = (async () => {
    try {
      const page = await scope.projectTemplates.listTemplates();
      templates = page.items.map((template) => ({
        id: template.id,
        name: template.name,
        taskCount: template.taskCount,
        checklistCount: template.checklistCount,
        parentId: template.defaultParent?.id ?? null,
      }));
    } catch {
      templates = [];
    }
  })();

  let goals: readonly GoalSummary[] = [];
  let goalsFailed = false;
  const goalsRead = (async () => {
    try {
      const timeZone = await scope.ownerTimeZone();
      const { evaluation, recentBoundaryStartIso } =
        createOwnerAlignmentContext(new Date(), timeZone);
      goals = (
        await loadGoalSummaries(scope, {
          now: new Date(),
          timezone: timeZone,
          todayIso: evaluation.todayIso,
          recentBoundaryStartIso,
        })
      ).items.slice(0, PROJECTS_GOAL_SUMMARY_LIMIT);
    } catch {
      goalsFailed = true;
    }
  })();

  const [, , counts] = await Promise.all([
    listRead,
    parentOptionsRead,
    countsRead,
    templatesRead,
    goalsRead,
  ]);

  const scopeTotal =
    counts === null
      ? null
      : state === "all"
        ? counts.active + counts.completed + counts.archived
        : state === "completed"
          ? counts.completed
          : state === "archived"
            ? counts.archived
            : counts.active;
  const presentation = resolveCollectionPresentation({
    param: presentParam,
    allowed: PROJECT_PRESENTATIONS,
    total: scopeTotal,
    large: "table",
  });

  return {
    projects,
    nextCursor,
    parentOptions,
    parentOptionsFailed,
    counts,
    goals,
    goalsFailed,
    templates,
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
      templates={loaderData.templates}
      query={loaderData.query}
      presentation={loaderData.presentation}
      state={loaderData.state}
      failed={loaderData.failed}
    />
  );
}

export type { CollectionPresentation };
