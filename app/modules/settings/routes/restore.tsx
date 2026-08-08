/**
 * SET-02 — the authenticated restore endpoints
 * (`POST /settings/restore/:step`, where `step` is `preview`, `safety-backup`,
 * `apply` or `discard`).
 *
 * A resource route: it renders no UI. The whole authorisation story lives here,
 * server-side, and nothing about it is negotiable by the client — the same
 * shape as the X-04 export route it is the counterpart to:
 *
 *   - `requireAuthenticatedSession` — no verified session, no restore. The
 *     Worker request boundary has already validated the Cloudflare Access JWT,
 *     enforced `OWNER_EMAIL` and checked same-origin provenance for this unsafe
 *     method before the action runs; this is the fail-closed check on top.
 *   - `resolveAuthenticatedWorkspaceScope` — the target workspace comes from
 *     trusted server configuration. **There is no workspace parameter, header or
 *     body field anywhere in this file**, and the uploaded snapshot's own
 *     `workspace.id` is read only to DISPLAY provenance. A crafted archive
 *     therefore cannot name where its records go.
 *   - the owner's SUBJECT owns the restored owner-scoped rows (preferences,
 *     saved views). A backup carries no owner identifier and could not supply
 *     one if it did.
 *
 * The four steps exist as four requests deliberately. Uploading and writing in
 * one call would mean a restore begins the moment a file is chosen, which is
 * exactly what SET-02 forbids: `preview` validates and stages without touching a
 * single canonical row, `safety-backup` produces and VERIFIES a recovery point,
 * `apply` performs the atomic cutover, and `discard` abandons the whole thing.
 *
 * Failures never leak internals. The owner gets a short, honest sentence; the
 * structural detail — paths and rule names, never record content — is logged
 * server-side where it belongs.
 */

import { env } from "cloudflare:workers";

import {
  RestoreFailedError,
  RestoreRejectedError,
  type RestorePreview,
  type RestoreResult,
} from "~/kernel/restore";
import { buildInfo } from "~/lib/version";
import {
  applyRestore,
  createSafetyBackup,
  discardRestore,
  prepareRestore,
  RESTORE_MAX_ARCHIVE_BYTES,
  type RestoreDependencies,
} from "~/platform/restore";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/restore";

/** The four steps of a restore, in the order they must happen. */
export const RESTORE_STEPS = [
  "preview",
  "safety-backup",
  "apply",
  "discard",
] as const;
export type RestoreStep = (typeof RESTORE_STEPS)[number];

/** The form field the archive is uploaded under. */
export const RESTORE_FILE_FIELD = "backup";
/** The form field a prepared restore is referenced by. */
export const RESTORE_OPERATION_FIELD = "operationId";

function isStep(value: unknown): value is RestoreStep {
  return (
    typeof value === "string" &&
    (RESTORE_STEPS as readonly string[]).includes(value)
  );
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  // A restore response describes the owner's entire workspace. Never cached.
  "cache-control": "no-store, no-cache, must-revalidate, private",
  "x-content-type-options": "nosniff",
} as const;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * Log the structural cause and return the owner-facing sentence.
 *
 * The two are deliberately different values. The owner needs to know what to do;
 * the diagnostic — issue codes and snapshot PATHS — is what a future
 * investigation needs, and it must never travel to the browser, because a path
 * list is the one part of a validation failure that could hint at content.
 */
function reportFailure(step: RestoreStep, error: unknown): Response {
  if (error instanceof RestoreRejectedError) {
    console.error(
      `[restore:${step}] rejected (${error.rejection.kind}):`,
      error.rejection.issues
        .slice(0, 10)
        .map((issue) => `${issue.code} at ${issue.path}`)
        .join("; ") || "no structural detail",
    );
    return json(
      {
        ok: false,
        kind: error.rejection.kind,
        message: error.rejection.message,
      },
      422,
    );
  }
  if (error instanceof RestoreFailedError) {
    console.error(
      `[restore:${step}] failed (workspaceReplaced=${error.workspaceReplaced}):`,
      error.cause instanceof Error
        ? `${error.cause.name}: ${error.cause.message}`
        : error.message,
    );
    return json(
      {
        ok: false,
        kind: "restore_failed",
        message: error.message,
        workspaceReplaced: error.workspaceReplaced,
        failedChecks:
          error.verification?.checks
            .filter((check) => !check.passed)
            .map((check) => check.name) ?? [],
      },
      500,
    );
  }
  console.error(
    `[restore:${step}] unexpected:`,
    error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
  );
  return json(
    {
      ok: false,
      kind: "restore_failed",
      message:
        "The restore could not be completed. Your workspace was not changed.",
      workspaceReplaced: false,
      failedChecks: [],
    },
    500,
  );
}

