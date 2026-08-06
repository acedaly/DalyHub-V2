/**
 * APPEARANCE-01 — the appearance registry (owner-facing presentation).
 *
 * The persisted CONTRACT — which values are legal, how a stored or cookie value is
 * parsed, and how the first-paint cookie is serialised — lives in the kernel
 * (`app/kernel/preferences/appearance.ts`), because the appearance is a real owner
 * preference. This module adds the part that is a design-system concern: what each
 * choice is CALLED, how it is described and which glyph carries it.
 *
 * Everything from the kernel contract is re-exported here, so the shell, Settings
 * and the tests have one import site and there is still exactly one appearance
 * list in the codebase.
 *
 * TERMINOLOGY IS FIXED. The control is "Appearance"; the choices are "System",
 * "Light" and "Dark". Not Auto, not Default, not Night mode — an ambiguous name
 * for a setting the owner sets once and then has to reason about a year later is
 * worse than no setting.
 */

import { MonitorIcon, MoonIcon, SunIcon } from "~/shared/icons";
import {
  APPEARANCE_PREFERENCES,
  type AppearancePreference,
} from "~/kernel/preferences/appearance";

export {
  APPEARANCE_COOKIE_MAX_AGE,
  APPEARANCE_COOKIE_NAME,
  APPEARANCE_PREFERENCES,
  DEFAULT_APPEARANCE,
  isAppearancePreference,
  parseAppearancePreference,
  readAppearancePreference,
  resolveAppearance,
  serializeAppearanceCookie,
  type AppearancePreference,
  type ResolvedAppearance,
} from "~/kernel/preferences/appearance";

/** The user-facing name of the setting itself. Used as the group/legend label. */
export const APPEARANCE_LABEL = "Appearance";

/** One choice's owner-facing presentation. */
export interface AppearanceDescriptor {
  /** The stored value, and the `<html data-appearance>` value. */
  readonly value: AppearancePreference;
  /** The visible option name. */
  readonly label: string;
  /** One short sentence, in plain Australian English, for the Settings row. */
  readonly description: string;
  /** The glyph that carries the option alongside its label — never instead of it. */
  readonly Icon: typeof SunIcon;
}

/**
 * The three choices, in presentation order: the default first, then the two
 * explicit appearances in the order a light-first product reads them.
 */
export const APPEARANCE_OPTIONS: readonly AppearanceDescriptor[] = [
  {
    value: "system",
    label: "System",
    description:
      "Follows your device, and changes with it while DalyHub is open.",
    Icon: MonitorIcon,
  },
  {
    value: "light",
    label: "Light",
    description: "Always light, whatever your device is set to.",
    Icon: SunIcon,
  },
  {
    value: "dark",
    label: "Dark",
    description: "Always dark, whatever your device is set to.",
    Icon: MoonIcon,
  },
];

const OPTIONS_BY_VALUE: ReadonlyMap<
  AppearancePreference,
  AppearanceDescriptor
> = new Map(APPEARANCE_OPTIONS.map((option) => [option.value, option]));

/**
 * The display name for a preference. Used wherever the current choice is stated
 * in words rather than only shown as a selected control — the account menu's
 * summary line, and any status text.
 */
export function appearanceLabel(preference: AppearancePreference): string {
  return OPTIONS_BY_VALUE.get(preference)?.label ?? "System";
}

/** The descriptor for a preference. Total for a typed value. */
export function appearanceOption(
  preference: AppearancePreference,
): AppearanceDescriptor {
  const option = OPTIONS_BY_VALUE.get(preference);
  if (option === undefined) {
    // Unreachable for a typed value; keeps the accessor total at runtime.
    throw new Error(`unknown appearance preference: ${preference}`);
  }
  return option;
}

/**
 * A guard the tests use to prove the presentation registry and the kernel value
 * set cannot drift: every legal preference has exactly one descriptor.
 */
export const APPEARANCE_OPTION_VALUES: readonly AppearancePreference[] =
  APPEARANCE_PREFERENCES;
