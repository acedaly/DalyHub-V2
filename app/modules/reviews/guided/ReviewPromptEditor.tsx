/**
 * REVIEW-02 — one reflection prompt, on the guided flow's writing surface.
 *
 * It writes through the EXISTING Review mutation route (`/reviews/:id/mutate`,
 * `intent=update_section`) into the EXISTING `review_sections` row — the same
 * authority, the same storage and the same Markdown pipeline the Review record's
 * own editors use. The guided flow adds exactly two things:
 *
 *   - it quotes the version it loaded (`expectedUpdatedAt`), so a save can never
 *     silently overwrite text written on another device;
 *   - it shows the save state in words, and announces it politely, so an owner
 *     writing on a phone always knows whether their words are safe.
 *
 * Saving is on blur and on an explicit Save, matching the Review record's existing
 * convention. Focus is never moved by a save.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { LiveMarkdownEditor } from "~/shared/markdown-editor";
import { FormButton } from "~/shared/forms";

import type { ReviewGuidePrompt } from "./review-guide-view";
import type { ReviewMutationResult } from "../routes/mutate";

type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

const SAVE_LABELS: Readonly<Record<SaveState, string>> = {
  idle: "Not saved yet",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
  conflict: "Changed elsewhere",
};

export interface ReviewPromptEditorProps {
  readonly reviewId: string;
  readonly prompt: ReviewGuidePrompt;
  readonly readOnly: boolean;
  /** Larger writing surface on the desktop reflection workspace. */
  readonly rows?: number;
  /** Called after the server accepts a save, so the host can revalidate. */
  readonly onSaved?: () => void;
  /**
   * AI-01 — text the owner accepted from the Weekly Review assistant. It is
   * APPENDED to whatever they have already written, never substituted for it:
   * an assistant can add to a reflection, it can never overwrite one. A new
   * `nonce` is what marks a new acceptance, so the same text can be accepted
   * twice deliberately without being applied twice by a re-render.
   */
  readonly appendRequest?: {
    readonly text: string;
    readonly nonce: number;
  } | null;
}

export function ReviewPromptEditor({
  reviewId,
  prompt,
  readOnly,
  rows = 12,
  onSaved,
  appendRequest = null,
}: ReviewPromptEditorProps) {
  const [value, setValue] = useState(prompt.body);
  const [state, setState] = useState<SaveState>(
    prompt.answered ? "saved" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  // The version this editor is holding. Advanced by each accepted save so a long
  // writing session keeps quoting a current base rather than a stale one.
  const baseVersion = useRef(prompt.updatedAt);
  const savedBody = useRef(prompt.body);

  // A different prompt means a different section: reset rather than carry text
  // across, which would be the one way this surface could lose someone's writing.
  useEffect(() => {
    setValue(prompt.body);
    setState(prompt.answered ? "saved" : "idle");
    setError(null);
    baseVersion.current = prompt.updatedAt;
    savedBody.current = prompt.body;
  }, [prompt.sectionId, prompt.body, prompt.answered, prompt.updatedAt]);

  // Append accepted assistant text. Deliberately additive and deliberately not
  // auto-saved: the owner still presses save, so nothing reaches the Review
  // repository without a second, human action.
  const appliedNonce = useRef(0);
  useEffect(() => {
    if (appendRequest === null) return;
    if (appendRequest.nonce === appliedNonce.current) return;
    appliedNonce.current = appendRequest.nonce;
    setValue((current) =>
      current.trim().length === 0
        ? appendRequest.text
        : `${current.replace(/\s+$/, "")}\n\n${appendRequest.text}`,
    );
    setState("idle");
  }, [appendRequest]);

  const save = useCallback(async () => {
    if (readOnly) return;
    if (value === savedBody.current) return;
    setState("saving");
    setError(null);
    const body = new FormData();
    body.set("intent", "update_section");
    body.set("sectionId", prompt.sectionId);
    body.set("body", value);
    body.set("expectedUpdatedAt", baseVersion.current);
    try {
      const response = await fetch(
        `/reviews/${encodeURIComponent(reviewId)}/mutate`,
        { method: "POST", body },
      );
      const result = (await response.json()) as ReviewMutationResult;
      if (result.kind === "update_section" && result.ok) {
        baseVersion.current = result.updatedAt;
        savedBody.current = value;
        setState("saved");
        onSaved?.();
        return;
      }
      if (result.kind === "update_section" && result.conflict === true) {
        // The owner's text stays exactly where it is, in the editor. Nothing is
        // discarded and nothing is overwritten.
        setState("conflict");
        setError(result.formError);
        return;
      }
      setState("error");
      setError(
        result.kind === "update_section"
          ? result.formError
          : "That reflection couldn’t be saved.",
      );
    } catch {
      setState("error");
      setError("That reflection couldn’t be saved.");
    }
  }, [onSaved, prompt.sectionId, readOnly, reviewId, value]);

  const dirty = value !== savedBody.current;

  if (readOnly) {
    return (
      <div className="dh-review-guide__prompt">
        <h3 className="dh-review-guide__prompt-label">{prompt.label}</h3>
        {prompt.prompt ? (
          <p className="dh-review-guide__prompt-question">{prompt.prompt}</p>
        ) : null}
        {prompt.body.trim().length > 0 ? (
          <div className="dh-review-section-readonly">
            <pre>{prompt.body}</pre>
          </div>
        ) : (
          <p className="dh-review-muted">Nothing written for this prompt.</p>
        )}
      </div>
    );
  }

  return (
    <div className="dh-review-guide__prompt">
      <h3 className="dh-review-guide__prompt-label">{prompt.label}</h3>
      {prompt.prompt ? (
        <p className="dh-review-guide__prompt-question">{prompt.prompt}</p>
      ) : null}
      <LiveMarkdownEditor
        value={value}
        onChange={(next) => {
          setValue(next);
          if (state !== "idle") setState("idle");
        }}
        onBlur={() => void save()}
        // DOC-EDITOR-01 — the same keyboard save every other explicit-save
        // long-form surface offers, reaching this prompt's own Save button.
        onCommit={readOnly ? undefined : () => void save()}
        label={prompt.label}
        placeholder="Write your reflection…"
        error={error}
        rows={rows}
        statusSlot={
          <span
            className="dh-review-guide__save-state"
            data-state={dirty ? "idle" : state}
          >
            {dirty ? "Unsaved changes" : SAVE_LABELS[state]}
          </span>
        }
      />
      <div className="dh-review-guide__prompt-actions">
        <FormButton
          type="button"
          variant="secondary"
          disabled={!dirty || state === "saving"}
          onClick={() => void save()}
        >
          {state === "saving" ? "Saving…" : "Save"}
        </FormButton>
      </div>
      {/* Polite, and never a focus move: an autosave must not steal the caret. */}
      <p className="dh-visually-hidden" role="status">
        {dirty ? "" : state === "saved" ? `${prompt.label} saved.` : ""}
      </p>
    </div>
  );
}