async function dependencies(
  context: Route.ActionArgs["context"],
): Promise<RestoreDependencies> {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const build = buildInfo(env);
  return {
    restore: scope.restore,
    snapshot: scope.snapshot,
    workspaceId: scope.context.workspaceId,
    ownerId: session.user.subject,
    application: {
      name: build.name,
      version: build.version,
      releaseName: build.releaseName,
      environment: build.environment,
      buildCommit: build.commit,
    },
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  };
}

/**
 * There is no GET.
 *
 * Stated as a loader rather than left absent: a resource route with no loader
 * makes React Router raise an internal "you did not provide a loader" error the
 * first time anything issues one — a pasted URL, a prefetch, the service
 * worker warming its cache — which fills the server log with a stack trace
 * instead of an answer. This says the true thing, once, and keeps the contract
 * ("nothing about a restore is reachable by following a link") visible in the
 * route rather than only in a comment.
 */
export function loader(): never {
  throw new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "POST", "cache-control": "no-store" },
  });
}

export async function action({ params, request, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const step = params.step;
  if (!isStep(step)) {
    throw new Response("Unsupported restore step", { status: 404 });
  }

  // Authentication before anything reads the body: a request without a session
  // never gets as far as allocating an upload.
  const deps = await dependencies(context);
  const form = await request.formData();

  try {
    if (step === "preview") {
      const file = form.get(RESTORE_FILE_FIELD);
      if (!(file instanceof File)) {
        return json(
          {
            ok: false,
            kind: "unreadable_archive",
            message:
              "No backup file was received. Choose a DalyHub backup ZIP.",
          },
          400,
        );
      }
      // Bounded BEFORE the bytes are read into the isolate.
      if (file.size > RESTORE_MAX_ARCHIVE_BYTES) {
        return json(
          {
            ok: false,
            kind: "too_large",
            message: `That file is larger than the ${Math.round(RESTORE_MAX_ARCHIVE_BYTES / (1024 * 1024))} MB a restore accepts.`,
          },
          413,
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const preview: RestorePreview = await prepareRestore(deps, bytes);
      return json({ ok: true, preview });
    }

    const operationId = form.get(RESTORE_OPERATION_FIELD);
    if (typeof operationId !== "string" || operationId.length === 0) {
      return json(
        {
          ok: false,
          kind: "incompatible",
          message:
            "That restore is no longer available. Choose the backup file again to start over.",
        },
        400,
      );
    }

    if (step === "safety-backup") {
      const backup = await createSafetyBackup(deps, operationId);
      return new Response(backup.bytes as unknown as BodyInit, {
        headers: {
          "content-type": "application/zip",
          "content-disposition":
            `attachment; filename="${backup.receipt.filename}"; ` +
            `filename*=UTF-8''${encodeURIComponent(backup.receipt.filename)}`,
          "cache-control": "no-store, no-cache, must-revalidate, private",
          pragma: "no-cache",
          "x-content-type-options": "nosniff",
          "content-length": String(backup.bytes.length),
          // Non-sensitive receipt facts, so the client can report what it saved
          // without parsing the archive it just received.
          "x-dalyhub-safety-backup-records": String(backup.receipt.recordCount),
        },
      });
    }

    if (step === "apply") {
      const result: RestoreResult = await applyRestore(deps, operationId);
      return json({ ok: true, result });
    }

    await discardRestore(deps, operationId);
    return json({ ok: true });
  } catch (error) {
    return reportFailure(step, error);
  }
}
