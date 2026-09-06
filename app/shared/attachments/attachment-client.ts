/**
 * V2.11 FILE-01 — the ONE client path to the attachment endpoints.
 *
 * Every surface that attaches, lists or removes a file goes through here. It is
 * in `shared/` rather than in a module for the reason the obligation actions
 * already are: several modules need it, and a module importing another module's
 * internals is the boundary `module-import-boundary.test.ts` exists to hold.
 *
 * ## The operation id is minted per FILE, not per attempt
 *
 * This is the whole retry guarantee seen from the client. When the owner picks
 * `receipt.pdf`, one id is minted and kept with that selection; a retry after a
 * dropped connection sends the SAME id, so the server's UNIQUE index turns the
 * second write into "you already have this" rather than into a second
 * attachment. Minting per attempt would make the constraint useless — the
 * database would see two different operations and honour both.
 *
 * Nothing here interprets a file's bytes, and nothing here decides what may be
 * uploaded: the client's `accept` attribute is a convenience for the picker, and
 * the server's allow-list is the rule.
 */

import type { SerializedAttachment } from "~/kernel/attachments";

/** What `POST /attachments` answers. Mirrors the route's own union. */
export type AttachmentUploadResponse =
  | {
      readonly ok: true;
      readonly attachment: SerializedAttachment;
      readonly created: boolean;
    }
  | { readonly ok: false; readonly message: string };

/** What `POST /attachments/:id` answers for a delete. */
export type AttachmentDeleteResponse =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * The sentence shown when the server could not be reached at all.
 *
 * Distinct from a server refusal on purpose: a refusal tells the owner what to
 * change, and this tells them to try again — and the retry is safe, because the
 * operation id is the same.
 */
const OFFLINE_MESSAGE =
  "That file couldn’t be sent. Check your connection and try again.";

/** Upload one file to one record. Never throws — it answers. */
export async function uploadAttachmentFile(input: {
  readonly ownerEntityId: string;
  readonly file: File;
  readonly operationId: string;
  readonly signal?: AbortSignal;
}): Promise<AttachmentUploadResponse> {
  const body = new FormData();
  body.set("owner", input.ownerEntityId);
  body.set("operation", input.operationId);
  body.set("file", input.file);
  try {
    const response = await fetch("/attachments", {
      method: "POST",
      body,
      signal: input.signal,
    });
    const result = (await response.json()) as AttachmentUploadResponse;
    /*
     * A non-2xx that still carried the route's own shape is reported with the
     * route's own sentence — a size or type refusal the owner can act on. A
     * non-2xx with no shape (a proxy error page, a 502 from somewhere else) gets
     * the generic one rather than whatever HTML came back.
     */
    if (typeof result === "object" && result !== null && "ok" in result) {
      return result;
    }
    return { ok: false, message: OFFLINE_MESSAGE };
  } catch {
    return { ok: false, message: OFFLINE_MESSAGE };
  }
}

/** Remove one attachment. Never throws — it answers. */
export async function deleteAttachmentFile(
  attachmentId: string,
): Promise<AttachmentDeleteResponse> {
  const body = new FormData();
  body.set("intent", "delete");
  try {
    const response = await fetch(
      `/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "POST", body },
    );
    if (response.status === 404) {
      /*
       * Already gone. Reporting that as a failure would make the owner think
       * their file is still there when it is not — so it reads as success and
       * the caller drops the row, which is the true state either way.
       */
      return { ok: true };
    }
    const result = (await response.json()) as AttachmentDeleteResponse;
    if (typeof result === "object" && result !== null && "ok" in result) {
      return result;
    }
    return { ok: false, message: "That file couldn’t be removed. Try again." };
  } catch {
    return { ok: false, message: "That file couldn’t be removed. Try again." };
  }
}

/** Re-read a record's evidence. Returns `null` when the read failed. */
export async function listAttachmentsFor(
  ownerEntityId: string,
): Promise<readonly SerializedAttachment[] | null> {
  try {
    const response = await fetch(
      `/attachments?owner=${encodeURIComponent(ownerEntityId)}`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      readonly attachments?: readonly SerializedAttachment[];
    };
    return data.attachments ?? null;
  } catch {
    return null;
  }
}

/**
 * Mint one operation id for one chosen file.
 *
 * `crypto.randomUUID` where the browser has it (every target does, over HTTPS),
 * and a bounded random fallback otherwise — never a counter or a timestamp,
 * which two tabs would collide on.
 */
export function newUploadOperationId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
