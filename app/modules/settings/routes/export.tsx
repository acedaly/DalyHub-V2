/**
 * X-04 — the authenticated workspace-export downloads
 * (`GET /settings/export/:format`, where `format` is `full` or `obsidian`).
 *
 * A resource route: it renders no UI, returns a `Content-Disposition:
 * attachment` response, and is the only path by which workspace data leaves
 * DalyHub in bulk. The whole authorisation story lives here, server-side, and
 * nothing about it is negotiable by the client:
 *
 *   - `requireAuthenticatedSession` — no verified session, no export. The Worker
 *     request boundary has already validated the Cloudflare Access JWT and
 *     enforced `OWNER_EMAIL` before this loader runs; this is the fail-closed
 *     check on top of that.
 *   - `resolveAuthenticatedWorkspaceScope` — the workspace comes from trusted
 *     server configuration. **No request value influences which workspace is
 *     read**: there is no workspace parameter, header or body field, so a
 *     crafted request cannot reach another workspace's records.
 *   - the owner's SUBJECT (`session.user.subject`) selects the owner-scoped
 *     preference and saved-view rows. It is used as a query predicate only and
 *     never written into the export.
 *
 * Both formats are built from ONE `buildWorkspaceSnapshot` call, so the
 * structured archive and the vault can never describe different data.
 *
 * The response is deliberately unfriendly to caches and sniffers: `no-store`
 * (this is the owner's entire private workspace — it must not sit in a shared
 * cache, a CDN or the browser's disk cache), `nosniff`, and an ASCII-safe
 * filename. Nothing is persisted on the Worker and nothing is sent anywhere
 * else.
 *
 * A failure never leaks internals: SQL, binding names, workspace ids and stack
 * traces stay server-side, and the owner gets a short, honest sentence.
 */

import { env } from "cloudflare:workers";

import { SnapshotValidationError } from "~/kernel/export";
import { actorKey, resolveActorIdentity } from "~/kernel/identity";
import { buildInfo } from "~/lib/version";
import {
  AttachmentExportError,
  WorkspaceSnapshotUnavailableError,
  buildObsidianVaultArchive,
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
  readAttachmentBytesForArchive,
  type ExportArchive,
} from "~/platform/export";
import { resolveAttachmentObjectStore } from "~/platform/attachments";
import { ZipTooLargeError } from "~/platform/export";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/export";

/** The two downloads Settings offers. */
export const EXPORT_FORMATS = ["full", "obsidian"] as const;
export type WorkspaceExportFormat = (typeof EXPORT_FORMATS)[number];

