/**
 * DS-09 Command Palette — the registry command-execution core.
 *
 * The route-agnostic heart of `POST /commands/:commandId`: given a registry, an
 * (untrusted) command id and a trusted workspace-scoped context, it validates the
 * id, looks up the EXACT command, rejects an unknown command and a navigation-only
 * command, and runs an executable handler ONCE under a bounded deadline — always
 * returning a typed, safe outcome plus the HTTP status the route should use
 * (ADR-024 §24.9). Extracted from the route so the decision logic is unit-testable
 * with a fabricated registry (success/failure/timeout/cancellation) while the
 * route itself is tested for auth, method and workspace-boundary integration.
 */

import type { ModuleRegistry, ModuleRuntimeContext } from "~/kernel/modules";
import { executeCommand } from "~/shared/commands/execute-command";
import type { ExecuteCommandOptions } from "~/shared/commands/execute-command";
import {
  COMMAND_EXECUTION_DEADLINE_MS,
  MAX_COMMAND_ID_LENGTH,
} from "~/shared/commands/model";
import type { CommandExecutionOutcome } from "~/shared/commands/model";

/** A safe outcome paired with the HTTP status the route should return. */
export type RunCommandResult = {
  readonly outcome: CommandExecutionOutcome;
  readonly status: number;
};

/**
 * Resolve and run a registered command by its untrusted id. Never throws; always
 * returns a safe outcome and status. Executes an executable command at most once.
 */
export async function runRegisteredCommand(
  registry: ModuleRegistry,
  commandId: string,
  context: ModuleRuntimeContext,
  options: ExecuteCommandOptions = {},
): Promise<RunCommandResult> {
  if (commandId.length === 0 || commandId.length > MAX_COMMAND_ID_LENGTH) {
    return unknownCommand();
  }

  const command = registry.getCommand(commandId);
  if (command === null) {
    return unknownCommand();
  }

  // A navigation command is declarative — it must never be run through the
  // mutation endpoint; the client navigates to its target directly.
  if (command.kind !== "execute") {
    return {
      outcome: {
        ok: false,
        reason: "unavailable",
        message: "That command can’t be run here.",
      },
      status: 400,
    };
  }

  const outcome = await executeCommand(command.run, context, {
    timeoutMs: options.timeoutMs ?? COMMAND_EXECUTION_DEADLINE_MS,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  return { outcome, status: 200 };
}

function unknownCommand(): RunCommandResult {
  return {
    outcome: {
      ok: false,
      reason: "unavailable",
      message: "That command isn’t available.",
    },
    status: 404,
  };
}
