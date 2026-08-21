/**
 * DHDS-09 — the shapes the shared floating surfaces are described with.
 *
 * One option model, because a menu command, a picker option and a listbox row
 * are the same object with different parts filled in. Keeping them one type is
 * what lets the shared option anatomy (`.dh-option`, `floating.css`) be one
 * anatomy rather than three that resemble each other.
 */

import type { ReactNode } from "react";

/** How loudly an option speaks, and what kind of thing it is. */
export type FloatingOptionTone =
  /** An ordinary value or command. */
  | "default"
  /**
   * Destructive and irreversible — Delete, Discard. Its LABEL takes the danger
   * colour; the row stays a row (DHDS-09 §20: no red slab).
   */
  | "danger"
  /**
   * The "none of these" choice — Clear, No date, Move to Inbox. A different
   * KIND of item from the real values, and rarely the point of opening the
   * surface, so it is quieter and separated from them.
   */
  | "quiet";

/**
 * One repeated choice inside a floating surface.
 *
 * Only `id` and `label` are required. Nothing reserves space it is not using,
 * so a four-item priority menu and a searchable Project picker render through
 * the same anatomy without either paying for the other's parts.
 */
export interface FloatingOption {
  /** Stable identity. For a picker this is the value that gets committed. */
  readonly id: string;
  /** The visible, always-present name. Never a bare code without context. */
  readonly label: string;
  /**
   * One line of supporting context — what a status means, whether a parent is
   * a Project or an Area, a person's role. Never a second sentence, and never
   * part of the accessible NAME (it is referenced separately).
   */
  readonly support?: string;
  /**
   * A leading identity mark: a priority flag, an entity accent tile, a
   * person's initials, a command's glyph. DECORATIVE by construction — the
   * label carries the meaning, so this is rendered `aria-hidden`.
   */
  readonly mark?: ReactNode;
  /**
   * The keyboard shortcut this option duplicates, already in the product's
   * display notation. Decorative for the same reason: appending a key to the
   * accessible name makes the name unmatchable by the words a screen-reader
   * user hears.
   */
  readonly shortcut?: string;
  /** An accessible name that differs from the visible label. Rare. */
  readonly ariaLabel?: string;
  readonly tone?: FloatingOptionTone;
  /** Draw a hairline above this option — a boundary between KINDS of item. */
  readonly separatorBefore?: boolean;
  readonly disabled?: boolean;
}

/** A menu option: a command, so it can also be a link or be in flight. */
export interface FloatingMenuOption extends FloatingOption {
  /** Navigate rather than run a handler. A link is exempt from focus return. */
  readonly href?: string;
  /** A command whose previous activation has not finished. Not activatable. */
  readonly pending?: boolean;
  /** What the command does. Optional so a radio menu can drive selection only. */
  readonly onSelect?: () => void;
  /**
   * This row is a COMMAND rather than one of the values, inside a menu that is
   * otherwise choosing among values.
   *
   * It stays an ordinary `menuitem` while its neighbours are `menuitemradio`,
   * because announcing "not selected" for a row that can never be selected — a
   * "Search all Projects…" hand-off, a "Create…" escape hatch — is a lie about
   * the field's state. The CLEAR command is deliberately not one of these: it
   * is the "none of these" value, and announcing it as unchecked beside a
   * checked value is exactly the state of the field.
   */
  readonly isCommand?: boolean;
  /**
   * Keep the surface open after this option is chosen.
   *
   * The default is the dismissal contract in DHDS-09 §32: a menu closes after
   * a command and a single-choice picker closes after a choice. Opt in only
   * where staying open genuinely improves the task — a multi-select, or a
   * command that reveals a second step in the same surface.
   */
  readonly keepOpen?: boolean;
}

/** Which of the anchor's inline edges a surface lines up with. */
export type FloatingAlign = "start" | "end";

/**
 * How a surface presents itself.
 *
 * `auto` is the DHDS-09 default and the one almost every caller wants: anchored
 * to its trigger on a pointer device, the shared bottom Sheet on a phone. The
 * same options, the same order, the same ids and the same domain action —
 * only the container differs, which is what stops a phone growing a second
 * interaction with the same name.
 *
 * `anchored` pins the surface to the anchored presentation at every width.
 *
 * A sheet opened from inside another sheet is supported and precedented — the
 * shared `Sheet` keeps a stack precisely so Escape closes only the top one, and
 * Quick Capture has nested one since ASSET-03 — so this is NOT the escape hatch
 * for "I am inside a sheet". It is for the rarer case where the anchored
 * presentation is genuinely the better one at every width: a surface small
 * enough that a full-height sheet would be theatre, opened from a control the
 * owner is already pointing at.
 */
export type FloatingPresentation = "auto" | "anchored";
