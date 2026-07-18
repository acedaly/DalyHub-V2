/**
 * FND-08 Markdown pipeline — URL policy.
 *
 * Every URL in user Markdown (link destinations, and the destination of an
 * image before it is transformed) is UNTRUSTED. This module is the single place
 * that decides whether a URL may appear as an `href`. It is deliberately an
 * ALLOWLIST, not a blocklist of "bad" schemes, so an unknown or novel scheme is
 * rejected by default rather than slipping through (ADR-015 §11).
 *
 * Permitted:
 *   - relative application paths        (`/path`, `../rel`, `page`)
 *   - fragment links                    (`#section`)
 *   - `http:` `https:` `mailto:` `tel:`
 *
 * Rejected — everything else, including `javascript:`, `data:`, `vbscript:`,
 * `file:`, `blob:`, `filesystem:`, `about:`, `chrome:`, `resource:` and
 * protocol-relative (`//host`) forms.
 *
 * The checker mirrors how a browser actually resolves an `href` so obfuscation
 * cannot smuggle a scheme past it: browsers strip ALL tab/newline/carriage-return
 * characters from a URL attribute before parsing (this is exactly how
 * `java\nscript:` bypasses naive checks), and trim leading/trailing whitespace.
 * We reproduce both, reject any remaining control characters, and only then look
 * for a scheme. HTML-entity and numeric-reference obfuscation is already decoded
 * by the CommonMark parser before a destination reaches us, so the value we test
 * is the real, resolved one.
 */

/** The only URL schemes allowed on a rendered link. Compared case-insensitively. */
export const SAFE_URL_SCHEMES: readonly string[] = [
  "http",
  "https",
  "mailto",
  "tel",
];

const ALLOWED_SCHEMES = new Set(SAFE_URL_SCHEMES);

/** Tab, line feed and carriage return — removed anywhere, as a browser would. */
const STRIP_ANYWHERE = /[\t\n\r]/g;

/** Any C0 control character or DEL remaining after the strip above. */
// eslint-disable-next-line no-control-regex
const REMAINING_CONTROL = /[\u0000-\u001F\u007F]/;

/**
 * A leading scheme: an ASCII letter followed by letters/digits/`+`/`-`/`.`, up
 * to the first colon. The scheme charset excludes `/`, `?`, `#` and `\`, so a
 * match here is a genuine scheme and not a colon that merely appears inside a
 * relative path (e.g. `page/a:b`).
 */
const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/**
 * Decide whether an untrusted URL is safe to use as a link `href` under the
 * documented allowlist. Pure and deterministic; never fetches or resolves the
 * URL.
 */
export function isSafeMarkdownUrl(raw: unknown): boolean {
  if (typeof raw !== "string") {
    return false;
  }

  // Browsers delete tab/newline/CR from href values entirely before parsing.
  let url = raw.replace(STRIP_ANYWHERE, "");

  // Trim leading/trailing whitespace, including unusual Unicode spaces (`\s`
  // covers NBSP, en/em spaces, line/paragraph separators, BOM, etc.).
  url = url.replace(/^\s+/, "").replace(/\s+$/, "");

  if (url === "") {
    return false;
  }

  // Any raw control character left in the middle is illegitimate — reject.
  if (REMAINING_CONTROL.test(url)) {
    return false;
  }

  // Pure fragment links are always safe (same-document navigation).
  if (url.startsWith("#")) {
    return true;
  }

  // Protocol-relative (`//host`) and backslash-authority (`\\host`, `/\host`)
  // forms borrow the current page's scheme and reach another origin; the policy
  // does not permit them.
  if (url.startsWith("//") || url.startsWith("\\") || url.startsWith("/\\")) {
    return false;
  }

  const schemeMatch = SCHEME.exec(url);
  if (schemeMatch) {
    return ALLOWED_SCHEMES.has(schemeMatch[1].toLowerCase());
  }

  // No scheme, not protocol-relative → an ordinary relative path. Allowed.
  return true;
}
