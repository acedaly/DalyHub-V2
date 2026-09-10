/**
 * The phone sheet's two search entries — global Search and the Command Palette.
 *
 * Only the OVERLAY variant renders these. On desktop, Search leads the top app
 * bar and the palette is one of its utilities; a phone has no bar of that kind,
 * and the sheet is where a thumb reaches them.
 *
 * They are BUTTONS that open surfaces, not inputs. A second real text field
 * would be a second search implementation to keep in step with the first.
 *
 * UNTITLED-02 — the `dh-sidebar__search*` class family is gone. Each entry now
 * wears the same row anatomy as a navigation destination (`RailNavItem`'s
 * geometry and states), because in this sheet that is what they are: things you
 * tap to go somewhere. The shortcut hint is `aria-hidden` so it stays out of the
 * accessible name, and is dropped entirely on the phone, where there is no
 * keyboard to press it with — printing "⌘K" beside a control a thumb is about to
 * tap is chrome that can never be acted on.
 */

import { Command, SearchLg } from "@untitledui/icons";
import type { FC, ReactNode } from "react";

export type SidebarSearchProps = {
  /** Opens global Search (DS-08), receiving the trigger so focus can return. */
  readonly onOpenSearch?: (opener: HTMLElement) => void;
  /** Opens the Command Palette (DS-09), for the same reason. */
  readonly onOpenCommand?: (opener: HTMLElement) => void;
};

function SearchEntry({
  icon: Icon,
  label,
  hint,
  onOpen,
}: {
  readonly icon: FC<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  readonly label: string;
  readonly hint: ReactNode;
  readonly onOpen?: (opener: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen ? (event) => onOpen(event.currentTarget) : undefined}
      className="group/entry flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md p-2 outline-focus-ring transition duration-100 ease-linear hover:bg-primary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Icon
        aria-hidden="true"
        className="size-5 shrink-0 text-fg-quaternary transition-inherit-all group-hover/entry:text-fg-quaternary_hover"
      />
      <span className="flex-1 text-left text-sm font-semibold text-secondary transition-inherit-all group-hover/entry:text-secondary_hover">
        {label}
      </span>
      <kbd
        aria-hidden="true"
        className="hidden rounded border border-secondary px-1.5 py-0.5 font-mono text-xs text-quaternary sm:inline-block"
      >
        {hint}
      </kbd>
    </button>
  );
}

export function SidebarSearch({
  onOpenSearch,
  onOpenCommand,
}: SidebarSearchProps) {
  return (
    <div
      role="search"
      aria-label="Search and commands"
      className="flex flex-col gap-0.5"
    >
      <SearchEntry
        icon={SearchLg}
        label="Search"
        hint="/"
        onOpen={onOpenSearch}
      />
      <SearchEntry
        icon={Command}
        label="Command palette"
        hint="⌘K"
        onOpen={onOpenCommand}
      />
    </div>
  );
}
