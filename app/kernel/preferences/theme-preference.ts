/**
 * THEME-01 — the persisted theme-preference contract (kernel).
 *
 * The theme is now a real owner preference, stored on the owner/workspace
 * application-preferences record, so it follows the owner between browsers and
 * devices. That makes its VALUE SET and its VALIDATION a kernel concern, and this
 * module is their single authority: the D1 adapter, the Settings action, the theme
 * action and the app shell all parse through here.
 *
 * It is deliberately pure and dependency-free — no React, no storage, no cookie
 * plumbing beyond string serialisation — so it is safe to import from a loader, an
 * action, the storage adapter and unit tests alike.
 *
 * The owner-facing PRESENTATION of each theme (display names, descriptions,
 * light/dark grouping, preview swatches) belongs to the design system and lives in
 * `app/shared/shell/theme.ts`, which re-exports everything here. The kernel knows
 * which theme ids are legal; it does not know what they look like.
 */

/** The curated theme ids. Each has a complete colour map in `app/styles/tokens.css`. */
export const THEME_IDS = [
  "daly-light",
  "daly-dark",
  "eucalypt",
  "coastal",
  "ember",
] as const;

/** A curated theme id — a value that can appear in `<html data-theme>`. */
export type ThemeId = (typeof THEME_IDS)[number];

/**
 * The appearance-mode value that follows the operating-system setting.
 *
 * `system` is NOT a sixth palette: it pairs Daly Light with Daly Dark and is
 * resolved by `prefers-color-scheme` in the stylesheet, because the server has no
 * way to know the OS setting. Supporting the OS preference must not cost a curated
 * theme (ADR-061).
 */
export const SYSTEM_THEME = "system";

/**
 * Everything the owner can CHOOSE: the five curated themes plus `system`. This is
 * the set the preference stores and Settings renders.
 */
export const THEME_PREFERENCES = [SYSTEM_THEME, ...THEME_IDS] as const;

/** A validated theme preference. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/**
 * The default preference when none is stored or a stored value is invalid.
 *
 * `system` respects the operating-system appearance setting on first run
 * (AGENTS.md §15) and resolves to two complete curated themes, so the default is
 * never a half-designed state.
 */
export const DEFAULT_THEME: ThemePreference = SYSTEM_THEME;

/** The theme applied when the OS prefers light, and the universal fallback. */
export const DEFAULT_LIGHT_THEME: ThemeId = "daly-light";

/** The theme applied when the OS prefers dark. */
export const DEFAULT_DARK_THEME: ThemeId = "daly-dark";

/** Whether a theme presents as light or dark. */
export type ThemeAppearance = "light" | "dark";

/** True when `value` is one of the five curated theme ids. */
export function isThemeId(value: unknown): value is ThemeId {
  return (
    typeof value === "string" &&
    (THEME_IDS as readonly string[]).includes(value)
  );
}

/** True when `value` is a choosable preference (a curated theme id, or `system`). */
export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/**
 * The legacy `system`/`light`/`dark` preference this milestone replaced, mapped
 * onto the curated registry. Kept as data (not an ad-hoc branch) so the stored
 * value migration, the cookie reader and the kernel normaliser all agree.
 */
const LEGACY_THEME_ALIASES: Readonly<Record<string, ThemePreference>> = {
  light: DEFAULT_LIGHT_THEME,
  dark: DEFAULT_DARK_THEME,
  system: SYSTEM_THEME,
};

/**
 * Coerce any value to a valid preference.
 *
 * A legacy `light`/`dark` value becomes its curated equivalent, so an owner who
 * chose Dark before this milestone lands on Daly Dark rather than being reset. An
 * unrecognised value — including a theme a later release removes — falls back to
 * the default and is never written back verbatim. Arbitrary browser input can
 * therefore never reach `<html data-theme>`, a `Set-Cookie` header or the database.
 */
export function parseThemePreference(value: unknown): ThemePreference {
  if (isThemePreference(value)) {
    return value;
  }
  if (typeof value === "string" && value in LEGACY_THEME_ALIASES) {
    return LEGACY_THEME_ALIASES[value];
  }
  return DEFAULT_THEME;
}

/**
 * The theme a preference actually PAINTS, given a known OS appearance.
 *
 * The server never calls this — it has no OS signal, and deliberately passes
 * `system` straight through to `data-theme` so the stylesheet resolves it. Settings'
 * preview and the tests use it to know which palette a choice will produce.
 */
export function resolveThemeId(
  preference: ThemePreference,
  osAppearance: ThemeAppearance = "light",
): ThemeId {
  if (preference === SYSTEM_THEME) {
    return osAppearance === "dark" ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME;
  }
  return preference;
}

/** The cookie name carrying the first-paint mirror of the stored preference. */
export const THEME_COOKIE_NAME = "dh_theme";

/** Bounded cookie lifetime: one year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Read the mirrored preference from a raw `Cookie` header. A missing header,
 * missing cookie, legacy value or invalid value all resolve safely — legacy values
 * through the alias table, anything else to the default.
 */
export function readThemePreference(
  cookieHeader: string | null | undefined,
): ThemePreference {
  if (!cookieHeader) {
    return DEFAULT_THEME;
  }
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const name = part.slice(0, eq).trim();
    if (name === THEME_COOKIE_NAME) {
      return parseThemePreference(part.slice(eq + 1).trim());
    }
  }
  return DEFAULT_THEME;
}

/**
 * Serialise the theme cookie. Same-site Lax, root path, bounded lifetime, and
 * HttpOnly (the value is only ever read server-side, never by client JS). `Secure`
 * is added in production/non-local environments.
 *
 * The value is re-parsed here, so no browser-supplied string can be reflected into
 * a `Set-Cookie` header even if a caller skipped validation.
 */
export function serializeThemeCookie(
  preference: ThemePreference,
  options: { readonly secure: boolean },
): string {
  const attributes = [
    `${THEME_COOKIE_NAME}=${parseThemePreference(preference)}`,
    "Path=/",
    `Max-Age=${THEME_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (options.secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}
