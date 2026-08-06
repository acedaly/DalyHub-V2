/**
 * DS-03 — the Shared Drawer public contract.
 *
 * One reusable, ENTITY-AGNOSTIC overlay that opens any DalyHub record over the
 * current page without losing the user's place (DESIGN_SYSTEM.md → Drawer). The
 * Drawer knows nothing about Projects, Tasks, People, D1, workspaces or module
 * routes — callers pass an opaque `key` and a render function that maps a key to
 * a title, an accessible description and `children` (which host the DS-02
 * Record Layout). The Drawer owns focus, background inertness, body-scroll
 * locking, the browser-history/URL contract and z-index stacking; consumers own
 * only "given this key, what record do I show".
 *
 * The API is intentionally small and documented; add a field only when a real
 * record needs it.
 */

import type { ReactNode, RefObject } from "react";

/**
 * A drawer stack key: an opaque, non-empty, URL-safe token that identifies the
 * record (or development fixture) a drawer shows. The Drawer treats it as an
 * opaque string and never parses it — the `<kind>:<id>` shape used by the DS-03
 * fixture is a CONSUMER convention, not part of this contract, so the Drawer
 * stays entity-agnostic.
 */
export type DrawerKey = string;

/**
 * A drawer's presentation width. `default` fits a full Record Layout as a calm
 * side sheet; `wide` is for genuinely wider records. Both collapse to a
 * full-height sheet on narrow viewports. Add a variant only when a real record
 * needs one — do not invent sizes speculatively.
 */
export type DrawerSize = "default" | "wide";

/** One level of the open drawer stack, derived from the URL. */
export interface DrawerEntry {
  /** The opaque record key for this level. */
  readonly key: DrawerKey;
  /** Zero-based stack depth (0 is the first/backmost drawer). */
  readonly depth: number;
  /** True for the single interactive top drawer. */
  readonly isTop: boolean;
}

/**
 * What a consumer's `renderDrawer` returns for a given entry — everything the
 * Drawer chrome needs to present the record, minus all stack/focus/history
 * plumbing (which the Drawer owns). Returning `null` signals "no such record":
 * the Drawer then shows a coherent, accessible not-found panel so a stale or
 * hand-typed deep link fails gracefully rather than blank.
 */
export interface DrawerRenderResult {
  /** The accessible name for the dialog (typically the record title). Required. */
  readonly title: string;
  /** Optional accessible description, associated via `aria-describedby`. */
  readonly description?: string;
  /** The drawer body — hosts a DS-02 `RecordLayout`. */
  readonly children: ReactNode;
  /** Presentation width; defaults to `default`. */
  readonly size?: DrawerSize;
  /**
   * When present and truthy at close time, the in-drawer close affordances
   * (Escape, the close button, backdrop click) are suppressed so an unsaved-state
   * workflow can guard the drawer. A function is evaluated at each close attempt.
   * (Forms and any confirmation UI belong to DS-06, not here.)
   */
  readonly preventClose?: boolean | (() => boolean);
  /**
   * An explicit element to receive focus when the drawer opens. When omitted the
   * Drawer focuses its close button, then the first focusable control.
   */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * MOBILE-01 — contextual actions rendered in the Drawer's own header, beside
   * Close. On a phone the Drawer IS the record's screen, so its overflow menu and
   * one or two record actions belong in the chrome rather than in a second header
   * below it. Keep this to an overflow menu plus at most one action; anything more
   * belongs in the record body.
   */
  readonly headerActions?: ReactNode;
  /**
   * MOBILE-01 — a sticky action region pinned to the bottom of the Drawer.
   *
   * Use it for the record's PRIMARY commitment (Save, Complete, Add) so it stays
   * reachable without scrolling a long record to its end. The region is
   * keyboard-aware: it sits above the on-screen keyboard via the shared
   * `--app-keyboard-inset` token and above the home indicator via the safe-area
   * inset, so it can never cover the field being typed into.
   *
   * It is NOT a place for secondary or destructive actions — those stay in the
   * overflow menu (PX-04), so the sticky region never becomes a second toolbar.
   */
  readonly stickyActions?: ReactNode;
  /**
   * MOBILE-01 — suppress the record's own repeated title inside the body.
   *
   * The Drawer header already names the record. A record that renders a full
   * DS-02 Record Header beneath it shows the SAME title twice, which costs a
   * phone the most valuable rows on the screen. A consumer sets this and passes
   * `compactHeader` to its Record Layout; the Drawer surfaces it as a data
   * attribute so the styling is one rule rather than a prop threaded everywhere.
   */
  readonly titleInHeaderOnly?: boolean;
}

/**
 * The imperative controller returned by `useDrawer()`. All mutations are
 * expressed as ordinary navigations, so every drawer change is a real URL/history
 * transition (deep-linkable, shareable, Back/Forward-aware) — never hidden
 * component state.
 */
export interface DrawerController {
  /** The current open stack, backmost first. Empty when nothing is open. */
  readonly entries: readonly DrawerEntry[];
  /** Number of open drawers (`entries.length`). */
  readonly depth: number;
  /** True when at least one drawer is open. */
  readonly isOpen: boolean;
  /** The top (interactive) drawer's key, or `undefined` when none is open. */
  readonly topKey: DrawerKey | undefined;
  /**
   * Open `key` as a new drawer on top of the stack (pushes a history entry).
   * Opening the key that is already on top is a no-op, so repeated activations
   * never duplicate a stack level.
   */
  openDrawer(key: DrawerKey): void;
  /** Replace the top drawer's key in place (no new history entry). */
  replaceDrawer(key: DrawerKey): void;
  /** Close the top drawer, revealing the level beneath (or the underlying page). */
  closeDrawer(): void;
  /** Close every open drawer, revealing the underlying page. */
  closeAll(): void;
}
