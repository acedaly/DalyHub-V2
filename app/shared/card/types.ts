/**
 * DS-04 — the Shared Card public contract.
 *
 * ONE configurable, ENTITY-AGNOSTIC Card for every entity type, in lists, boards
 * and grids (DESIGN_SYSTEM.md → Cards). There is no TaskCard/ProjectCard/…; a
 * consumer supplies plain typed data and receives a consistent card with selection,
 * quick actions, density, progress and an accessible primary open action.
 *
 * The Card knows nothing about D1, repositories, workspaces, the Area hierarchy,
 * Project/Task rules, real routes, module loaders or Cloudflare bindings. It does
 * not own Drawer state or parse drawer keys — it exposes a small primary-open
 * contract (an `href`, an `onOpen` callback, or both for the ideal DS-03
 * integration) and lets the consumer decide what "open" means.
 *
 * The API is intentionally small and documented; add a field only when a real
 * entity needs it, and add it to this one Card (never a bespoke per-module card).
 */

import type { MouseEvent, ReactNode } from "react";

import type { OverflowMenuItem } from "~/shared/overflow-menu";

/** A semantic tone, paired with a text label — never colour-only (WCAG 2.2 AA). */
export type CardTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/** Comfortable (default) or compact vertical rhythm. */
export type CardDensity = "comfortable" | "compact";

/** The presentation context. The SAME component adapts spacing/placement. */
export type CardPresentation = "list" | "board" | "grid";

/**
 * MOBILE-01 — how much a metadata entry earns on a small card.
 *
 * `high` (the default) is a SIGNAL the user scans for — a task's priority or
 * urgency, a project's health. `low` is supporting detail: still shown, still in
 * the accessibility tree, but rendered as a de-emphasised run so a phone card does
 * not become five rows of competing chips.
 *
 * This is deliberately a MODULE DECLARATION rather than a CSS selector keyed to an
 * entity type: the module that knows what its record means decides what matters,
 * and the shared Card renders that decision the same way everywhere. Nothing is
 * removed at any width — de-prioritising is not hiding.
 */
export type CardMetaPriority = "high" | "low";

/** A small metadata entry shown on the card. */
export interface CardMetaItem {
  readonly id: string;
  /** Optional label; when present it precedes the value (e.g. "Owner: Aidan"). */
  readonly label?: string;
  readonly value: ReactNode;
  /** Scanning priority on a small card. Defaults to `high`. */
  readonly priority?: CardMetaPriority;
}

/** A status pill: a tone plus an always-present text label. */
export interface CardStatus {
  readonly label: string;
  readonly tone?: CardTone;
}

/** A parent/context label (e.g. the owning Project), optionally a link. */
export interface CardContext {
  readonly label: string;
  readonly href?: string;
}

/** A due/date label, optionally toned (e.g. overdue). Always carries text. */
export interface CardDateLabel {
  readonly label: string;
  readonly tone?: CardTone;
}

/**
 * A bounded progress value with an accessible text equivalent. `value` is read
 * against `max` (default 1), so both a 0–1 fraction and an N-of-M count work.
 * Invalid/NaN/negative inputs normalise to 0; over-max clamps to complete.
 */
export interface CardProgress {
  readonly value: number;
  readonly max?: number;
  /** Accessible/visible text override; defaults to a percentage. */
  readonly label?: string;
}

/** Controlled selection. Native checkbox semantics; selection never opens a card. */
export interface CardSelection {
  readonly selected: boolean;
  readonly onSelectedChange: (selected: boolean) => void;
  readonly disabled?: boolean;
  /** Accessible name for the control; defaults to `Select <title>`. */
  readonly label?: string;
}

/**
 * A quick action or overflow action. May be a button (`onSelect`) or link (`href`).
 * Meaning is never conveyed by icon or colour alone — a visible `label` or an
 * explicit `ariaLabel` is always the accessible name.
 */
export interface CardAction {
  readonly id: string;
  /** Visible label (also the accessible name unless `ariaLabel` overrides). */
  readonly label: string;
  /** Accessible-name override for icon-only actions. */
  readonly ariaLabel?: string;
  readonly icon?: ReactNode;
  /** Hide the visible label (icon-only). The accessible name is kept via aria. */
  readonly iconOnly?: boolean;
  readonly href?: string;
  /**
   * The `href` leaves DalyHub (a conferencing link, a vendor page), so it opens in
   * a new tab with `rel="noreferrer"` rather than replacing the application.
   * Only meaningful with `href`; in-app links must stay same-window so Back works.
   */
  readonly external?: boolean;
  readonly onSelect?: () => void;
  readonly disabled?: boolean;
  /** Pending shows a busy state and blocks activation (generic; no mutation here). */
  readonly pending?: boolean;
  /** Keyboard-shortcut hint (metadata only; DS-09 owns global shortcuts). */
  readonly shortcut?: string;
  /** Accessible help/tooltip text (rendered as a title + description). */
  readonly description?: string;
}

