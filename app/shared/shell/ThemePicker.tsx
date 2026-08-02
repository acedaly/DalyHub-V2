/**
 * THEME-01 — the theme picker (Settings) and the compact quick switch (user menu).
 *
 * Both are progressively-enhanced forms posting to the theme action, which persists
 * the choice on the owner's preferences record, mirrors it into the first-paint
 * cookie and redirects back. With JavaScript that redirect is a client navigation,
 * so the new theme paints immediately and nothing reloads; without JavaScript it is
 * an ordinary form post that still works.
 *
 * Accessibility:
 *   - every option is a real submit button with a visible text name, never a
 *     colour-only swatch, so the picker works in forced-colours mode, for a
 *     screen-reader user and for anyone who cannot distinguish the palettes;
 *   - each option's ACCESSIBLE NAME is just the theme name, with the description
 *     attached through `aria-describedby`. Letting the description fall into the
 *     name would make every option announce a paragraph, and would make "Daly
 *     Light" ambiguous with the Match system option that mentions it;
 *   - the current choice is conveyed SEMANTICALLY with `aria-pressed`, and
 *     reinforced (not replaced) by a tick and a border;
 *   - the swatch itself is `aria-hidden` — it repeats nothing;
 *   - the group has an accessible name, and a live region announces the applied
 *     theme after a change so the switch is not a silent visual-only event.
 *
 * The picker holds no theme list of its own: it renders the registry in
 * `./theme.ts`, so adding a theme is a registry edit.
 */

import { useId } from "react";
import { Form, useNavigation } from "react-router";

import { CheckIcon } from "~/shared/icons";

import { ThemePreview } from "./ThemePreview";
import {
  SYSTEM_THEME_OPTION,
  THEMES,
  themePreferenceName,
  type ThemePreference,
} from "./theme";

/** The route the theme forms post to. */
export const THEME_ACTION_PATH = "/preferences/theme";

/** One option row: `system` first, then the curated themes in registry order. */
const OPTIONS: readonly {
  readonly id: ThemePreference;
  readonly name: string;
  readonly description: string;
  readonly appearance?: "light" | "dark";
}[] = [
  SYSTEM_THEME_OPTION,
  ...THEMES.map((theme) => ({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    appearance: theme.appearance,
  })),
];

export type ThemePickerProps = {
  /** The currently persisted preference (drives the selected state). */
  readonly current: ThemePreference;
};

export function ThemePicker({ current }: ThemePickerProps) {
  const navigation = useNavigation();
  // True while a theme submit is in flight, so the picker can say "Applying…"
  // rather than appearing to have ignored the click on a slow connection.
  const applying =
    navigation.state !== "idle" &&
    navigation.formAction?.startsWith(THEME_ACTION_PATH) === true;

  return (
    <Form method="post" action={THEME_ACTION_PATH} className="dh-theme-picker">
      <fieldset className="dh-theme-picker__fieldset">
        <legend className="dh-visually-hidden">Theme</legend>
        <ul className="dh-theme-picker__list">
          {OPTIONS.map((option) => (
            <ThemeOption
              key={option.id}
              option={option}
              selected={option.id === current}
            />
          ))}
        </ul>
      </fieldset>
      <p className="dh-theme-picker__status" role="status">
        {applying ? "Applying theme…" : `Using ${themePreferenceName(current)}`}
      </p>
    </Form>
  );
}

function ThemeOption({
  option,
  selected,
}: {
  readonly option: (typeof OPTIONS)[number];
  readonly selected: boolean;
}) {
  const nameId = useId();
  const descriptionId = useId();

  return (
    <li className="dh-theme-picker__item">
      <button
        type="submit"
        name="theme"
        value={option.id}
        className="dh-theme-picker__option"
        aria-pressed={selected}
        aria-labelledby={nameId}
        aria-describedby={descriptionId}
      >
        <ThemePreview preference={option.id} />
        <span className="dh-theme-picker__text">
          <span className="dh-theme-picker__name">
            <span id={nameId}>{option.name}</span>
            {option.appearance ? (
              // Visible as a chip; announced as part of the description instead,
              // so the option's name stays exactly the theme's name.
              <span className="dh-theme-picker__appearance" aria-hidden="true">
                {option.appearance === "dark" ? "Dark" : "Light"}
              </span>
            ) : null}
          </span>
          <span className="dh-theme-picker__description" id={descriptionId}>
            {option.appearance ? (
              <span className="dh-visually-hidden">
                {option.appearance === "dark"
                  ? "Dark theme. "
                  : "Light theme. "}
              </span>
            ) : null}
            {option.description}
          </span>
        </span>
        <span className="dh-theme-picker__state">
          {selected ? (
            <>
              <span className="dh-theme-picker__tick" aria-hidden="true">
                <CheckIcon />
              </span>
              <span className="dh-theme-picker__selected-label">Selected</span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export type ThemeQuickSwitchProps = {
  /** The currently persisted preference. */
  readonly current: ThemePreference;
};

/**
 * The compact switch inside the user menu. Same action, same semantics, same
 * registry — just a denser presentation for a menu panel, with the swatch doing the
 * work the long description does in Settings. Settings remains the full surface, so
 * the menu links there rather than duplicating the descriptions.
 */
export function ThemeQuickSwitch({ current }: ThemeQuickSwitchProps) {
  return (
    <Form
      method="post"
      action={THEME_ACTION_PATH}
      className="dh-theme-switch"
      aria-label="Theme"
    >
      <p className="dh-theme-switch__label">Theme</p>
      <div className="dh-theme-switch__options">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="submit"
            name="theme"
            value={option.id}
            className="dh-theme-switch__option"
            aria-pressed={option.id === current}
          >
            <ThemePreview preference={option.id} />
            <span className="dh-theme-switch__name">{option.name}</span>
          </button>
        ))}
      </div>
    </Form>
  );
}
