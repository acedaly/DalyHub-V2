/**
 * V2.11 FILE-00 — the ONE inline route
 * (`GET /attachments/:attachmentId/preview`), and the only place in DalyHub that
 * serves an uploaded byte with `Content-Disposition: inline`.
 *
 * ## What it will serve, and what it refuses
 *
 * Raster images only — `image/png`, `image/jpeg`, `image/webp`, `image/gif` —
 * decided by the media type's OWN `disposition` in the kernel allow-list, never
 * by a query parameter, a header or anything else the client sends. Every other
 * type answers **404**, including PDF, including text, and including a type that
 * has somehow reached the database without being on the list.
 *
 * That narrowness is not caution for its own sake; it is what the policy already
 * decided. DalyHub's CSP sets `object-src 'none'`, `frame-src 'none'` and
 * `media-src 'none'`, so nothing but an `<img>` can display a byte inside a
 * DalyHub page, and `img-src 'self'` is what makes THIS route work at all. A
 * route that served a PDF inline would produce a blank frame, not a preview.
 *
 * `image/svg+xml` cannot reach here because it cannot be uploaded: an SVG is a
 * script container, and it is refused at the boundary rather than defended
 * against here (ADR-119 decision 5). The same is true of `text/html`. This route
 * therefore has one job — serve a raster image to an `<img>` — and no branch for
 * active content, because there is no active content to branch on.
 *
 * Everything else is the download route's: the same session requirement, the
 * same workspace predicate, the same 404 for a foreign id, the same
 * checksum-verified read, the same media type taken from the row rather than
 * from the object.
 */

import { env } from "cloudflare:workers";

import {
  AttachmentStorageError,
  contentDispositionHeader,
} from "~/kernel/attachments";
import {
  readAttachmentBytes,
  resolveAttachmentObjectStore,
} from "~/platform/attachments";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { isInlineServable } from "./attachment";
import type { Route } from "./+types/attachment-preview";

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const attachment = await scope.attachments.get(params.attachmentId);
  if (attachment === null) throw new Response("Not Found", { status: 404 });

  /*
   * The policy check, from the media type's own entry. A PDF is a 404 here
   * rather than a redirect to the download route: a preview URL that quietly
   * becomes a download is a URL whose behaviour depends on data, and this one
   * must be predictable from the type alone.
   */
  if (!isInlineServable(attachment.mediaType)) {
    throw new Response("Not Found", { status: 404 });
  }

  const objects = resolveAttachmentObjectStore(env);
  if (objects === null) throw new Response("Not Found", { status: 404 });

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
    if (cause instanceof AttachmentStorageError) {
      console.error(
        `[attachments] preview failure: ${cause.reason} for ${cause.key ?? "unknown key"}`,
      );
      /*
       * A broken `<img>` is the right outcome for a preview that cannot be
       * produced: it is decoration on a row that already carries the filename,
       * the size and a working download link. A 502 body would be rendered as a
       * broken image anyway, with a spurious error in the console.
       */
      throw new Response("Not Found", { status: 404 });
    }
    throw cause;
  }

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": attachment.mediaType,
      // `inline`, and still carrying the real filename — so a "save image as"
      // saves it under the owner's own name rather than under the attachment id.
      "content-disposition": contentDispositionHeader(
        "inline",
        attachment.filename,
      ),
      "content-length": String(attachment.byteSize),
      "cache-control": "no-store, no-cache, must-revalidate, private",
      "x-content-type-options": "nosniff",
    },
  });
}
