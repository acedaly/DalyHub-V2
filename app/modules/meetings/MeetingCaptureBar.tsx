/**
 * MOBILE-01 — the Meeting capture bar.
 *
 * A meeting is the one workflow where the phone is genuinely IN USE while the
 * thing being recorded is happening. Before this, capturing a decision meant
 * scrolling to the right section, finding its add field, typing, submitting, and
 * scrolling back — several times a meeting, while trying to listen.
 *
 * The capture bar pins one row to the bottom of the Meeting workspace:
 *
 *     Note · Action · Decision · Outcome
 *
 * Choosing a type focuses a single input; submitting saves through the CANONICAL
 * authority for that type and leaves you exactly where you were, with the input
 * cleared and still focused, ready for the next one. No drawer opens, no tab
 * changes, and nothing nests.
 *
 * Authorities (there is no capture-only write path):
 *   - Action / Decision / Outcome → `intent=add_item` with the item's kind, the
 *     same structured-item authority the section's own add field uses;
 *   - Note → appended to the meeting's canonical `notesMarkdown` through the same
 *     `intent=update` the Notes editor autosaves through, so a note captured here
 *     and a note typed in the editor are the same field, the same Markdown source
 *     and the same Activity.
 *
 * Keyboard and safe-area behaviour come from tokens: the bar sits above the phone
 * keyboard (`--dh-keyboard-inset`) and above the bottom navigation
 * (`--dh-bottomnav-height`), so it can never cover the field being typed into.
 * Enter submits — a one-line capture form's Enter should commit, not add a
 * newline.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { MeetingItemKind } from "~/kernel/meetings";

/** What the bar can capture. `note` is the Markdown field; the rest are items. */
export type MeetingCaptureKind = "note" | MeetingItemKind;

type CaptureOption = {
  readonly kind: MeetingCaptureKind;
  readonly label: string;
  readonly placeholder: string;
};

/**
 * The four types, in the order they occur in a real meeting: you take notes
 * throughout, actions and decisions emerge, outcomes are named at the end.
 * `agenda` is deliberately absent — an agenda is written BEFORE a meeting, not
 * captured during one.
 */
const OPTIONS: readonly CaptureOption[] = [
  { kind: "note", label: "Note", placeholder: "Capture a note…" },
  { kind: "action", label: "Action", placeholder: "What needs doing?" },
  { kind: "decision", label: "Decision", placeholder: "What was decided?" },
  { kind: "outcome", label: "Outcome", placeholder: "What came of it?" },
];

export type MeetingCaptureBarProps = {
  /** Append a structured item through the canonical `add_item` authority. */
  readonly onAddItem: (kind: MeetingItemKind, body: string) => Promise<boolean>;
  /** Append a line to the meeting's canonical notes Markdown. */
  readonly onAppendNote: (line: string) => Promise<boolean>;
  /** Hidden entirely for an archived/read-only meeting. */
  readonly readOnly?: boolean;
};

export function MeetingCaptureBar({
  onAddItem,
  onAppendNote,
  readOnly = false,
}: MeetingCaptureBarProps) {
  const [kind, setKind] = useState<MeetingCaptureKind>("note");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Set when a save finishes, so the input is refocused once it is interactive
   * again. It cannot be refocused inside `submit`: the field is `disabled` while
   * the save is in flight — which is what blurred it — and a disabled element
   * cannot take focus, so a `focus()` call there is silently dropped and the user
   * is left with no keyboard after every capture. Focusing from an effect runs
   * after React has re-enabled the field.
   */
  const refocusAfterSave = useRef(false);

  const active = OPTIONS.find((option) => option.kind === kind) ?? OPTIONS[0];

  useEffect(() => {
    if (busy || !refocusAfterSave.current) {
      return;
    }
    refocusAfterSave.current = false;
    inputRef.current?.focus();
  }, [busy]);

  const choose = useCallback((next: MeetingCaptureKind) => {
    setKind(next);
    setStatus(null);
    // Selecting a type focuses the input, so the whole interaction is
    // tap-type-Enter without hunting for the field.
    inputRef.current?.focus();
  }, []);

  const submit = useCallback(async () => {
    const body = value.trim();
    if (body.length === 0 || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    const ok =
      kind === "note" ? await onAppendNote(body) : await onAddItem(kind, body);
    setBusy(false);
    // Either way the user stays in the workspace with the field focused — ready
    // for the next capture, or to correct and retry the one that failed.
    refocusAfterSave.current = true;
    if (ok) {
      setValue("");
      setStatus(`${active.label} captured`);
    } else {
      // The text stays on screen: a failed capture must never cost the words.
      setStatus(
        `That ${active.label.toLowerCase()} couldn’t be saved. Try again.`,
      );
    }
  }, [value, busy, kind, onAppendNote, onAddItem, active.label]);

  if (readOnly) {
    return null;
  }

  return (
    <div
      className="dh-meeting-capturebar"
      role="group"
      aria-label="Capture during this meeting"
      data-testid="meeting-capture-bar"
    >
      <div
        className="dh-meeting-capturebar__types"
        role="group"
        aria-label="What are you capturing?"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className="dh-meeting-capturebar__type"
            aria-pressed={option.kind === kind}
            onClick={() => choose(option.kind)}
            data-testid={`meeting-capture-${option.kind}`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <form
        className="dh-meeting-capturebar__form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label
          className="dh-visually-hidden"
          htmlFor="dh-meeting-capture-input"
        >
          {active.label}
        </label>
        <input
          id="dh-meeting-capture-input"
          ref={inputRef}
          className="dh-input dh-meeting-capturebar__input"
          type="text"
          value={value}
          placeholder={active.placeholder}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          data-testid="meeting-capture-input"
        />
        <button
          type="submit"
          className="dh-btn dh-btn--primary dh-meeting-capturebar__save"
          disabled={busy || value.trim().length === 0}
        >
          Add
        </button>
      </form>

      {/* Saves and failures are announced, never silent. */}
      <p className="dh-meeting-capturebar__status" role="status">
        {status}
      </p>
    </div>
  );
}
