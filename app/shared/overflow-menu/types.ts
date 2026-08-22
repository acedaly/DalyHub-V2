/**
 * DS-12 — the shared overflow (⋯) menu contract.
 *
 * ONE menu-item model for every overflow surface in the product: the DS-02 Record
 * Header's overflow and the DS-04 Card's overflow render the SAME
 * {@link OverflowMenuItem} list through the SAME component, so a secondary or
 * destructive action looks, reads and behaves identically wherever it appears
 * (DESIGN_SYSTEM.md → Overflow menu).
 *
 * The model is deliberately the `RecordAction`/`CardAction` shape plus the two
 * things a menu needs and a button row does not — a `tone` (so a destructive item
 * is visually separated without being colour-only) and a `separatorBefore` group
 * break. It knows nothing about entities, lifecycles or routes: a consumer passes
 * plain data and a handler.
 */

import type { ReactNode } from "react";

/** A menu item's tone. `danger` marks a destructive item (icon + text still carry
 * the meaning — never colour alone). */
export type OverflowMenuItemTone = "default" | "danger";

/** One item in an overflow menu. A link when `href` is set, else a button. */
export interface OverflowMenuItem {
  readonly id: string;
  /** The visible label — also the accessible name unless `ariaLabel` overrides. */
  readonly label: string;
  /** Accessible-name override (use only when the visible label is terse). */
  readonly ariaLabel?: string;
  /** Optional leading glyph. Decorative — the label always carries the meaning. */
  readonly icon?: ReactNode;
  /** Optional supporting line shown under the label (e.g. why an item is blocked). */
  readonly description?: ReactNode;
  readonly href?: string;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  /** Pending shows a busy state and blocks activation (generic; no mutation here). */
  readonly pending?: boolean;
  readonly tone?: OverflowMenuItemTone;
  /** Start a new visual group above this item (a hairline rule). Decorative. */
  readonly separatorBefore?: boolean;
  /**
   * CONTROL-01 §5 — the keyboard shortcut this item duplicates, e.g. `E` or
   * `⌘K`, shown at the item's trailing edge.
   *
   * Only ever set it where the shortcut GENUINELY EXISTS and is bound on this
   * surface. A hint is a promise: printing one for a key that does nothing
   * teaches a keystroke that then fails silently, which is worse than printing
   * none. It is `aria-hidden`, because the item's accessible name is the action
   * and a screen-reader user is not helped by hearing "E" appended to it.
   */
  readonly shortcut?: string;
}

/** Props for the one shared overflow menu. */
export interface OverflowMenuProps {
  /** The items, in the order they should appear. An empty list renders nothing. */
  readonly items: readonly OverflowMenuItem[];
  /**
   * The trigger's accessible name. Always name the record it acts on — e.g.
   * `More actions for Website relaunch` — so a screen-reader user hearing several
   * card menus can tell them apart.
   */
  readonly label: string;
  /** Which edge the panel aligns to. Defaults to `end` (right in LTR). */
  readonly align?: "start" | "end";
  /**
   * Extra class on the WRAPPER — the element the menu occupies in its row.
   *
   * V2.4-GATE-01. This is where a consumer puts `dh-action-reveal`, because the
   * reveal contract's own consumer rule says the class goes on "the trailing
   * action container" and the wrapper IS that container. Putting it on the
   * trigger instead left the wrapper live while the affordance inside it was
   * invisible and pointer-inert — see `TaskRow`.
   */
  readonly className?: string;
  /** Extra class on the trigger (for surface-specific sizing only). */
  readonly triggerClassName?: string;
  /** Removes the trigger from the tab order (a roving-tabindex collection). */
  readonly tabIndex?: number;
  readonly "data-testid"?: string;
}
