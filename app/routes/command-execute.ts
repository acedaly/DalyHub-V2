/**
 * DS-09 Command Palette — the authenticated command-execution route
 * (`POST /commands/:commandId`).
 *
 * The single server boundary that runs an EXECUTABLE module command (ADR-024
 * §24.9). It renders no shell, so it stays OUTSIDE the app-shell layout. The
 * sequence is deliberate and fail-closed:
 *
 *   1. reject any non-POST method (405) — no GET mutation;
 *   2. require the authenticated session (401) — thrown before the try;
 *   3. resolve the trusted, request-free workspace scope (never client-supplied);
 *   4. discover the registry and look up the EXACT command by its (untrusted) id;
 *   5. reject an unknown command, and reject a navigation-only command — a
 *      declarative navigation can never be run through the mutation endpoint;
 *   6. run the handler ONCE, under a bounded deadline + cancellation signal;
 *   7. return a typed, safe outcome — never the handler, never a raw exception.
 *
 * The browser sends only the command id in the path; every other field it might
 * have seen in catalogue metadata (module id, title, target, permissions) is
 * IGNORED — authority comes from the server-resolved workspace and the registry,
 * not from anything the client submits.
 */

import { env } from "cloudflare:workers";

import { discoverModuleRegistry } from "~/modules/discover-modules";
import { runRegisteredCommand } from "~/platform/commands/run-command";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { COMMAND_EXECUTION_DEADLINE_MS } from "~/shared/commands/model";
import type { CommandExecutionOutcome } from "~/shared/commands/model";

import type { Route } from "./+types/command-execute";

function json(outcome: CommandExecutionOutcome, status = 200): Response {
  return new Response(JSON.stringify(outcome), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  // No GET mutation: only POST executes a command.
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }

  // Authentication is authoritative: a missing session is a 401, thrown outside
  // the try so it can never be swallowed into a JSON outcome.
  const session = requireAuthenticatedSession(context);
  const commandId = params.commandId ?? "";

  try {
    // The trusted, request-free, D1-verified workspace scope. The client cannot
    // choose or forge it. If it fails to resolve, NO command runs.
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const registry = discoverModuleRegistry();

    // Resolve + run through the route-agnostic core. It runs an executable
    // command exactly once, rejects unknown and navigation-only commands, and
    // never throws or leaks internal detail.
    const { outcome, status } = await runRegisteredCommand(
      registry,
      commandId,
      { workspace: scope.context },
      { timeoutMs: COMMAND_EXECUTION_DEADLINE_MS, signal: request.signal },
    );
    return json(outcome, status);
  } catch {
    // Fail closed: a workspace-resolution or infrastructure failure becomes a
    // calm, retryable outcome — no internal detail leaks (auth already 401'd).
    return json({
      ok: false,
      reason: "failed",
      message: "That command didn’t complete.",
    });
  }
}