function isExportFormat(value: unknown): value is WorkspaceExportFormat {
  return (
    typeof value === "string" &&
    (EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

/**
 * The owner-facing failure sentence for each way an export can fail.
 *
 * Deliberately short and specific enough to act on, with no internal detail —
 * no SQL, no binding name, no workspace id, no stack trace. The cause is logged
 * server-side separately (see the loader), because a response the owner can read
 * and a diagnostic the owner must never see are two different things.
 */
function failureMessage(error: unknown): { status: number; message: string } {
  if (error instanceof WorkspaceSnapshotUnavailableError) {
    return {
      status: 503,
      message:
        "The export could not start because your workspace could not be resolved. Try again shortly.",
    };
  }
  if (error instanceof SnapshotValidationError) {
    return {
      status: 500,
      message:
        "The export was stopped because the snapshot failed its own integrity check. No file was produced — a partial export would be worse than none.",
    };
  }
  if (error instanceof AttachmentExportError) {
    return {
      status: 500,
      message:
        error.reason === "too_many"
          ? "This workspace has more attached files than a single archive can carry. Please report this — the export needs to be split."
          : error.reason === "unavailable"
            ? "This workspace has attached files and file storage isn’t configured for this deployment, so a complete export cannot be produced."
            : "The export was stopped because one of your attached files could not be read, or did not match what DalyHub recorded for it. No file was produced — an export missing a file is not a backup.",
    };
  }
  if (error instanceof ZipTooLargeError) {
    /*
     * V2.12 FIN-00 / DEBT-247 — the writer now refuses at the RESTORE reader's
     * own limit, so this sentence is reachable at the point where the owner can
     * still act, rather than being discovered during a recovery. The two
     * reasons are fixed differently and so are said differently: too much
     * content, versus too much INCOMPRESSIBLE content (files).
     */
    return {
      status: 507,
      message:
        error.reason === "archive"
          ? "This workspace produces an archive larger than DalyHub can restore, so no file was written. It is almost always the attached files: remove or shrink the largest ones and export again. Nothing has been lost — a backup that cannot be restored is what this refusal exists to prevent."
          : "This workspace is too large to export in a single archive. Please report this — the export needs to be split.",
    };
  }
  return {
    status: 500,
    message: "The export could not be generated. Nothing was changed.",
  };
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);

  const format = params.format;
  if (!isExportFormat(format)) {
    throw new Response("Unsupported export format", { status: 404 });
  }

  let archive: ExportArchive;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    // The ONE version authority (RELEASE-01). It is already an allow-list of
    // safe values, so mapping it here cannot widen what the export discloses;
    // only the field name differs, and the snapshot's is the more explicit one.
    const build = buildInfo(env);
    const snapshot = await buildWorkspaceSnapshot(scope.snapshot, {
      ownerId: session.user.subject,
      exportedAt: new Date(),
      application: {
        name: build.name,
        version: build.version,
        releaseName: build.releaseName,
        environment: build.environment,
        buildCommit: build.commit,
      },
    });
    if (format === "full") {
      /*
       * V2.11 FILE-02 — the BYTES, read and verified before the archive is
       * assembled.
       *
       * If any of them cannot be read, or does not match the digest recorded
       * when it was uploaded, this THROWS and no archive is produced. That is
       * the release's rule and it is deliberately harsher than the rest of the
       * export contract, which reports what it could not do in `limitations`:
       * a missing record is a gap in an export, and a missing file is a backup
       * that will not restore.
       */
      archive = await buildStructuredExportArchive(
        snapshot,
        await readAttachmentBytesForArchive({
          workspaceId: scope.context.workspaceId,
          attachments: snapshot.records.attachments,
          store: resolveAttachmentObjectStore(env),
        }),
      );
    } else {
      // IDENT-01: the vault is prose the owner reads in Obsidian, so its activity
      // lines carry the actor's NAME. Resolve every distinct actor in ONE bounded
      // directory query; an actor with no membership row writes "Unknown user"
      // rather than the raw Access subject, which must never leave the server.
      const identities = await scope.actors.resolveActors(
        snapshot.records.activities.map((activity) => ({
          type: activity.actorType,
          id: activity.actorId,
        })),
      );
      archive = await buildObsidianVaultArchive(
        snapshot,
        {
          resolveActorName: (actorType, actorId) => {
            const actor = { type: actorType, id: actorId };
            return (
              identities.get(actorKey(actor))?.displayName ??
              resolveActorIdentity(actor, null).displayName
            );
          },
        },
        /*
         * V2.11 FILE-03 — the vault carries the files too, under the owner's
         * own names. Read and verified by the SAME function the structured
         * archive uses, so the two downloads can never disagree about which
         * bytes a record's evidence is.
         */
        await readAttachmentBytesForArchive({
          workspaceId: scope.context.workspaceId,
          attachments: snapshot.records.attachments,
          store: resolveAttachmentObjectStore(env),
        }),
      );
    }
  } catch (error) {
    // Keep a server-side trace: swallowing this entirely would leave a failed
    // export with no record anywhere. Only the error's NAME and MESSAGE are
    // logged — never the error object, a snapshot or a record — because the
    // validator's messages name paths and rules by design and nothing else here
    // carries workspace content.
    console.error(
      "[export] generation failed:",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
    );
    const { status, message } = failureMessage(error);
    throw new Response(message, {
      status,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return new Response(archive.bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      // The filename is ASCII by construction (see `exportFilename`), so the
      // quoted form is already safe; `filename*` is sent for completeness.
      "content-disposition":
        `attachment; filename="${archive.filename}"; ` +
        `filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
      // The owner's entire workspace: never store it in any cache.
      "cache-control": "no-store, no-cache, must-revalidate, private",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "content-length": String(archive.bytes.length),
    },
  });
}
