/**
 * FND-09 theme infrastructure — the theme-preference contract and its cookie.
 *
 * FND-09 provides only the MECHANISM for `system` / `light` / `dark`, not the
 * design system (DS-01 owns the token palettes and the final visual language).
 * The preference is cookie-backed and read server-side so `<html>` is rendered
 * with the correct theme on the first byte — no light-to-dark flash, no client
 * cookie reading, no `localStorage`, no database table (ADR-016 §5.11, §17).
 *
 * Pure and dependency-free so it is usable in the root loader, the theme action
 * and unit tests alike. Invalid or missing values fall back safely to `system`.
 */

/** The three supported theme preferences. `system` follows the OS setting. */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

/** A validated theme preference. */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** The default preference when none is set or a stored value is invalid. */
export const DEFAULT_THEME: ThemePreference = "system";

/** The cookie name carrying the persisted preference. */
export const THEME_COOKIE_NAME = "dh_theme";

/** Bounded cookie lifetime: one year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** True when `value` is one of the supported preferences. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === "string" &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
  );
}

/** Coerce any value to a valid preference, falling back to `system`. */
export function parseThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : DEFAULT_THEME;
}

/**
 * Read the persisted preference from a raw `Cookie` header. Missing header,
 * missing cookie or an invalid value all resolve to `system`.
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
 */
export function serializeThemeCookie(
  preference: ThemePreference,
  options: { readonly secure: boolean },
): string {
  const attributes = [
    `${THEME_COOKIE_NAME}=${preference}`,
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
