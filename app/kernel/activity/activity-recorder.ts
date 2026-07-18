/**
 * FND-05 Activity kernel — the storage-independent recording seam.
 *
 * Reading and RECORDING Activity are deliberately separated (ADR-012). The
 * module-facing `ActivityRepository` is read-only; recording happens only as the
 * atomic side effect of a meaningful domain mutation, coordinated by the D1
 * repositories through this seam. This module defines the storage-independent
 * pieces of that seam:
 *
 *   - `ActivityActor` / `ActivityActorContext` — the TRUSTED, server-derived actor
 *     carried on every event. It is established once at the composition boundary
 *     and threaded into the mutation repositories; it is NEVER accepted through a
 *     module method parameter, so module code cannot spoof an actor. FND-09 will
 *     replace the current `system` actor with an authenticated `user` actor
 *     WITHOUT changing the Activity schema or these contracts.
 *   - `NewActivityEvent` — a repository's description of the event a mutation
 *     should append (its type, subjects and payload).
 *   - `ActivityWriteModel` — the fully validated, storage-ready event value that
 *     the D1 adapter turns into parameter-bound insert statements. It carries the
 *     payload as a validated object, never as a JSON string — serialisation is the
 *     adapter's job (via the one shared `serializeActivityPayload` helper).
 *
 * The D1-specific atomic-batch coordination lives in
 * `app/platform/storage/d1/d1-atomic-mutation.ts`; nothing here imports D1.
 */

import type {
  ActivityActor,
  ActivityPayload,
  ActivitySubject,
  ActivityType,
} from "./activity";
import {
  parseActivityType,
  validateActivityId,
  validateActivityPayload,
  validateActor,
  validateSubjects,
} from "./activity-validation";

/**
 * The trusted actor context bound alongside a mutation repository. Intentionally
 * tiny: just the validated actor. It is a scope/provenance value, not an auth
 * token.
 */
export type ActivityActorContext = {
  readonly actor: ActivityActor;
};

/** The built-in `system` actor: the server composition boundary itself, used
 * until FND-09 provides authenticated users. `id` is null — the system actor has
 * no stable per-actor identifier. */
export const SYSTEM_ACTOR: ActivityActor = { type: "system", id: null };

/**
 * Build an actor context from an untrusted actor value, validating it. This is
 * the sanctioned way to establish the actor at the composition boundary.
 */
export function createActivityActorContext(actor: {
  readonly type: unknown;
  readonly id: unknown;
}): ActivityActorContext {
  return { actor: validateActor(actor) };
}

/**
 * The default actor context: the trusted `system` actor. Used by the composition
 * boundary today and by repositories constructed without an explicit actor.
 */
export function createSystemActorContext(): ActivityActorContext {
  return { actor: SYSTEM_ACTOR };
}

/**
 * A repository's description of the event a successful mutation should append.
 * The workspace, id, actor and timestamp are supplied by the recording seam (from
 * the bound context, the injected id generator and the shared clock), never by
 * this description — so a module cannot forge identity, scope or actor.
 */
export type NewActivityEvent = {
  /** The event type as a raw string; validated into an `ActivityType`. */
  readonly type: string;
  /** The entities the event relates to (one or many). */
  readonly subjects: readonly {
    readonly entityId: string;
    readonly role: string;
  }[];
  /** The structured payload; validated as an `ActivityPayload`. */
  readonly payload: ActivityPayload;
};

/**
 * A fully validated, storage-ready event. The D1 adapter turns this into
 * parameter-bound `activities` + `activity_subjects` inserts. The payload is a
 * validated object — the adapter serialises it exactly once (byte-size enforced
 * there), so no JSON text ever appears in the kernel.
 */
export type ActivityWriteModel = {
  readonly id: string;
  readonly type: ActivityType;
  readonly actor: ActivityActor;
  readonly occurredAt: Date;
  readonly payload: ActivityPayload;
  readonly subjects: readonly ActivitySubject[];
};

/**
 * Validate a `NewActivityEvent` and combine it with the trusted actor, a
 * generated id and the mutation timestamp into an `ActivityWriteModel`. Throws a
 * typed Activity error (validation or payload) BEFORE any storage access, so an
 * invalid event can never be recorded and can never leave a domain mutation
 * dangling (the adapter builds statements only from a valid model). Payload
 * structure/depth/cycles are checked here; the exact encoded byte size is enforced
 * when the adapter serialises — both strictly before the atomic batch runs.
 */
export function buildActivityWriteModel(
  event: NewActivityEvent,
  actor: ActivityActor,
  id: string,
  occurredAt: Date,
): ActivityWriteModel {
  return {
    id: validateActivityId(id),
    type: parseActivityType(event.type),
    // Re-validate the actor defensively: it is trusted, but validating keeps the
    // invariant local and cheap, and catches a mis-constructed context early.
    actor: validateActor(actor),
    occurredAt,
    payload: validateActivityPayload(event.payload),
    subjects: validateSubjects(event.subjects),
  };
}
