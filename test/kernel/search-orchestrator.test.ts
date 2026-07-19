import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";
import {
  parseWorkspaceId,
  type WorkspaceRepository,
} from "~/kernel/workspaces";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { AuthenticatedSession } from "~/kernel/auth";
import {
  parseModuleId,
  type ModuleRuntimeContext,
  type RegisteredSearchProvider,
  type SearchExecutor,
} from "~/kernel/modules";
import { executeSearch } from "~/shared/search/orchestrator";

import { makeWorkspaceRepository, resetTables } from "./support";

function sessionFor(): AuthenticatedSession {
  return {
    user: { subject: "owner-subject", email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

/**
 * DS-08 — the server composition boundary in the REAL Workers runtime.
 *
 * Proves that the workspace scope a search executor receives is resolved from
 * TRUSTED server configuration (request-free) and delivered unchanged through
 * `ModuleRuntimeContext` — a client can neither supply nor influence it, because
 * the resolver takes no request input and `executeSearch` has no workspace-id
 * parameter.
 */

// Matches vitest.workers.config.ts DEFAULT_WORKSPACE_ID (env.DEFAULT_WORKSPACE_ID).
const CONFIGURED = "test-default-workspace";

function recordingProvider(
  onContext: (context: ModuleRuntimeContext) => void,
): RegisteredSearchProvider {
  const search: SearchExecutor = async (query, context) => {
    onContext(context);
    return [
      {
        id: "r1",
        title: `Match ${query.text}`,
        target: { kind: "route", to: "/x" },
        entityType: "task",
      },
    ];
  };
  return {
    id: "probe.search",
    moduleId: parseModuleId("probe"),
    label: "Probe",
    search,
  };
}

describe("search orchestration over the real workspace boundary", () => {
  let repository: WorkspaceRepository;

  beforeEach(async () => {
    await resetTables();
    repository = makeWorkspaceRepository();
  });

  it("delivers the exact server-resolved workspace to the provider (route resolver)", async () => {
    await repository.create({ id: parseWorkspaceId(CONFIGURED) });
    // The SAME resolver the /search route uses — resolves + verifies in D1.
    const scope = await resolveAuthenticatedWorkspaceScope(env, sessionFor());

    let delivered: string | undefined;
    const outcome = await executeSearch({
      providers: [
        recordingProvider((c) => (delivered = c.workspace.workspaceId)),
      ],
      context: { workspace: scope.context },
      rawQuery: "alpha",
    });

    expect(scope.context.workspaceId).toBe(CONFIGURED);
    expect(delivered).toBe(CONFIGURED);
    expect(outcome.status).toBe("ok");
    expect(outcome.totalCount).toBe(1);
  });

  it("fails closed if the configured workspace is absent (no fabricated scope)", async () => {
    // The configured workspace was never created — resolution must reject, so
    // search never runs against an unverified scope.
    await expect(
      resolveAuthenticatedWorkspaceScope(env, sessionFor()),
    ).rejects.toThrow();
  });
});
