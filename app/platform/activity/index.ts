/**
 * IDENT-01 activity platform — public surface.
 *
 * Server surfaces that render history import the shared actor-resolution helper
 * from here, rather than each building their own directory lookup.
 */

export {
  createActivityActorResolver,
  type ActorBearingRecord,
} from "./activity-actors";
