/**
 * DS-04 (TODAY-06) — the pure, React-free swipe-gesture model.
 *
 * The mechanics of "swipe a Card to reveal an action tray" expressed as small,
 * deterministic, side-effect-free functions plus one tiny single-open registry.
 * The React hook ({@link useCardSwipe}) and the Card component drive the DOM; ALL
 * decision logic — direction intent, offset projection, boundary clamping, the
 * open/closed snap decision, and the "only one tray open at a time" invariant —
 * lives here so it can be unit-tested directly (the roving-model / reorder-math
 * precedent, DESIGN_SYSTEM.md → Cards, AGENTS.md §14).
 *
 * Provenance: this is original DalyHub code. Only the well-known *idea* of a
 * swipe-to-reveal list row (studied in Things 3 / iOS Mail, REFERENCE_PRODUCTS.md)
 * is reused; no third-party gesture library or code is used, so no attribution is
 * required (the DS-08/DS-09 in-house precedent, OPEN_SOURCE_POLICY.md).
 *
 * Geometry note: the tray is revealed on the trailing (inline-end) edge by dragging
 * the surface toward the inline-start. `offset` is the non-negative reveal distance
 * in px; the surface is translated by `-offset` (LTR). This is a horizontal,
 * single-axis interaction — vertical movement is never claimed, so natural page
 * scrolling is preserved (the surface also sets `touch-action: pan-y`).
 */

/** The distance/timing thresholds that shape the gesture. All in CSS px / ratios. */
export interface SwipeThresholds {
  /**
   * The net finger travel (px) before the gesture commits to a direction. Below
   * this in BOTH axes the gesture is still `pending` and nothing moves — so a tap
   * or a tiny accidental jitter never reveals the tray.
   */
  readonly intent: number;
  /**
   * The fraction of the tray width past which releasing snaps the tray OPEN (and
   * below which it snaps closed). A calm, deliberate default: you must pull the
   * tray most of the way before it commits.
   */
  readonly openRatio: number;
}

/** The calm defaults: a 12px deadzone and a 40%-of-tray open commitment. */
export const DEFAULT_SWIPE_THRESHOLDS: SwipeThresholds = {
  intent: 12,
  openRatio: 0.4,
};

/**
 * A sensible tray width (px) used before the real tray has been measured (e.g. the
 * very first gesture, or a non-layout test environment). Once the tray is laid out
 * the measured width is authoritative.
 */
export const FALLBACK_TRAY_WIDTH = 176;

/** The decided axis of a gesture (or `pending` while still within the deadzone). */
export type SwipeIntent = "pending" | "horizontal" | "vertical";

/**
 * Decide the gesture's axis from its net displacement. `pending` until movement in
 * either axis exceeds the intent threshold; then the larger axis wins (ties go to
 * vertical so page scrolling is favoured — a swipe must be *clearly* horizontal).
 */
export function resolveSwipeIntent(
  dx: number,
  dy: number,
  intent: number = DEFAULT_SWIPE_THRESHOLDS.intent,
): SwipeIntent {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < intent && ay < intent) {
    return "pending";
  }
  // Strictly-greater horizontal claims the swipe; equal or greater vertical yields
  // to the page scroll. Guarding against a diagonal drag hijacking a scroll.
  return ax > ay ? "horizontal" : "vertical";
}

/** Clamp a raw reveal offset into the valid `[0, trayWidth]` range (the boundaries). */
export function clampOffset(offset: number, trayWidth: number): number {
  if (!(trayWidth > 0) || !Number.isFinite(offset)) {
    return 0;
  }
  return Math.min(trayWidth, Math.max(0, offset));
}

/**
 * Project the current reveal offset from where the tray was committed plus the
 * finger's horizontal travel. Dragging toward the inline-start (dx < 0) increases
 * the reveal; dragging back (dx > 0) decreases it. Always clamped to the boundaries.
 */
export function projectOffset(
  committed: number,
  dx: number,
  trayWidth: number,
): number {
  return clampOffset(committed - dx, trayWidth);
}

/** The two committed resting states of a tray. */
export type SwipeRest = "open" | "closed";

/**
 * Decide the resting state when the finger lifts: OPEN once the reveal has passed
 * the open-ratio of the tray width, otherwise snap back CLOSED. A zero-width tray
 * can never open.
 */
export function resolveRelease(
  offset: number,
  trayWidth: number,
  openRatio: number = DEFAULT_SWIPE_THRESHOLDS.openRatio,
): SwipeRest {
  if (!(trayWidth > 0)) {
    return "closed";
  }
  return offset >= trayWidth * openRatio ? "open" : "closed";
}

/* -------------------------------------------------------------------------- */
/* Single-open registry                                                        */
/* -------------------------------------------------------------------------- */

/** A revealed tray the registry can ask to close. */
export interface SwipeTrayHandle {
  readonly close: () => void;
}

/**
 * Enforces the "only one Card action tray open at a time" invariant. Opening a tray
 * closes whichever was open; closing clears it if it is still the active one. Pure
 * and self-contained (a closure over the single active handle), so it is unit-tested
 * in isolation; the Card layer uses ONE shared instance ({@link sharedSwipeRegistry}).
 */
export interface SwipeRegistry {
  /** Register `handle` as the open tray, closing any previously-open one. */
  open(handle: SwipeTrayHandle): void;
  /** Clear `handle` if it is the active tray (a no-op otherwise). */
  release(handle: SwipeTrayHandle): void;
  /** Close the active tray, if any (e.g. on navigation or a drawer opening). */
  closeActive(): void;
  /** The currently-open tray, or null. */
  active(): SwipeTrayHandle | null;
}

