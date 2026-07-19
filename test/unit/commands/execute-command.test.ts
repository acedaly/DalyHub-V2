import { describe, expect, it } from "vitest";

import { createModuleRegistry, defineModule } from "~/kernel/modules";
import type { CommandHandler } from "~/kernel/modules";
import { workspaceContextFromId } from "~/kernel/workspaces";
import { runRegisteredCommand } from "~/platform/commands/run-command";
import { executeCommand } from "~/shared/commands/execute-command";

const context = { workspace: workspaceContextFromId("test-workspace") };

describe("executeCommand runner", () => {
  it("returns a sanitised success outcome", async () => {
    const run: CommandHandler = () => ({ ok: true, message: "Done" });
    expect(await executeCommand(run, context)).toEqual({
      ok: true,
      message: "Done",
    });
  });

  it("turns a thrown handler into a calm failure (no raw error)", async () => {
    const run: CommandHandler = () => {
      throw new Error("SELECT * FROM secrets");
    };
    const outcome = await executeCommand(run, context);
    expect(outcome.ok).toBe(false);
    expect(JSON.stringify(outcome)).not.toMatch(/SELECT|secrets|Error/i);
  });

  it("reports an honest timeout without claiming cancellation", async () => {
    const run: CommandHandler = () => new Promise(() => {}); // never resolves
    const outcome = await executeCommand(run, context, { timeoutMs: 20 });
    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.reason).toBe("failed");
    expect(outcome.ok === false && outcome.message).toMatch(/taking too long/i);
    expect(JSON.stringify(outcome)).not.toMatch(/cancelled/i);
  });

  it("aborts the handler signal on timeout", async () => {
    let aborted = false;
    const run: CommandHandler = (ctx) =>
      new Promise((resolve) => {
        ctx.signal.addEventListener("abort", () => {
          aborted = true;
          resolve({ ok: false, reason: "failed", message: "aborted" });
        });
      });
    await executeCommand(run, context, { timeoutMs: 20 });
    expect(aborted).toBe(true);
  });

  it("links an outer abort signal", async () => {
    const outer = new AbortController();
    let sawAbort = false;
    const run: CommandHandler = (ctx) =>
      new Promise((resolve) => {
        const onAbort = () => {
          sawAbort = true;
          resolve({ ok: true });
        };
        // A well-behaved handler checks the flag as well as the event, since the
        // signal may already be aborted by the time it runs.
        if (ctx.signal.aborted) {
          onAbort();
          return;
        }
        ctx.signal.addEventListener("abort", onAbort, { once: true });
      });
    const promise = executeCommand(run, context, { signal: outer.signal });
    outer.abort();
    await promise;
    expect(sawAbort).toBe(true);
  });
});

describe("runRegisteredCommand", () => {
  const registry = createModuleRegistry([
    defineModule({
      id: "demo",
      name: "Demo",
      commands: [
        {
          id: "demo.ok",
          title: "OK",
          kind: "execute",
          run: () => ({ ok: true, message: "ran" }),
        },
        {
          id: "demo.fail",
          title: "Fail",
          kind: "execute",
          run: () => ({ ok: false, reason: "conflict", message: "nope" }),
        },
        {
          id: "demo.go",
          title: "Go",
          kind: "navigate",
          target: { kind: "route", to: "/demo" },
        },
      ],
    }),
  ]);

  it("runs an executable command and returns 200", async () => {
    const result = await runRegisteredCommand(registry, "demo.ok", context);
    expect(result.status).toBe(200);
    expect(result.outcome).toEqual({ ok: true, message: "ran" });
  });

  it("returns a typed failure with 200", async () => {
    const result = await runRegisteredCommand(registry, "demo.fail", context);
    expect(result.status).toBe(200);
    expect(result.outcome.ok).toBe(false);
  });

  it("rejects an unknown command with 404", async () => {
    const result = await runRegisteredCommand(
      registry,
      "demo.missing",
      context,
    );
    expect(result.status).toBe(404);
    expect(result.outcome.ok).toBe(false);
  });

  it("rejects a navigation-only command with 400", async () => {
    const result = await runRegisteredCommand(registry, "demo.go", context);
    expect(result.status).toBe(400);
    expect(result.outcome.ok).toBe(false);
  });

  it("rejects an over-long id without a registry lookup", async () => {
    const result = await runRegisteredCommand(
      registry,
      "x".repeat(500),
      context,
    );
    expect(result.status).toBe(404);
  });
});
