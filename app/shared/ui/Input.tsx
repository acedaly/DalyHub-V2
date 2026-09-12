/**
 * DS-02 — the DalyHub text-entry primitives.
 *
 * `TextField` (`~/shared/forms`) is the FIELD: a label, a control, helper text,
 * an error and the association between them. It stays exactly as it is — DS-01
 * classified it KEEP + RESTYLE and it is the right abstraction for a form, and
 * it already composes the controls below.
 *
 * These are the bare CONTROLS underneath it, for the places a field wrapper is
 * wrong: a search box in a toolbar, a filter row's inline entry, a dialog's
 * single question, an inline editor.
 *
 * ── UNTITLED-11 — where the paint comes from now ────────────────────────────
 *
 * PR #285 recorded `~/shared/ui/Input` as "still legacy-painted", and it was:
 * the height, the border, the radius, the focus ring, the invalid and disabled
 * states all came from `:is(.dh-control, .dh-input)` in `ui.css`, over the
 * legacy `--surface` / `--border-strong` / `--ink-*` family. Modules had started
 * routing around it — the Goal record's measurement sheet reaches past this
 * component to Untitled's `InputBase` directly, with a comment explaining that
 * `.dh-input` is unlayered and "repainted the control's height, radius and focus
 * ring" over the migrated control. That is two field systems in one product, and
 * the second one was winning by accident of cascade order.
 *
 * The recipe is Untitled's `base/input` now — its radius, its `bg-primary`, its
 * `shadow-xs`, its inset ring, its `ring-2 ring-brand` focus, its
 * `ring-error_subtle` invalid state and its `text-placeholder` — and every one
 * of those is a semantic role, so a field follows the appearance switch and the
 * generated Branded Plum ramp with nothing to keep in step.
 *
 * ── One ELEMENT, not Untitled's Group wrapper, and why ──────────────────────
 *
 * Upstream's `InputBase` puts the box on a React Aria `Group` around the input,
 * with the input transparent inside it. Adopting that shape would change the DOM
 * of every text control in the product at once — and roughly twenty module
 * stylesheets carry LAYOUT rules keyed on `.dh-input` (`flex: 1`, a grid span, a
 * width), which would then size the inner input instead of the box it sits in.
 *
 * The recipe transfers to a single element without loss: Untitled's box is drawn
 * with an INSET RING rather than a border, which is exactly as expressible on an
 * `<input>` as on a wrapper. So the paint is genuinely upstream's and no
 * consumer's markup moves. The one thing the wrapper is still needed for is a
 * leading glyph, which is what `Input`'s `leading` slot draws — and Untitled
 * does the same thing inside its own Group.
 *
 * ── `inputClassName()` is the bridge the sweep needs ────────────────────────
 *
 * About twenty module call sites render a bare `<input className="dh-input">`
 * rather than going through this component. The same problem `Button` had with
 * 201 `dh-btn` literals, and the same answer: an exported class builder, so an
 * element that cannot BE this component gets the identical paint from the
 * identical source. `dh-input` and `dh-control` are still EMITTED — those
 * stylesheets' layout rules are real — but neither carries paint any more.
 *
 * ── The density height and the anti-zoom floor are DalyHub's ────────────────
 *
 * Untitled sizes a field by padding alone. DalyHub sizes it by
 * `--input-height`, which the density system moves, and floors the font at 16px
 * on a touch pointer so iOS does not zoom the page when a field takes focus
 * (MOBILE-01). Both are stated here as the one place they live.
 */

import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  TextareaHTMLAttributes,
} from "react";
import {
  Input as AriaInput,
  TextArea as AriaTextArea,
} from "react-aria-components";

import { cx } from "~/shared/ui/untitled/utils/cx";

/**
 * Untitled's `base/input` box, on the control itself.
 *
 * Copied from `InputBase`'s own `AriaGroup` recipe, with `border` replaced by
 * the inset ring it already uses and the focus/invalid arms expressed as
 * pseudo-class variants rather than as React Aria render props — the component
 * below is a plain element, so it has no render-prop state to read.
 */
const UNTITLED_FIELD = cx(
  // `border-0` because the box is the RING: `base.css`'s control floor gives
  // every native field a real border, and leaving it would draw Untitled's ring
  // and the legacy hairline one pixel apart.
  "m-0 box-border w-full max-w-full border-0 rounded-lg bg-primary text-primary shadow-xs",
  "ring-1 ring-primary ring-inset outline-hidden",
  "transition-shadow duration-100 ease-linear motion-reduce:transition-none",
  "placeholder:text-placeholder placeholder:opacity-100",
  // The border IS the focus indicator for a text field; a second outline ring
  // outside it says the same thing twice.
  "focus:ring-2 focus:ring-brand focus-visible:outline-hidden",
  "aria-[invalid=true]:ring-error_subtle aria-[invalid=true]:focus:ring-2 aria-[invalid=true]:focus:ring-error",
  "disabled:cursor-not-allowed disabled:opacity-50",
  /*
   * Read-only is legible and inert-looking but NOT disabled, and the two must
   * not look alike: a quiet ground against `disabled`'s transparency. It used to
   * be a dashed border in `forms.css`, which a ring cannot express.
   *
   * `[readonly]`, NOT Tailwind's `read-only:` variant. CSS `:read-only` means
   * "not user-editable", and a `<select>` satisfies it ALWAYS — so the variant
   * greyed the ground of every select in the product. Caught on
   * `/design/primitives`, where the select sat on a quiet ground beside white
   * inputs. The attribute selector matches only a field actually marked
   * read-only, which is what the state means here.
   */
  "[&[readonly]]:cursor-default [&[readonly]]:bg-secondary",
);

