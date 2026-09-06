/**
 * V2.11 FILE-00 — the ONE download route (`GET /attachments/:attachmentId`) and
 * the ONE delete endpoint (`POST /attachments/:attachmentId`).
 *
 * ## Every byte leaves through here
 *
 * There is no public bucket, no public object URL and no signed URL. The only
 * way an attachment's bytes reach a browser is this loader, which:
 *
 *   1. requires a verified session;
 *   2. resolves the workspace from trusted server configuration — no request
 *      value influences it;
 *   3. reads the row through the workspace-scoped repository, so a foreign id is
 *      `null` and answers **404**, indistinguishable from one that never
 *      existed;
 *   4. derives the object key from THAT ROW, never from anything the client
 *      sent;
 *   5. verifies the bytes against the checksum recorded with the metadata before
 *      handing them over.
 *
 * Guessing `/attachments/<uuid>` therefore reaches nothing: the id has to exist
 * AND belong to the workspace the server resolved for this session.
 *
 * ## Content-Disposition is always `attachment` here
 *
 * Not "usually". The one inline path is the separate preview route, and it
 * serves raster images only. That is not a product preference — DalyHub's own
 * CSP sets `object-src 'none'`, `frame-src 'none'` and `media-src 'none'`, so a
 * PDF cannot be displayed inside a DalyHub page at any price, and pretending
 * otherwise would be a promise the policy breaks (ADR-119 decision 5).
 *
 * The media type comes from the D1 row — the value that went through the
 * allow-list — never from the object's own recorded content type. Two sources
 * for one decision is how a bucket edit becomes a content-type confusion bug.
 *
 * `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store` are
 * applied by the request boundary to every authenticated response, so this route
 * inherits them rather than restating them.
 */

import { env } from "cloudflare:workers";

import {
  AttachmentStorageError,
  attachmentMediaType,
  contentDispositionHeader,
} from "~/kernel/attachments";
import {
  deleteAttachment,
  readAttachmentBytes,
  resolveAttachmentObjectStore,
} from "~/platform/attachments";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/attachment";

/** The outcome a delete returns. */
export type AttachmentDeleteResult =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const attachment = await scope.attachments.get(params.attachmentId);
  if (attachment === null) throw new Response("Not Found", { status: 404 });

  const objects = resolveAttachmentObjectStore(env);
  if (objects === null) {
    throw new Response(
      "File storage isn’t configured for this deployment, so this file can’t be opened.",
      {
        status: 503,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await readAttachmentBytes(
      {
        attachments: scope.attachments,
        objects,
        workspaceId: scope.context.workspaceId,
      },
      attachment,
    );
  } catch (cause) {
    /*
     * The metadata says a file exists and the store disagrees, or the bytes do
     * not match the digest recorded with them. Either is a real failure and it
     * is reported as one: a zero-byte 200 dressed up as the owner's document
     * would be the worst possible answer.
     */
    if (cause instanceof AttachmentStorageError) {
      console.error(
        `[attachments] download failure: ${cause.reason} for ${cause.key ?? "unknown key"}`,
      );
      throw new Response(
        cause.reason === "checksum_mismatch"
          ? "This file’s contents don’t match what DalyHub recorded when it was uploaded, so it wasn’t served. Restore it from a backup."
          : "This file’s contents could not be read. It may need restoring from a backup.",
        {
          status: 502,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "no-store",
          },
        },
      );
    }
    throw cause;
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      // From the ROW, which went through the allow-list. Never from the object.
      "content-type": attachment.mediaType,
      "content-disposition": contentDispositionHeader(
        "attachment",
        attachment.filename,
      ),
      "content-length": String(attachment.byteSize),
      // Restated rather than assumed: this response carries the owner's private
      // document, and the boundary's own policy is the one that must win.
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const form = await request.formData();
  if (String(form.get("intent") ?? "") !== "delete") {
    return json({ ok: false, message: "That action isn’t supported." }, 400);
  }

  const objects = resolveAttachmentObjectStore(env);
  if (objects === null) {
    return json(
      {
        ok: false,
        message:
          "File storage isn’t configured for this deployment, so this file can’t be removed.",
      } satisfies AttachmentDeleteResult,
      503,
    );
  }

  const deleted = await deleteAttachment(
    {
      attachments: scope.attachments,
      objects,
      workspaceId: scope.context.workspaceId,
    },
    params.attachmentId,
  );
  if (deleted === null) {
    /*
     * Nothing to delete: either it is already gone, or it belongs to another
     * workspace. The SAME answer for both, because distinguishing them would
     * confirm the existence of a row this session may not see.
     */
    throw new Response("Not Found", { status: 404 });
  }

  /*
   * `ok: true` the moment the metadata and the ledger row are committed. If the
   * object delete that followed failed, the sweep owns it — and the owner's
   * statement is still true: the file is gone from DalyHub and no path reaches
   * its bytes. Reporting a partial failure here would be reporting something the
   * owner cannot act on.
   */
  return json({ ok: true } satisfies AttachmentDeleteResult);
}

/** The media type's own policy, exported so the preview route cannot invent one. */
export function isInlineServable(mediaType: string): boolean {
  return attachmentMediaType(mediaType)?.disposition === "image";
}
