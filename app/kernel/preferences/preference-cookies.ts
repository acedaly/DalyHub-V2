/**
 * The shared FIRST-PAINT cookie mechanics for owner display preferences.
 *
 * Two preferences decide what the very first byte of a document looks like — the
 * APPEARANCE (System/Light/Dark, APPEARANCE-01) and the COLOUR SCHEME (Daly
 * Violet, Electric, Pulse, Ocean, Graphite — THEME-01). Both are stored on the
 * owner's preference record, which is their authority, and both are MIRRORED into
 * a cookie so a document that never reaches the authenticated shell loader
 * (`/offline`, a root error boundary) still paints correctly without a
 * bootstrapping script.
 *
 * The mirroring is identical for both, and it has security-relevant details —
 * `HttpOnly`, `SameSite`, when `Secure` applies, never reflecting an unvalidated
 * browser string into a `Set-Cookie` header. Writing them twice is how two
 * cookies that are supposed to behave the same quietly stop doing so, so they are
 * written once here and each preference module supplies only its own name,
 * validator and default.
 *
 * The module is deliberately pure and dependency-free — no React, no storage, no
 * request plumbing beyond string handling — so it is safe to import from a
 * loader, an action, the D1 adapter and unit tests alike.
 */

/** Bounded cookie lifetime for a display preference: one year, in seconds. */
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Environments where a preference cookie must be marked `Secure`. */
const SECURE_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "production",
  "staging",
  "preview",
]);

/**
 * Whether preference cookies should carry `Secure`, given the raw `ENVIRONMENT`.
 *
 * Every writer goes through this, so no two of them can disagree about the
 * security attributes of cookies that are supposed to behave alike. A cookie
 * written from two places with different flags is two cookies.
 */
export function isSecurePreferenceCookieEnvironment(
  environment: string | undefined,
): boolean {
  return SECURE_ENVIRONMENTS.has((environment ?? "").trim().toLowerCase());
}

/**
 * The raw value of one cookie from a `Cookie` header, or `null`.
 *
 * Deliberately returns the RAW string: validating it is the calling preference
 * module's job, because only it knows what a legal value is and what an illegal
 * one should degrade to.
 */
export function readPreferenceCookie(
  cookieHeader: string | null | undefined,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/**
 * Serialise a preference cookie. Same-site Lax, root path, bounded lifetime and
 * HttpOnly (these values are only ever read server-side, never by client JS).
 * `Secure` is added in the deployed environments.
 *
 * The caller passes an ALREADY VALIDATED value — every call site re-parses first
 * — so no browser-supplied string can be reflected into a `Set-Cookie` header.
 */
export function serializePreferenceCookie(
  name: string,
  value: string,
  options: { readonly secure: boolean },
): string {
  const attributes = [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${PREFERENCE_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (options.secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}
