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
import type { SelectOption } from "~/shared/forms/types";

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
  const state = parseState(new URL(request.url).searchParams.get("state"));

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.projects.listProjects({ state });
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
      projects: page.items.map(serializeProjectListItem),
      parentOptions,
      state,
      failed: false,
    };
  } catch {
    return {
      projects: [] as SerializedProjectListItem[],
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
      parentOptions={loaderData.parentOptions}
      state={loaderData.state}
      failed={loaderData.failed}
    />
  );
}
