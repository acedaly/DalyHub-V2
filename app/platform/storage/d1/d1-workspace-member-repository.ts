/**
 * IDENT-01 — the D1 adapter for workspace membership and the actor directory.
 *
 * One class implements BOTH kernel seams because both read exactly one table
 * joined to the linked Person's `entities` row, and splitting them would mean two
 * copies of that join. It is workspace-BOUND: every statement carries
 * `workspace_id = ?`, so identity can never leak across the isolation boundary
 * (ADR-003/ADR-010).
 *
 * This is the only place `workspace_members` snake_case rows exist. It records NO
 * Activity: provisioning membership is identity plumbing, not a domain mutation.
 */

import {
  IdentityStorageError,
  IdentityValidationError,
  actorKey,
  normaliseMemberDisplayName,
  normaliseMemberEmail,
  normaliseMemberPersonId,
  resolveActorIdentity,
  validateMemberSubject,
  type ActorDirectory,
  type ActorIdentity,
  type ActorRef,
  type EnsureWorkspaceMemberInput,
  type WorkspaceMember,
  type WorkspaceMemberRepository,
} from "~/kernel/identity";
import { systemClock, type Clock } from "~/kernel/spine";
import { parseWorkspaceId, type WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp, toStorageTimestamp } from "./database";

/** The raw joined row: the membership plus the linked Person's display name. */
interface WorkspaceMemberRow {
  readonly workspace_id: string;
  readonly subject: string;
  readonly email: string | null;
  readonly display_name: string | null;
  readonly auth_display_name: string | null;
  readonly person_entity_id: string | null;
  readonly person_display_name: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_seen_at: string;
}

/**
 * The membership row joined to its linked Person. A SOFT-DELETED Person keeps
 * naming the member: deleting a contact record must not silently rename the
 * author of every past event.
 */
const SELECT_MEMBERS = `
  SELECT m.workspace_id, m.subject, m.email, m.display_name, m.auth_display_name,
         m.person_entity_id, e.title AS person_display_name,
         m.created_at, m.updated_at, m.last_seen_at
  FROM workspace_members m
  LEFT JOIN entities e
    ON e.workspace_id = m.workspace_id AND e.id = m.person_entity_id
  WHERE m.workspace_id = ?`;

/**
 * How many distinct subjects one directory lookup will resolve. A page of
 * activity has at most as many actors as events, and pages are bounded well below
 * this; the cap simply keeps the `IN (…)` list from ever being unbounded.
 */
export const MAX_DIRECTORY_ACTORS = 200;

export type D1WorkspaceMemberRepositoryOptions = {
  readonly clock?: Clock;
};

