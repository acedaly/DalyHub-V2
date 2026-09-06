/**
 * V2.11 FILE-01 — the ONE attachment state machine, and the honesty rule it
 * exists to enforce.
 *
 * ## "Uploaded" is said once, and only when it is true
 *
 * A file is `uploading` from the moment it is chosen until the server has
 * answered with a stored attachment — which means BOTH the object and the
 * metadata row exist, because the route does not answer `ok` until they do. The
 * client never optimistically shows a file as attached. That is a deliberate
 * departure from DalyHub's usual optimistic-and-reversible rule (AGENTS.md §7)
 * and the reason is specific: an optimistic row for a file that then failed is a
 * row the owner believes is their evidence. Everything else in the product is
 * recoverable by undo; a document they think is safe and is not, is not.
 *
 * ## Retry cannot duplicate
 *
 * The operation id is minted ONCE per chosen file and kept on its pending entry,
 * so `retry` resends the same one. The server's UNIQUE index does the rest.
 * Pressing retry ten times can produce at most one attachment.
 *
 * ## Uploads are serialised
 *
 * One at a time, in the order they were chosen. Not for correctness — the server
 * is safe either way — but because parallel uploads on a phone connection make
 * every one of them slower and the progress unreadable, and because the
 * per-record bound is checked server-side per request, so a burst of parallel
 * uploads past the limit would fail in an order nobody can explain.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { SerializedAttachment } from "~/kernel/attachments";

import {
  deleteAttachmentFile,
  listAttachmentsFor,
  newUploadOperationId,
  uploadAttachmentFile,
} from "./attachment-client";

/** Where one chosen file has got to. Four states, all honest. */
export type PendingUploadState = "selected" | "uploading" | "failed";

/** A file the owner chose that is not (yet) an attachment. */
export interface PendingUpload {
  /** Stable for the life of the selection, and it IS the idempotency key. */
  readonly operationId: string;
  readonly filename: string;
  readonly byteSize: number;
  readonly state: PendingUploadState;
  /** The server's own sentence, when it refused. */
  readonly error: string | null;
  /** The file itself, kept so a retry needs no second pick. */
  readonly file: File;
}

/** The narrow slice of the feedback surface this needs. */
export interface AttachmentFeedback {
  notifySuccess(message: string): void;
  notifyError(message: string): void;
}

export interface UseAttachmentsInput {
  readonly ownerEntityId: string;
  /** What the record already had, from its own loader. No second read on mount. */
  readonly initial: readonly SerializedAttachment[];
  readonly feedback?: AttachmentFeedback;
  /** Called after any change, so a record can revalidate if it wants to. */
  readonly onChanged?: () => void;
}

export interface AttachmentsController {
  readonly attachments: readonly SerializedAttachment[];
  readonly pending: readonly PendingUpload[];
  /** True while any upload or delete is in flight. */
  readonly busy: boolean;
  /** Which attachment is being removed, so its row can disable its own button. */
  readonly removingId: string | null;
  readonly add: (files: readonly File[]) => void;
  readonly retry: (operationId: string) => void;
  readonly dismiss: (operationId: string) => void;
  readonly remove: (attachment: SerializedAttachment) => void;
  /** The live-region sentence, or `""` when there is nothing to announce. */
  readonly status: string;
}

