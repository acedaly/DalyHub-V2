/**
 * NOTES-06 — the Note export action (client side).
 *
 * The server route is an ordinary authenticated `GET` that returns an
 * attachment, so the simplest implementation would be a plain link. It fetches
 * instead, for two reasons the brief calls for directly:
 *
 *   - **honest feedback.** A link gives the user nothing when the export fails
 *     (an expired session, a deleted note): the click just appears to do
 *     nothing. Fetching lets a failure become a real, ANNOUNCED error message
 *     through the shared DS-10 Feedback platform, and a success become an
 *     announced confirmation.
 *   - **no page reload, on every platform.** The download is triggered from an
 *     object URL, so the record — and any unsaved editor state — is untouched.
 *
 * The filename is taken from the server's `Content-Disposition`; the client
 * never invents one, so the safe-filename and duplicate-name rules live in
 * exactly one place.
 */

import { useCallback, useState } from "react";

import { useFeedback } from "~/shared/feedback";
import {
  NOTE_EXPORT_FORMAT_INFO,
  type NoteExportFormat,
} from "~/platform/notes/note-export";

/** Pull the filename out of a `Content-Disposition`, or fall back safely. */
export function filenameFromDisposition(
  header: string | null,
  fallback: string,
): string {
  if (!header) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // fall through to the ASCII form
    }
  }
  const ascii = /filename="([^"]+)"/i.exec(header);
  return ascii?.[1] ?? fallback;
}

export interface NoteExportState {
  readonly exportNote: (format: NoteExportFormat) => Promise<void>;
  /**
   * NOTES-05 §21 — copy the note to the clipboard in the same format.
   *
   * It fetches the SAME export route rather than serialising the note again in
   * the browser. That is the whole point: "Copy Markdown" and "Export as
   * Markdown" must produce identical bytes, and the only way to guarantee that
   * is one projection with one producer. It also means copied content can never
   * include hidden UI text or internal state — the client copies exactly what
   * the server serialised from storage, and nothing the DOM happens to contain.
   */
  readonly copyNote: (format: NoteExportFormat) => Promise<void>;
  readonly pending: boolean;
}

export function useNoteExport(noteId: string, title: string): NoteExportState {
  const feedback = useFeedback();
  const [pending, setPending] = useState(false);

  const exportNote = useCallback(
    async (format: NoteExportFormat) => {
      setPending(true);
      try {
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/export?format=${format}`,
          { headers: { accept: "text/plain" } },
        );
        if (!response.ok) {
          throw new Error(`Export failed with status ${response.status}`);
        }
        const blob = await response.blob();
        const filename = filenameFromDisposition(
          response.headers.get("content-disposition"),
          `note.${NOTE_EXPORT_FORMAT_INFO[format].extension}`,
        );
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        feedback.notifySuccess(`“${title}” exported as ${filename}`);
      } catch {
        feedback.notifyError(
          `We couldn’t export “${title}”. Please try again.`,
        );
      } finally {
        setPending(false);
      }
    },
    [feedback, noteId, title],
  );

  const copyNote = useCallback(
    async (format: NoteExportFormat) => {
      const what = NOTE_EXPORT_FORMAT_INFO[format].label;
      setPending(true);
      try {
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/export?format=${format}`,
          { headers: { accept: "text/plain" } },
        );
        if (!response.ok) {
          throw new Error(`Copy failed with status ${response.status}`);
        }
        const text = await response.text();
        // `navigator.clipboard` is absent on an insecure origin and in some
        // embedded browsers. Say so honestly rather than reporting a copy that
        // did not happen.
        if (!navigator.clipboard?.writeText) {
          throw new Error("Clipboard unavailable");
        }
        await navigator.clipboard.writeText(text);
        feedback.notifySuccess(`“${title}” copied as ${what}`);
      } catch {
        feedback.notifyError(
          `We couldn’t copy “${title}”. You can still export it from this menu.`,
        );
      } finally {
        setPending(false);
      }
    },
    [feedback, noteId, title],
  );

  return { exportNote, copyNote, pending };
}
