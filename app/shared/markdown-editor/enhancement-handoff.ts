/**
 * DEBT-202 — what the enhanced editor starts from, decided once and in the open.
 *
 * `LiveMarkdownEditor` server-renders a real `<textarea>` and replaces it with
 * CodeMirror on the client. The handoff used the component's `value` PROP as the
 * new document, and that is the defect: between the fallback's own DOM value
 * changing and React committing a render that updates the prop, the two
 * disagree — and on a cold code-split chunk that window is exactly the window a
 * fast typist types in ("capture the thought before it goes" is the product's
 * own instruction).
 *
 * What made it worse than a lost keystroke is that **the loss is silent and the
 * product then reports success**. MEASURED on CI run `32607890703`, from the
 * REQUEST BODY rather than the DOM: after filling a Task's Description and
 * pressing Save, the POST carried the value that was already stored, the server
 * accepted it, and a success toast rendered. Nothing anywhere told the author
 * their words were gone; the form saved, truthfully, over the top of them.
 *
 * The fallback is RIGHT and stays — it is what makes the field work before
 * JavaScript, and removing it to dodge this would trade a real progressive-
 * enhancement guarantee for a race. Only the handoff was wrong.
 *
 * This decision is a pure function rather than three lines inside an async
 * `.then`, for the same reason `taskCompletionOutcome` is: it can then be
 * asserted directly, at the exact instant the race happens, instead of through a
 * component whose enhancement a test cannot reliably interleave with a keystroke.
 */

/** The live surface's DOM state at the moment the enhanced editor is created. */
export interface EnhancementFallbackState {
  /** The `<textarea>`'s OWN value — the authority, when it is present. */
  readonly value: string;
  /** Where the caret was, so a sentence in progress survives the handoff. */
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

export interface EnhancementHandoff {
  /** The document the enhanced editor is created with. */
  readonly doc: string;
  /** Where to put the caret in it. */
  readonly selectionStart: number;
  readonly selectionEnd: number;
  /**
   * True when the fallback held text the host had not committed yet, so the
   * caller must report it upward — otherwise the enhanced editor shows the
   * author's words while the FORM still holds the old ones, which is the same
   * silent loss wearing a different hat.
   */
  readonly adopted: boolean;
}

/**
 * Resolve the document the enhanced editor should start from.
 *
 * The fallback's own value wins whenever it exists, because it is the surface
 * the author was actually typing into. The prop is used when there is no
 * fallback to read — an editor mounted straight into Write mode, or a fallback
 * already torn down.
 */
export function resolveEnhancementHandoff(
  propValue: string,
  fallback: EnhancementFallbackState | null,
): EnhancementHandoff {
  if (fallback === null) {
    return {
      doc: propValue,
      selectionStart: propValue.length,
      selectionEnd: propValue.length,
      adopted: false,
    };
  }
  const doc = fallback.value;
  const clamp = (position: number) =>
    Math.max(0, Math.min(doc.length, position));
  return {
    doc,
    selectionStart: clamp(fallback.selectionStart),
    selectionEnd: clamp(fallback.selectionEnd),
    adopted: doc !== propValue,
  };
}
