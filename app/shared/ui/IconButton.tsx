/**
 * DS-02 — the DalyHub IconButton.
 *
 * Before DS-02 an icon-only action was drawn about six different ways: the
 * card's `.dh-card__action`, the record header's `.record-action`, the overflow
 * trigger's own 40px circle, the editor toolbar's button, the mobile bar's
 * action and the inline-edit trigger. They agreed on hover only because
 * `base.css` had already been made to name all six in its state-layer host list
 * — which is a fix for the symptom.
 *
 * ── The accessible name is not optional, and not a prop you can forget ───────
 *
 * `label` is REQUIRED and becomes `aria-label`. An icon-only control with no
 * name is the single most common accessibility defect in a product like this
 * one, and the type system is the only place to make it impossible rather than
 * merely discouraged.
 *
 * ── The tooltip is the DESCRIPTION, never the name ───────────────────────────
 *
 * Passing `tooltip` composes the shared `Tooltip` (M3-TIP) around the control
 * and wires `aria-describedby`. The `aria-label` stays regardless, so a user
 * whose assistive technology does not announce descriptions still hears the
 * name. Passing `tooltip` alone with no `label` is not expressible.
 *
 * By default the tooltip repeats the label — which is exactly what an icon-only
 * control wants ("what is this button?") — so `tooltip` is a boolean-ish
 * convenience: `tooltip` shows the label, `tooltip="…"` shows something else.
 *
 * ── Shape ────────────────────────────────────────────────────────────────────
 *
 * A rounded square on `--dh-radius-control`, not a circle. The circle is M3's
 * icon-button shape and it is the reason a DalyHub toolbar of five icon buttons
 * read as a row of floating dots beside a rectangular text field. A square hit
 * area also packs into a dense row without the gaps a circle needs to not look
 * crowded.
 */

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import {
  Tooltip,
  composeRefs,
  type TooltipTriggerProps,
} from "~/shared/tooltip";

/**
 * `subtle` is the default and is what a toolbar or a row action should be:
 * no container until it is hovered. `outlined` is for an icon button that must
 * read as a control on its own (a stepper, a segmented neighbour). `danger`
 * tints the glyph, and still needs the tooltip to say what it does.
 */
export type IconButtonVariant = "subtle" | "outlined" | "danger";

/** Inline proportion. As with `Button`, height comes from density. */
export type IconButtonSize = "sm" | "md";

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> {
  /** The glyph. Always decorative — `label` carries the meaning. */
  readonly icon: ReactNode;
  /** The accessible name. Required: an icon is not a name. */
  readonly label: string;
  /**
   * Show a tooltip. `true` repeats `label`; a string overrides it for the case
   * the name is terse and the explanation is not.
   */
  readonly tooltip?: boolean | string;
  /** A keyboard shortcut in the shared `Mod-Shift-x` notation. */
  readonly shortcut?: string;
  readonly variant?: IconButtonVariant;
  readonly size?: IconButtonSize;
  /**
   * A toggle's on state. Rendered as `aria-pressed` AND as a real container
   * change, never as a colour alone.
   */
  readonly pressed?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon,
  label,
  tooltip,
  shortcut,
  variant = "subtle",
  size = "md",
  pressed,
  className,
  type = "button",
  ref,
  ...rest
}: IconButtonProps) {
  const classes = [
    "dh-icon-button",
    `dh-icon-button--${variant}`,
    size === "sm" ? "dh-icon-button--sm" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const control = (trigger?: TooltipTriggerProps) => (
    <button
      type={type}
      className={classes}
      aria-label={label}
      aria-pressed={pressed}
      // `composeRefs` so a caller's own ref survives the tooltip's measurement
      // ref — the trigger is measured where it actually renders.
      ref={
        trigger
          ? composeRefs<HTMLButtonElement>(
              ref,
              trigger.ref as Ref<HTMLButtonElement>,
            )
          : ref
      }
      aria-describedby={trigger?.describedBy}
      {...rest}
    >
      <span className="dh-icon-button__glyph" aria-hidden="true">
        {icon}
      </span>
    </button>
  );

  if (!tooltip) {
    return control();
  }

  return (
    <Tooltip label={tooltip === true ? label : tooltip} shortcut={shortcut}>
      {(trigger) => control(trigger)}
    </Tooltip>
  );
}
