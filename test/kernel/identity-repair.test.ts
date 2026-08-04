import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { planIdentityRepair } from "../../scripts/identity-repair-plan.mjs";
import { renderStatement } from "../../scripts/repair-activity-identity.mjs";

import type { AuthenticatedSession } from "~/kernel/auth";
import { actorKey } from "~/kernel/identity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { createActorDirectory } from "~/platform/storage/d1";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { makeContext, makeWorkspaceRepository, resetTables } from "./support";

/**
 * IDENT-01 — the production identity repair, executed against a REAL D1 database
 * in the Workers runtime.
 *
 * The planner's rules are unit-tested; what this proves is the part that only a
 * real database can: the statements it emits actually run, they fix the display
 * name for events that ALREADY EXIST, they add no activity rows, and running the
 * whole repair twice changes nothing the second time.
 */

const WS = "test-default-workspace";
const SUB = "access-sub-aidan";
const EMAIL = "aidan@daly.id.au";

function session(): AuthenticatedSession {
  return {
    user: { subject: SUB, email: EMAIL, displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

async function readEvidence() {
  // The planner documents the row shape each query must produce; these reads
  // mirror `readQueries` in the repair script exactly.
  const all = async (sql: string): Promise<Record<string, unknown>[]> =>
    ((await env.DB.prepare(sql).bind(WS).all()).results ?? []) as Record<
      string,
      unknown
    >[];
  return {
    actors: await all(
      `SELECT actor_type, actor_id, COUNT(*) AS events,
              MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at
       FROM activities WHERE workspace_id = ? GROUP BY actor_type, actor_id`,
    ),
    members: await all(
      `SELECT subject, email, display_name, auth_display_name, person_entity_id
       FROM workspace_members WHERE workspace_id = ?`,
    ),
    preferenceOwners: await all(
      `SELECT DISTINCT owner_id FROM owner_app_preferences WHERE workspace_id = ?`,
    ),
    people: await all(
      `SELECT e.id AS id, e.title AS title, pd.email AS email
       FROM entities e
       JOIN person_details pd
         ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
       WHERE e.workspace_id = ? AND e.type = 'person' AND e.deleted_at IS NULL`,
    ),
  };
}

async function runRepair(options: Record<string, unknown> = {}) {
  const evidence = await readEvidence();
  // The rows come from SQL, so their static type is the generic row shape; the
  // planner documents (and the queries above satisfy) the columns it needs.
  const plan = planIdentityRepair({
    ...evidence,
    options: {
      workspaceId: WS,
      ownerEmail: EMAIL,
      now: new Date().toISOString(),
      ...options,
    },
  } as unknown as Parameters<typeof planIdentityRepair>[0]);
  for (const statement of plan.statements) {
    await env.DB.prepare(renderStatement(statement)).run();
  }
  return plan;
}

async function count(table: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE workspace_id = ?`,
  )
    .bind(WS)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function resolvedName(): Promise<string | undefined> {
  const identities = await createActorDirectory(
    env.DB,
    makeContext(WS),
  ).resolveActors([{ type: "user", id: SUB }]);
  return identities.get(actorKey({ type: "user", id: SUB }))?.displayName;
}

/** Reproduce the production shape: real events, but no membership row at all. */
async function seedUnrepairedHistory() {
  const scope = await resolveAuthenticatedWorkspaceScope(
    { DB: env.DB, DEFAULT_WORKSPACE_ID: WS },
    session(),
  );
  await scope.entities.create({ type: "widget", title: "a thing" });
  await scope.entities.create({ type: "widget", title: "another thing" });
  return scope;
}

describe("the production identity repair", () => {
  beforeEach(async () => {
    await resetTables();
    await makeWorkspaceRepository().create({ id: parseWorkspaceId(WS) });
  });

  it("names an existing event's actor without touching the event", async () => {
    await seedUnrepairedHistory();
    expect(await resolvedName()).toBe("Unknown user");
    const activitiesBefore = await count("activities");

    const plan = await runRepair();
    expect(plan.counts.member_from_activity_actor).toBe(1);

    // The history itself is untouched: same rows, same actor columns.
    expect(await count("activities")).toBe(activitiesBefore);
    const rows = await env.DB.prepare(
      "SELECT DISTINCT actor_type, actor_id FROM activities WHERE workspace_id = ?",
    )
      .bind(WS)
      .all<{ actor_type: string; actor_id: string }>();
    expect(rows.results).toEqual([{ actor_type: "user", actor_id: SUB }]);

    // …and the SAME events now resolve to a real identity.
    expect(await resolvedName()).toBe(EMAIL);
  });

  it("is idempotent: a second run plans nothing and changes nothing", async () => {
    await seedUnrepairedHistory();
    await runRepair();
    const snapshot = await env.DB.prepare(
      "SELECT * FROM workspace_members WHERE workspace_id = ?",
    )
      .bind(WS)
      .all();

    const second = await runRepair();
    expect(second.statements).toHaveLength(0);
    expect(second.unresolved).toHaveLength(0);

    const after = await env.DB.prepare(
      "SELECT * FROM workspace_members WHERE workspace_id = ?",
    )
      .bind(WS)
      .all();
    expect(after.results).toEqual(snapshot.results);
    expect(await count("workspace_members")).toBe(1);
  });

  it("links the owner's Person record and uses that name", async () => {
    const scope = await seedUnrepairedHistory();
    await scope.people.create({ title: "Aidan Daly", email: EMAIL });

    // First pass provisions membership; the second links the matching Person
    // (the link needs the membership row's email to match against).
    await runRepair();
    const second = await runRepair();
    expect(second.counts.person_link_by_email).toBe(1);

    expect(await resolvedName()).toBe("Aidan Daly");
    // Still no third pass of work, and still no invented history.
    expect((await runRepair()).statements).toHaveLength(0);
  });

  it("applies an explicit display name for a named subject", async () => {
    await seedUnrepairedHistory();
    await runRepair();
    const plan = await runRepair({ subject: SUB, displayName: "Aidan Daly" });
    expect(plan.counts.display_name_explicit).toBe(1);
    expect(await resolvedName()).toBe("Aidan Daly");
  });

  it("creates no duplicate activity rows, ever", async () => {
    await seedUnrepairedHistory();
    const before = await count("activities");
    await runRepair();
    await runRepair({ subject: SUB, displayName: "Aidan Daly" });
    expect(await count("activities")).toBe(before);
  });

  it("leaves pre-authentication system events alone unless explicitly asked", async () => {
    await seedUnrepairedHistory();
    // A legacy row: recorded before authenticated actors existed.
    await env.DB.prepare(
      `INSERT INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
       VALUES ('legacy-1', ?, 'entity.created', 'system', NULL, '2026-01-01T00:00:00.000Z', '{}')`,
    )
      .bind(WS)
      .run();

    const reported = await runRepair();
    expect(
      reported.unresolved.some((u) => u.reason === "legacy_system_actor"),
    ).toBe(true);
    const untouched = await env.DB.prepare(
      "SELECT actor_type, actor_id FROM activities WHERE id = 'legacy-1'",
    ).first<{ actor_type: string; actor_id: string | null }>();
    expect(untouched).toEqual({ actor_type: "system", actor_id: null });

    // Opted in, with a single unambiguous subject, it is attributed — and only
    // the pre-authentication row is.
    await runRepair({ attributeLegacySystem: true });
    const repaired = await env.DB.prepare(
      "SELECT actor_type, actor_id FROM activities WHERE id = 'legacy-1'",
    ).first<{ actor_type: string; actor_id: string | null }>();
    expect(repaired).toEqual({ actor_type: "user", actor_id: SUB });
    expect(await count("activities")).toBe(3);
  });
});
