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
 *     Agenda · Note · Action · Decision · Outcome
 *
 * Choosing a type focuses a single input; submitting saves through the CANONICAL
 * authority for that type and leaves you exactly where you were, with the input
 * cleared and still focused, ready for the next one. No drawer opens, no tab
 * changes, and nothing nests.
 *
 * Authorities (there is no capture-only write path):
 *   - Agenda / Action / Decision / Outcome → `intent=add_item` with the item's
 *     kind, the same structured-item authority the section's own add field uses;
 *   - Note → appended to the meeting's canonical `notesMarkdown` through the same
 *     `intent=update` the Notes editor autosaves through, so a note captured here
 *     and a note typed in the editor are the same field, the same Markdown source
 *     and the same Activity.
 *
 * ── MOBILE-03: Agenda is here now, and which type LEADS depends on the meeting ─
 * The first version of this bar deliberately left Agenda out, on the reasoning
 * that "an agenda is written BEFORE a meeting, not captured during one". The
 * reasoning is sound about WHEN and wrong about WHERE: writing the agenda is
 * itself a phone-in-hand job — on the walk to the room, on the train the evening
 * before — and sending the owner to a different surface for the one meeting item
 * that has a deadline was the friction, not a safeguard. The 3.1 brief (§19,
 * §20) asks for one add-to-meeting surface covering all of them.
 *
 * So the bar offers five types, and the one it OPENS on follows the meeting's
 * own state ({@link defaultCaptureKind}): Agenda for a meeting that has not been
 * held, Note for one in progress or behind us. Nothing is hidden either way —
 * every type is one tap from every other — and the default simply matches what
 * the owner is overwhelmingly about to do.
 *
 * ── MOBILE-03: the four structured types work OFFLINE ────────────────────────
 * A meeting room is where a connection is least reliable and the notes are least
 * replaceable. Agenda, Action, Decision and Outcome go through
 * `captureMeetingItem`, which attempts the request and queues the intent on a
 * transport failure; the owner is told "Saved on this device" rather than being
 * told it failed, and replay sends it when DalyHub is reachable again.
 *
 * Note is ONLINE-ONLY and says so when it cannot be sent. It writes the
 * meeting's `notesMarkdown`, a single long string saved whole under a version
 * precondition — two offline devices appending to it would each send a complete
 * document that discards the other's paragraph. That is the one conflict shape
 * `DALYHUB_MOBILE_FOUNDATION.md` §4.7 says not to take on by accident, so the
 * bar declines it honestly and the structured types remain available.
 *
 * Keyboard and safe-area behaviour come from tokens: the bar sits above the phone
 * keyboard (`--app-keyboard-inset`) and above the bottom navigation
 * (`--app-bottomnav-height`), so it can never cover the field being typed into.
 * Enter submits — a one-line capture form's Enter should commit, not add a
 * newline.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { MeetingItemKind } from "~/kernel/meetings";
import type { MeetingCaptureOutcome } from "./meeting-offline-capture";
import { toggleOptionClassName } from "~/shared/forms";
import { Button, Input } from "~/shared/ui";
import { cx } from "~/shared/ui/untitled/utils/cx";

/** What the bar can capture. `note` is the Markdown field; the rest are items. */
export type MeetingCaptureKind = "note" | MeetingItemKind;

type CaptureOption = {
  readonly kind: MeetingCaptureKind;
  readonly label: string;
  readonly placeholder: string;
};

/**
 * The five types, in the order a meeting goes through them: the agenda is
 * written first, notes run throughout, actions and decisions emerge, outcomes
 * are named at the end.
 *
 * MOBILE-03 added `agenda`, which the first version of this bar left out. See
 * this file's header for why that reasoning was reversed.
 */
const OPTIONS: readonly CaptureOption[] = [
  { kind: "agenda", label: "Agenda", placeholder: "What should we cover?" },
  { kind: "note", label: "Note", placeholder: "Capture a note…" },
  { kind: "action", label: "Action", placeholder: "What needs doing?" },
  { kind: "decision", label: "Decision", placeholder: "What was decided?" },
  { kind: "outcome", label: "Outcome", placeholder: "What came of it?" },
];

/**
 * The type the bar opens on, from the meeting's own state.
 *
 * MOBILE-03 — before a meeting has been held, the thing an owner is
 * overwhelmingly about to type is an agenda point; once it is under way or
 * behind them, it is a note. This spends no tap either way (every type is one
 * tap from every other) and removes one in the common case.
 *
 * Pure and exported so the rule is unit-tested without a DOM, and so the
 * default cannot drift from what the bar renders.
 */
