/**
 * PROJECT-02 — the Templates collection route (`/projects/templates`).
 *
 * The trusted server boundary for the bounded, workspace-scoped template list:
 * it reads the templates (with their counts, from grouped aggregates rather
 * than a query per template) and the Area/Goal options the create-from-template
 * form needs, through the authenticated composition boundary. A failure
 * degrades to a calm error state so the shell stays usable — never a 500.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { SelectOption } from "~/shared/forms/types";

import { ProjectTemplatesView } from "../ProjectTemplatesCollection";
import {
  serializeTemplateSummary,
  type SerializedTemplateSummary,
} from "../template-view";
import type { Route } from "./+types/templates";

export function meta() {
  return [
    { title: "Templates · DalyHub" },
    {
      name: "description",
      content:
        "Reusable project shapes: start a project from something that already worked.",
    },
  ];
}

/** Bounded page size for the parent (Area/Goal) options in the create form. */
const PARENT_OPTIONS_LIMIT = 100;

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  let scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>;
  try {
    scope = await resolveAuthenticatedWorkspaceScope(env, session);
  } catch {
    return {
      templates: [] as SerializedTemplateSummary[],
      parentOptions: [] as SelectOption[],
      failed: true,
    };
  }

  let templates: SerializedTemplateSummary[] = [];
  let failed = false;
  try {
    const page = await scope.projectTemplates.listTemplates();
    templates = page.items.map(serializeTemplateSummary);
  } catch {
    failed = true;
  }

  // A separate failure domain, exactly as on the Projects collection: the
  // create form's options failing must never masquerade as "the templates
  // failed to load".
  let parentOptions: SelectOption[];
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
    parentOptions = [];
  }

  return { templates, parentOptions, failed };
}

export default function ProjectTemplatesRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <ProjectTemplatesView
      templates={loaderData.templates}
      parentOptions={loaderData.parentOptions}
      failed={loaderData.failed}
    />
  );
}
