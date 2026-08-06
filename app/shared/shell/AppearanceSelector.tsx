/**
 * APPEARANCE-01 — the ONE appearance control.
 *
 * It renders in exactly two places — the account menu in the application shell,
 * and Settings → General — and it is the SAME component in both, wired to the same
 * action and the same stored preference, so the two surfaces cannot drift apart or
 * show different current values. There is no third appearance control and no theme
 * button in a page header: an appearance is set rarely and then forgotten, so it
 * belongs where the other rarely-set things are.
 *
 * ── Semantics ────────────────────────────────────────────────────────────────
 * A `<fieldset>` of three NATIVE radios. Native is the point: the browser gives
 * the group its roving focus, its arrow-key navigation, its `aria-checked` state
 * and its focus ring for free, and every assistive technology already knows the
 * pattern. Nothing here re-implements a radio group with buttons and
 * `role="radio"`.
 *
 * Each option carries a glyph AND its word, and the selected one is marked by the
 * native radio dot, a container fill and a check glyph — three signals, none of
 * them colour alone, so the current choice survives forced-colours mode and a
 * colour-blind reader (AGENTS.md §15).
 *
 * ── Persistence ──────────────────────────────────────────────────────────────
 * Changing the selection posts to `/preferences/appearance`, which writes the
 * owner's preference record and mirrors it into the first-paint cookie. React
 * Router revalidates after the fetcher settles, so the root loader re-reads the
 * cookie and `<html data-appearance>` changes — one attribute, no reload, no
 * imperative DOM write, and no client-side theme state that could disagree with
 * the server on the next navigation.
 *
 * The success path is deliberately SILENT: the whole screen changing colour is
 * the confirmation, and announcing "Appearance saved" on every change would be
 * exactly the unnecessary live-region chatter the accessibility brief rules out.
 * A FAILURE still speaks, through the shared DS-10 feedback platform, because a
 * silent failure would leave the owner believing a choice was stored when it was
 * not.
 */

import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import { CheckIcon } from "~/shared/icons";
import { useFeedback } from "~/shared/feedback";

import {
  APPEARANCE_LABEL,
  APPEARANCE_OPTIONS,
  type AppearancePreference,
} from "./appearance";

/** The action that persists the preference and mirrors the first-paint cookie. */
export const APPEARANCE_ACTION_PATH = "/preferences/appearance";

export type AppearanceSelectorProps = {
  /** The stored preference, from the shell (menu) or Settings (page) loader. */
  readonly value: AppearancePreference;
  /**
   * `menu` is the compact selection group inside the account menu; `settings` is
   * the fuller radio list with per-option descriptions. Same semantics, same
   * action, same state — two densities.
   */
  readonly variant: "menu" | "settings";
  /**
   * Hide the legend visually when the surrounding surface already names the
   * control (a Settings group titled "Appearance"). The legend is still there for
   * assistive technology — the group is never left unnamed.
   */
  readonly hideLegend?: boolean;
};

export function AppearanceSelector({
  value,
  variant,
  hideLegend = false,
}: AppearanceSelectorProps) {
  const fetcher = useFetcher<{ readonly ok: boolean }>();
  const feedback = useFeedback();

  /*
   * The value to RENDER: the in-flight submission while one is pending, so the
   * control moves the instant it is clicked rather than waiting for the round
   * trip. The stored `value` prop takes back over as soon as the fetcher settles
   * and revalidation delivers the new loader data — so a rejected write reverts
   * the control instead of leaving it lying.
   */
  const pending = fetcher.formData?.get("appearance");
  const shown =
    typeof pending === "string" ? (pending as AppearancePreference) : value;

  /*
   * Repaint the DOCUMENT optimistically, not just the control.
   *
   * `<html data-appearance>` is rendered by the root `Layout` from loader data,
   * which does not change until the POST completes AND revalidation lands. On a
   * slow connection that is several round trips during which the radio has moved
   * and the screen has not — an interaction that reports itself as done and is
   * not, which the performance budget rules out for anything over 100ms
   * (AGENTS.md §16) and the interaction philosophy rules out outright
   * ("optimistic and reversible", §7).
   *
   * Writing the attribute here is the whole optimistic step, because the
   * stylesheet does the rest: one attribute, and the page is repainted.
   *
   * ROLLBACK is the same line. `shown` falls back to the stored `value` the
   * moment the fetcher settles, so a rejected write drives this effect straight
   * back to the stored appearance — there is no second code path to keep in step,
   * and no way to leave the document showing an appearance that was never saved.
   *
   * It does not fight React. React only patches an attribute when the value it
   * RENDERED changes, so an imperative write survives an unrelated re-render;
   * when revalidation finally delivers the new value, React writes the same
   * string this effect already wrote and nothing flickers. On the first mount
   * `shown === value === ` whatever the server rendered, so hydration is a no-op.
   */
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    if (root.dataset.appearance !== shown) {
      root.dataset.appearance = shown;
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
      feedback.notifyError("Couldn’t save your appearance.", {
        dedupeKey: "appearance",
      });
    }
  }, [fetcher.state, fetcher.data, feedback]);

  return (
    <fetcher.Form
      method="post"
      action={APPEARANCE_ACTION_PATH}
      className={`dh-appearance dh-appearance--${variant}`}
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
          {APPEARANCE_LABEL}
        </legend>
        <div className="dh-appearance__options">
          {APPEARANCE_OPTIONS.map((option) => {
            const selected = option.value === shown;
            return (
              <label
                key={option.value}
                className="dh-appearance__option md-state-layer"
                data-selected={selected ? "true" : "false"}
              >
                {/* The radio is never DISABLED while a write is in flight. It
                 * would be the obvious way to show "saving", and it is the wrong
                 * one here: disabling the focused control inside the account menu
                 * drops focus to the body and closes the owner's place in the
                 * menu. The form carries `aria-busy` instead, the fetcher
                 * supersedes an in-flight write with the newer one, and a rejected
                 * write reverts the selection when the loader data returns. */}
                <input
                  className="dh-appearance__input"
                  type="radio"
                  name="appearance"
                  value={option.value}
                  checked={selected}
                  onChange={(event) =>
                    event.currentTarget.form?.requestSubmit()
                  }
                />
                <span className="dh-appearance__glyph" aria-hidden="true">
                  <option.Icon />
                </span>
                <span className="dh-appearance__text">
                  <span className="dh-appearance__label">{option.label}</span>
                  {variant === "settings" ? (
                    <span className="dh-appearance__description">
                      {option.description}
                    </span>
                  ) : null}
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
