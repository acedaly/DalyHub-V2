/**
 * M3-01 — the shared chart primitives.
 *
 * Hand-rolled SVG, no charting dependency: each is a small typed component that
 * takes a data array and paints it with the design system's own chart tokens, so
 * every visualisation in DalyHub is correct in both appearances by construction
 * and none of them ships a runtime library.
 *
 * Every one carries `role="img"` and a generated text summary, because a chart
 * genuinely conveys information rather than decorating a number stated beside
 * it (AGENTS.md §15).
 */

export { ProgressRing, type ProgressRingProps } from "./ProgressRing";
