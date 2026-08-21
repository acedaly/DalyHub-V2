/**
 * DHDS-08 — the motion vocabulary, as values JavaScript can hold.
 *
 * `app/styles/tokens.css` is the authority; this module mirrors the two rungs
 * that a TIMER has to know about, because a React component that keeps an
 * exiting element mounted has to know for how long, and a CSS custom property
 * cannot be read before the element exists.
 *
 * Only the durations that drive REMOVAL are mirrored. Everything else — every
 * curve, every duration a transition uses — stays in CSS and is never restated
 * here, because two copies of a value are two values.
 *
 * `test/unit/motion/motion-tokens.test.ts` asserts these against the stylesheet
 * so the mirror cannot drift.
 */

/** `--dh-motion-exit` — how long a surface takes to leave. */
export const DH_MOTION_EXIT_MS = 140;

/** `--dh-motion-base` — the standard interface transition, and a disclosure. */
export const DH_MOTION_BASE_MS = 200;

/**
 * `--dh-motion-deliberate` — the longest transition the system publishes, and
 * the length of a completed row's departure.
 */
export const DH_MOTION_DELIBERATE_MS = 260;

/** The media query that expresses the owner's reduced-motion preference. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Does this device ask for reduced motion, right now?
 *
 * Answers `false` where there is no `matchMedia` (the server, an old engine),
 * which is the safe direction: the caller then runs its ordinary path, and the
 * CSS in `base.css` and `motion.css` still removes the motion itself. Nothing
 * in DalyHub depends on this returning `true` for the interface to be correct
 * — it only shortens timers.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
