/**
 * STEER-02 — the Goal MOVE destination search endpoint
 * (`/goals/area-options?q=`).
 *
 * A resource route (no UI) backing the "Area" picker on the Goal record, which
 * is how a mis-filed Goal is re-filed (DEBT-184). It follows
 * `/projects/parent-options`'s established pattern exactly rather than
 * inventing a second parent-picker model — the roadmap's explicit non-goal:
 *
 *  - the eligible set (every active, non-archived Area in the workspace) can
 *    exceed any static bound, so the picker is server-backed and searchable
 *    rather than a fixed list the record's loader would have to carry;
 *  - the KIND is resolved SERVER-side from each entity's real type; the client
 *    never asserts it;
 *  - and this endpoint is a convenience for SELECTION, never the authority —
 *    `POST /goals/:goalId/mutate` with `intent=move` independently re-verifies
 *    that the chosen id is an active, non-archived Area in the trusted
 *    workspace before `SpineRepository.move` is asked for anything.
 *
 * It differs from the Projects endpoint in exactly one way, and deliberately: a
 * Goal's only legal parent is an AREA (`spineLinkTypeFor(goal, area)` is the
 * one edge the spine allows), so Goals are not offered as destinations.
 */

import { env } from "cloudflare:workers";

import { searchLinkTargets } from "~/platform/entity-links";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { SelectOption } from "~/shared/forms/types";

import type { Route } from "./+types/area-options";

/** The one entity type a Goal may belong to. */
const GOAL_PARENT_TYPES = ["area"] as const;

/** How many options a single search returns (bounded — never unbounded). */
const AREA_OPTIONS_LIMIT = 50;

export interface GoalAreaOptionsData {
  readonly options: readonly SelectOption[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The shared, workspace-scoped, bounded target search: a case-insensitive
  // title match over active Areas only. There is no anchor to exclude — a Goal
  // cannot be its own Area — so the anchor id is empty (matches nothing).
  const targets = await searchLinkTargets(
    { entities: scope.entities, entityLinks: scope.entityLinks },
    {
      anchorId: "",
      query,
      targetTypes: [...GOAL_PARENT_TYPES],
      limit: AREA_OPTIONS_LIMIT,
    },
  );

  // AREA-05 — never offer an ARCHIVED Area as a destination. A Goal cannot be
  // CREATED in an archived Area (`routes/new.tsx`), so it must not be movable
  // into one either; the mutate route refuses it independently as well.
  const archivedAreaIds = new Set(
    await scope.areas.listArchivedAreaIds(targets.map((target) => target.id)),
  );

  const options: SelectOption[] = targets
    .filter((target) => !archivedAreaIds.has(target.id))
    .map((target) => ({
      value: target.id,
      label: target.title,
      description: "Area",
    }));

  return json({ options } satisfies GoalAreaOptionsData);
}
