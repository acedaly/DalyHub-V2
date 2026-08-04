/**
 * IDENT-01 — the PURE planner behind the production identity repair.
 *
 * Given what the database currently says about actors, membership, preferences
 * and People, this decides exactly which repair statements to run and why. It is
 * deliberately free of Node, Wrangler, D1 and the filesystem so that:
 *
 *   - `scripts/repair-activity-identity.mjs` can run it against production, and
 *   - the test suite can run the SAME planner against a real D1 database inside
 *     the Workers pool and prove the repair is idempotent.
 *
 * Safety rules encoded here, not left to the operator:
 *
 *   - It NEVER rewrites, deletes or duplicates an Activity row by default. The
 *     activity stream already carries the stable actor id; what was missing was
 *     the membership row it resolves through, so the repair is additive.
 *   - It only attributes an actor from RELIABLE evidence: an actor id already on
 *     the events, the recorded preferences owner id, or an explicitly supplied
 *     value. It never assigns every historical event to the current owner just
 *     because this happens to be a single-user deployment.
 *   - Anything it cannot attribute is REPORTED as unresolved and left alone, so
 *     it renders as `Unknown user` rather than as a misleading name.
 *   - Every statement is idempotent (`ON CONFLICT DO NOTHING`, or an `UPDATE`
 *     guarded by `IS NULL`), so a re-run is a no-op and a partially applied run
 *     is safely resumable.
 */

/** Repair methods, in the order they are reported. */
export const REPAIR_METHODS = [
  "member_from_activity_actor",
  "member_from_preferences_owner",
  "email_from_owner_evidence",
  "display_name_explicit",
  "person_link_explicit",
  "person_link_by_email",
  "legacy_system_attribution",
];

/** Reasons an actor cannot be safely attributed. */
export const UNRESOLVED_REASONS = {
  LEGACY_SYSTEM: "legacy_system_actor",
  NO_IDENTITY_EVIDENCE: "no_identity_evidence",
};

/** @param {unknown} value @returns {boolean} */
const EMPTY = (value) =>
  value === null || value === undefined || String(value).trim() === "";

/** @param {unknown} value @returns {string | null} */
const canonicalEmail = (value) =>
  EMPTY(value) ? null : String(value).trim().toLowerCase();

/**
 * Build the repair plan.
 *
 * @param {object} input
 * @param {Array<{actor_type: string, actor_id: string|null, events: number, first_at: string, last_at: string}>} input.actors
 *   `activities` grouped by actor, for the workspace.
 * @param {Array<{subject: string, email: string|null, display_name: string|null,
 *   auth_display_name: string|null, person_entity_id: string|null}>} input.members
 *   the existing `workspace_members` rows.
 * @param {Array<{owner_id: string}>} input.preferenceOwners
 *   distinct `owner_app_preferences.owner_id` values — a recorded, trustworthy
 *   authenticated subject even for a workspace whose events predate membership.
 * @param {Array<{id: string, title: string, email: string|null}>} input.people
 *   active Person records with their detail email, for identity linking.
 * @param {object} [input.options]
 * @param {string} [input.options.workspaceId]
 * @param {string} [input.options.ownerEmail] the configured `OWNER_EMAIL`.
 * @param {string} [input.options.subject] restrict identity edits to one subject.
 * @param {string} [input.options.displayName] set an explicit member display name.
 * @param {string} [input.options.personEntityId] link the member to this Person.
 * @param {boolean} [input.options.attributeLegacySystem] opt in to re-attributing
 *   pre-authentication `system` events (off by default, and only ever possible
 *   when there is exactly one candidate subject).
 * @param {string} [input.options.now] ISO timestamp for written rows.
 */
