/**
 * APPEARANCE-01 — the persisted appearance-preference contract (kernel).
 *
 * DalyHub ships ONE generated Material Design 3 light/dark pair (ADR-074). This
 * module does not add a theme feature and does not add a palette: it adds the one
 * thing ADR-074 left the owner unable to say — WHICH HALF OF THE PAIR TO PAINT.
 *
 * There are exactly three choices and there will only ever be three:
 *
 *   system   follow the device (`prefers-color-scheme`), and keep following it
 *            while DalyHub is open
 *   light    always the light appearance, whatever the device says
 *   dark     always the dark appearance, whatever the device says
 *
 * The preference is stored on the owner/workspace application-preferences record,
 * so it follows the owner between browsers and devices, and it is MIRRORED into a
 * first-paint cookie so a document that never reaches the authenticated shell
 * loader still renders the right appearance on its first byte. The record is the
 * authority; the cookie is a mirror (the same division ADR-061 established for the
 * theme this supersedes).
 *
 * The module is deliberately pure and dependency-free — no React, no storage, no
 * cookie plumbing beyond string serialisation — so it is safe to import from a
 * loader, an action, the D1 adapter and unit tests alike. Owner-facing
 * PRESENTATION (labels, descriptions, icons) belongs to the design system and
 * lives in `app/shared/shell/appearance.ts`.
 */

/** Everything the owner can choose. Exactly three values, in presentation order. */
export const APPEARANCE_PREFERENCES = ["system", "light", "dark"] as const;

/** A validated appearance preference. */
export type AppearancePreference = (typeof APPEARANCE_PREFERENCES)[number];

/**
 * What is actually PAINTED once `system` has been resolved against the device.
 * This is what `color-scheme` and the stylesheet's dark block key off.
 */
export type ResolvedAppearance = "light" | "dark";

/**
 * The default when nothing is stored, or when a stored value is unreadable.
 *
 * `system` respects the operating-system setting on first run (AGENTS.md §15) and
 * is what every existing owner is already getting, so the default is never a
 * change of behaviour.
 */
export const DEFAULT_APPEARANCE: AppearancePreference = "system";

/** True when `value` is one of the three choosable appearance preferences. */
export function isAppearancePreference(
  value: unknown,
): value is AppearancePreference {
  return (
    typeof value === "string" &&
    (APPEARANCE_PREFERENCES as readonly string[]).includes(value)
  );
}

/**
 * Coerce any value to a valid preference.
 *
 * It COERCES rather than throws: an unrecognised value — a hand-edited cookie, a
 * stale form post, a row written by a future release — lands the owner on
 * `system` instead of on an error page. Choosing an appearance must never be able
 * to break the surface the owner is looking at, and arbitrary browser input must
 * never reach `<html data-appearance>`, a `Set-Cookie` header or the database.
 */
export function parseAppearancePreference(
  value: unknown,
): AppearancePreference {
  return isAppearancePreference(value) ? value : DEFAULT_APPEARANCE;
}

/**
 * The appearance a preference actually PAINTS, given a known device appearance.
 *
 * The server never calls this with a real device signal — it has no way to know
 * the operating-system setting, and deliberately passes `system` straight through
 * to `data-appearance` so the stylesheet's `prefers-color-scheme` block resolves
 * it. That is also what makes "respond when the system appearance changes while
 * DalyHub is open" free: the media query re-evaluates itself, with no listener and
 * no re-render. This function exists for the surfaces that must NAME the effective
 * appearance (tests, the `theme-color` pair, an explicit choice).
 */
export function resolveAppearance(
  preference: AppearancePreference,
  deviceAppearance: ResolvedAppearance = "light",
): ResolvedAppearance {
  return preference === "system" ? deviceAppearance : preference;
}

/** The cookie carrying the first-paint mirror of the stored preference. */
export const APPEARANCE_COOKIE_NAME = "dh_appearance";

/** Bounded cookie lifetime: one year, in seconds. */
export const APPEARANCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Read the mirrored preference from a raw `Cookie` header. A missing header, a
 * missing cookie and an invalid value all resolve to `system`.
 */
export function readAppearancePreference(
  cookieHeader: string | null | undefined,
): AppearancePreference {
  if (!cookieHeader) {
    return DEFAULT_APPEARANCE;
  }
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === APPEARANCE_COOKIE_NAME) {
      return parseAppearancePreference(part.slice(eq + 1).trim());
    }
  }
  return DEFAULT_APPEARANCE;
}

/**
 * Serialise the appearance cookie. Same-site Lax, root path, bounded lifetime and
 * HttpOnly (the value is only ever read server-side, never by client JS). `Secure`
 * is added in the deployed environments.
 *
 * The value is re-parsed here, so no browser-supplied string can be reflected into
 * a `Set-Cookie` header even if a caller skipped validation.
 */
export function serializeAppearanceCookie(
  preference: AppearancePreference,
  options: { readonly secure: boolean },
): string {
  const attributes = [
    `${APPEARANCE_COOKIE_NAME}=${parseAppearancePreference(preference)}`,
    "Path=/",
    `Max-Age=${APPEARANCE_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (options.secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}
