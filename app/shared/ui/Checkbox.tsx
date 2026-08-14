/**
 * DS-02 — the DalyHub Checkbox.
 *
 * ── D7 is preserved, and this is the SQUARE half of it ───────────────────────
 *
 * DalyHub genuinely has two acts and draws them differently: *completing* a
 * task is a CIRCLE (the task row's own control, DS-04's), and *selecting* a row
 * is a SQUARE. This primitive is the square — selection, options, settings,
 * filters. It does not know what a task is and must not grow a `completed`
 * variant; that is a product rule and it lives in the product.
 *
 * ── Native, styled ───────────────────────────────────────────────────────────
 *
 * A real `<input type="checkbox">`. Space toggles it, the label is the target,
 * `indeterminate` is a DOM property the browser paints, forced-colours mode
 * draws it, and a form submits it. What `ui.css` restyles is the box and the
 * tick — `appearance: none` plus a drawn mark, which is the one place the
 * product accepts a bespoke rendering because the user-agent checkbox has no
 * design tokens at all.
 *
 * ── Indeterminate ────────────────────────────────────────────────────────────
 *
 * `indeterminate` is not an attribute — it is a property, and React does not
 * set it from JSX. The ref callback below is the whole reason this component
 * exists rather than a bare styled input: a "select all" checkbox in a
 * collection header is the most common place the mixed state is needed, and
 * every call site was otherwise going to write the same `useEffect`.
 *
 * ── No animation ─────────────────────────────────────────────────────────────
 *
 * The tick appears; it does not draw itself in over 300ms. Completing tasks is
 * a high-frequency, repeated act, and a decorative stroke animation on it is a
 * tax paid once per task forever. The only transition is the container colour,
 * and `prefers-reduced-motion` removes that too.
 */

import { useCallback } from "react";
import type { InputHTMLAttributes, ReactNode, Ref } from "react";

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "size"
> {
  /**
   * The visible label. Rendered inside the `<label>` that wraps the control, so
   * the whole run is the target and no `htmlFor`/`id` pair can drift.
   *
   * Omit it ONLY where the control's name comes from elsewhere (a row whose
   * title names it), and pass `aria-label` in that case.
   */
  readonly label?: ReactNode;
  /** The mixed state, for a parent controlling a set of children. */
  readonly indeterminate?: boolean;
  /** Supporting text under the label. */
  readonly description?: ReactNode;
  readonly ref?: Ref<HTMLInputElement>;
}

export function Checkbox({
  label,
  description,
  indeterminate,
  className,
  ref,
  ...rest
}: CheckboxProps) {
  const setNode = useCallback(
    (node: HTMLInputElement | null) => {
      if (node) node.indeterminate = indeterminate ?? false;
      if (typeof ref === "function") ref(node);
      else if (ref)
        (ref as { current: HTMLInputElement | null }).current = node;
    },
    [indeterminate, ref],
  );

  const input = (
    <input
      type="checkbox"
      className="dh-checkbox__control"
      ref={setNode}
      // `mixed` rather than `true`/`false` while indeterminate, so the state a
      // screen reader announces matches the one the eye is shown.
      aria-checked={indeterminate ? "mixed" : undefined}
      {...rest}
    />
  );

  if (label === undefined && description === undefined) {
    return (
      <span className={["dh-checkbox", className].filter(Boolean).join(" ")}>
        {input}
      </span>
    );
  }

  return (
    <label
      className={["dh-checkbox", "dh-checkbox--labelled", className]
        .filter(Boolean)
        .join(" ")}
    >
      {input}
      <span className="dh-checkbox__text">
        {label !== undefined ? (
          <span className="dh-checkbox__label">{label}</span>
        ) : null}
        {description !== undefined ? (
          <span className="dh-checkbox__description">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