/** Props for the one Shared Card. */
export interface CardProps {
  /** Stable record/card identity. Required for selection and reorder keying. */
  readonly id: string;
  /** Entity type label (e.g. "Project"); names the decorative `icon`. */
  readonly typeLabel?: string;
  /** Optional entity icon/glyph (decorative; `typeLabel` names it). */
  readonly icon?: ReactNode;
  /** Optional semantic entity accent (a tone) — a restrained type cue, not status. */
  readonly accent?: CardTone;
  /** The card title (required). Also the primary open target's accessible name. */
  readonly title: string;
  /**
   * The heading level of the card title, so cards nest correctly under the
   * surrounding heading (a Collection pane header at `h1` → cards at `h2`; a card
   * under an `h2` section → `h3`). Defaults to `3`. Setting the right level keeps
   * the document's heading outline valid (WCAG 2.2 — no skipped levels).
   */
  readonly headingLevel?: 2 | 3 | 4;
  /** Optional subtitle or short description. */
  readonly subtitle?: ReactNode;
  /**
   * TASKS-04 — an EDITOR rendered in place of the title while the row is being
   * renamed inline. Supply it only while editing: the Card's own title/open control
   * (the link or button whose accessible name is `openAriaLabel`) is what makes a
   * card openable, and replacing it permanently would take the record away. The
   * caller owns the editing state; the Card just yields the slot.
   */
  readonly titleEditor?: ReactNode;
  readonly status?: CardStatus;
  readonly metadata?: readonly CardMetaItem[];
  readonly progress?: CardProgress;
  readonly context?: CardContext;
  readonly dateLabel?: CardDateLabel;
  readonly selection?: CardSelection;
  /** Curated quick actions (a small few). The overflow holds the long tail. */
  readonly quickActions?: readonly CardAction[];
  /**
   * DS-12 — the card's overflow (⋯) menu: the long tail and the lifecycle
   * actions (Archive / Restore / Delete), rendered through the SAME shared
   * `OverflowMenu` the Record Header uses, so a card's menu and its record's menu
   * read identically. An empty list renders nothing.
   */
  readonly overflowActions?: readonly OverflowMenuItem[];
  /**
   * The single-action form of {@link overflowActions}, kept for the one-item case.
   * It is normalised into a one-item menu — there is no second overflow rendering.
   */
  readonly overflowAction?: CardAction;
  /** Accessible name for the overflow trigger. Defaults to `More actions for <title>`. */
  readonly overflowLabel?: string;
  /**
   * Touch swipe quick actions (TODAY-06). When provided AND the device is
   * touch-first, the card can be swiped horizontally to reveal an action tray
   * holding these actions. This is an ACCELERATOR only: the tray is a visual
   * duplicate (`aria-hidden`) of controls that must also be reachable without a
   * gesture — pass the SAME `CardAction`s here that you expose as `quickActions`
   * (or in the Drawer), so every action keeps an ordinary accessible control and
   * keyboard path (DESIGN_SYSTEM.md → Swipe quick actions, AGENTS.md §15). Reuses
   * the shared `AppAction`/`CardAction` execution path — never a touch-only handler.
   * Availability must be state-dependent: omit actions that do not apply. On a
   * non-touch device (mouse/keyboard) the tray never reveals and behaviour is
   * unchanged.
   */
  readonly swipeActions?: readonly CardAction[];

  /**
   * Primary open action. Provide `href` (a shareable link — e.g. a DS-03 drawer
   * deep link), `onOpen` (an SPA callback), or BOTH: with both, an unmodified
   * click opens via `onOpen` while a modified/middle click follows the `href`
   * (open in a new tab), so keyboard, mouse and shareable-link behaviours are all
   * correct. The Card never owns Drawer state.
   */
  readonly href?: string;
  readonly onOpen?: () => void;
  /** Accessible-name override for the open target (defaults to the title). */
  readonly openAriaLabel?: string;

  readonly density?: CardDensity;
  readonly presentation?: CardPresentation;
  /**
   * Roving-focus membership for a keyboard-navigable collection (DS-09 keyboard
   * pattern). When set, this value is applied ONLY to the card's **primary open
   * target**, so the collection behaves as a single composite widget with exactly
   * ONE tab stop: `0` makes this card the tab stop (arrow keys move between cards),
   * `-1` takes it out of the tab order. The card's SECONDARY controls (the selection
   * checkbox and the quick/overflow action buttons) are always removed from the tab
   * order (`tabindex="-1"`) while roving is active — so Tab never stops on them — yet
   * they remain fully operable by pointer and by keyboard through the collection's
   * own model (Space selects the focused card) and the shared contextual commands /
   * Command Palette (every action has a keyboard equivalent). Undefined (the default)
   * leaves natural tab behaviour unchanged, so every existing consumer is untouched.
   * Programmatic `.focus()` on a `tabindex="-1"` control still works.
   */
  readonly rovingTabIndex?: number;
  /** A reorder handle node (supplied by `ReorderableCardCollection`). */
  readonly reorderHandle?: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** Internal: the resolved, normalised progress used for rendering. */
export interface NormalisedProgress {
  readonly fraction: number;
  readonly percent: number;
  readonly text: string;
}

export function normaliseProgress(progress: CardProgress): NormalisedProgress {
  const max = progress.max ?? 1;
  const rawFraction =
    Number.isFinite(progress.value) && Number.isFinite(max) && max > 0
      ? progress.value / max
      : 0;
  const fraction = Math.min(1, Math.max(0, rawFraction));
  const percent = Math.round(fraction * 100);
  const text = progress.label ?? `${percent}%`;
  return { fraction, percent, text };
}

export function primaryOpenIsModifiedClick(
  event: MouseEvent<HTMLElement>,
): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button === 1
  );
}
