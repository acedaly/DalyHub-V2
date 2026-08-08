/**
 * AUDIT-10 request platform — the one Content-Security-Policy authority.
 *
 * Before this module DalyHub's CSP restricted `base-uri`, `frame-ancestors` and
 * `object-src` and nothing else. With no `default-src` and no `script-src`, the
 * Markdown sanitiser was the ONLY thing standing between an injected string and
 * script execution (END_TO_END_AUDIT_2026_08_05 → AUDIT-10). The sanitiser is
 * still mandatory and is not weakened anywhere by this change; CSP is the second,
 * independent layer that was missing.
 *
 * ── Every source is derived from evidence, not from a template ───────────────
 *
 * `script-src 'self' 'nonce-…'`
 *   DalyHub ships no third-party script and loads every module from its own
 *   origin. It cannot use a bare `'self'` alone, because React Router's framework
 *   mode emits INLINE scripts on every document: the `window.__reactRouterContext`
 *   hand-off and route-module preloads (`<Scripts>`), the scroll-position restore
 *   (`<ScrollRestoration>`), React's own streaming completion instructions, and
 *   one deliberate `history.replaceState` line in the offline shell. All of them
 *   are SERVER-RENDERED by code in this repository, so a per-response nonce
 *   covers them exactly — and covers nothing an attacker can predict, because the
 *   nonce is 128 bits of `crypto.getRandomValues` minted after the request
 *   arrives. There is no `'unsafe-inline'` and no `'unsafe-eval'` in production:
 *   an injected `<script>`, an `onclick=` attribute and a `javascript:` URL are
 *   all refused by the policy even if some future sink let them into the DOM.
 *
 * `style-src 'self' 'nonce-…'` + `style-src-attr 'unsafe-inline'`
 *   Application styling is external, bundled CSS. The ONE runtime `<style>`
 *   injection is CodeMirror's (`style-mod`, in the Notes writing surface), which
 *   accepts a nonce through `EditorView.cspNonce` — so it is nonced rather than
 *   exempted. `style-src-attr 'unsafe-inline'` is a deliberate, documented
 *   exception: a dozen React components size a progress track, a ring or an
 *   avatar with a `style={{…}}` attribute. Script and style `unsafe-inline` are
 *   not equivalent risks — a style attribute cannot execute script, cannot read
 *   the DOM and cannot exfiltrate on its own — and confining the exception to
 *   `-attr` means an injected `<style>` ELEMENT is still refused.
 *
 * `img-src 'self' data: https:`
 *   `data:` is required by a CSS `mask` in `segmented-filter.css` and by Person
 *   avatars stored as `data:image/…` (`person-validation.ts` accepts them). `https:`
 *   is required because a Person's `photoUrl` is an OWNER-ENTERED remote address
 *   — a real, shipped field on the Person contact form. It is deliberately not
 *   `*`: plain `http:` is excluded, and nothing else is admitted. Markdown does
 *   NOT contribute here — the sanitisation schema forbids `img` outright, so
 *   authored content cannot reference a remote image at all.
 *
 * `connect-src 'self'`
 *   Every browser-initiated request DalyHub makes is same-origin: React Router
 *   data requests, the module `fetch` calls, the offline probe, snapshot sync and
 *   capture replay. The AI providers are called by the WORKER, server-side, where
 *   no browser CSP applies — so Anthropic and OpenAI are deliberately absent from
 *   this directive. Adding them would widen the browser's allowance for a
 *   connection the browser never makes.
 *
 * `font-src 'self'` — one self-hosted Roboto Flex woff2, no font CDN.
 * `worker-src 'self'` — `/sw.js`, the PWA service worker, explicitly named rather
 *   than inherited, because a service worker is exactly the kind of thing a
 *   policy should be explicit about.
 * `manifest-src 'self'` — `/manifest.webmanifest`.
 * `media-src 'none'`, `frame-src 'none'`, `object-src 'none'` — DalyHub embeds no
 *   audio, video, frame or plugin content anywhere.
 * `base-uri 'none'` — no document sets a `<base>`; forbidding it closes the
 *   relative-URL-hijack path outright rather than merely restricting it.
 * `form-action 'self'` — every form posts back to DalyHub. Sign-out reaches
 *   Cloudflare's `/cdn-cgi/access/logout` by NAVIGATION, not by form submission,
 *   and that path is same-origin anyway.
 * `frame-ancestors 'none'` — nothing may embed DalyHub (matching the legacy
 *   `X-Frame-Options: DENY`, which is kept only for pre-CSP3 user agents).
 * `default-src 'self'` — the backstop for any fetch directive not named above.
 *
 * ── Development is a SEPARATE, explicitly-gated policy ───────────────────────
 * Vite's dev server injects its own inline preamble and HMR client and connects
 * over a websocket; none of that exists in a build. The relaxed policy is
 * therefore returned ONLY for `mode: "development"`, and `resolveCspMode` will
 * not return `"development"` unless BOTH `import.meta.env.DEV` (a BUILD-time
 * constant that is false in every production bundle) and an explicit
 * development/test `ENVIRONMENT` agree. A production build cannot emit the
 * development policy whatever the environment says — the same fail-closed shape
 * `resolveAuthConfig` uses for `AUTH_MODE`.
 */

