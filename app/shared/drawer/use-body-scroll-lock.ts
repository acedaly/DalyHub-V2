/**
 * DS-03 — lock page scrolling while a modal drawer is open, preserving position.
 *
 * When `active`, the page behind the drawer must not scroll (the drawer's own
 * content scrolls independently) AND must not lose the user's place. We disable
 * scrolling with `overflow: hidden` on the root scroll container and compensate the
 * scrollbar width so the viewport-fixed drawer does not shift when the page
 * scrollbar disappears. On release the captured offset is REASSERTED across the
 * following frames, because closing dismisses the drawer with a history POP and
 * React Router's `ScrollRestoration` applies its own scroll on that POP — sometimes
 * on a later tick than a single rAF. Combined with the app's path-keyed
 * `ScrollRestoration` (ADR-018 §18.6), this makes scroll preservation
 * deterministic. It runs as a layout effect so the freeze and the release happen in
 * the same commit, and every mutated value is restored, so nothing leaks.
 *
 * ── MOBILE-04: the freeze is ONE page-wide lock, and it captures ONCE ────────
 * MEASURED on a 390x844 phone against `/tasks`: scroll to `y = 1000`, open the
 * first row's drawer, close it with Back. **Four of five round trips came back at
 * 0.** The fifth only succeeded because the measuring harness added enough round
 * trips to change the timing, which is the signature of a race rather than of a
 * working restore.
 *
 * The cause is a clamp that no script performs, and the hook believing it.
 * Instrumented from before the app's own code ran (so the timing is the owner's,
 * not the harness's), the failing open reads:
 *
 *     …        the list sits at y=1000, document 8348px tall
 *     …        the drawer's open navigation revalidates the route, so the
 *              collection renders short for a moment and the browser CLAMPS the
 *              offset to 0. No `scrollTo`, no `scrollTop` — nothing to trace,
 *              because nothing was called
 *     …        this freeze's layout effect runs INSIDE that window and reads
 *              `window.scrollY` as 0: "the owner was at the top"
 *     t=5862ms ScrollRestoration calls scrollTo(0, 1000) — correct
 *     t=5996ms this hook calls scrollTo(0, 0) — and wins, 134ms later
 *
 * React Router had it right and the hook overruled it. Three things follow, and
 * the third is the one that actually fixes it:
 *
 *   1. **The freeze is page-wide and captures once.** A `Sheet` opened over a
 *     `Drawer` joins the existing freeze by reference count rather than
 *     capturing its own offset, so two overlays cannot disagree about where the
 *     page was — the same reason `Sheet` keeps its open-sheet stack
 *     module-scoped rather than one flag per sheet.
 *   2. **A release that has not landed yet still owns the offset.** React runs
 *     an old cleanup BEFORE the new effect, so a re-mount takes the depth to
 *     zero in between and the count alone would not save it.
 *     {@link pendingRestore} keeps the captured offset readable until it has
 *     stuck, and a lock starting in that window adopts it instead of reading a
 *     `window.scrollY` that is still clamped.
 *   3. **An origin of (0, 0) is never reasserted at all.** See the guard in
 *     the release below: 0 is also what the failure looks like, so reasserting
 *     it can only hold a page that needs no help or destroy a restore that was
 *     already right.
 *
 * Stated as one property: **while the page is frozen or is being put back, the
 * DOM's current offset is not the owner's position, and nothing may act on it as
 * though it were.**
 *
 * MEASURED after: the same five round trips restore to 1000 five times out of
 * five, within 739–950ms of the Back.
 */

import { useEffect, useLayoutEffect } from "react";

// `useLayoutEffect` warns during SSR; fall back to `useEffect` on the server, where
// there is no scrolling to lock anyway.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Reassert until the offset has held for this many consecutive frames.
 *
 * Only frames in which the offset ALREADY equals the target count, so this is
 * "it stayed put once it could", not "four frames elapsed".
 */
const STABLE_FRAMES = 4;

/**
 * The wall-clock bound on reasserting, after which the page is left where it is.
 *
 * Sized against what is actually being waited for: a POP revalidation's loader
 * round trip plus the layout pass that follows it, because until the list has its
 * rows back the document is too short to hold the offset and every `scrollTo` is
 * clamped. The loop exits the moment the offset sticks, so a fast close pays none
 * of this; a page that genuinely never grows back — the row was deleted from
 * inside the drawer, so the list really is shorter — gives up at the bound and
 * sits wherever it can, which is the honest answer rather than an infinite loop.
 *
 * It replaced a fixed 24-frame budget, which expired while the page was still
 * short and was the second reason the measured restore gave up at 0.
 */
const REASSERT_TIMEOUT_MS = 1_500;

/** The page-wide freeze: how many overlays are holding it, and from where. */
type PageFreeze = {
  depth: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly previousRootOverflow: string;
  readonly previousBodyPaddingRight: string;
};

let freeze: PageFreeze | null = null;

