/**
 * DS-06 Shared Forms — the pure, framework-free field and form contracts.
 *
 * This module defines the TYPES every shared control, the form host and the
 * validation/save model agree on. It is deliberately React-free (an import-guard
 * test asserts it), so a future server module or a non-React consumer can share
 * the same field/validation/save vocabulary without pulling in the UI.
 *
 * The vocabulary is entity-agnostic: nothing here mentions Tasks, Projects,
 * Goals, People, workspaces, D1 or routes. A consumer supplies typed values,
 * field definitions, validation and persistence callbacks; the shared system
 * only knows about field anatomy, validation outcomes and save state.
 */

/**
 * The result of validating a single value. Either it is acceptable, or it
 * carries ONE specific, human-readable, recovery-oriented message. Messages are
 * always safe to display: the validation layer never surfaces raw exceptions,
 * database errors, stack traces or opaque codes (AGENTS.md §17).
 */
export type ValidationOutcome =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

/** A synchronous validator: a pure function from a value to an outcome. */
export type Validator<TValue> = (value: TValue) => ValidationOutcome;

/**
 * An asynchronous validator (e.g. a server uniqueness check). It receives an
 * `AbortSignal` so the caller can cancel a superseded request; a well-behaved
 * validator rejects with the signal's reason when aborted. Stale responses are
 * ignored by the form regardless, but honouring the signal avoids wasted work.
 */
export type AsyncValidator<TValue> = (
  value: TValue,
  signal: AbortSignal,
) => Promise<ValidationOutcome>;

/**
 * The two save models a form may declare. This is the DS-06 resolution of
 * DEBT-03: the mode is an explicit, visible part of the contract, never inferred
 * unpredictably.
 *
 *   - `explicit` — the user commits with a Save action; Cancel discards. Used
 *     where commitment matters (creation, consequential edits).
 *   - `autosave`  — each field persists on its own deterministic trigger (a valid
 *     blur or a restrained debounce), with calm, visible status.
 */
export type SaveMode = "explicit" | "autosave";

/**
 * The lifecycle of an explicit-save submission. `idle` before/after; `submitting`
 * while the persistence callback runs (the actions are disabled to prevent
 * duplicate submissions); `error` when it failed (the complete draft is
 * preserved). Success returns to `idle` with a fresh baseline.
 */
export type SubmitStatus = "idle" | "submitting" | "error";

/**
 * The calm, user-visible status of an autosaving field. Deliberately small: the
 * user must be able to predict, at a glance, whether their value is committed.
 *
 *   - `idle`    — matches the last saved value; nothing to do.
 *   - `unsaved` — edited past the saved value; a save is pending/queued.
 *   - `saving`  — a save is in flight.
 *   - `saved`   — the latest value is persisted.
 *   - `error`   — the latest save failed; the input is intact and retry is offered.
 */
export type AutosaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

/**
 * Whether a control is interactive, inert-but-editable-later (`disabled`), or
 * shown as committed, non-editable content (`readOnly`). These are distinct and
 * must remain semantically distinguishable to assistive technology (a disabled
 * control is skipped by some AT and cannot be focused; a read-only control is
 * focusable and announced as read-only).
 */
export type FieldInteractivity = {
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
};

/**
 * The shared anatomy every field control renders. These props are consumed by
 * the `Field` wrapper to build a consistent, accessible layout: a visible label,
 * a required/optional cue, optional help text, and the current validation
 * message — all wired to the control with stable ids and correct
 * `aria-describedby` / `aria-invalid`.
 */
export interface FieldAnatomy extends FieldInteractivity {
  /** Stable, unique base id for the control. Description ids derive from it. */
  readonly id: string;
  /** The visible, human-language label. Always present — never placeholder-only. */
  readonly label: string;
  /**
   * Whether a value is required. Drives the visible required/optional cue and,
   * by default, a built-in required validation. Optional fields are marked as
   * such so the requirement is never ambiguous.
   */
  readonly required?: boolean;
  /** Optional help text shown beneath the label, before any error. */
  readonly help?: string;
  /** The current validation message, or null when the field is valid. */
  readonly error?: string | null;
}

/**
 * Where a required/optional field sits on the "must the user fill this?" axis,
 * expressed for display. Optional is shown explicitly (rather than left blank)
 * so a form never leaves the requirement ambiguous.
 */
export type RequiredIndicator = "required" | "optional" | "none";

/**
 * Deterministic date serialisation formats DS-06 supports. Both are timezone
 * UNAMBIGUOUS by construction:
 *
 *   - `date` — a calendar date with NO time and NO zone: the ISO `YYYY-MM-DD`
 *     string exactly as the user picked it, never shifted through UTC/local.
 *   - `datetime` — a specific instant, serialised as an ISO-8601 UTC string
 *     (`…Z`). Only used where an absolute instant is meant; a bare wall-clock
 *     time with no zone is deliberately NOT a supported field type, because it
 *     cannot be serialised without ambiguity.
 */
export type DateFieldKind = "date" | "datetime";

/** A single option in a select/combobox control. */
export interface SelectOption {
  /** The stable machine value stored when this option is chosen. */
  readonly value: string;
  /** The human-language label shown to the user. */
  readonly label: string;
  /** When true, the option is shown but not selectable. */
  readonly disabled?: boolean;
  /** Optional secondary text (e.g. a hint or category) for richer options. */
  readonly description?: string;
  /**
   * ASSET-03 — a PRESENTATION-ONLY heading this option sits under in the compact
   * selection sheet (`SelectField sheetOnCompact`). It groups a long vocabulary
   * so it can be scanned on a phone; it is never stored, never submitted and
   * never part of the option's meaning. Options with no `group` render first, in
   * their given order.
   */
  readonly group?: string;
}

/**
 * The bounds a tags control enforces. All optional; sensible ceilings are applied
 * even when omitted so an untrusted paste cannot create an unbounded collection.
 */
export interface TagConstraints {
  /** Maximum number of tags. Defaults to a safe ceiling. */
  readonly maxTags?: number;
  /** Maximum length of a single tag, in characters. Defaults to a safe ceiling. */
  readonly maxTagLength?: number;
  /** When true, tags are compared case-insensitively for duplicate detection. */
  readonly caseInsensitive?: boolean;
}
