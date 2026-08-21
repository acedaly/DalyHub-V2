/**
 * DHDS-09 — the ONE quiet sort control.
 *
 * ── What DHDS-09 found ──────────────────────────────────────────────────────
 * Sorting is the single most repeated collection control in DalyHub, and three
 * modules had never been brought onto the shared one. Meetings, Reviews and
 * People each drew a bare native `<select>`, and each drew it differently:
 *
 *   | Module   | Class                        | Wording                     |
 *   |----------|------------------------------|-----------------------------|
 *   | Meetings | `.dh-input`                  | a hidden label, plain options |
 *   | Reviews  | `.dh-select`                 | `Sort: Recently updated` INSIDE each option |
 *   | People   | `.dh-people-filters__select` | `Sort: <name>` INSIDE each option |
 *
 * Three heights, three radii, and — in two of them — the field's NAME repeated
 * inside every one of its values, because a bare `<select>` has nowhere else to
 * put it. That is exactly the "different dropdown styling and wording on every
 * page" the DHDS-09 brief rules out.
 *
 * ── What this is ────────────────────────────────────────────────────────────
 * A trigger that STATES the current sort — "Sort: Recently updated" — opening
 * the shared {@link Menu} of `menuitemradio` options. The name is said once, on
 * the trigger, so the options are values rather than repeated sentences; the
 * current one carries a check; and the surface, the option anatomy, the
 * keyboard contract and the phone sheet are the product's shared ones.
 *
 * ── Why not `CollectionControls` ────────────────────────────────────────────
 * The richer filter surface is right for a collection with several dimensions,
 * and these three have one. Putting a single sort behind a "Filter & sort"
 * button would hide the only control the header has, and would open a sheet on
 * a phone to answer a one-line question. This is the compact end of the same
 * grammar: same menu, same rows, same keyboard, less surface.
 *
 * A direction toggle is deliberately NOT here. None of the collections that
 * needed converging supports one — their sort keys carry their own direction
 * ("Recently updated", "Name A–Z") — and inventing an Ascending/Descending pair
 * a module cannot honour is the "options a module cannot genuinely support" the
 * brief warns about. A collection that grows one adds two more options to its
 * own list.
 */

import { useCallback, useId, useRef, useState } from "react";

import { Menu } from "~/shared/floating";
import type { FloatingMenuOption } from "~/shared/floating";
import { ChevronDownIcon } from "~/shared/icons";

export interface SortMenuOption {
  readonly value: string;
  /** The value's own name — "Recently updated". Never prefixed with "Sort:". */
  readonly label: string;
}

export interface SortMenuProps {
  /** The applied sort key. */
  readonly value: string;
  readonly options: readonly SortMenuOption[];
  readonly onSelect: (value: string) => void;
  /**
   * What is being sorted, for the accessible name — "meetings", "people". The
   * trigger reads "Sort meetings" so several collections' controls on one page
   * (a dashboard, a test) are distinguishable by name.
   */
  readonly subject: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}

export function SortMenu({
  value,
  options,
  onSelect,
  subject,
  className,
  ...rest
}: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const generatedId = useId();
  const menuId = `${generatedId}-sort`;
  const current =
    options.find((option) => option.value === value) ?? options[0];

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  const items: readonly FloatingMenuOption[] = options.map((option) => ({
    id: option.value,
    label: option.label,
    onSelect: () => onSelect(option.value),
  }));

  if (options.length === 0) return null;

  return (
    <div
      className={["dh-sortmenu", className].filter(Boolean).join(" ")}
      data-open={open ? "true" : "false"}
      data-testid={rest["data-testid"]}
    >
      <button
        type="button"
        ref={triggerRef}
        className="dh-sortmenu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        /*
         * The trigger's accessible name is the ACTION, and its visible text is
         * the current STATE. A screen-reader user hears "Sort meetings, button,
         * Recently updated" — the job and the answer — rather than the answer
         * twice, which is what a `<select>` labelled by its own value produced.
         */
        aria-label={`Sort ${subject}`}
        onClick={() => setOpen((now) => !now)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <span className="dh-sortmenu__label">
          <span className="dh-sortmenu__name">Sort:</span>{" "}
          {current?.label ?? ""}
        </span>
        <ChevronDownIcon className="dh-sortmenu__caret" aria-hidden="true" />
      </button>

      {open ? (
        <Menu
          anchorRef={triggerRef}
          label={`Sort ${subject}`}
          items={items}
          value={current?.value ?? value}
          onClose={close}
          align="end"
          id={menuId}
        />
      ) : null}
    </div>
  );
}
