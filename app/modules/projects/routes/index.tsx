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
import type { SelectOption } from "~/shared/forms/types";
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
  return value === "open" || value === "completed" ? value : "all";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const params = new URL(request.url).searchParams;
  const state = parseState(params.get("state"));
  // An opaque keyset cursor for the NEXT page, echoed back from a prior page's
  // `nextCursor`. It is validated (and scope-checked) in the repository; an absent
  // or malformed value simply yields the first page or a calm error — never an
  // unbounded query.
  const cursor = params.get("cursor") ?? undefined;

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.projects.listProjects({ state, cursor });

    // Derive health for the WHOLE bounded page in one facts gather (no N+1), then
    // evaluate each with the SAME owner-calendar clock the facts used.
    const healthContext = createOwnerHealthContext(new Date());
    const factsById = await scope.projectHealth.listProjectHealthFacts(
      page.items.map((item) => item.id),
      healthContext.todayIso,
    );

    // The Area/Goal parent options for the create form (bounded, workspace-scoped).
    const [areas, goals] = await Promise.all([
      scope.entities.list({ type: "area", limit: PARENT_OPTIONS_LIMIT }),
      scope.entities.list({ type: "goal", limit: PARENT_OPTIONS_LIMIT }),
    ]);
    const parentOptions: SelectOption[] = [
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
    return {
      projects: page.items.map((item) => {
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
      }),
      nextCursor: page.nextCursor,
      parentOptions,
      state,
      failed: false,
    };
  } catch {
    return {
      projects: [] as SerializedProjectListItem[],
      nextCursor: null as string | null,
      parentOptions: [] as SelectOption[],
      state,
      failed: true,
    };
  }
}

export default function ProjectsRoute({ loaderData }: Route.ComponentProps) {
  return (
    <ProjectsCollectionView
      projects={loaderData.projects}
      nextCursor={loaderData.nextCursor}
      parentOptions={loaderData.parentOptions}
      state={loaderData.state}
      failed={loaderData.failed}
    />
  );
}
