/**
 * DHDS-08 — keeping an element mounted long enough to leave.
 *
 * React unmounts immediately. CSS cannot animate an element that is no longer
 * in the document. So an exit animation needs ONE piece of machinery: something
 * that holds the element in the tree for the length of its exit, marks it
 * `data-dh-exit="true"` so `motion.css` runs the exit keyframe, and then lets
 * it go.
 *
 * This is that machinery, and it is deliberately the only one in the product.
 * §22 warns against inventing a generic animation abstraction to prove one
 * exists; this is not that. It has a single product semantic — "this surface is
 * closing" — and it exists because React's removal timing genuinely requires
 * it, which is the exact exception §22 names.
 *
 * ── What it is NOT ──────────────────────────────────────────────────────────
 * It never delays the CLOSE. By the time a consumer flips `open` to `false` the
 * decision has already been taken, the focus has already been restored by the
 * owning component, and any mutation has already been posted. What lingers is
 * pixels. Nothing is awaited on this, and no interactivity depends on it: an
 * exiting surface is marked `inert` by its host so it cannot be tabbed into or
 * clicked while it fades.
 *
 * ── Reduced motion ──────────────────────────────────────────────────────────
 * There is no exit animation to wait for, so there is no wait: the element
 * unmounts on the same tick, exactly as it did before DHDS-08. The wait is real
 * even when the motion is not, which is why this branches in JavaScript rather
 * than relying on the CSS alone.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   const { mounted, exiting } = usePresence(open);
 *   if (!mounted) return null;
 *   return <div className="dh-motion-lift" data-dh-exit={exiting || undefined} …/>
 *
 * `data-dh-exit` is emitted as `"true"` or omitted entirely — never `"false"` —
 * because `motion.css` selects on `[data-dh-exit="true"]` and a stray `"false"`
 * in the DOM is a value that reads as if it meant something.
 */

import { useEffect, useRef, useState } from "react";

import { DH_MOTION_EXIT_MS } from "./motion";
import { useReducedMotion } from "./use-reduced-motion";

export interface Presence {
  /** Keep rendering? True while open, and while the exit is still running. */
  readonly mounted: boolean;
  /** True only during the exit. Drives `data-dh-exit` and `inert`. */
  readonly exiting: boolean;
}

export function usePresence(
  open: boolean,
  durationMs: number = DH_MOTION_EXIT_MS,
): Presence {
  const reducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  /*
   * The pending unmount, held so a REOPEN can cancel it. Without this, opening
   * a surface within the exit window would schedule an unmount that then fires
   * against the newly-open surface and blanks it — the classic double-toggle
   * bug in every hand-rolled version of this hook.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
   * `mounted` as a ref as well as state, because the effect below has to ASK
   * whether anything is on screen before deciding to animate it away, and
   * reading that from the state value would make the effect depend on its own
   * output — re-running the close path every time the exit changed it.
   */
  const mountedRef = useRef(open);

  useEffect(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (open) {
      mountedRef.current = true;
      setMounted(true);
      setExiting(false);
      return;
    }

    // Closing something that was never open must not run an exit.
    if (!mountedRef.current) return;

    if (reducedMotion || durationMs <= 0) {
      mountedRef.current = false;
      setExiting(false);
      setMounted(false);
      return;
    }

    setExiting(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      mountedRef.current = false;
      setExiting(false);
      setMounted(false);
    }, durationMs);
  }, [open, reducedMotion, durationMs]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  return { mounted, exiting };
}
