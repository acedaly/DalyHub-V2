/**
 * THEME-01 — the ONE colour-scheme control.
 *
 * It renders in exactly one place — Settings → General → Appearance, directly
 * under the appearance control — and it is deliberately NOT in the account menu.
 * An appearance is flipped often enough to want it a click away; a colour scheme
 * is chosen once and then lived in, and five preview rows in a dropdown would
 * make the menu a theme gallery. One control, one home.
 *
 * ── Semantics ────────────────────────────────────────────────────────────────
 * A `<fieldset>` of five NATIVE radios — the same pattern, the same reasons and
 * the same markup shape as `AppearanceSelector`. Native is the point: the browser
 * supplies the roving focus, the arrow-key navigation, the `aria-checked` state
 * and the focus ring, and every assistive technology already knows it. Nothing
 * here re-implements a radio group out of buttons.
 *
 * Each option carries its NAME, a sentence describing it, a check glyph when
 * selected and a three-dot preview — so the choice never rests on the swatches,
 * which is exactly what a colour-blind reader and a forced-colours user need
 * (AGENTS.md §15). The swatches are `aria-hidden`: they repeat information the
 * name and description already carry, and reading out "three circles" helps
 * nobody.
 *
 * ── Persistence ──────────────────────────────────────────────────────────────
 * Changing the selection posts to `/preferences/color-scheme`, which writes the
 * owner's preference record and mirrors it into the first-paint cookie. React
 * Router revalidates after the fetcher settles, so the root loader re-reads the
 * cookie and `<html data-color-scheme>` changes — one attribute, no reload, no
 * imperative DOM write beyond the optimistic one below, and no client-side scheme
 * state that could disagree with the server on the next navigation.
 *
 * The success path is deliberately SILENT: the whole screen changing colour is
 * the confirmation. A FAILURE still speaks, through the shared DS-10 feedback
 * platform, because a silent failure would leave the owner believing a choice was
 * stored when it was not.
 */

import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import { CheckIcon } from "~/shared/icons";
import { useFeedback } from "~/shared/feedback";

import {
  COLOR_SCHEME_LABEL,
  COLOR_SCHEME_OPTIONS,
  COLOR_SCHEME_PREVIEW_SLOTS,
  type ColorScheme,
} from "./color-scheme";

/** The action that persists the scheme and mirrors the first-paint cookie. */
export const COLOR_SCHEME_ACTION_PATH = "/preferences/color-scheme";

export type ColorSchemeSelectorProps = {
  /** The stored scheme, from the Settings loader. */
  readonly value: ColorScheme;
  /**
   * Hide the legend visually when the surrounding surface already names the
   * control. The legend is still there for assistive technology — the group is
   * never left unnamed.
   */
  readonly hideLegend?: boolean;
};

export function ColorSchemeSelector({
  value,
  hideLegend = false,
}: ColorSchemeSelectorProps) {
  const fetcher = useFetcher<{ readonly ok: boolean }>();
  const feedback = useFeedback();

  /*
   * The value to RENDER: the in-flight submission while one is pending, so the
   * control moves the instant it is clicked rather than waiting for the round
   * trip. The stored `value` prop takes back over as soon as the fetcher settles
   * and revalidation delivers the new loader data — so a rejected write reverts
   * the control instead of leaving it lying.
   */
  const pending = fetcher.formData?.get("colorScheme");
  const shown = typeof pending === "string" ? (pending as ColorScheme) : value;

  /*
   * Repaint the DOCUMENT optimistically, not just the control — the same
   * mechanism, and the same argument, as the appearance selector's.
   *
   * `<html data-color-scheme>` is rendered by the root `Layout` from loader data,
   * which does not change until the POST completes AND revalidation lands. On a
   * slow connection that is several round trips during which the radio has moved
   * and the screen has not, which the performance budget rules out for anything
   * over 100ms (AGENTS.md §16) and THEME-01 §25 rules out outright ("tap
   * Electric and immediately see the result").
   *
   * Writing the attribute here is the whole optimistic step, because the
   * stylesheet does the rest: one attribute, and the page is repainted.
   *
   * ROLLBACK is the same line. `shown` falls back to the stored `value` the
   * moment the fetcher settles, so a rejected write drives this effect straight
   * back to the stored scheme — there is no second code path to keep in step, and
   * no way to leave the document showing a scheme that was never saved.
   */
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    if (root.dataset.colorScheme !== shown) {
      root.dataset.colorScheme = shown;
    }
  }, [shown]);

  // One error toast per failed save, deduped, never repeated on re-render.
  const reported = useRef<unknown>(null);
  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data === undefined) {
      return;
    }
    if (reported.current === fetcher.data) {
      return;
    }
    reported.current = fetcher.data;
    if (!fetcher.data.ok) {
      feedback.notifyError("Couldn’t save your colour scheme.", {
        dedupeKey: "color-scheme",
      });
    }
  }, [fetcher.state, fetcher.data, feedback]);

  return (
    <fetcher.Form
      method="post"
      action={COLOR_SCHEME_ACTION_PATH}
      className="dh-appearance dh-appearance--settings dh-scheme"
      aria-busy={fetcher.state !== "idle" ? true : undefined}
    >
      <fieldset className="dh-appearance__field">
        <legend
          className={
            hideLegend
              ? "dh-appearance__legend dh-visually-hidden"
              : "dh-appearance__legend"
          }
        >
          {COLOR_SCHEME_LABEL}
        </legend>
        <div className="dh-appearance__options">
          {COLOR_SCHEME_OPTIONS.map((option) => {
            const selected = option.value === shown;
            return (
              <label
                key={option.value}
                className="dh-appearance__option md-state-layer dh-scheme-tone"
                data-selected={selected ? "true" : "false"}
                data-scheme={option.value}
              >
                {/* Never DISABLED while a write is in flight: disabling the
                 * focused radio drops focus to the body. The form carries
                 * `aria-busy` instead, the fetcher supersedes an in-flight write
                 * with the newer one, and a rejected write reverts the selection
                 * when the loader data returns. */}
                <input
                  className="dh-appearance__input"
                  type="radio"
                  name="colorScheme"
                  value={option.value}
                  checked={selected}
                  onChange={(event) =>
                    event.currentTarget.form?.requestSubmit()
                  }
                />
                {/* The preview. Three dots — primary, secondary, tertiary — drawn
                 * from the generated per-scheme preview tokens, so each row shows
                 * its OWN scheme in the CURRENT appearance rather than a tint of
                 * whatever is active. `aria-hidden` because the name and the
                 * description already say everything this repeats. */}
                <span className="dh-scheme__preview" aria-hidden="true">
                  {COLOR_SCHEME_PREVIEW_SLOTS.map((slot) => (
                    <span
                      key={slot}
                      className={`dh-scheme__swatch dh-scheme__swatch--${slot}`}
                    />
                  ))}
                </span>
                <span className="dh-appearance__text">
                  <span className="dh-appearance__label">{option.label}</span>
                  <span className="dh-appearance__description">
                    {option.description}
                  </span>
                </span>
                {/* A SHAPE for the selected state, beside the tint and the native
                 * radio dot — so selection is never carried by colour alone. */}
                <span className="dh-appearance__check" aria-hidden="true">
                  {selected ? <CheckIcon /> : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </fetcher.Form>
  );
}
