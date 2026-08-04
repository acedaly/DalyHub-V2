/**
 * IDENT-01 Identity kernel — the storage-independent repository contracts.
 *
 * Two narrow, workspace-BOUND seams (ADR-010: no method takes a `workspaceId`):
 *
 *   - `WorkspaceMemberRepository` — the small write surface that keeps the
 *     membership row current: provisioning it from an authenticated session and
 *     linking it to a Person record. It is the ONLY place membership is written.
 *   - `ActorDirectory` — the READ seam every activity surface uses. It resolves a
 *     BATCH of actor references to identities in one bounded query, so a feed of
 *     30 events costs one lookup, never 30 (no N+1).
 *
 * Neither records Activity: membership is identity plumbing, not a domain
 * mutation, and provisioning it must never write a history event.
 */

import type {
  ActorIdentity,
  ActorRef,
  AuthenticatedActorFacts,
  WorkspaceMember,
} from "./identity";

/** What `ensureMember` writes: the facts an authenticated request knows. */
export type EnsureWorkspaceMemberInput = AuthenticatedActorFacts;

export interface WorkspaceMemberRepository {
  /**
   * Provision or refresh the membership row for an authenticated subject, and
   * return it. Idempotent: calling it with unchanged facts leaves the row's
   * identity columns untouched. It NEVER overwrites the owner-curated
   * `displayName` or the `personEntityId` link with provider data.
   */
  ensureMember(input: EnsureWorkspaceMemberInput): Promise<WorkspaceMember>;

  /** The membership row for a subject in this workspace, or null. */
  getBySubject(subject: string): Promise<WorkspaceMember | null>;

  /** Every membership row in this workspace, oldest first. Bounded by design. */
  list(): Promise<readonly WorkspaceMember[]>;

  /**
   * Link (or, with `null`, unlink) the member to a Person record in this
   * workspace. The Person must exist in the bound workspace.
   */
  linkPerson(
    subject: string,
    personEntityId: string | null,
  ): Promise<WorkspaceMember>;

  /** Set (or clear) the owner-curated display name for a member. */
  setDisplayName(
    subject: string,
    displayName: string | null,
  ): Promise<WorkspaceMember>;
}

/**
 * The read seam that names actors. Implementations MUST be total: an actor with
 * no membership row resolves through the canonical rule to `Unknown user`, never
 * to a throw and never to the viewer's own identity.
 */
export interface ActorDirectory {
  /**
   * Resolve a batch of actor references to identities, keyed by `actorKey`.
   * One bounded query for the whole batch.
   */
  resolveActors(
    actors: readonly ActorRef[],
  ): Promise<ReadonlyMap<string, ActorIdentity>>;
}
