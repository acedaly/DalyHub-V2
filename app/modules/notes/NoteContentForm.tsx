/**
 * NOTES-05 — the Note record's "Note" tab: the writing-first live Markdown
 * editor.
 *
 * NOTES-05 replaces NOTES-01C's desktop Source/Split/Preview and NOTES-04's
 * textarea-plus-toolbar with the ONE shared `LiveMarkdownEditor`
 * (`~/shared/markdown-editor`): a single writing surface, on every viewport,
 * where the Markdown is styled as it is typed (headings grow, emphasis/code
 * style, task items become checkboxes, thematic breaks and tables render),
 * plus an unobtrusive Read toggle that renders through the one FND-08 pipeline.
 * The editor's document IS the Markdown source, so this file's persistence
 * contract is unchanged from NOTES-01C.
 *
 * Autosave correctness is still entirely the ONE shared, pure DS-06 coordinator
 * (`~/shared/forms/autosave.ts`, via `useAutosaveField`) — one save ever in
 * flight, rapid edits coalesce to the LATEST value, a stale/late response can
 * never overwrite newer local state, a failed save preserves the user's draft
 * and offers Retry, and no save is attempted while the value is invalid
 * (oversized). The document-scale debounce (`NOTE_AUTOSAVE_DEBOUNCE_MS`) and the
 * client-side size check (`validateNoteContentSize`) are unchanged from
 * NOTES-01C. `SaveStatusIndicator` (rendered in the editor's top bar via its
 * `statusSlot`) presents unsaved/saving/saved/error, distinguishing a detected
 * OFFLINE failure and auto-retrying on reconnect; `UnsavedChangesGuard` arms
 * while the latest edit is not yet safely persisted and never blocks the
 * record's own Delete (`suppressGuard`).
 */

import { useEffect, useRef, type RefObject } from "react";

import { MARKDOWN_SOURCE_MAX_BYTES } from "~/kernel/markdown";
import {
  SaveStatusIndicator,
  UnsavedChangesGuard,
  useAutosaveField,
} from "~/shared/forms";
import { LiveMarkdownEditor } from "~/shared/markdown-editor";

import { validateNoteContentSize } from "./note-content-validation";
import { useOnlineStatus } from "./use-online-status";
import type { NoteMutationResult } from "./routes/mutate";

const CONTENT_HELP = `Markdown — headings, lists, checklists, quotes, tables and more format as you type. Up to ${MARKDOWN_SOURCE_MAX_BYTES.toLocaleString()} bytes.`;

/**
 * A full document is a much larger, less frequently-committed payload than the
 * short fields `useAutosaveField` is otherwise proven against — a longer
 * debounce than DS-06's 800ms default keeps rapid, continuous typing from
 * generating a save per pause, while still saving well within what a user reads
 * as "automatic" once they stop.
 */
const NOTE_AUTOSAVE_DEBOUNCE_MS = 1500;

const OFFLINE_MESSAGE =
  "You're offline. Your changes are safe here and will save automatically once you're back online.";

export interface NoteContentFormProps {
  readonly noteId: string;
  readonly initialContent: string;
  /** Called after a successful content save, so the record can revalidate
   * (the Activity tab's `reloadKey` depends on the fresh `contentUpdatedAt`). */
  readonly onSaved: () => void;
  /**
   * Force the navigation guard off regardless of autosave state — set (via a
   * synchronous `flushSync`) the instant the record's own Delete action
   * succeeds, so a note the user just deliberately deleted never asks "leave
   * with unsaved changes?" on the way to `/notes` (`~/modules/notes/use-delete-note.ts`).
   */
  readonly suppressGuard?: boolean;
  /**
   * Set (during render) with the field's current `flush` function, so
   * `use-delete-note.ts` can force the latest edit to be safely persisted
   * BEFORE it deletes and navigates away.
   */
  readonly flushRef?: RefObject<(() => Promise<boolean>) | null>;
}

export function NoteContentForm({
  noteId,
  initialContent,
  onSaved,
  suppressGuard = false,
  flushRef,
}: NoteContentFormProps) {
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  // The hook always surfaces its ONE calm, fixed `errorMessage` on failure
  // (never a raw exception) — this ref captures the more specific server
  // message (when one exists) purely for DISPLAY, layered on top in render.
  const lastServerMessageRef = useRef<string | null>(null);

  const field = useAutosaveField<string>({
    initialValue: initialContent,
    debounceMs: NOTE_AUTOSAVE_DEBOUNCE_MS,
    validate: validateNoteContentSize,
    onSave: async (value, signal) => {
      const body = new FormData();
      body.set("intent", "update_content");
      body.set("content", value);
      let data: NoteMutationResult;
      try {
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/mutate`,
          { method: "POST", body, signal },
        );
        data = (await response.json()) as NoteMutationResult;
      } catch (cause) {
        lastServerMessageRef.current = null;
        throw cause instanceof Error ? cause : new Error("network");
      }
      if (data.kind === "update_content" && data.ok) {
        lastServerMessageRef.current = null;
        onSavedRef.current();
        return;
      }
      lastServerMessageRef.current =
        (data.kind === "update_content" &&
          (data.fieldErrors?.content ?? data.formError)) ||
        null;
      throw new Error("save rejected");
    },
  });

  if (flushRef) {
    flushRef.current = field.flush;
  }

  // Offline detection: attribute a failure honestly, and retry automatically
  // the moment connectivity returns instead of waiting for the user to notice
  // and click Retry for something the browser already told us.
  const online = useOnlineStatus();
  const statusRef = useRef(field.status);
  statusRef.current = field.status;
  const retryRef = useRef(field.retry);
  retryRef.current = field.retry;
  useEffect(() => {
    if (online && statusRef.current === "error") {
      retryRef.current();
    }
  }, [online]);

  const isOffline = !online;
  const displayError =
    field.status === "error"
      ? isOffline
        ? OFFLINE_MESSAGE
        : (lastServerMessageRef.current ?? field.error)
      : null;

  // Guard while the latest edit is not yet safely persisted. `saving` is
  // included: a save in flight might still fail, or be superseded by an even
  // newer edit the coordinator will save next — the content is not durably safe
  // until `saved`/`idle`. Never traps the user: Leave is always offered.
  const hasUnsettledChanges =
    !suppressGuard &&
    (field.status === "unsaved" ||
      field.status === "saving" ||
      field.status === "error");

  return (
    <>
      <UnsavedChangesGuard when={hasUnsettledChanges} />
      <LiveMarkdownEditor
        label="Note"
        value={field.value}
        onChange={field.onChange}
        onBlur={field.onBlur}
        help={CONTENT_HELP}
        error={field.validationError}
        placeholder="Start writing…"
        toolbarLabel="Formatting"
        statusSlot={
          <SaveStatusIndicator
            status={field.status}
            error={displayError}
            onRetry={field.retry}
          />
        }
      />
    </>
  );
}