export function defaultCaptureKind(input: {
  /** When the meeting was recorded as held, if it has been. */
  readonly heldAt: Date | string | null;
  /** The meeting's lifecycle status. */
  readonly status: string;
}): MeetingCaptureKind {
  const held = input.heldAt !== null;
  // `completed` and `cancelled` are both behind us; only a `planned` meeting
  // that has not been held is still being prepared.
  const finished = input.status === "completed" || input.status === "cancelled";
  return held || finished ? "note" : "agenda";
}

export type MeetingCaptureBarProps = {
  /**
   * Append a structured item through the canonical `add_item` authority.
   *
   * MOBILE-03 — this returns a three-state outcome rather than a boolean,
   * because "we could not reach DalyHub and have kept this on the device" is
   * neither a success nor a failure and must not be reported as either.
   */
  readonly onAddItem: (
    kind: MeetingItemKind,
    body: string,
  ) => Promise<MeetingCaptureOutcome>;
  /** Append a line to the meeting's canonical notes Markdown. Online only. */
  readonly onAppendNote: (line: string) => Promise<boolean>;
  /** The type to open on — see {@link defaultCaptureKind}. */
  readonly initialKind?: MeetingCaptureKind;
  /** Hidden entirely for an archived/read-only meeting. */
  readonly readOnly?: boolean;
};

export function MeetingCaptureBar({
  onAddItem,
  onAppendNote,
  initialKind = "note",
  readOnly = false,
}: MeetingCaptureBarProps) {
  const [kind, setKind] = useState<MeetingCaptureKind>(initialKind);
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
    /*
     * MOBILE-03 — three outcomes, not two.
     *
     * `note` writes the meeting's Markdown body and is online-only (see the
     * header), so it still answers with a boolean and its failure is a failure.
     * The four structured types answer with `queued` when the device could not
     * reach DalyHub, which is a SUCCESS from the owner's side: the words are
     * kept, replay will send them, and telling them to "try again" would invite
     * them to type it twice.
     */
    const outcome: MeetingCaptureOutcome =
      kind === "note"
        ? (await onAppendNote(body))
          ? { kind: "saved" }
          : {
              kind: "refused",
              message: "That note couldn’t be saved. Try again.",
            }
        : await onAddItem(kind, body);
    setBusy(false);
    // Either way the user stays in the workspace with the field focused — ready
    // for the next capture, or to correct and retry the one that failed.
    refocusAfterSave.current = true;
    if (outcome.kind === "refused") {
      // The text stays on screen: a failed capture must never cost the words.
      setStatus(outcome.message);
      return;
    }
    setValue("");
    setStatus(
      outcome.kind === "queued"
        ? // §36 — subtle and factual. Not "sync failed", not a warning icon:
          // the capture is safe, and the only thing the owner needs to know is
          // that it has not left the phone yet.
          `${active.label} saved on this device — it will sync when connected`
        : `${active.label} captured`,
    );
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
      {/*
       * MOBILE-03 — a `dh-scroll-strip`, so five types on a 320px phone announce
       * that they continue rather than being cut off or wrapping onto a second
       * row the pinned bar has no space for. The same affordance every other
       * horizontally-constrained strip in the product uses, including the shared
       * capture sheet's own type row.
       */}
      <div
        className="dh-meeting-capturebar__types dh-scroll-strip"
        role="group"
        aria-label="What are you capturing?"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.kind}
            type="button"
            /*
             * UNTITLED-13 — the shared toggle-option recipe (Untitled's pill
             * geometry), and the FOURTH control to leave `md-state-layer` on
             * being rebuilt on Untitled, after the button (Phase 5), the icon
             * button (UNTITLED-11) and the editor toolbar (UNTITLED-12). It
             * used to be a bespoke chip in `meetings.css` with its own border,
             * radius, ground and pressed fill, sitting under an M3 wash.
             *
             * `aria-pressed` still carries the state and the LABEL still says
             * which type is selected, so meaning is never colour alone. The
             * 44px floor comes with the recipe.
             */
            className={cx(
              "dh-meeting-capturebar__type",
              toggleOptionClassName({ checked: option.kind === kind }),
            )}
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
        <Input
          id="dh-meeting-capture-input"
          ref={inputRef}
          className="dh-meeting-capturebar__input"
          type="text"
          value={value}
          placeholder={active.placeholder}
          disabled={busy}
          onChange={(event) => setValue(event.target.value)}
          data-testid="meeting-capture-input"
        />
        <Button
          type="submit"
          variant="primary"
          className="dh-meeting-capturebar__save"
          disabled={busy || value.trim().length === 0}
        >
          Add
        </Button>
      </form>

      {/* Saves and failures are announced, never silent. */}
      <p className="dh-meeting-capturebar__status" role="status">
        {status}
      </p>
    </div>
  );
}
