/**
 * DS-02 — the DalyHub Select.
 *
 * ── D31 is load-bearing, and this does not touch it ──────────────────────────
 *
 * A `<select>` is REPAINTED, never replaced. This component renders a real
 * `<select>` with real `<option>` children, which is what keeps:
 *
 *   - the platform picker on touch (the iOS wheel, the Android dialog);
 *   - the free keyboard behaviour — type-ahead, Home/End, Alt+Down, and the
 *     platform's own list navigation, none of which a bespoke listbox gets
 *     right without several hundred lines;
 *   - the assistive-technology semantics, which are the ones every screen
 *     reader has special-cased for thirty years;
 *   - the no-JS form submit.
 *
 * The brief's audit list for this control — options must not clip, the selected
 * value stays obvious, full lists stay reachable, keyboard navigation works,
 * placement is predictable, long lists scroll — is the list of things the
 * NATIVE control gets right for free and a hand-rolled one gets wrong. The
 * failure mode DS-02 is guarding against is a bespoke popup that clips inside
 * an `overflow: hidden` ancestor; a native picker is drawn by the OS, outside
 * the document, and cannot.
 *
 * What DS-02 changes is only how the CLOSED control is painted: the height, the
 * radius, the border and the chevron, so a select in a filter row and an input
 * beside it are visibly the same family. `appearance: none` changes nothing
 * else — that is the whole of UIX-06's finding and it still holds.
 *
 * ── The chevron ──────────────────────────────────────────────────────────────
 *
 * Drawn as a gradient pair in `ui.css` rather than as an SVG asset, so it takes
 * `currentColor` and is correct in both appearances and in forced colours by
 * construction. Inherited from the control baseline; restated here only at the
 * DalyHub rung.
 */

import type { ReactNode, Ref, SelectHTMLAttributes } from "react";

export interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size"
> {
  readonly invalid?: boolean;
  /** The `<option>` list. Plain children, because it is a plain `<select>`. */
  readonly children: ReactNode;
  readonly ref?: Ref<HTMLSelectElement>;
}

export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <select
      className={["dh-control", "dh-control--select", className]
        .filter(Boolean)
        .join(" ")}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}