/**
 * The DalyHub proportions: the density height, the field inset, and the
 * anti-zoom floor. `--input-height` and `--app-field-font-size-compact` are
 * published once in `tokens.css`; naming them here rather than restating their
 * values is what keeps the floor a single fact about iOS.
 */
const DALYHUB_FIELD_METRICS = cx(
  "min-h-[var(--input-height)] px-[var(--field-padding-inline)] py-0",
  "text-[length:var(--app-field-font-size-compact)] leading-[1.4]",
);

/**
 * The class list for a text control, so an element that cannot BE `Input` — a
 * bare `<input>` in a module, an `<input>` a third-party control owns — gets the
 * identical paint from the identical source.
 *
 * `dh-control` and `dh-input` are emitted as LAYOUT bridges, not as paint: about
 * twenty module stylesheets size a field by naming one of them, and those rules
 * are the module's own composition rather than a second control design.
 */
export function inputClassName(options?: {
  readonly multiline?: boolean;
  readonly className?: string;
}): string {
  const { multiline = false, className } = options ?? {};
  return cx(
    UNTITLED_FIELD,
    DALYHUB_FIELD_METRICS,
    multiline &&
      // Three rungs of the control height, so a multi-line field looks like one
      // before it is typed in — and VERTICAL resize only: a textarea dragged
      // wider than its column breaks the form grid and nothing is gained.
      "min-h-[var(--textarea-min-height)] resize-y py-[var(--field-padding-block)]",
    "dh-control",
    multiline && "dh-control--multiline",
    "dh-input",
    multiline && "dh-input--multiline",
    className,
  );
}

/** How a control reports a validation failure. */
type InvalidProps = {
  /**
   * Marks the control invalid. Renders `aria-invalid`, which is what actually
   * associates the state with assistive technology — the tint is reinforcement.
   * A caller showing an error message must also point `aria-describedby` at it;
   * `TextField` does that for you and is the better choice inside a form.
   */
  readonly invalid?: boolean;
};

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">, InvalidProps {
  /**
   * A leading glyph inside the control (a search magnifier). Decorative — the
   * control keeps its own label. Renders an inline-start slot and insets the
   * text; without it the control has no wrapper at all.
   */
  readonly leading?: ReactNode;
  readonly ref?: Ref<HTMLInputElement>;
}

export function Input({ invalid, leading, className, ...rest }: InputProps) {
  const control = (extra?: string) => (
    <AriaInput
      className={inputClassName({ className: cx(extra, className) })}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );

  if (!leading) return control();

  return (
    /*
     * The leading-glyph wrapper. A plain element, not React Aria's `TextField`.
     *
     * UNTITLED-11 — the `TextField` wrapper used to be here (and around the
     * bare control too) purely so its render-prop state could drive the styling.
     * It cannot any more and does not need to: the box is Untitled's recipe,
     * whose invalid, disabled and read-only arms read `aria-invalid`, `:disabled`
     * and `:read-only` off the control itself.
     *
     * Removing it also fixes a real defect it caused. React Aria's `TextField`
     * OWNS the value of the input inside it, so a caller's `defaultValue` on the
     * control was silently discarded — visible on `/design/primitives`, where the
     * invalid, disabled and read-only demos all rendered empty. Nothing in the
     * product hit it because product fields are controlled, which is exactly how
     * a defect like that survives.
     */
    <span className="dh-control-affix relative flex w-full items-center">
      {/*
       * Positioned exactly as Untitled positions its own `icon` inside
       * `InputBase`: absolute, `text-fg-quaternary`, and inert to the pointer so
       * a click lands in the field rather than on the picture.
       */}
      <span
        className="pointer-events-none absolute inline-flex size-[var(--dh-icon-size)] items-center text-fg-quaternary"
        style={{ insetInlineStart: "var(--field-padding-inline)" }}
        aria-hidden="true"
      >
        {leading}
      </span>
      {control(
        "ps-[calc(var(--field-padding-inline)+var(--dh-icon-size)+var(--dh-space-2))]",
      )}
    </span>
  );
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>, InvalidProps {
  readonly ref?: Ref<HTMLTextAreaElement>;
}

/**
 * A multi-line control.
 *
 * It takes the same box, radius and focus treatment as `Input` and differs in
 * exactly two ways: `min-block-size` is a multiple of the control height rather
 * than the control height, and it may be resized vertically.
 */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <AriaTextArea
      className={inputClassName({ multiline: true, className })}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
