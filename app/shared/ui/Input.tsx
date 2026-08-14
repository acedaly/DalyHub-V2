/**
 * DS-02 — the DalyHub text-entry primitives.
 *
 * `TextField` (`~/shared/forms`) is the FIELD: a label, a control, helper text,
 * an error and the association between them. It stays exactly as it is — DS-01
 * classified it KEEP + RESTYLE and it is the right abstraction for a form.
 *
 * These are the bare CONTROLS underneath it, for the places a field wrapper is
 * wrong: a search box in a toolbar, a filter row's inline entry, a dialog's
 * single question, an inline editor. Those are the surfaces that were dropping
 * a bare `<input>` into the page and relying on the `base.css` control baseline
 * to make it not look broken.
 *
 * ── What they own ────────────────────────────────────────────────────────────
 *
 * Height (`--dh-control-height`, so density decides), inline padding, border,
 * radius, focus ring, invalid state, disabled state and placeholder colour —
 * once, in `ui.css`, for every text control in the product.
 *
 * ── The anti-zoom floor is NOT re-implemented here ───────────────────────────
 *
 * `--app-field-font-size-compact` is `body-medium` on a pointer device and is
 * floored at 16px on a touch one (tokens.css, MOBILE-01). It is stated in the
 * stylesheet, so a control cannot opt out of it by being written after this
 * file. Nothing about DS-02's compaction touches it: an iPhone still gets 16px
 * text in every field, and still does not zoom on focus.
 */

import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  TextareaHTMLAttributes,
} from "react";

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
  const control = (
    <input
      className={["dh-control", className].filter(Boolean).join(" ")}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );

  if (!leading) return control;

  return (
    <span className="dh-control-affix">
      <span className="dh-control-affix__leading" aria-hidden="true">
        {leading}
      </span>
      {control}
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
 * It takes the same border, radius and focus treatment as `Input` and differs
 * in exactly two ways: `min-block-size` is a multiple of the control height
 * rather than the control height, and it may be resized vertically. Horizontal
 * resize is off — a textarea dragged wider than its column breaks the form's
 * grid, and nothing is gained.
 */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={["dh-control", "dh-control--multiline", className]
        .filter(Boolean)
        .join(" ")}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
