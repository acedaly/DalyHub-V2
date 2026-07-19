import { describe, expect, it } from "vitest";

import { createModuleRegistry, defineModule } from "~/kernel/modules";
import type { CommandHandler } from "~/kernel/modules";
import { workspaceContextFromId } from "~/kernel/workspaces";
import { runRegisteredCommand } from "~/platform/commands/run-command";

/**
 * DS-09 — the command-execution CORE (`runRegisteredCommand` + the deadline
 * runner) exercised in the REAL Workers runtime with a fabricated registry, so the
 * success / typed-failure / timeout / cancellation paths run under workerd (the
 * same runtime as production) rather than only under happy-dom (ADR-024 §24.9).
 */

const context = { workspace: workspaceContextFromId("test-default-workspace") };

function registryWith(run: CommandHandler) {
  return createModuleRegistry([
    defineModule({
      id: "demo",
      name: "Demo",
      commands: [{ id: "demo.run", title: "Run", kind: "execute", run }],
    }),
  ]);
}

describe("command execution core in the Workers runtime", () => {
  it("runs a successful executable command exactly once", async () => {
    let runs = 0;
    const registry = registryWith(() => {
      runs += 1;
      return { ok: true, message: "ran" };
    });
    const result = await runRegisteredCommand(registry, "demo.run", context);
    expect(result.status).toBe(200);
    expect(result.outcome).toEqual({ ok: true, message: "ran" });
    expect(runs).toBe(1);
  });

  it("returns a typed failure without leaking detail", async () => {
    const registry = registryWith(() => ({
      ok: false,
      reason: "conflict",
      message: "changed underneath",
    }));
    const result = await runRegisteredCommand(registry, "demo.run", context);
    expect(result.outcome.ok).toBe(false);
    expect(result.outcome.ok === false && result.outcome.reason).toBe(
      "conflict",
    );
  });

  it("turns a thrown handler into a calm failure", async () => {
    const registry = registryWith(() => {
      throw new Error("secret internal detail");
    });
    const result = await runRegisteredCommand(registry, "demo.run", context);
    expect(result.outcome.ok).toBe(false);
    expect(JSON.stringify(result.outcome)).not.toMatch(/secret|Error/i);
  });

  it("times out a hung handler honestly under the deadline", async () => {
    const registry = registryWith(() => new Promise(() => {}));
    const result = await runRegisteredCommand(registry, "demo.run", context, {
      timeoutMs: 20,
    });
    expect(result.outcome.ok).toBe(false);
    expect(result.outcome.ok === false && result.outcome.message).toMatch(
      /taking too long/i,
    );
  });

  it("aborts the handler signal on cancellation", async () => {
    let aborted = false;
    const registry = registryWith(
      (ctx) =>
        new Promise((resolve) => {
          if (ctx.signal.aborted) {
            aborted = true;
            resolve({ ok: true });
            return;
          }
          ctx.signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              resolve({ ok: true });
            },
            { once: true },
          );
        }),
    );
    await runRegisteredCommand(registry, "demo.run", context, {
      timeoutMs: 20,
    });
    expect(aborted).toBe(true);
  });
});
