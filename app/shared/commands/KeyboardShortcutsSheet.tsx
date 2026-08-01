/**
 * UX-01 — the app-wide keyboard-shortcut reference.
 *
 * `?` now shows the reference on EVERY screen, not only on Today. It is hosted by
 * the ONE shared `Sheet` (which itself reuses the DS-03 focus trap, background
 * inerting, scroll lock and focus restoration — there is still no second modal
 * machinery in DalyHub), and it renders the ONE shared reference component, so the
 * content cannot drift from the copy Today's Drawer shows.
 *
 * Why Today keeps its Drawer host: on Today the reference participates in the
 * drawer STACK, which is what makes a task drawer beneath it stop owning the task
 * shortcuts (`isTop`). The shell binding is therefore registered as a FALLBACK —
 * lowest precedence — so Today's contextual `?` still wins there and the stack
 * semantics are untouched, while every other surface gets the reference it always
 * claimed to have. Converging the two hosts stays recorded as DEBT-18.
 */

import { Sheet } from "~/shared/sheet";

import { KeyboardShortcutsReference } from "./KeyboardShortcutsReference";

export type KeyboardShortcutsSheetProps = {
  /** The control that opened it, so focus returns there on close. */
  readonly opener: HTMLElement | null;
  readonly onClose: () => void;
};

export function KeyboardShortcutsSheet({
  opener,
  onClose,
}: KeyboardShortcutsSheetProps) {
  return (
    <Sheet
      title="Keyboard shortcuts"
      description="Operate DalyHub without a mouse"
      opener={opener}
      onClose={onClose}
      data-testid="keyboard-shortcuts"
      // The reference is read-only: without this its scrolling body would be
      // unreachable by keyboard (see `SheetProps.bodyFocusable`).
      bodyFocusable
    >
      <KeyboardShortcutsReference />
    </Sheet>
  );
}

export default KeyboardShortcutsSheet;
