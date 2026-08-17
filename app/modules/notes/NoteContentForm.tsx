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
 *
 * ## AUDIT-08 — the save says which version it is replacing
 *
 * The reconciliation contract above only fires when this record REVALIDATES and
 * hands back a newer `initialContent`. Two tabs left open on the same note need
 * not do that before one of them saves, so the server is the backstop: every
 * save quotes the content version it was written against
 * (`expectedContentUpdatedAt`), and a save based on text that has since changed
 * is REFUSED rather than applied. Nothing is lost in either direction — the
 * newer stored text is untouched, and the draft stays in the editor exactly as
 * it was typed.
 *
 * The refusal is then routed into the SAME `RemoteChangeBanner` an out-of-band
 * change already uses, because it is the same question with the same two safe
 * answers: load the newer version, or keep mine. There is no Notes-only dialog,
 * no automatic Markdown merge, and no second conflict vocabulary to learn.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  MARKDOWN_SOURCE_MAX_BYTES,
  markdownSourceByteLength,
} from "~/kernel/markdown";
import { EntityIcon, getEntityIdentity, isEntityType } from "~/shared/entity";
import {
  RemoteChangeBanner,
  SaveStatusIndicator,
  UnsavedChangesGuard,
  useAutosaveField,
} from "~/shared/forms";
import {
  LiveMarkdownEditor,
  type RecordLinkOption,
} from "~/shared/markdown-editor";

import { validateNoteContentSize } from "./note-content-validation";
import { useOnlineStatus } from "~/shared/linked-items";
import type { NoteMutationResult } from "./routes/mutate";

/**
 * CONVERGE-01 §6 — the help line says what the editor DOES.
 *
 * It used to end with "Up to 1,000,000 bytes.", permanently, under every note in
 * the workspace. A ceiling nobody is near is not help: it is a rule printed at a
 * writer who is a thousandth of the way to it, in the one place in DalyHub whose
 * whole job is to get out of the way. The limit is unchanged and is still
 * enforced in both places it was — the client courtesy check
 * (`validateNoteContentSize`) and the server's authoritative
 * `parseMarkdownSource`.
 *
 * What changed is WHEN the sentence appears: when a note is genuinely
 * approaching the ceiling, and on the error itself. See `CONTENT_LIMIT_WARN_AT`.
 */
const CONTENT_HELP =
  "Markdown — headings, lists, checklists, quotes, tables and more format as you type.";

/**
 * The share of the limit at which the ceiling becomes worth mentioning.
 *
 * 90% of a million bytes is ~900 KB of Markdown — a document nobody arrives at
 * by accident, and far enough from the wall that the warning is a heads-up
 * rather than a failure the owner has already hit. Below it the sentence is
 * noise; above it, it is the only warning before a save is refused.
 */
const CONTENT_LIMIT_WARN_AT = 0.9;

/** The ceiling, said once, in the same words the validation error uses. */
function contentLimitHelp(value: string): string {
  const used = markdownSourceByteLength(value);
  if (used < MARKDOWN_SOURCE_MAX_BYTES * CONTENT_LIMIT_WARN_AT) {
    return CONTENT_HELP;
  }
  return `${CONTENT_HELP} ${used.toLocaleString()} of ${MARKDOWN_SOURCE_MAX_BYTES.toLocaleString()} bytes used.`;
}

/**
 * A full document is a much larger, less frequently-committed payload than the
 * short fields `useAutosaveField` is otherwise proven against — a longer
 * debounce than DS-06's 800ms default keeps rapid, continuous typing from
 * generating a save per pause, while still saving well within what a user reads
 * as "automatic" once they stop.
 */
const NOTE_AUTOSAVE_DEBOUNCE_MS = 1500;

const OFFLINE_MESSAGE =
  "You’re offline. Your changes are safe here and will save automatically once you’re back online.";