export function planIdentityRepair(input) {
  const options = input.options ?? {};
  const workspaceId = options.workspaceId ?? "";
  const now = options.now ?? new Date(0).toISOString();
  const ownerEmail = canonicalEmail(options.ownerEmail);

  const actors = input.actors ?? [];
  const members = input.members ?? [];
  const preferenceOwners = input.preferenceOwners ?? [];
  const people = input.people ?? [];

  const statements = [];
  const counts = Object.fromEntries(REPAIR_METHODS.map((m) => [m, 0]));
  const unresolved = [];
  const notes = [];

  const memberBySubject = new Map(members.map((m) => [m.subject, m]));

  /* -- 1. Which subjects does the evidence name? --------------------------- */

  const activitySubjects = new Map();
  let legacySystemEvents = 0;
  let legacySystemLatest = null;
  let earliestUserEvent = null;

  for (const row of actors) {
    if (row.actor_type === "user" && !EMPTY(row.actor_id)) {
      const subject = String(row.actor_id);
      activitySubjects.set(
        subject,
        (activitySubjects.get(subject) ?? 0) + Number(row.events ?? 0),
      );
      if (earliestUserEvent === null || row.first_at < earliestUserEvent) {
        earliestUserEvent = row.first_at;
      }
    } else if (row.actor_type === "system" && EMPTY(row.actor_id)) {
      legacySystemEvents += Number(row.events ?? 0);
      if (legacySystemLatest === null || row.last_at > legacySystemLatest) {
        legacySystemLatest = row.last_at;
      }
    }
  }

  const preferenceSubjects = new Set(
    preferenceOwners.map((row) => row.owner_id).filter((id) => !EMPTY(id)),
  );

  // Every subject we have RELIABLE evidence for. A subject appears here only
  // because it is already recorded somewhere authoritative — never invented.
  const knownSubjects = new Set([
    ...activitySubjects.keys(),
    ...preferenceSubjects,
    ...memberBySubject.keys(),
  ]);

  /* -- 2. Provision the missing membership rows ---------------------------- */

  /**
   * @param {string} subject
   * @param {string | null} email
   * @param {string} method
   */
  const insert = (subject, email, method) => {
    statements.push({
      method,
      subject,
      sql: `INSERT INTO workspace_members (
              workspace_id, subject, email, display_name, auth_display_name,
              person_entity_id, created_at, updated_at, last_seen_at
            ) VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
            ON CONFLICT (workspace_id, subject) DO NOTHING`,
      params: [workspaceId, subject, email, now, now, now],
      description:
        email === null
          ? `provision membership for subject (no email evidence yet)`
          : `provision membership for subject with the configured owner email`,
    });
    counts[method] += 1;
  };

  // The ONLY case where the configured owner email may be attached AUTOMATICALLY
  // is an unambiguous one: exactly one subject exists in the whole workspace, so
  // there is no second identity it could belong to.
  const unambiguous = knownSubjects.size === 1;
  const autoEmail = unambiguous && ownerEmail !== null ? ownerEmail : null;
  const named = EMPTY(options.subject) ? null : String(options.subject);
  if (!unambiguous && ownerEmail !== null && named === null) {
    notes.push(
      `More than one authenticated subject is recorded (${knownSubjects.size}); ` +
        `OWNER_EMAIL is not applied automatically. Use --subject to name one.`,
    );
  }

  /**
   * The email to store for a subject.
   *
   * An operator who NAMES a subject has supplied the missing evidence
   * themselves, so the owner email applies to that subject even in an ambiguous
   * workspace — and it applies on the INSERT, not only to a row that already
   * exists. Without that, the documented `--subject … --owner-email … --apply`
   * flow left the named actor unresolved until a second run.
   *
   * @param {string} subject
   * @returns {string | null}
   */
  const emailFor = (subject) =>
    named !== null && subject === named && ownerEmail !== null
      ? ownerEmail
      : autoEmail;

  for (const subject of activitySubjects.keys()) {
    if (!memberBySubject.has(subject)) {
      insert(subject, emailFor(subject), "member_from_activity_actor");
    }
  }
  for (const subject of preferenceSubjects) {
    if (!memberBySubject.has(subject) && !activitySubjects.has(subject)) {
      insert(subject, emailFor(subject), "member_from_preferences_owner");
    }
  }

  /* -- 3. Fill an existing row's missing email ----------------------------- */

  for (const member of members) {
    const wanted = emailFor(member.subject);
    if (member.email === null && wanted !== null) {
      statements.push({
        method: "email_from_owner_evidence",
        subject: member.subject,
        sql: `UPDATE workspace_members
                 SET email = ?, updated_at = ?
               WHERE workspace_id = ? AND subject = ? AND email IS NULL`,
        params: [wanted, now, workspaceId, member.subject],
        description:
          "record the verified owner email on an existing membership",
      });
      counts.email_from_owner_evidence += 1;
    }
  }

  /* -- 4. Explicit, operator-supplied identity ----------------------------- */

  if (!EMPTY(options.displayName)) {
    const desiredName = String(options.displayName).trim();
    const existing = named === null ? undefined : memberBySubject.get(named);
    if (named === null) {
      notes.push("--display-name requires --subject; skipped.");
    } else if (!knownSubjects.has(named)) {
      notes.push(
        "--subject is not a recorded subject in this workspace; skipped.",
      );
    } else if (existing && existing.display_name === desiredName) {
      // Already exactly this name. Planning the update anyway would advance
      // `updated_at` and make a re-run report work it did not need to do, which
      // is precisely the idempotency the report promises.
    } else {
      statements.push({
        method: "display_name_explicit",
        subject: named,
        sql: `UPDATE workspace_members
                 SET display_name = ?, updated_at = ?
               WHERE workspace_id = ? AND subject = ?`,
        params: [desiredName, now, workspaceId, named],
        description: "set the owner-curated display name",
      });
      counts.display_name_explicit += 1;
    }
  }

  /**
   * @param {string} subject
   * @param {string} personId
   * @param {string} method
   * @param {string} description
   */
  const linkPerson = (subject, personId, method, description) => {
    statements.push({
      method,
      subject,
      sql: `UPDATE workspace_members
               SET person_entity_id = ?, updated_at = ?
             WHERE workspace_id = ? AND subject = ? AND person_entity_id IS NULL`,
      params: [personId, now, workspaceId, subject],
      description,
    });
    counts[method] += 1;
  };

  if (!EMPTY(options.personEntityId)) {
    const subject =
      named === null ? (unambiguous ? [...knownSubjects][0] : null) : named;
    const person = people.find((p) => p.id === options.personEntityId);
    const linked = subject === null ? undefined : memberBySubject.get(subject);
    if (subject === null) {
      notes.push("--person requires --subject when several subjects exist.");
    } else if (!person) {
      notes.push(
        "--person does not name an active Person in this workspace; skipped.",
      );
    } else if (linked && linked.person_entity_id === person.id) {
      // Already linked to exactly this Person — same reason as the display name
      // above: a re-run must plan nothing.
    } else {
      linkPerson(
        subject,
        person.id,
        "person_link_explicit",
        `link the member to the Person record "${person.title}"`,
      );
    }
  }

  /* -- 5. Link a Person by matching the verified email --------------------- */

  for (const member of members) {
    if (member.person_entity_id !== null) {
      continue;
    }
    if (
      named !== null &&
      member.subject === named &&
      !EMPTY(options.personEntityId)
    ) {
      // The operator named this subject's Person explicitly; that decision wins
      // over an email match, whether or not it produced a statement above.
      continue;
    }
    const email = canonicalEmail(member.email) ?? emailFor(member.subject);
    if (email === null) {
      continue;
    }
    const matches = people.filter((p) => canonicalEmail(p.email) === email);
    if (matches.length === 1) {
      linkPerson(
        member.subject,
        matches[0].id,
        "person_link_by_email",
        `link the member to the Person record "${matches[0].title}" (matched on the verified email)`,
      );
    } else if (matches.length > 1) {
      notes.push(
        `${matches.length} People records share the email ${email}; not linking automatically — pass --person=<entityId>.`,
      );
    }
  }

  /* -- 6. Legacy pre-authentication system events (opt-in only) ------------ */

  if (legacySystemEvents > 0) {
    const cutoff = earliestUserEvent;
    const candidates = [...knownSubjects];
    if (!options.attributeLegacySystem) {
      unresolved.push({
        reason: UNRESOLVED_REASONS.LEGACY_SYSTEM,
        events: legacySystemEvents,
        detail:
          "Recorded before authenticated actors existed, with no actor id. Left as System. " +
          "Pass --attribute-legacy-system to re-attribute them when you are certain they were owner actions.",
      });
    } else if (candidates.length !== 1) {
      unresolved.push({
        reason: UNRESOLVED_REASONS.LEGACY_SYSTEM,
        events: legacySystemEvents,
        detail: `Attribution requested but ${candidates.length} candidate subjects exist — refusing to guess.`,
      });
    } else if (cutoff === null) {
      unresolved.push({
        reason: UNRESOLVED_REASONS.LEGACY_SYSTEM,
        events: legacySystemEvents,
        detail:
          "Attribution requested but this workspace has no authenticated event to date the cut-off from.",
      });
    } else {
      // Narrow and auditable: only actor-less `system` rows that PREDATE the
      // first authenticated event, in this workspace, and only when exactly one
      // subject could possibly have caused them. Events after that cut-off are
      // genuine system activity and stay untouched.
      statements.push({
        method: "legacy_system_attribution",
        subject: candidates[0],
        sql: `UPDATE activities
                 SET actor_type = 'user', actor_id = ?
               WHERE workspace_id = ?
                 AND actor_type = 'system'
                 AND actor_id IS NULL
                 AND occurred_at < ?`,
        params: [candidates[0], workspaceId, cutoff],
        description: `re-attribute ${legacySystemEvents} pre-authentication event(s) recorded before ${cutoff}`,
      });
      counts.legacy_system_attribution += 1;
    }
  }

  /* -- 7. What is still not attributable ----------------------------------- */

  const willHaveIdentity = new Set();
  for (const member of members) {
    if (
      member.email !== null ||
      member.display_name !== null ||
      member.auth_display_name !== null ||
      member.person_entity_id !== null
    ) {
      willHaveIdentity.add(member.subject);
    }
  }
  for (const statement of statements) {
    if (statement.method !== "legacy_system_attribution" && statement.subject) {
      if (
        statement.method === "member_from_activity_actor" ||
        statement.method === "member_from_preferences_owner"
      ) {
        if (statement.params[2] !== null) {
          willHaveIdentity.add(statement.subject);
        }
      } else {
        willHaveIdentity.add(statement.subject);
      }
    }
  }
  for (const [subject, events] of activitySubjects) {
    if (!willHaveIdentity.has(subject)) {
      unresolved.push({
        reason: UNRESOLVED_REASONS.NO_IDENTITY_EVIDENCE,
        subject,
        events,
        detail:
          "No email, provider name or Person record is recorded for this subject. " +
          "Its events display as “Unknown user” until one is supplied " +
          "(--subject <id> --display-name <name>, or --person <entityId>).",
      });
    }
  }

  return {
    statements,
    counts,
    unresolved,
    notes,
    summary: {
      workspaceId,
      subjects: [...knownSubjects],
      userEvents: [...activitySubjects.values()].reduce((a, b) => a + b, 0),
      legacySystemEvents,
      legacySystemLatest,
      existingMembers: members.length,
      activePeople: people.length,
    },
  };
}

/**
 * Total number of repairs the plan would apply.
 * @param {ReturnType<typeof planIdentityRepair>} plan
 * @returns {number}
 */
export function plannedRepairCount(plan) {
  return plan.statements.length;
}
