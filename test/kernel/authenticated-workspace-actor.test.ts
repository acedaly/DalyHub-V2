import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  resolveAuthenticatedWorkspaceScope,
  resolveWorkspaceScope,
} from "~/platform/workspaces";
import { makeWorkspaceRepository, resetTables } from "./support";

/**
 * FND-09 authenticated composition (ADR-016 §5.6, §11): a validated session
 * supplies the Activity ACTOR, while the workspace stays server-derived. Driven
 * against real D1 in the Workers runtime.
 */

const WORKSPACE_ID = "test-default-workspace";

function sessionFor(subject: string): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

async function provisionWorkspace(id = WORKSPACE_ID): Promise<void> {
  await makeWorkspaceRepository().create({ id: parseWorkspaceId(id) });
}

describe("authenticated workspace composition", () => {
  beforeEach(async () => {
    await resetTables();
  });

  it("resolves the configured workspace for an authenticated request", async () => {
    await provisionWorkspace();
    const scope = await resolveAuthenticatedWorkspaceScope(
      { DB: env.DB, DEFAULT_WORKSPACE_ID: WORKSPACE_ID },
      sessionFor("subject-abc"),
    );
    expect(scope.context.workspaceId).toBe(WORKSPACE_ID);
  });

  it("records an authenticated mutation with actor_type=user and actor_id=validated sub", async () => {
    await provisionWorkspace();
    const scope = await resolveAuthenticatedWorkspaceScope(
      { DB: env.DB, DEFAULT_WORKSPACE_ID: WORKSPACE_ID },
      sessionFor("subject-abc"),
    );

    const created = await scope.entities.create({
      type: "widget",
      title: "authored by the owner",
    });

    const feed = await scope.activity.listForWorkspace();
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]!.type).toBe("entity.created");
    expect(feed.items[0]!.actor).toEqual({ type: "user", id: "subject-abc" });
    expect(feed.items[0]!.subjects).toEqual([
      { entityId: created.id, role: "subject" },
    ]);

    // Cross-check the raw row's actor columns.
    const row = await env.DB.prepare(
      "SELECT actor_type, actor_id FROM activities LIMIT 1",
    ).first<{ actor_type: string; actor_id: string }>();
    expect(row?.actor_type).toBe("user");
    expect(row?.actor_id).toBe("subject-abc");
  });

  it("ignores a spoofed actor id supplied through the mutation input", async () => {
    await provisionWorkspace();
    const scope = await resolveAuthenticatedWorkspaceScope(
      { DB: env.DB, DEFAULT_WORKSPACE_ID: WORKSPACE_ID },
      sessionFor("trusted-sub"),
    );

    // Attempt to smuggle an actor through the entity input — it is not part of
    // the contract and must be ignored; the trusted session actor wins.
    await scope.entities.create({
      type: "widget",
      title: "spoof attempt",
      actorId: "attacker",
      actor: { type: "user", id: "attacker" },
    } as never);

    const feed = await scope.activity.listForWorkspace();
    expect(feed.items[0]!.actor).toEqual({ type: "user", id: "trusted-sub" });
  });

  it("keeps the workspace server-derived: the session cannot select another workspace", async () => {
    await provisionWorkspace();
    // Two different authenticated subjects both resolve the SAME configured
    // workspace — identity never selects the data scope.
    const a = await resolveAuthenticatedWorkspaceScope(
      { DB: env.DB, DEFAULT_WORKSPACE_ID: WORKSPACE_ID },
      sessionFor("subject-a"),
    );
    const b = await resolveAuthenticatedWorkspaceScope(
      { DB: env.DB, DEFAULT_WORKSPACE_ID: WORKSPACE_ID },
      sessionFor("subject-b"),
    );
    expect(a.context.workspaceId).toBe(WORKSPACE_ID);
    expect(b.context.workspaceId).toBe(WORKSPACE_ID);
  });

  it("still exposes the system actor for genuinely system-initiated composition", async () => {
    await provisionWorkspace();
    const scope = await resolveWorkspaceScope({
      DB: env.DB,
      DEFAULT_WORKSPACE_ID: WORKSPACE_ID,
    });
    await scope.entities.create({ type: "widget", title: "system work" });
    const feed = await scope.activity.listForWorkspace();
    expect(feed.items[0]!.actor).toEqual({ type: "system", id: null });
  });
});