/** The two policies this module can build. */
export type CspMode = "production" | "development";

/** Environments in which the relaxed development policy may be used at all. */
const DEVELOPMENT_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "development",
  "test",
]);

/** Bytes of entropy in a nonce. 128 bits — unguessable within one response. */
const NONCE_BYTES = 16;

/**
 * Mint a fresh per-response CSP nonce.
 *
 * A nonce is only worth anything if it is unpredictable and never reused across
 * responses, so it comes from the platform CSPRNG and is encoded base64url with
 * no padding (base64's `+`, `/` and `=` are legal in a nonce-source but make the
 * header harder to read and to assert on).
 */
export function createCspNonce(): string {
  const bytes = new Uint8Array(NONCE_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * True when `value` is a nonce this module would have minted. Used to fail closed
 * rather than interpolate an unexpected value into a header: a nonce reaches the
 * builder from the request boundary only, but a header is not the place to find
 * out that an assumption broke.
 */
export function isValidCspNonce(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/** The directives shared by both policies, in a stable, readable order. */
function baseDirectives(nonce: string): readonly string[] {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "media-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "font-src 'self'",
    // See the header: `data:` for the CSS mask and data-URI avatars, `https:` for
    // owner-entered Person photo URLs. Never `*`, never `http:`.
    "img-src 'self' data: https:",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    // The one documented exception, and it is confined to ATTRIBUTES: an injected
    // `<style>` element is still refused by `style-src` above.
    "style-src-attr 'unsafe-inline'",
    "connect-src 'self'",
  ];
}

/**
 * Build the effective Content-Security-Policy for one response.
 *
 * Pure and total: same inputs, same string. An invalid nonce raises rather than
 * being written into a header — a malformed nonce-source silently disables the
 * whole `script-src`, which is the one failure this policy must not have.
 */
export function buildContentSecurityPolicy(options: {
  readonly nonce: string;
  readonly mode: CspMode;
}): string {
  if (!isValidCspNonce(options.nonce)) {
    throw new TypeError("A CSP nonce must be a base64url token.");
  }
  const directives = [...baseDirectives(options.nonce)];
  if (options.mode === "development") {
    /*
     * Vite's dev server injects an inline preamble and the HMR client without a
     * nonce, evaluates transformed modules, serves every stylesheet as a
     * JS-injected `<style>` element, and talks to itself over a websocket. None
     * of that exists in a build, and none of it is reachable from the production
     * policy above.
     *
     * The nonce is REPLACED here rather than kept alongside `'unsafe-inline'`,
     * and that is a CSP rule rather than a preference: when a directive carries
     * any nonce or hash source, browsers IGNORE `'unsafe-inline'` in it. Leaving
     * the nonce in would therefore have produced a development policy that
     * silently blocked Vite's own styles — which is exactly what it did, until a
     * browser run reported `style-src-elem` violations on every dev page.
     */
    replace(
      directives,
      "script-src",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    );
    replace(directives, "style-src", "style-src 'self' 'unsafe-inline'");
    replace(directives, "connect-src", "connect-src 'self' ws: wss:");
  }
  return directives.join("; ");
}

/** Swap one directive for another, in place, keeping the declared order. */
function replace(
  directives: string[],
  name: string,
  replacement: string,
): void {
  const index = directives.findIndex((value) => value.startsWith(`${name} `));
  directives[index] = replacement;
}

/**
 * The trusted server-side value the CSP mode is resolved from. Deliberately the
 * SAME `ENVIRONMENT` variable authentication reads, so there is one answer to
 * "is this a development runtime?" rather than two.
 */
export interface CspModeEnv {
  readonly ENVIRONMENT?: string;
}

/**
 * Resolve which policy applies. Fails CLOSED: anything other than an explicit
 * development/test `ENVIRONMENT` inside a development BUILD gets the production
 * policy.
 *
 * `import.meta.env.DEV` is a build-time constant — Vite replaces it with `false`
 * when building the Worker — so a deployed bundle cannot be argued into the
 * relaxed policy by an environment variable, a header or a hostname.
 */
export function resolveCspMode(env: CspModeEnv): CspMode {
  if (!import.meta.env.DEV) {
    return "production";
  }
  const environment = (env.ENVIRONMENT ?? "").trim().toLowerCase();
  return DEVELOPMENT_ENVIRONMENTS.has(environment)
    ? "development"
    : "production";
}