export class D1WorkspaceMemberRepository
  implements WorkspaceMemberRepository, ActorDirectory
{
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #clock: Clock;

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options?: D1WorkspaceMemberRepositoryOptions,
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#clock = options?.clock ?? systemClock;
  }

  #toMember(row: WorkspaceMemberRow): WorkspaceMember {
    return {
      workspaceId: parseWorkspaceId(row.workspace_id),
      subject: row.subject,
      email: row.email,
      displayName: row.display_name,
      authDisplayName: row.auth_display_name,
      personEntityId: row.person_entity_id,
      personDisplayName: row.person_display_name,
      createdAt: fromStorageTimestamp(row.created_at),
      updatedAt: fromStorageTimestamp(row.updated_at),
      lastSeenAt: fromStorageTimestamp(row.last_seen_at),
    };
  }

  async getBySubject(subject: string): Promise<WorkspaceMember | null> {
    const value = validateMemberSubject(subject);
    try {
      const row = await this.#db
        .prepare(`${SELECT_MEMBERS} AND m.subject = ?`)
        .bind(this.#workspaceId, value)
        .first<WorkspaceMemberRow>();
      return row ? this.#toMember(row) : null;
    } catch (error) {
      throw new IdentityStorageError({ cause: error });
    }
  }

  async list(): Promise<readonly WorkspaceMember[]> {
    try {
      const result = await this.#db
        .prepare(`${SELECT_MEMBERS} ORDER BY m.created_at, m.subject`)
        .bind(this.#workspaceId)
        .all<WorkspaceMemberRow>();
      return (result.results ?? []).map((row) => this.#toMember(row));
    } catch (error) {
      throw new IdentityStorageError({ cause: error });
    }
  }

  /**
   * Provision or refresh the membership row. ONE idempotent statement:
   *   - the row is created on first sign-in with the provider's facts;
   *   - on later sign-ins only the provider-owned columns (`email`,
   *     `auth_display_name`) and `last_seen_at` move forward;
   *   - the owner-curated `display_name` and the `person_entity_id` link are
   *     NEVER overwritten by provider data;
   *   - `updated_at` advances only when an identity column actually changed, so
   *     the row is a truthful record of identity change, not of traffic.
   */
  async ensureMember(
    input: EnsureWorkspaceMemberInput,
  ): Promise<WorkspaceMember> {
    const subject = validateMemberSubject(input.subject);
    const email = normaliseMemberEmail(input.email);
    const authDisplayName = normaliseMemberDisplayName(
      input.displayName ?? null,
      "authDisplayName",
    );
    const now = toStorageTimestamp(this.#clock());

    try {
      await this.#db
        .prepare(
          `INSERT INTO workspace_members (
             workspace_id, subject, email, display_name, auth_display_name,
             person_entity_id, created_at, updated_at, last_seen_at
           )
           VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?)
           ON CONFLICT (workspace_id, subject) DO UPDATE SET
             email = excluded.email,
             -- Keep a previously-known provider name when this credential
             -- carries none, rather than erasing identity on a thinner token.
             auth_display_name =
               COALESCE(excluded.auth_display_name, workspace_members.auth_display_name),
             last_seen_at = excluded.last_seen_at,
             updated_at = CASE
               WHEN workspace_members.email IS NOT excluded.email
                 OR (excluded.auth_display_name IS NOT NULL
                     AND workspace_members.auth_display_name IS NOT excluded.auth_display_name)
               THEN excluded.updated_at
               ELSE workspace_members.updated_at
             END`,
        )
        .bind(this.#workspaceId, subject, email, authDisplayName, now, now, now)
        .run();
    } catch (error) {
      throw new IdentityStorageError({ cause: error });
    }

    const member = await this.getBySubject(subject);
    if (member === null) {
      throw new IdentityStorageError();
    }
    return member;
  }

  async linkPerson(
    subject: string,
    personEntityId: string | null,
  ): Promise<WorkspaceMember> {
    const value = validateMemberSubject(subject);
    const personId = normaliseMemberPersonId(personEntityId);

    if (personId !== null) {
      // The Person must exist in THIS workspace and actually be a Person. The
      // composite FK already forbids a cross-workspace id; this makes the failure
      // a typed validation error rather than a raw constraint violation, and also
      // rejects linking the member to, say, a Task.
      let exists: { readonly type: string } | null;
      try {
        exists = await this.#db
          .prepare(
            `SELECT type FROM entities WHERE workspace_id = ? AND id = ?`,
          )
          .bind(this.#workspaceId, personId)
          .first<{ readonly type: string }>();
      } catch (error) {
        throw new IdentityStorageError({ cause: error });
      }
      if (exists === null || exists.type !== "person") {
        throw new IdentityValidationError(
          "personEntityId",
          "personEntityId must reference a Person in this workspace.",
        );
      }
    }

    await this.#setColumn("person_entity_id", value, personId);
    const member = await this.getBySubject(value);
    if (member === null) {
      throw new IdentityValidationError(
        "subject",
        "subject is not a member of this workspace.",
      );
    }
    return member;
  }

  async setDisplayName(
    subject: string,
    displayName: string | null,
  ): Promise<WorkspaceMember> {
    const value = validateMemberSubject(subject);
    const name = normaliseMemberDisplayName(displayName);
    await this.#setColumn("display_name", value, name);
    const member = await this.getBySubject(value);
    if (member === null) {
      throw new IdentityValidationError(
        "subject",
        "subject is not a member of this workspace.",
      );
    }
    return member;
  }

  /**
   * Update ONE identity column. The column name is a closed union chosen in code,
   * never a caller string, so the interpolation cannot carry input; the value,
   * timestamp and scope stay parameter-bound.
   */
  async #setColumn(
    column: "person_entity_id" | "display_name",
    subject: string,
    value: string | null,
  ): Promise<void> {
    try {
      await this.#db
        .prepare(
          `UPDATE workspace_members
             SET ${column} = ?, updated_at = ?
           WHERE workspace_id = ? AND subject = ?`,
        )
        .bind(
          value,
          toStorageTimestamp(this.#clock()),
          this.#workspaceId,
          subject,
        )
        .run();
    } catch (error) {
      throw new IdentityStorageError({ cause: error });
    }
  }

  /**
   * Resolve a batch of actor references in ONE bounded query.
   *
   * Non-`user` actors (and `user` actors with no id) need no lookup at all — the
   * canonical rule answers them from the actor type alone — so only identified
   * subjects reach the database, deduped.
   */
  async resolveActors(
    actors: readonly ActorRef[],
  ): Promise<ReadonlyMap<string, ActorIdentity>> {
    const identities = new Map<string, ActorIdentity>();
    const subjects = new Set<string>();

    for (const actor of actors) {
      if (typeof actor.id === "string" && actor.id.trim().length > 0) {
        subjects.add(actor.id.trim());
      }
    }

    const members = new Map<string, WorkspaceMember>();
    const wanted = [...subjects].slice(0, MAX_DIRECTORY_ACTORS);
    if (wanted.length > 0) {
      const placeholders = wanted.map(() => "?").join(", ");
      try {
        const result = await this.#db
          .prepare(`${SELECT_MEMBERS} AND m.subject IN (${placeholders})`)
          .bind(this.#workspaceId, ...wanted)
          .all<WorkspaceMemberRow>();
        for (const row of result.results ?? []) {
          members.set(row.subject, this.#toMember(row));
        }
      } catch (error) {
        throw new IdentityStorageError({ cause: error });
      }
    }

    for (const actor of actors) {
      const key = actorKey(actor);
      if (identities.has(key)) {
        continue;
      }
      const member = actor.id === null ? null : (members.get(actor.id) ?? null);
      identities.set(key, resolveActorIdentity(actor, member));
    }

    return identities;
  }
}