export function useAttachments(
  input: UseAttachmentsInput,
): AttachmentsController {
  const { ownerEntityId, initial, feedback, onChanged } = input;
  const [attachments, setAttachments] =
    useState<readonly SerializedAttachment[]>(initial);
  const [pending, setPending] = useState<readonly PendingUpload[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  /*
   * The record's loader is the authority for what is already attached. When it
   * revalidates — after any navigation, or after a mutation elsewhere on the
   * record — this follows it rather than holding a stale local copy.
   */
  useEffect(() => {
    setAttachments(initial);
  }, [initial]);

  /* Kept in a ref so the serialised worker below reads the current queue
   * without being re-created on every state change. */
  const queue = useRef<PendingUpload[]>([]);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const patch = useCallback(
    (operationId: string, changes: Partial<PendingUpload>) => {
      if (!mounted.current) return;
      setPending((current) =>
        current.map((entry) =>
          entry.operationId === operationId ? { ...entry, ...changes } : entry,
        ),
      );
      const entry = queue.current.find(
        (item) => item.operationId === operationId,
      );
      if (entry) Object.assign(entry, changes);
    },
    [],
  );

  const drop = useCallback((operationId: string) => {
    queue.current = queue.current.filter(
      (entry) => entry.operationId !== operationId,
    );
    if (!mounted.current) return;
    setPending((current) =>
      current.filter((entry) => entry.operationId !== operationId),
    );
  }, []);

  /** Send one entry. Serialised by {@link pump}. */
  const send = useCallback(
    async (entry: PendingUpload) => {
      patch(entry.operationId, { state: "uploading", error: null });
      if (mounted.current) setStatus(`Uploading ${entry.filename}`);

      const result = await uploadAttachmentFile({
        ownerEntityId,
        file: entry.file,
        operationId: entry.operationId,
      });

      if (!result.ok) {
        patch(entry.operationId, { state: "failed", error: result.message });
        if (mounted.current) setStatus(`${entry.filename} failed to upload`);
        feedback?.notifyError(result.message);
        return;
      }

      /*
       * `created: false` means this operation id was already stored — a retry
       * that reached the server the first time after all. The file IS attached,
       * so it is reported as attached; saying "already uploaded" would be a
       * distinction about network plumbing the owner did not ask about.
       */
      const attachment = result.attachment;
      if (mounted.current) {
        setAttachments((current) =>
          current.some((existing) => existing.id === attachment.id)
            ? current
            : [...current, attachment],
        );
        setStatus(`${attachment.filename} attached`);
      }
      drop(entry.operationId);
      onChanged?.();
    },
    [drop, feedback, onChanged, ownerEntityId, patch],
  );

  /** Drain the queue one at a time. */
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = queue.current.find((entry) => entry.state === "selected");
        if (!next) break;
        await send(next);
      }
    } finally {
      running.current = false;
    }
  }, [send]);

  const add = useCallback(
    (files: readonly File[]) => {
      if (files.length === 0) return;
      const entries = files.map<PendingUpload>((file) => ({
        // ONE id per chosen file — see the header. A retry reuses it.
        operationId: newUploadOperationId(),
        filename: file.name,
        byteSize: file.size,
        state: "selected",
        error: null,
        file,
      }));
      queue.current = [...queue.current, ...entries];
      setPending((current) => [...current, ...entries]);
      void pump();
    },
    [pump],
  );

  const retry = useCallback(
    (operationId: string) => {
      patch(operationId, { state: "selected", error: null });
      void pump();
    },
    [patch, pump],
  );

  const remove = useCallback(
    async (attachment: SerializedAttachment) => {
      setRemovingId(attachment.id);
      if (mounted.current) setStatus(`Removing ${attachment.filename}`);
      const result = await deleteAttachmentFile(attachment.id);
      if (!mounted.current) return;
      setRemovingId(null);
      if (!result.ok) {
        setStatus(`${attachment.filename} could not be removed`);
        feedback?.notifyError(result.message);
        return;
      }
      setAttachments((current) =>
        current.filter((existing) => existing.id !== attachment.id),
      );
      setStatus(`${attachment.filename} removed`);
      feedback?.notifySuccess("Removed.");
      onChanged?.();
      /*
       * A best-effort reconciliation. The delete already succeeded; this only
       * catches the case where another surface changed the same record while
       * this one was open, and a failure to re-read changes nothing.
       */
      const fresh = await listAttachmentsFor(ownerEntityId);
      if (fresh !== null && mounted.current) setAttachments(fresh);
    },
    [feedback, onChanged, ownerEntityId],
  );

  return {
    attachments,
    pending,
    busy: removingId !== null || pending.some((e) => e.state === "uploading"),
    removingId,
    add,
    retry,
    dismiss: drop,
    remove: (attachment) => void remove(attachment),
    status,
  };
}
