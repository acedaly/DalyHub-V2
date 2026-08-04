/**
 * IDENT-01 activity platform — the ONE way a server surface names its actors.
 *
 * Every route that turns kernel `ActivityRecord`s into renderable items calls
 * this, so actor resolution is identical across the workspace feed, every record
 * Timeline, Diary, People and the mobile layouts — and so no surface can grow its
 * own fallback.
 *
 * It resolves the whole page's DISTINCT actors in ONE bounded directory query and
 * hands back a synchronous resolver for the pure mapper, mirroring exactly how
 * referenced entities are already batch-resolved (no N+1 in the UI).
 *
 * Failure is contained: if the directory read fails, actors resolve through the
 * canonical rule with no membership facts — `System` for system events,
 * `Unknown user` for identified ones. A history page never fails to render, and
 * it never falls back to naming the viewer.
 */

import type { ActivityActor, ActivityRecord } from "~/kernel/activity";
import {
  actorKey,
  resolveActorIdentity,
  type ActorDirectory,
  type ActorIdentity,
} from "~/kernel/identity";
import type { ActorResolver } from "~/shared/activity-feed/model";

/** The subset of an activity record this helper needs (so tests can pass stubs). */
export type ActorBearingRecord = Pick<ActivityRecord, "actor">;

/**
 * Resolve every distinct actor on a page of activity and return the synchronous
 * resolver `toActivityItems({ resolveActor })` expects.
 */
export async function createActivityActorResolver(
  directory: ActorDirectory,
  records: readonly ActorBearingRecord[],
): Promise<ActorResolver> {
  const actors: ActivityActor[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const key = actorKey(record.actor);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    actors.push(record.actor);
  }

  let identities: ReadonlyMap<string, ActorIdentity>;
  try {
    identities = await directory.resolveActors(actors);
  } catch {
    identities = new Map();
  }

  return (actor: ActivityActor) =>
    identities.get(actorKey(actor)) ?? resolveActorIdentity(actor, null);
}
