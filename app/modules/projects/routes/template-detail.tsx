/**
 * PROJECT-02 — the template record route (`/projects/templates/:templateId`).
 *
 * The trusted server boundary for one template's full contents: the header, its
 * ordered tasks and their steps, read in a fixed number of workspace-scoped
 * statements whatever the template holds. A template in another workspace — or
 * one that never existed — is the same calm 404, disclosing nothing.
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { SelectOption } from "~/shared/forms/types";

import { ProjectTemplateRecordView } from "../ProjectTemplateRecord";
import { serializeTemplateDetail } from "../template-view";
import type { Route } from "./+types/template-detail";

export function meta() {
  return [{ title: "Template · DalyHub" }];
}

const PARENT_OPTIONS_LIMIT = 100;

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const detail = await scope.projectTemplates.getTemplateDetail(
    params.templateId ?? "",
  );
  if (!detail) throw new Response("Not Found", { status: 404 });

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
    // A separate failure domain: the record still renders, and the two pickers
    // that need these options simply have none to offer.
    parentOptions = [];
  }

  return { template: serializeTemplateDetail(detail), parentOptions };
}

export default function ProjectTemplateDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <ProjectTemplateRecordView
      template={loaderData.template}
      parentOptions={loaderData.parentOptions}
    />
  );
}