export function createSwipeRegistry(): SwipeRegistry {
  let activeTray: SwipeTrayHandle | null = null;
  return {
    open(handle) {
      if (activeTray !== null && activeTray !== handle) {
        const previous = activeTray;
        activeTray = handle;
        previous.close();
        return;
      }
      activeTray = handle;
    },
    release(handle) {
      if (activeTray === handle) {
        activeTray = null;
      }
    },
    closeActive() {
      const current = activeTray;
      activeTray = null;
      current?.close();
    },
    active() {
      return activeTray;
    },
  };
}

/**
 * The ONE process-wide registry the Card swipe layer shares, so a revealed tray in
 * any collection closes when another opens. Only ever touched from client pointer
 * handlers; never invoked during server rendering.
 */
export const sharedSwipeRegistry: SwipeRegistry = createSwipeRegistry();

/** Close any open Card action tray — used when a drawer opens or on navigation. */
export function closeActiveSwipeTray(): void {
  sharedSwipeRegistry.closeActive();
}

/* -------------------------------------------------------------------------- */
/* MOBILE-02 §4 — the ROW swipe: two directions, and a commit rather than a    */
/* tray                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A Task ROW's swipe is a different gesture from a Card's, and this is why it
 * has its own model beside the tray's rather than a flag on it.
 *
 * A Card reveals a TRAY: the surface slides, a row of buttons appears behind it,
 * and the tray stays open until one is pressed or something else closes it. That
 * is right for a card, which is tall enough to hold buttons and sparse enough
 * that one open tray is legible.
 *
 * A Task row is 45px in a list of fifty. A tray of 45px buttons on a 45px row is
 * a second row of controls the owner must then aim at, on the densest surface in
 * the product — and the single-open-tray registry means the previous row snaps
 * shut while the thumb is still moving. So a row COMMITS: pull past the
 * threshold, release, and the action fires. One gesture, one act, nothing left
 * open to tidy up.
 *
 * Both models share `resolveSwipeIntent` above, so "is this gesture horizontal
 * or is the page scrolling?" is decided in exactly one place for both.
 */

/**
 * Which edge a row swipe has revealed.
 *
 * Named for the EDGE rather than the direction of travel, because that is what
 * the owner sees: dragging the row towards the inline-end uncovers its
 * inline-start edge. Logical rather than left/right so the model is correct
 * under RTL without a second set of rules.
 */
export type RowSwipeEdge = "start" | "end";

export interface RowSwipeThresholds {
  /**
   * Net travel (px) before the gesture claims the horizontal axis. Below this in
   * both axes nothing moves, so a tap and a scroll's first pixels never begin a
   * swipe. Shared value with the Card tray's deadzone.
   */
  readonly intent: number;
  /**
   * Travel (px) past which RELEASING fires the edge's action.
   *
   * Deliberately most of a thumb's comfortable arc rather than a hair past the
   * deadzone: this gesture COMPLETES A TASK, and a 30px accidental commit on a
   * scrolling list would be the worst kind of destructive surprise. Below it the
   * row springs back and nothing happens.
   */
  readonly commit: number;
  /** The furthest the row will travel however hard it is pulled. */
  readonly max: number;
}

export const DEFAULT_ROW_SWIPE_THRESHOLDS: RowSwipeThresholds = {
  intent: 12,
  commit: 88,
  max: 132,
};

/**
 * The signed offset the row is DRAWN at for a given finger travel.
 *
 * Follows the finger exactly up to `commit`, then resists: past the commit point
 * only about a third of further travel is spent, up to `max`. The resistance is
 * the gesture's own statement that it has reached its end — the row stops
 * keeping up with the thumb, which is the same language a rubber-band scroll
 * uses, and it means a hard flick lands in the same place as a firm pull rather
 * than throwing the row off the screen.
 *
 * Positive is towards the inline-end (revealing the START edge).
 */
export function rowSwipeOffset(
  travel: number,
  thresholds: RowSwipeThresholds = DEFAULT_ROW_SWIPE_THRESHOLDS,
): number {
  const sign = travel < 0 ? -1 : 1;
  const distance = Math.abs(travel);
  if (distance <= thresholds.commit) {
    return sign * distance;
  }
  const resisted =
    thresholds.commit + (distance - thresholds.commit) * RESISTANCE;
  return sign * Math.min(resisted, thresholds.max);
}

/** How much of the travel past the commit point the row actually spends. */
const RESISTANCE = 0.35;

/**
 * Which edge's action a release at this offset fires, or `null` for none.
 *
 * Reads the DRAWN offset rather than the raw travel, so what the owner saw is
 * what decides: if the row is visibly past the commit point it commits, and if
 * it is not it does not. A gesture that fired on travel the row never showed
 * would be a commit with no visible cause.
 */
export function rowSwipeCommit(
  offset: number,
  thresholds: RowSwipeThresholds = DEFAULT_ROW_SWIPE_THRESHOLDS,
): RowSwipeEdge | null {
  if (Math.abs(offset) < thresholds.commit) {
    return null;
  }
  return offset > 0 ? "start" : "end";
}

/**
 * Whether the row is far enough along to be ARMED — the point where the
 * affordance stops being a hint and states that releasing will act.
 *
 * The same threshold as the commit, deliberately: the affordance changing and
 * the action firing must be the same line, or the row promises one thing and
 * does another.
 */
export function rowSwipeArmed(
  offset: number,
  thresholds: RowSwipeThresholds = DEFAULT_ROW_SWIPE_THRESHOLDS,
): boolean {
  return rowSwipeCommit(offset, thresholds) !== null;
}
