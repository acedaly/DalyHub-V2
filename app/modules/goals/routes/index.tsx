/**
 * AREA-03 — the real Goals collection route (`/goals`): the Alignment view.
 *
 * Replaces the FND-09 placeholder. Shows every open Goal across every Area
 * with its derived alignment state — whether recent Task activity has
 * contributed to it — so the owner can see at a glance which Goals have had
 * attention and which have not (ADR-040).
 */

import { env } from "cloudflare:workers";

import { InvalidSpineCursorError } from "~/kernel/spine";
import {
  composeGoalAlignmentFacts,
  createOwnerAlignmentContext,
  evaluateGoalAlignment,
} from "~/shared/alignment";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { GoalsCollectionView } from "../GoalsCollection";
import {
  serializeGoalListItem,
  type SerializedGoalListItem,
} from "../goal-view";
import type { SerializedGoalWithAlignment } from "../GoalsCollection";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Goals · DalyHub" },
    {
      name: "description",
      content:
        "Whether recent action matches your stated Goals — the intention-to-action gap.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);

    const { evaluation, recentWindowStartIso } = createOwnerAlignmentContext(
      new Date(),
    );

    // DEBT-23: the collection is ordered by the deterministic workspace-wide
    // Alignment precedence in the repository (BEFORE pagination), so the Goals
    // most worth a look lead across the WHOLE workspace — not merely within each
    // fetched page. A stale/incompatible cursor is reset calmly to the first page
    // rather than surfaced as an error.
    let page;
    try {
      page = await scope.goals.listGoalsByAlignment({
        cursor,
        recentWindowStartIso,
      });
    } catch (error) {
      if (error instanceof InvalidSpineCursorError) {
        page = await scope.goals.listGoalsByAlignment({ recentWindowStartIso });
      } else {
        throw error;
      }
    }
    const ids = page.items.map((item) => item.id);

    const [contributions, activityFacts] = await Promise.all([
      scope.goals.listGoalProjectContributions(ids),
      scope.alignment.listGoalAlignmentFacts(ids, { recentWindowStartIso }),
    ]);

    const goals: SerializedGoalWithAlignment[] = page.items.map((item) => {
      const facts = composeGoalAlignmentFacts({
        goalId: item.id,
        completedAt: item.completedAt,
        contribution: contributions.get(item.id) ?? {
          total: 0,
          completed: 0,
          incomplete: 0,
          active: 0,
          planned: 0,
          onHold: 0,
          archived: 0,
        },
        activity: activityFacts.get(item.id),
      });
      return {
        ...serializeGoalListItem(item),
        alignment: evaluateGoalAlignment(facts, evaluation),
      };
    });

    return {
      goals,
      nextCursor: page.nextCursor,
      failed: false,
    };
  } catch {
    return {
      goals: [] as SerializedGoalWithAlignment[],
      nextCursor: null as string | null,
      failed: true,
    };
  }
}

export default function GoalsRoute({ loaderData }: Route.ComponentProps) {
  return (
    <GoalsCollectionView
      goals={loaderData.goals}
      nextCursor={loaderData.nextCursor}
      failed={loaderData.failed}
    />
  );
}

// Re-exported so `../GoalsCollection` and other callers can share the exact
// loader-data shape without re-declaring it.
export type { SerializedGoalListItem };
