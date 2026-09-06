/**
 * V2.11 FILE-00 — the ONE upload endpoint (`POST /attachments`) and the ONE
 * evidence listing (`GET /attachments?owner=…`).
 *
 * Shell-owned resource routes, like `/search`, `/tags` and `/notifications`:
 * they render no UI, so they stay outside the app-shell layout while remaining
 * behind the Worker's authentication boundary.
 *
 * ## Why ONE endpoint and not one per module
 *
 * Obligations, Assets, Meetings, Notes, Projects, Tasks, Goals and People all
 * attach files, and every one of them posts here. A second upload path would be
 * a second place the size bound, the type allow-list, the workspace predicate
 * and the compensation ordering could drift — which is the whole failure this
 * release exists to prevent. The OWNER is a field in the body, verified against
 * the workspace-scoped entity repository before a byte is read.
 *
 * ## The order of the checks
 *
 * 1. **Method.** Anything but POST is 405 with an `Allow` header.
 * 2. **Session.** No verified session, no upload — before anything allocates.
 * 3. **Declared length.** `Content-Length` is checked against the per-file bound
 *    BEFORE `request.formData()` is called, so an oversized upload is refused
 *    without the isolate ever holding it. A missing or lying header is caught by
 *    the second size check on the real bytes; the header check exists to make
 *    the common case cheap, not to be the guarantee.
 * 4. **Owner.** The record must exist, in THIS workspace, and not be
 *    soft-deleted. A foreign id is 404 — indistinguishable from one that never
 *    existed.
 * 5. **Store.** No bucket bound, no upload: an honest 503 rather than a crash.
 * 6. **Everything else** is the compensated write in
 *    `~/platform/attachments`, which is the only place that ordering lives.
 */

import { env } from "cloudflare:workers";

import {
  AttachmentStorageError,
  AttachmentValidationError,
  MAX_ATTACHMENT_BYTES,
  assertDeclaredSizeWithinBound,
  attachmentViews,
  validateUploadOperationId,
  type SerializedAttachment,
} from "~/kernel/attachments";
import {
  resolveAttachmentObjectStore,
  uploadAttachment,
} from "~/platform/attachments";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/attachments";

/** The form field carrying the file itself. */
export const ATTACHMENT_FILE_FIELD = "file";
/** The form field naming the record the file belongs to. */
export const ATTACHMENT_OWNER_FIELD = "owner";
/** The form field carrying the client's idempotency key. */
export const ATTACHMENT_OPERATION_FIELD = "operation";

/** The discriminated outcome every attachment surface consumes. */
export type AttachmentUploadResult =
  | {
      readonly ok: true;
      readonly attachment: SerializedAttachment;
      /** False when this operation id had already been stored — a safe retry. */
      readonly created: boolean;
    }
  | { readonly ok: false; readonly message: string };

/** The listing payload. */
export interface AttachmentListData {
  readonly attachments: readonly SerializedAttachment[];
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function failure(message: string, status: number): Response {
  return json({ ok: false, message } satisfies AttachmentUploadResult, status);
}

/**
 * The generic sentence for a storage failure.
 *
 * It never carries the provider's message, the object key or the bucket name.
 * The owner is told what they can do; the diagnostic stays server-side, which is
 * the rule the export route already follows.
 */
const STORAGE_MESSAGE =
  "That file couldn’t be stored just now. Nothing was attached — try again.";

const UNAVAILABLE_MESSAGE =
  "File storage isn’t configured for this deployment, so files can’t be attached here.";

/**
 * `GET /attachments?owner=<entity id>` — the evidence on one record.
 *
 * ONE bounded statement, and the owner is verified in this workspace first, so
 * asking about a foreign record's evidence answers 404 rather than an empty list
 * (an empty list would confirm the id is not in this workspace, which is a
 * smaller leak than the files but a leak all the same).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const ownerEntityId = new URL(request.url).searchParams.get(
    ATTACHMENT_OWNER_FIELD,
  );
  if (typeof ownerEntityId !== "string" || ownerEntityId.length === 0) {
    throw new Response("Not Found", { status: 404 });
  }

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const owner = await scope.entities.getById(ownerEntityId);
  if (owner === null) throw new Response("Not Found", { status: 404 });

  const attachments = await scope.attachments.listForOwner(ownerEntityId);
  return json({
    attachments: attachmentViews(attachments),
  } satisfies AttachmentListData);
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }
  const session = requireAuthenticatedSession(context);

  /*
   * The bound BEFORE the body is read. A declared length over the ceiling is
   * refused here, so the isolate never allocates for it. `413` is the honest
   * status and the sentence names the limit.
   */
  const declared = Number(request.headers.get("content-length") ?? "");
  try {
    assertDeclaredSizeWithinBound(declared);
  } catch (cause) {
    return failure(
      cause instanceof AttachmentValidationError
        ? cause.message
        : `That file is larger than the ${MAX_ATTACHMENT_BYTES}-byte limit.`,
      413,
    );
  }

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const objects = resolveAttachmentObjectStore(env);
  if (objects === null) return failure(UNAVAILABLE_MESSAGE, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failure("That upload could not be read. Try again.", 400);
  }

  const ownerEntityId = String(form.get(ATTACHMENT_OWNER_FIELD) ?? "");
  if (ownerEntityId.length === 0) {
    return failure("That file has no record to attach it to.", 400);
  }

  /*
   * The owner check, before any byte is stored. The entity repository is bound
   * to the server-resolved workspace, so a record in another workspace reads as
   * absent — and the FOREIGN KEY would refuse the write in any case, which is
   * what makes this a fast refusal rather than the guarantee.
   */
  const owner = await scope.entities.getById(ownerEntityId);
  if (owner === null) {
    return failure(
      "That record no longer exists, so nothing was attached.",
      404,
    );
  }

  const file = form.get(ATTACHMENT_FILE_FIELD);
  if (!(file instanceof File)) {
    return failure("No file was received. Choose a file and try again.", 400);
  }
  // The real size, before `arrayBuffer()`. The header above can lie; this cannot.
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return failure(
      `That file is larger than ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB, which is the most DalyHub stores for one attachment.`,
      413,
    );
  }

  let uploadOperationId: string;
  try {
    uploadOperationId = validateUploadOperationId(
      form.get(ATTACHMENT_OPERATION_FIELD),
    );
  } catch (cause) {
    return failure(
      cause instanceof AttachmentValidationError
        ? cause.message
        : "That upload could not be identified. Try again.",
      400,
    );
  }

  try {
    const result = await uploadAttachment(
      {
        attachments: scope.attachments,
        objects,
        workspaceId: scope.context.workspaceId,
      },
      {
        ownerEntityId,
        filename: file.name,
        declaredMediaType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
        uploadOperationId,
      },
    );
    return json({
      ok: true,
      attachment: attachmentViews([result.attachment])[0]!,
      created: result.created,
    } satisfies AttachmentUploadResult);
  } catch (cause) {
    if (cause instanceof AttachmentValidationError) {
      return failure(cause.message, 415);
    }
    if (cause instanceof AttachmentStorageError) {
      // The shape only. The reason is a closed vocabulary and the key is
      // DalyHub's own derived value; neither is owner content.
      console.error(`[attachments] storage failure: ${cause.reason}`);
      return failure(STORAGE_MESSAGE, 502);
    }
    console.error(
      "[attachments] upload failed:",
      cause instanceof Error ? `${cause.name}: ${cause.message}` : "unknown",
    );
    return failure(STORAGE_MESSAGE, 500);
  }
}
