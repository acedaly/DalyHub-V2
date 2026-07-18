/**
 * FND-09 shell — theme control.
 *
 * A progressively-enhanced form that posts the chosen preference to the theme
 * action, which sets the cookie and redirects back (ADR-016 §5.11). It works
 * without JavaScript (a plain form submit) and, with React Router, as a
 * client-side navigation that preserves the user's place. The active preference
 * is conveyed semantically via `aria-pressed`, not by colour alone, and every
 * option is a real text-labelled button (no icon-only controls).
 */

import { Form } from "react-router";

import { THEME_PREFERENCES, type ThemePreference } from "./theme";

/** The route the theme form posts to. */
export const THEME_ACTION_PATH = "/preferences/theme";

const THEME_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export type ThemeControlProps = {
  /** The currently persisted preference (drives the active state). */
  readonly current: ThemePreference;
};

export function ThemeControl({ current }: ThemeControlProps) {
  return (
    <Form method="post" action={THEME_ACTION_PATH} className="theme-control">
      <fieldset className="theme-fieldset">
        <legend>Theme</legend>
        {THEME_PREFERENCES.map((preference) => (
          <button
            key={preference}
            type="submit"
            name="theme"
            value={preference}
            className="theme-option"
            aria-pressed={preference === current}
          >
            {THEME_LABELS[preference]}
          </button>
        ))}
      </fieldset>
    </Form>
  );
}
