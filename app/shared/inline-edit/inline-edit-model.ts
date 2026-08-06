/**
 * DS-16 — the shared inline-edit state model.
 *
 * ONE state machine for every inline-editable field in DalyHub, kept pure and
 * React-free so the interesting cases — a rejected save, a superseded save, a
 * draft that must survive a failure — are unit-testable as data rather than as
 * a rendered component.
 *
 * The whole point of this module is the sentence "never silently lose an
 * attempted edit". Before DS-16 each module invented its own answer: the Task
 * drawer kept a form's dirty state, the Area rename opened a Drawer and threw
 * the typed value away if the request failed, Project status was a `<select>`
 * that navigated. Three mechanisms, three failure behaviours. This is the one.
 *
 * ── The states ───────────────────────────────────────────────────────────────
 *
 *   view    the stored value is displayed; no draft exists
 *   edit    a draft exists and is being typed
 *   saving  a draft has been submitted and the request is in flight
 *   failed  the request was refused; THE DRAFT IS STILL HERE and still editable
 *
 * `failed` is the state that earns the module. It is not "error, discard and
 * reopen" — the editor stays open, holding exactly what the user typed, with the
 * server's message beside it. Retry re-submits the same draft.
 *
 * ── Superseded saves ─────────────────────────────────────────────────────────
 * Each submission carries a monotonically increasing `attempt`. A resolution
 * whose attempt is not the current one is DROPPED: an out-of-order reply from an
 * earlier request must never overwrite a newer draft or clear a newer error.
 * Without that, typing "abc", saving, then typing "abcd" and saving can leave
 * the field showing "abc" if the first response lands second.
 */

/** What a module's save callback reports back. */
export type InlineSaveOutcome =
  | { readonly ok: true }
  /**
   * Refused. `message` is shown beside the field; the draft is preserved.
   * A validation refusal and a storage failure are the same shape on purpose —
   * from the field's point of view both mean "your text is still yours".
   */
  | { readonly ok: false; readonly message: string };

export type InlineEditState<T> =
  | { readonly status: "view" }
  | { readonly status: "edit"; readonly draft: T; readonly attempt: number }
  | { readonly status: "saving"; readonly draft: T; readonly attempt: number }
  | {
      readonly status: "failed";
      readonly draft: T;
      readonly attempt: number;
      readonly message: string;
    };

export type InlineEditAction<T> =
  | { readonly type: "begin"; readonly draft: T }
  | { readonly type: "change"; readonly draft: T }
  | { readonly type: "cancel" }
  | { readonly type: "submit"; readonly attempt: number }
  | { readonly type: "resolved"; readonly attempt: number }
  | {
      readonly type: "rejected";
      readonly attempt: number;
      readonly message: string;
    };

/** The initial (displaying-the-stored-value) state. */
export function initialInlineEditState<T>(): InlineEditState<T> {
  return { status: "view" };
}

/** The draft currently held, or `null` when the field is merely displaying. */
export function inlineEditDraft<T>(state: InlineEditState<T>): T | null {
  return state.status === "view" ? null : state.draft;
}

/** Whether the field is currently open for editing (in any sub-state). */
export function isInlineEditing<T>(state: InlineEditState<T>): boolean {
  return state.status !== "view";
}

export function inlineEditReducer<T>(
  state: InlineEditState<T>,
  action: InlineEditAction<T>,
): InlineEditState<T> {
  switch (action.type) {
    case "begin":
      // Re-entering an already-open field must not wipe the draft: a second
      // click on a field the user is mid-way through typing into is a misclick,
      // not a request to discard their words.
      return state.status === "view"
        ? { status: "edit", draft: action.draft, attempt: 0 }
        : state;

    case "change":
      if (state.status === "view") return state;
      // Typing clears a previous failure message — the user is acting on it, and
      // leaving a stale "That couldn't be saved" beside live text is noise. The
      // attempt counter is NOT reset: a late reply from the failed request must
      // still be recognised as superseded.
      return { status: "edit", draft: action.draft, attempt: state.attempt };

    case "cancel":
      return { status: "view" };

    case "submit":
      if (state.status === "view") return state;
      // The attempt number is supplied by the caller rather than derived here.
      // The async continuation that will later report `resolved`/`rejected` has
      // to KNOW which attempt it is, and it cannot read the reducer's next state
      // synchronously — so the one counter lives with the code that awaits.
      return { status: "saving", draft: state.draft, attempt: action.attempt };

    case "resolved":
      // Only the CURRENT attempt may close the field. An older reply landing
      // late is a ghost: the user has already typed on, and closing here would
      // discard what they typed.
      if (state.status !== "saving" || state.attempt !== action.attempt) {
        return state;
      }
      return { status: "view" };

    case "rejected":
      if (state.status !== "saving" || state.attempt !== action.attempt) {
        return state;
      }
      return {
        status: "failed",
        draft: state.draft,
        attempt: state.attempt,
        message: action.message,
      };

    default:
      return state;
  }
}
