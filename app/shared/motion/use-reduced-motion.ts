/**
 * DHDS-08 — the owner's reduced-motion preference, as a live boolean.
 *
 * Almost nothing should need this. Reduced motion in DalyHub is a CSS contract
 * (`base.css` zeroes durations; `motion.css` removes the travel), and a
 * component that branches on this hook when a media query would have done the
 * job has moved a presentational decision into React for no reason — the same
 * rule `use-compact-viewport` states.
 *
 * What it IS for: the timers. A component that keeps an exiting element mounted
 * for the length of its exit animation must not wait 140ms for an animation
 * that has been switched off, because the wait is real even when the motion is
 * not. {@link usePresence} is the only consumer in the product, and it uses this.
 *
 * Deliberately `false` on the server and until the first effect runs, matching
 * `useCompactViewport`: SSR emits the ordinary markup, the client corrects
 * after mount, and there is no hydration mismatch. Answering `false` early is
 * the safe direction — the CSS has already removed the motion regardless.
 */

import { useEffect, useState } from "react";

import { REDUCED_MOTION_QUERY } from "./motion";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setReduced(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return reduced;
}
