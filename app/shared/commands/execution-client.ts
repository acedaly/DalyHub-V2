/**
 * DS-09 Command Palette — the browser command-execution transport.
 *
 * POSTs a command id to the authenticated `POST /commands/:commandId` boundary and
 * returns a sanitised, bounded {@link CommandExecutionOutcome}. It sends ONLY the
 * command id (in the path) — never a workspace id, module id, title or target, so
 * catalogue metadata can never be replayed as authority (ADR-024 §24.9). Any
 * response — success, typed failure, an auth/HTML error page or a non-JSON body —
 * is coerced into a safe outcome, so the palette never sees a raw error.
 *
 * It does NOT retry: an executable command may have side effects, so a retry must
 * be a deliberate new invocation the user initiates.
 */

import { sanitiseOutcome } from "./execution";
import type { CommandExecutionOutcome } from "./types";

/** The execution endpoint for a given command id. */
export function commandExecuteEndpoint(commandId: string): string {
  return `/commands/${encodeURIComponent(commandId)}`;
}

/** Injectable executor (real transport by default; a fake in tests/demos). */
export type ExecuteCommandFn = (
  commandId: string,
  signal: AbortSignal,
) => Promise<CommandExecutionOutcome>;

/** Execute a command by id via the authenticated boundary; never rejects. */
export async function postCommandExecution(
  commandId: string,
  signal: AbortSignal,
): Promise<CommandExecutionOutcome> {
  let body: unknown;
  try {
    const response = await fetch(commandExecuteEndpoint(commandId), {
      method: "POST",
      headers: { accept: "application/json" },
      signal,
    });
    body = await response.json();
  } catch {
    // Network failure, abort, or a non-JSON body (e.g. an auth error page) —
    // fall through to a calm sanitised failure.
    body = null;
  }
  return sanitiseOutcome(body);
}
