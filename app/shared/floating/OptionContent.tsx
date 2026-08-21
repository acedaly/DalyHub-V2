/**
 * DHDS-09 — the ONE anatomy of a repeated choice.
 *
 *     [ mark ]  Label                        ⌘K   ✓
 *               Supporting label
 *
 * The INSIDE of an option row, without the element or the semantics around it.
 * A menu item is a `button` with `role="menuitem"`, a picker option is an `li`
 * with `role="option"`, and a sort choice is a `menuitemradio` — three genuinely
 * different accessibility contracts that must not be flattened into one
 * (AGENTS.md §15: menu, listbox and combobox are not interchangeable). What they
 * have no reason to disagree about is what the row LOOKS like, so that is what
 * this owns and all it owns.
 *
 * Before DHDS-09 there were five of these: the overflow menu's `__labels` /
 * `__label` / `__description` / `__shortcut`, the form listbox's
 * `__option-check` / `__option-body` / `__option-label` / `__option-desc`, the
 * inline select's `__option` / `__option-description`, the collection popover's
 * `ControlOptionMark`, and the phone sheet's `SheetOption`. They differed in
 * option height, in which side the check sat on, in whether a description was
 * allowed to wrap, and in whether the current value was marked at all.
 */

import type { ReactNode } from "react";

import { CheckIcon } from "~/shared/icons";

export interface OptionContentProps {
  /**
   * A leading identity mark. Always `aria-hidden`: the label is the name, and
   * a coloured tile or a priority flag that also spoke would be announced
   * twice.
   */
  readonly mark?: ReactNode;
  readonly label: ReactNode;
  /** One quiet line under the label. Referenced, never part of the name. */
  readonly support?: ReactNode;
  /** The id `aria-describedby` points at, when there is a support line. */
  readonly supportId?: string;
  /** The shortcut this option duplicates. Decorative. */
  readonly shortcut?: string;
  /**
   * Whether this option is the current value.
   *
   * The check is REINFORCEMENT. The host has already said so semantically
   * (`aria-checked`, `aria-selected` or `aria-pressed`) and the shared
   * stylesheet also weights the label, so selection never rests on a glyph or
   * on a colour alone.
   */
  readonly selected?: boolean;
  /**
   * Reserve the check's box on every row in the list, so choosing a different
   * option does not re-lay-out the surface under the pointer.
   *
   * `true` for a list where selection is meaningful (a picker, a radio menu);
   * `false` for a list of commands, where no row will ever carry one and the
   * reserved column would just be an empty gutter.
   */
  readonly showCheck?: boolean;
}

export function OptionContent({
  mark,
  label,
  support,
  supportId,
  shortcut,
  selected = false,
  showCheck = false,
}: OptionContentProps) {
  return (
    <>
      {mark ? (
        <span className="dh-option__mark" aria-hidden="true">
          {mark}
        </span>
      ) : null}
      <span className="dh-option__labels">
        <span className="dh-option__label">{label}</span>
        {support ? (
          <span className="dh-option__support" id={supportId}>
            {support}
          </span>
        ) : null}
      </span>
      {shortcut ? (
        <span className="dh-option__shortcut" aria-hidden="true">
          {shortcut}
        </span>
      ) : null}
      {showCheck ? (
        <span className="dh-option__check" aria-hidden="true">
          {selected ? <CheckIcon /> : null}
        </span>
      ) : null}
    </>
  );
}
