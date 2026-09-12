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
 * Drawn as a gradient pair in `base.css` rather than as an SVG asset, so it
 * takes `currentColor` and is correct in both appearances and in forced colours
 * by construction. `.dh-control--select` is what reserves the room for it and is
 * the only rule this control still keeps in a stylesheet.
 *
 * ── UNTITLED-11 — the BOX is Untitled's, exactly as the input's is ──────────
 *
 * A select and a text field standing next to each other in one filter row are
 * the same family or the design has failed, so they take the same recipe from
 * the same place: `inputClassName()`, which is Untitled's `base/input` box. The
 * select adds only what is genuinely its own — the chevron's inline-end room and
 * the pointer cursor.
 */

import type { ReactNode, Ref, SelectHTMLAttributes } from "react";

import { inputClassName } from "./Input";

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
      className={inputClassName({
        className: `dh-control--select cursor-pointer pe-8 ${className ?? ""}`,
      })}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}