/**
 * The offset a release is still trying to restore, or null once it has stuck.
 *
 * A freeze collapses the document, so `window.scrollY` reads 0 for as long as the
 * page is frozen AND for however long the restore takes afterwards. Any lock that
 * starts inside that window must not read the DOM — it would capture the 0 and
 * later enforce it, which is precisely the defect this file's header measures.
 * Holding the offset here until the restore has verifiably landed gives such a
 * lock something true to adopt.
 *
 * It is cleared when the reassertion succeeds, and also when it gives up, so a
 * page that genuinely shrank does not hand a stale offset to the next overlay.
 */
let pendingRestore: {
  readonly scrollX: number;
  readonly scrollY: number;
} | null = null;

/**
 * Freeze the page, or join a freeze that is already held.
 *
 * Returns a release function that is safe to call more than once. The offset is
 * read here and ONLY here, before `overflow: hidden` is applied — which is what
 * makes it the offset the owner was actually at rather than the 0 the browser
 * clamps to once the document collapses.
 */
function holdPageFreeze(): () => void {
  if (freeze) {
    freeze.depth += 1;
  } else {
    const root = document.documentElement;
    const { body } = document;
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    freeze = {
      depth: 1,
      // A restore still in flight is the authority on where the owner is; the
      // DOM is not, because it is still clamped. See `pendingRestore`.
      scrollX: pendingRestore?.scrollX ?? window.scrollX,
      scrollY: pendingRestore?.scrollY ?? window.scrollY,
      previousRootOverflow: root.style.overflow,
      previousBodyPaddingRight: body.style.paddingRight,
    };
    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  let released = false;
  return () => {
    // Idempotent: React can invoke a cleanup once, and a caller should not have to
    // reason about whether it might be invoked again.
    if (released || !freeze) return;
    released = true;
    freeze.depth -= 1;
    if (freeze.depth > 0) {
      // An overlay is still open — the page stays frozen and stays put.
      return;
    }
    const { scrollX, scrollY, previousRootOverflow, previousBodyPaddingRight } =
      freeze;
    freeze = null;

    document.documentElement.style.overflow = previousRootOverflow;
    document.body.style.paddingRight = previousBodyPaddingRight;

    /*
     * MOBILE-04 — a captured origin of exactly (0, 0) is never reasserted.
     *
     * This is the clause that stops the hook destroying a correct restore, and
     * it comes straight out of the measurement. Opening a drawer revalidates the
     * route, so for a moment the collection renders short; the browser then
     * CLAMPS the offset to 0 with no scripted call at all, and the freeze's
     * layout effect — running in that window — reads 0 as "where the owner was".
     * Instrumented on the failing run:
     *
     *     t=5862ms  ScrollRestoration scrollTo(0, 1000)   (page was at 0)
     *     t=5996ms  this hook          scrollTo(0, 0)     (page was at 1000)
     *
     * React Router had it right and the hook overruled it 134ms later.
     *
     * The guard works because of an asymmetry rather than a heuristic: an origin
     * of 0 is ALSO what the failure looks like, and reasserting it can only ever
     * do one of two things — hold a page that is already at the top, which needs
     * no help, or drag a correctly-restored page back to the top, which is the
     * defect. There is nothing it can do that is both useful and true. Every
     * non-zero origin is still reasserted exactly as before, which is the case
     * the reassertion was added for.
     */
    if (scrollX === 0 && scrollY === 0) return;

    pendingRestore = { scrollX, scrollY };
    const deadline = Date.now() + REASSERT_TIMEOUT_MS;
    let stable = 0;
    const finish = () => {
      // Only clear the offset we ourselves published. A lock that started during
      // this restore has already adopted it and now owns the page's position, so
      // clearing another freeze's value here would strand it.
      if (
        pendingRestore?.scrollY === scrollY &&
        pendingRestore.scrollX === scrollX
      ) {
        pendingRestore = null;
      }
    };
    const reassert = () => {
      // A new overlay opened mid-restore and re-froze the page. It adopted this
      // offset, so it will restore it on ITS release; continuing to scroll now
      // would only fight the freeze.
      if (freeze) return;
      if (window.scrollX === scrollX && window.scrollY === scrollY) {
        stable += 1;
        if (stable >= STABLE_FRAMES) {
          finish();
          return;
        }
        window.requestAnimationFrame(reassert);
        return;
      }
      // Not there yet. Ask again — and if the document is still too short to
      // accept the offset, the browser clamps this call, which is exactly why the
      // frame does not count towards stability.
      window.scrollTo(scrollX, scrollY);
      stable = 0;
      if (Date.now() < deadline) {
        window.requestAnimationFrame(reassert);
      } else {
        // Gave up: the page never grew back to hold the offset. Do not leave a
        // stale position for the next overlay to adopt.
        finish();
      }
    };
    reassert();
  };
}

export function useBodyScrollLock(active: boolean): void {
  useIsomorphicLayoutEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }
    return holdPageFreeze();
  }, [active]);
}