/**
 * Is `candidate` a strictly newer content version than `against`? Both are the
 * server's own ISO-8601 UTC timestamps, so lexicographic order IS chronological
 * order; `null` means "content never saved" and is therefore the oldest value
 * there is.
 */
function isNewerVersion(
  candidate: string | null,
  against: string | null,
): boolean {
  if (candidate === null) return false;
  return against === null || candidate > against;
}

export interface NoteContentFormProps {
  readonly noteId: string;
  readonly initialContent: string;
  /**
   * AUDIT-08 — the stored content version `initialContent` came from, as the
   * record loader serialised it. `null` means the note's content has never been
   * saved, which is a real base version rather than "unknown": it is exactly
   * what the server compares against to keep an unwritten note unwritten.
   */
  readonly contentUpdatedAt: string | null;
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
  contentUpdatedAt,
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

  /*
   * AUDIT-08 — the content version this editor's committed text came from, and
   * therefore the version each save quotes.
   *
   * It is a ref, not state, because it must be readable inside `onSave` without
   * re-creating the callback mid-save. It only ever moves FORWARD, and only from
   * an authority: the server's answer to our own save, or a newer server version
   * this editor has already TAKEN ON (see the effect below).
   *
   * Crucially it does NOT advance merely because a save was refused. Advancing
   * there would make the very next save — a stray blur, the debounce — succeed
   * silently, which is the overwrite this whole mechanism exists to stop. It
   * advances only once the owner has answered the banner, so until they do, a
   * repeat save is refused again rather than quietly winning.
   */
  const baseVersion = useRef<string | null>(contentUpdatedAt);
  /*
   * The newer server text a refused save came back with, and the version it is.
   * Feeding it in as `serverValue` is what routes the conflict into the shared
   * reconciliation contract instead of inventing a second one here.
   */
  const [refused, setRefused] = useState<{
    readonly content: string;
    readonly version: string | null;
  } | null>(null);

  /*
   * The current server-side content, from whichever source knows it best.
   *
   * A refused save is fresher than the last loader value BY DEFINITION — it is
   * why the save was refused — so it wins until the loader catches up. Comparing
   * versions rather than swapping on arrival is what keeps this safe: the value
   * handed to the coordinator only ever moves forward, so it can never hand back
   * older text and have a clean editor silently adopt it.
   */
  const refusedIsNewer =
    refused !== null && isNewerVersion(refused.version, contentUpdatedAt);
  const serverContent = refusedIsNewer ? refused.content : initialContent;
  /** The newest server version this editor knows of, from either source. */
  const serverVersion = refusedIsNewer ? refused.version : contentUpdatedAt;

