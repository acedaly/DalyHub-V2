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
 * ── UNTITLED-11 — it is Untitled's icon button now ──────────────────────────
 *
 * The last generic primitive DalyHub was still painting itself. The markup has
 * always been right; the PAINT came from `.dh-icon-button*` in `ui.css` over the
 * legacy `--dh-color-*` family, plus a `currentColor` state layer from
 * `base.css` — whose own comment named this control as the one remaining full
 * host "because it has not been rebuilt on Untitled yet".
 *
 * It is rebuilt on `base/buttons/button-utility` — Untitled's canonical
 * icon-only control — by composing that component's OWN EXPORTED `styles`
 * together with its geometry, the same device `buttonClassName` uses for the
 * text button. So an icon button and a text button beside it now come from one
 * source, and the state layer is gone: Untitled draws hover as a real container
 * change and focus as its own ring, and a `currentColor` wash on top of those is
 * a SECOND hover state rather than the one shared one.
 *
 * What is NOT upstream's, and why each one stays:
 *
 *   - **The accessible name.** Untitled's control takes `tooltip` and uses it as
 *     the `aria-label`, so a button with no tooltip has no name. Here `label` is
 *     REQUIRED and the tooltip is a separate, optional DESCRIPTION. An icon-only
 *     control with no name is the single most common accessibility defect in a
 *     product like this one, and the type system is the only place to make it
 *     impossible rather than merely discouraged.
 *   - **The touch floor.** Upstream is `h-max p-1.5` — about 32px around a 20px
 *     glyph, which is right for a desktop toolbar and below DalyHub's coarse-
 *     pointer minimum. Both axes take `--dh-control-height`, so the hit area is
 *     the control height in both directions (AGENTS.md §15; the brief's §42 is
 *     explicit that Untitled's desktop dimensions are not assumed sufficient).
 *   - **`pressed`.** Upstream has no toggle state. It is `aria-pressed` AND a
 *     real container change, never a colour alone.
 *   - **`danger`.** Upstream has `secondary` and `tertiary` only. This is the
 *     tertiary recipe with Untitled's own error foreground roles — a DalyHub
 *     semantic extension, not a second palette.
 *   - **The shared `Tooltip`.** DalyHub's carries the `Mod-Shift-x` shortcut
 *     notation and wires `aria-describedby`; upstream's is a title-only
 *     React Aria tooltip. Swapping it would take the shortcut away from every
 *     call site that shows one.
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
 * A rounded square on Untitled's `rounded-md`, not a circle. The circle is M3's
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
import { styles as untitledUtilityStyles } from "~/shared/ui/untitled/base/buttons/button-utility";
import { cx } from "~/shared/ui/untitled/utils/cx";

/**
 * `subtle` is the default and is what a toolbar or a row action should be:
 * no container until it is hovered. `outlined` is for an icon button that must
 * read as a control on its own (a stepper, a segmented neighbour). `danger`
 * tints the glyph, and still needs the tooltip to say what it does.
 */
export type IconButtonVariant = "subtle" | "outlined" | "danger";

/** Inline proportion. As with `Button`, height comes from density. */
export type IconButtonSize = "sm" | "md";

/**
 * The DalyHub variant, as Untitled's utility-button colour.
 *
 * `danger` has no upstream colour: it composes the `tertiary` recipe with
 * Untitled's error foreground roles, below.
 */
const UNTITLED_COLORS = {
  subtle: "tertiary",
  outlined: "secondary",
  danger: "tertiary",
} as const;

/**
 * Untitled's own geometry for `ButtonUtility`, copied from its source with the
 * two DalyHub differences stated at the top of this file: the hit area is the
 * control height in both axes rather than `h-max p-1.5`, and there is no
 * `group` — nothing here targets a parent's hover.
 */
const UNTITLED_GEOMETRY =
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md " +
  "outline-focus-ring transition duration-100 ease-linear motion-reduce:transition-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "min-w-[var(--dh-control-height)] min-h-[var(--dh-control-height)]";

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

/**
 * The class list, so an element that cannot BE this component — a menu trigger
 * that must forward a React Aria prop set, a `<label>` acting as a file picker —
 * gets the identical paint from the identical source. The same reason
 * `buttonClassName` exists beside `Button`.
 */
export function iconButtonClassName(options: {
  readonly variant?: IconButtonVariant;
  readonly size?: IconButtonSize;
  readonly pressed?: boolean;
  readonly className?: string;
}): string {
  const { variant = "subtle", size = "md", pressed, className } = options;
  return cx(
    UNTITLED_GEOMETRY,
    untitledUtilityStyles[UNTITLED_COLORS[variant]],
    // Upstream sizes the glyph through `*:data-icon:size-*`; DalyHub's icons are
    // plain SVG children, so the inset is what sets the proportion instead.
    size === "sm" ? "p-1" : "p-1.5",
    variant === "danger" &&
      "text-fg-error-secondary hover:bg-error-primary hover:text-fg-error-primary",
    /*
     * The toggle's ON state: the Untitled ACTIVE surface and the brand
     * foreground. A real container change, so it survives forced colours and is
     * visible without a pointer.
     */
    pressed && "bg-active text-fg-brand-primary",
    className,
  );
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
  const classes = iconButtonClassName({ variant, size, pressed, className });

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
      <span
        className="inline-flex size-[var(--dh-icon-size)] items-center justify-center"
        aria-hidden="true"
      >
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
