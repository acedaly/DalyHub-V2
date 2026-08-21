/**
 * DHDS-08 — the public entry for DalyHub's motion machinery.
 *
 * Deliberately tiny. The motion SYSTEM is CSS: `tokens.css` publishes the
 * vocabulary and `motion.css` publishes the grammar, and a surface adopts a
 * motion by naming a class. Everything exported here exists only because
 * React's removal timing cannot be expressed in a stylesheet.
 *
 * If you are reaching for this module to make something animate, you are
 * probably in the wrong place — read `app/styles/motion.css` first.
 */

export {
  DH_MOTION_BASE_MS,
  DH_MOTION_DELIBERATE_MS,
  DH_MOTION_EXIT_MS,
  REDUCED_MOTION_QUERY,
  prefersReducedMotion,
} from "./motion";
export { useReducedMotion } from "./use-reduced-motion";
export { usePresence, type Presence } from "./use-presence";