  const field = useAutosaveField<string>({
    initialValue: initialContent,
    // NOTES-05 §18 — opt into the shared reconciliation contract. The record
    // route revalidates its loader (on our own save, on navigation, and whenever
    // another surface mutates this note), so `initialContent` IS the note's
    // current server-side content. Handing it to the hook lets a change made
    // elsewhere be adopted while this editor is clean, and be OFFERED rather
    // than silently applied or silently lost while it is dirty ([DEBT-47]).
    serverValue: serverContent,
    debounceMs: NOTE_AUTOSAVE_DEBOUNCE_MS,
    validate: validateNoteContentSize,
    onSave: async (value, signal) => {
      const body = new FormData();
      body.set("intent", "update_content");
      body.set("content", value);
      // Always sent, so the server always has a precondition to check. An empty
      // value is the honest answer for a note whose content has never been
      // saved, and is checked as such rather than skipped.
      body.set("expectedContentUpdatedAt", baseVersion.current ?? "");
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
        // Our text IS the stored text now: keep quoting a current base so a long
        // writing session does not conflict with its own previous save.
        baseVersion.current = data.contentUpdatedAt ?? null;
        onSavedRef.current();
        return;
      }
      if (data.kind === "update_content" && data.conflict === true) {
        /*
         * The save was refused. Two things must be true from here, and both are:
         * the draft is still in the editor (the coordinator keeps it and returns
         * to `unsaved`), and the newer stored text is still on the server.
         *
         * Adopting the newer base version is what makes the owner's next
         * decision stick: "Load the newer version" replaces the draft with text
         * that is now current, and "Keep mine" saves the draft over a version
         * the owner has been shown and chosen against — a deliberate
         * last-write-wins, never a silent one, and never a second conflict for
         * the same change.
         */
        lastServerMessageRef.current = null;
        setRefused({
          content: data.serverContent ?? "",
          version: data.contentUpdatedAt ?? null,
        });
        // Bring the record's other surfaces up to date with the change that was
        // just discovered; the editor's own text is untouched by this.
        onSavedRef.current();
        return { outcome: "conflict" as const };
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

  /*
   * AUDIT-08 — keep the quoted base version in step with the text this editor
   * is actually holding.
   *
   * It advances only while nothing is parked for the owner to decide on, which
   * is exactly when the coordinator has either adopted the server's version
   * silently (a clean editor takes it), or the owner has answered the banner:
   * "Load the newer version" makes their text ours, and "Keep mine" is an
   * explicit instruction to write over a version they have now SEEN. While a
   * change is still parked, the base stays put, so a save attempted before they
   * answer is refused again rather than quietly winning. And it never moves
   * backwards, so a revalidation landing after our own save cannot restore a
   * base we have already written past.
   */
  const remoteParked = field.remoteValue !== null;
  useEffect(() => {
    if (remoteParked) return;
    if (isNewerVersion(serverVersion, baseVersion.current)) {
      baseVersion.current = serverVersion;
    }
  }, [serverVersion, remoteParked]);

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

  // NOTES-05 §5 — the record-link picker's search. It goes through the SHARED
  // `/links` endpoint (`op=record-link`), so the editor's picker and the Linked
  // Items picker are backed by one bounded, workspace-scoped, anchor-excluding
  // query. The `dalyhub://` destination arrives already formatted by the server;
  // this client never builds one.
  const searchRecords = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<readonly RecordLinkOption[]> => {
      const params = new URLSearchParams({
        op: "record-link",
        anchor: noteId,
        q: query,
      });
      const response = await fetch(`/links?${params.toString()}`, { signal });
      if (!response.ok) throw new Error("Failed to search records");
      const data = (await response.json()) as {
        readonly options?: readonly RecordLinkOption[];
      };
      return data.options ?? [];
    },
    [noteId],
  );

  const recordLink = useMemo(
    () => ({
      search: searchRecords,
      renderIcon: (type: string) =>
        isEntityType(type) ? <EntityIcon type={type} /> : null,
      // The type is named in WORDS in the picker, so it uses the SAME nouns as
      // the rest of the product (AGENTS.md §7) rather than a raw kernel slug.
      typeLabel: (type: string) => getEntityIdentity(type)?.label ?? type,
    }),
    [searchRecords],
  );

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
      {field.remoteValue !== null ? (
        <RemoteChangeBanner
          what="This note"
          saving={field.status === "saving"}
          onAdopt={field.adoptRemote}
          onDismiss={field.dismissRemote}
        />
      ) : null}
      <LiveMarkdownEditor
        label="Note"
        value={field.value}
        onChange={field.onChange}
        /*
         * AUDIT-08 — while a change is parked for the owner to decide on, a
         * blur does not attempt a save.
         *
         * The base version is deliberately held until they answer, so such a
         * save is CERTAIN to be refused: it would cost a round trip, and — worse
         * — it disables the banner's own buttons for its duration, right as the
         * owner moves the mouse from the editor to them. Their draft is already
         * safe in the editor; there is nothing to rescue by saving it here.
         */
        onBlur={() => {
          if (field.remoteValue === null) field.onBlur();
        }}
        help={contentLimitHelp(field.value)}
        error={field.validationError}
        placeholder="Start writing…"
        toolbarLabel="Formatting"
        recordLink={recordLink}
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
