/**
 * DS-09 Command Palette — the deadline-bounded command execution runner.
 *
 * Runs one executable command handler under a bounded deadline and a cancellation
 * `AbortSignal`, mirroring DS-08's per-provider deadline runner (ADR-024 §24.9).
 * It NEVER rejects and NEVER leaks a raw error: a thrown handler becomes a calm
 * `failed` outcome, a timeout aborts the signal and returns an HONEST timeout
 * message (it does not claim the side effect was cancelled — a handler that
 * ignored the signal may have completed), and a returned value is sanitised into
 * a bounded, display-ready outcome. Timers and listeners are always cleaned up, so
 * there is no unhandled late rejection.
 *
 * This is runtime (it uses timers), not part of the React-free model barrel, but
 * it is React-free and binding-free, so the server route and unit tests reuse it.
 */

import type {
  CommandExecutionOutcome,
  CommandHandler,
  CommandRuntimeContext,
  ModuleRuntimeContext,
} from "~/kernel/modules";

import { COMMAND_EXECUTION_DEADLINE_MS } from "./limits";
import { sanitiseOutcome } from "./execution";

/** Options for one command execution. */
export type ExecuteCommandOptions = {
  /** The bounded deadline in ms (defaults to {@link COMMAND_EXECUTION_DEADLINE_MS}). */
  readonly timeoutMs?: number;
  /** An optional outer signal (e.g. the request aborted) linked to the handler. */
  readonly signal?: AbortSignal;
};

/**
 * Execute a command handler safely. Always resolves to a typed outcome; the
 * handler receives a {@link CommandRuntimeContext} carrying the workspace scope
 * and a cancellation signal aborted on timeout or outer cancellation.
 */
export function executeCommand(
  run: CommandHandler,
  context: ModuleRuntimeContext,
  options: ExecuteCommandOptions = {},
): Promise<CommandExecutionOutcome> {
  const timeoutMs = options.timeoutMs ?? COMMAND_EXECUTION_DEADLINE_MS;
  const controller = new AbortController();

  // Link an optional outer signal so caller/request cancellation aborts the run.
  let removeOuterListener: (() => void) | null = null;
  if (options.signal !== undefined) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      const onAbort = () => controller.abort();
      options.signal.addEventListener("abort", onAbort, { once: true });
      removeOuterListener = () =>
        options.signal?.removeEventListener("abort", onAbort);
    }
  }

  return new Promise<CommandExecutionOutcome>((resolve) => {
    let settled = false;
    const timers: { id?: ReturnType<typeof setTimeout> } = {};

    const finish = (outcome: CommandExecutionOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timers.id !== undefined) {
        clearTimeout(timers.id);
      }
      if (removeOuterListener !== null) {
        removeOuterListener();
      }
      resolve(outcome);
    };

    timers.id = setTimeout(() => {
      controller.abort();
      finish({
        ok: false,
        reason: "failed",
        // Honest: the handler may or may not have completed — we simply stopped
        // waiting. Never claim the side effect was cancelled.
        message:
          "The command is taking too long. It may still be finishing in the background.",
      });
    }, timeoutMs);

    const runtimeContext: CommandRuntimeContext = {
      ...context,
      signal: controller.signal,
    };

    // Isolate a synchronous throw as a rejection so it cannot escape.
    Promise.resolve()
      .then(() => run(runtimeContext))
      .then(
        (outcome) => finish(sanitiseOutcome(outcome)),
        () =>
          // A raw thrown error becomes a calm, detail-free failure.
          finish({
            ok: false,
            reason: "failed",
            message: "That command didn’t complete.",
          }),
      );
  });
}
