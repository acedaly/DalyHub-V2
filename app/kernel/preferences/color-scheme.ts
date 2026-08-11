/**
 * THEME-01 — the persisted colour-scheme contract (kernel).
 *
 * ── What a colour scheme IS, and what it is not ──────────────────────────────
 * DalyHub has ONE design system: one set of components, one typescale, one shape
 * scale, one spacing scale, one motion vocabulary. A COLOUR SCHEME changes the
 * palette that system is painted in, and nothing else. Five of them ship, and the
 * product is recognisably itself in all five.
 *
 * It is deliberately not called a "theme" in the owner-facing product, and mostly
 * not in the code either. "Theme" invites the reader to expect different
 * typography, different spacing, different component shapes — all of which are
 * explicitly out of scope and none of which a scheme may touch. "Colour scheme"
 * says exactly how far it goes.
 *
 * ── Three orthogonal concepts ────────────────────────────────────────────────
 *
 *   design system   shared components, layout, typography, shape — never varies
 *   colour scheme   THIS module: which palette (violet · electric · pulse ·
 *                   ocean · graphite)
 *   appearance      `appearance.ts`: which HALF of that palette (system · light ·
 *                   dark)
 *
 * The last two are independent by construction. Every scheme has a first-class
 * light and dark pair, so "Electric, Light" and "Electric, Dark" are both real
 * and neither is derived from the other. The stylesheet resolves the two
 * attributes separately (see the generated block in `tokens.css`).
 *
 * ── Storage ─────────────────────────────────────────────────────────────────
 * The preference is stored on the owner/workspace application-preferences record
 * — OWNER-scoped, like every other display preference and for the same reason
 * ADR-061 recorded when the appearance moved into the database: a personal choice
 * that does not follow you to your phone is a broken one. It is mirrored into a
 * first-paint cookie so a document that never reaches the authenticated shell
 * loader still renders the right scheme on its first byte. The record is the
 * authority; the cookie is a mirror.
 *
 * The module is deliberately pure and dependency-free — no React, no storage, no
 * cookie plumbing beyond string serialisation — so it is safe to import from a
 * loader, an action, the D1 adapter and unit tests alike. Owner-facing
 * PRESENTATION (names, descriptions, preview swatches) belongs to the design
 * system and lives in `app/shared/shell/color-scheme.ts`.
 */

import {
  PREFERENCE_COOKIE_MAX_AGE,
  isSecurePreferenceCookieEnvironment,
  readPreferenceCookie,
  serializePreferenceCookie,
} from "./preference-cookies";

/**
 * Every scheme the owner can choose, in presentation order.
 *
 * This is the ONE bounded source of truth for what a colour scheme is. The
 * generator (`scripts/generate-m3-scheme.mjs`) emits a palette for each of these
 * keys, `app/shared/shell/color-scheme.ts` gives each one a name and a preview,
 * the migration's CHECK constraint names the same five, and unit tests pin all
 * four lists to this one. A scheme name is never written as a literal anywhere
 * else.
 *
 * The order is the order Settings shows them: the default first, then the two
 * expressive schemes, then the cool one, then the quiet one — loudest to
 * quietest after the default, which is the order an owner scanning for "something
 * calmer" reads in.
 */
export const COLOR_SCHEMES = [
  "violet",
  "electric",
  "pulse",
  "ocean",
  "graphite",
] as const;

/** A validated colour-scheme preference. */
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/**
 * The default when nothing is stored, or when a stored value is unreadable.
 *
 * Daly Violet is what every existing owner is already looking at, so the default
 * is never a change of appearance for anybody: THEME-01 adds four alternatives
 * and migrates nobody onto them (§45). It is also the safe landing for a stale or
 * corrupted value (§30) — an owner whose stored scheme names something a future
 * release removed gets the default product rather than an unstyled page.
 */
export const DEFAULT_COLOR_SCHEME: ColorScheme = "violet";

/** True when `value` is one of the five choosable colour schemes. */
export function isColorScheme(value: unknown): value is ColorScheme {
  return (
    typeof value === "string" &&
    (COLOR_SCHEMES as readonly string[]).includes(value)
  );
}

/**
 * Coerce any value to a valid scheme.
 *
 * It COERCES rather than throws: an unrecognised value — a hand-edited cookie, a
 * stale form post, a row written by a release that had a sixth scheme — lands the
 * owner on Daly Violet instead of on an error page. Choosing a scheme must never
 * be able to break the surface the owner is looking at, and arbitrary browser
 * input must never reach `<html data-color-scheme>`, a `Set-Cookie` header or the
 * database.
 *
 * The WRITE path uses `parseColorScheme` (the strict validator in
 * `app-preferences-validation.ts`) instead, for the reason recorded there.
 */
export function parseColorSchemePreference(value: unknown): ColorScheme {
  return isColorScheme(value) ? value : DEFAULT_COLOR_SCHEME;
}

/** The cookie carrying the first-paint mirror of the stored scheme. */
export const COLOR_SCHEME_COOKIE_NAME = "dh_color_scheme";

/** Bounded cookie lifetime: one year, in seconds. */
export const COLOR_SCHEME_COOKIE_MAX_AGE = PREFERENCE_COOKIE_MAX_AGE;

/**
 * Read the mirrored scheme from a raw `Cookie` header. A missing header, a
 * missing cookie and an invalid value all resolve to Daly Violet.
 */
export function readColorSchemePreference(
  cookieHeader: string | null | undefined,
): ColorScheme {
  return parseColorSchemePreference(
    readPreferenceCookie(cookieHeader, COLOR_SCHEME_COOKIE_NAME),
  );
}

/**
 * Whether the cookie should carry `Secure`, given the raw `ENVIRONMENT` value.
 * The same rule the appearance mirror uses — they are the same kind of cookie.
 */
export function isSecureColorSchemeEnvironment(
  environment: string | undefined,
): boolean {
  return isSecurePreferenceCookieEnvironment(environment);
}

/**
 * Serialise the colour-scheme cookie. Same-site Lax, root path, bounded lifetime
 * and HttpOnly. The value is re-parsed here, so no browser-supplied string can be
 * reflected into a `Set-Cookie` header even if a caller skipped validation.
 */
export function serializeColorSchemeCookie(
  scheme: ColorScheme,
  options: { readonly secure: boolean },
): string {
  return serializePreferenceCookie(
    COLOR_SCHEME_COOKIE_NAME,
    parseColorSchemePreference(scheme),
    options,
  );
}
