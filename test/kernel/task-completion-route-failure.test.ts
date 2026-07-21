/**
 * TODAY-03 / ADR-029 — the completion action's calm-error behaviour when the
 * atomic `completeTask` operation fails at the storage layer. The rollback itself
 * (no partial state survives) is proven against real D1 with fault injection in
 * `task-completion.test.ts`; here we assert the ROUTE turns a `TaskStorageError`
 * into a calm, typed failure result and never leaks the raw error. The workspace
 * scope is mocked ONLY to force the storage failure deterministically — the real
 * transaction/batch path is exercised in the repository test.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { TaskStorageError } from "~/kernel/tasks";

const completeTask = vi.fn();
const getTask = vi.fn();

vi.mock("~/platform/workspaces", () => ({
  resolveAuthenticatedWorkspaceScope: vi.fn(async () => ({
    context: { workspaceId: "ws" },
    entities: {},
    entityLinks: {},
    spine: {},
    tasks: { getTask, completeTask },
    activity: {},
  })),
}));

// Imported AFTER the mock is declared so the route binds the mocked module.
const { action } = await import("~/modules/today/routes/task-detail");

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner", email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

function completeRequest(taskId: string) {
  const form = new FormData();
  form.set("intent", "complete");
  return action({
    request: new Request(`https://app.test/today/task/${taskId}`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { taskId },
  } as unknown as Parameters<typeof action>[0]) as Promise<Response>;
}

beforeEach(() => {
  completeTask.mockReset();
  getTask.mockReset();
});

describe("completion route — storage failure is calm", () => {
  it("returns a typed, calm error and never leaks the raw storage error", async () => {
    // The pre-dispatch guard resolves the task; the atomic completion then fails.
    getTask.mockResolvedValue({ id: "t1" });
    completeTask.mockRejectedValue(
      new TaskStorageError("A storage error occurred", {
        cause: new Error('D1_ERROR: near "FROM": syntax error'),
      }),
    );

    const res = await completeRequest("t1");
    // A calm 200 with a typed failure result — not a 500, not a thrown error.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kind: string;
      ok: boolean;
      message?: string;
    };
    expect(body.kind).toBe("completion");
    expect(body.ok).toBe(false);
    expect(body.message).toBeTruthy();
    // The raw SQL / D1 internals never reach the client.
    expect(JSON.stringify(body)).not.toMatch(/D1_ERROR|syntax error|FROM/);
    expect(completeTask).toHaveBeenCalledWith("t1");
  });
});
