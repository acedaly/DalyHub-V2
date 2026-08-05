/**
 * AUDIT-FIX-04 request platform — mutation provenance (application-level CSRF
 * defence-in-depth).
 *
 * ── The threat ───────────────────────────────────────────────────────────────
 * DalyHub has no session cookie of its own: authentication rides the Cloudflare
 * Access `CF_Authorization` cookie (ADR-016 §5.1). A cookie is attached by the
 * browser to a request because of WHERE IT IS GOING, never because of WHO ASKED
 * FOR IT. So an authenticated, valid, correctly-signed request is NOT by itself
 * evidence that the owner asked DalyHub for it: a page on another origin can
 * cause the browser to send one — deleting a Note, completing a Task, running a
 * command, purging a record, changing Settings.
 *
 * Cloudflare Access answers *who*. This module answers *did DalyHub itself ask
 * for this*. It is defence-in-depth at DalyHub's own boundary, not a replacement
 * for authentication.
 *
 * ── Why same-origin, and why `same-site` is NOT enough ───────────────────────
 * `daly.id.au` has siblings. A compromised or XSS'd `something-else.daly.id.au`
 * is **same-site** with `hub.daly.id.au` — so `SameSite=Lax`/`Strict` cookies are
 * still sent, and `Sec-Fetch-Site: same-site` is still reported. It is NOT the
 * same ORIGIN. The only relationship this module accepts for a protected
 * mutation is an exact origin match: scheme, hostname and effective port.
 *
 * That is why there is no `endsWith(".daly.id.au")` here, no registrable-domain
 * comparison, no hostname-only comparison, no wildcard subdomain and no port
 * normalisation. `https://hub.daly.id.au`, `http://hub.daly.id.au`,
 * `https://other.daly.id.au` and `https://hub.daly.id.au:8443` are four different
 * origins, and three of them are rejected.
 *
 * ── The trusted origin is the request's own URL ──────────────────────────────
 * `new URL(request.url).origin` is the destination the browser actually
 * addressed. Under DalyHub's deployment contract that is authoritative and needs
 * no configuration value:
 *
 *   - production sets `workers_dev: false` and `preview_urls: false`
 *     (`wrangler.jsonc`, enforced by the deploy preflight in
 *     `scripts/deploy-production.mjs`), so the ONLY hostname Cloudflare routes to
 *     this Worker is the Access-protected custom domain;
 *   - a browser derives `Host` from the URL it is fetching, and the Access cookie
 *     is scoped to that same host — so a request can only arrive here bearing the
 *     owner's session if it was addressed to DalyHub's own origin;
 *   - nothing here reads `X-Forwarded-Host`, `X-Forwarded-Proto` or any other
 *     client-supplied forwarding header.
 *
 * Local development and the Playwright suite therefore work unchanged: the
 * trusted origin is simply `http://localhost:<port>` there.
 *
 * ── Both signals are browser-controlled, and neither is reachable from JS ─────
 * `Origin` and `Sec-Fetch-Site` are forbidden header names: page JavaScript
 * cannot set or forge either. They are read together, and DISAGREEMENT is itself
 * a rejection — a request claiming `Sec-Fetch-Site: same-origin` while carrying a
 * hostile `Origin` is not a request any browser makes.
 *
 * The module is pure: it reads a `Request`, returns a typed verdict, and carries
 * no cookie, token, body or header value into its result.
 */

/** Methods that cannot mutate state, and so need no provenance. */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The `Sec-Fetch-Site` values a browser can report. Anything else — a new token,
 * a typo, two comma-joined values — is UNKNOWN and fails closed.
 */
type FetchSiteSignal =
  "same-origin" | "same-site" | "cross-site" | "none" | "absent" | "unknown";

/** What the `Origin` header said, relative to the trusted application origin. */
type OriginSignal = "same" | "different" | "absent" | "invalid";

/** Why a mutation was refused. Bounded, non-sensitive, safe to log. */
export type MutationProvenanceRejection =
  /** Neither `Origin` nor a usable `Sec-Fetch-Site` was present. */
  | "missing_provenance"
  /** `Origin` was `null`, malformed, non-canonical, or sent more than once. */
  | "invalid_origin"
  /** `Origin` parsed cleanly and is a DIFFERENT origin (including a sibling). */
  | "cross_origin"
  /** `Sec-Fetch-Site` was `same-site`, `cross-site`, `none` or unrecognised. */
  | "disallowed_fetch_site"
  /** `Origin` and `Sec-Fetch-Site` contradict each other. */
  | "inconsistent_signals";

/** The verdict for one request. Never carries a raw header value. */
export type MutationProvenanceResult =
  | { readonly allowed: true; readonly reason: "safe_method" | "same_origin" }
  | { readonly allowed: false; readonly reason: MutationProvenanceRejection };

/**
 * True when a method cannot mutate state.
 *
 * Deliberately an allowlist of SAFE methods rather than a denylist of unsafe
 * ones: an unknown or future method (`PURGE`, `LOCK`, a typo'd `POSTT`) is
 * treated as MUTATING and must prove its provenance.
 */
export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * Classify the `Origin` header against the trusted origin.
 *
 * `Headers.get` joins repeated headers with `", "`, so a comma anywhere in the
 * value means the request carried more than one `Origin` (or a value no browser
 * would send) — ambiguous, and rejected rather than guessed at.
 *
 * The value must also be EXACTLY its own serialised origin. `null`, a `file:`/
 * `data:` origin, a bare hostname and `https://hub.daly.id.au/anything` are all
 * refused: a browser sends a canonical ASCII origin serialisation and nothing
 * else.
 */
function classifyOrigin(
  raw: string | null,
  trustedOrigin: string,
): OriginSignal {
  if (raw === null) return "absent";
  const value = raw.trim();
  if (value.length === 0 || value.includes(",")) return "invalid";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "invalid";
  }
  // `Origin: null` and any opaque origin serialise to the string "null".
  if (parsed.origin === "null" || parsed.origin !== value) return "invalid";
  return parsed.origin === trustedOrigin ? "same" : "different";
}

/** Classify the `Sec-Fetch-Site` header. Unrecognised values fail closed. */
function classifyFetchSite(raw: string | null): FetchSiteSignal {
  if (raw === null) return "absent";
  const value = raw.trim().toLowerCase();
  switch (value) {
    case "same-origin":
    case "same-site":
    case "cross-site":
    case "none":
      return value;
    default:
      return "unknown";
  }
}

/**
 * Decide whether a request may mutate DalyHub state.
 *
 * The policy, exhaustively:
 *
 * | `Origin`      | `Sec-Fetch-Site` | verdict                 |
 * | ------------- | ---------------- | ----------------------- |
 * | safe method   | (any)            | allow `safe_method`     |
 * | exact match   | `same-origin`    | allow `same_origin`     |
 * | exact match   | absent           | allow `same_origin`     |
 * | exact match   | anything else    | `inconsistent_signals`  |
 * | different     | `same-origin`    | `inconsistent_signals`  |
 * | different     | anything else    | `cross_origin`          |
 * | invalid       | (any)            | `invalid_origin`        |
 * | absent        | `same-origin`    | `missing_provenance`    |
 * | absent        | absent           | `missing_provenance`    |
 * | absent        | anything else    | `disallowed_fetch_site` |
 *
 * **`Origin` is required for every mutation.** The Fetch Standard has browsers
 * attach `Origin` to every request whose method is not `GET`/`HEAD`, and DalyHub
 * has no non-browser mutation client: React Router forms and fetcher
 * submissions, the Quick Capture sheets, inline Task editing, the Command
 * Palette and the PWA offline-replay queue (`app/shared/offline/sync.ts`, which
 * replays through the ordinary create routes with an ordinary same-origin
 * `fetch`) all produce it. So the `Origin`-absent-but-`Sec-Fetch-Site:
 * same-origin` compatibility case is NOT taken: no legitimate client needs it,
 * and admitting it would be a permissive fallback bought for nothing.
 *
 * `Sec-Fetch-Site` is a corroborating signal, never a substitute. It is the one
 * that closes the sibling-subdomain gap SameSite cookies leave open, so
 * `same-site` is rejected as firmly as `cross-site`.
 */
export function evaluateMutationProvenance(
  request: Request,
  trustedOrigin: string,
): MutationProvenanceResult {
  if (isSafeMethod(request.method)) {
    return { allowed: true, reason: "safe_method" };
  }

  const origin = classifyOrigin(request.headers.get("Origin"), trustedOrigin);
  const fetchSite = classifyFetchSite(request.headers.get("Sec-Fetch-Site"));

  if (origin === "invalid") {
    return { allowed: false, reason: "invalid_origin" };
  }

  if (origin === "same") {
    if (fetchSite === "same-origin" || fetchSite === "absent") {
      return { allowed: true, reason: "same_origin" };
    }
    // A same-origin `Origin` alongside `same-site`/`cross-site`/`none`/garbage:
    // the two forbidden headers disagree, and no browser produces that pair.
    return { allowed: false, reason: "inconsistent_signals" };
  }

  if (origin === "different") {
    // A hostile origin wearing a reassuring fetch-site label is a contradiction,
    // and worth distinguishing from an honest cross-origin attempt.
    return {
      allowed: false,
      reason:
        fetchSite === "same-origin" ? "inconsistent_signals" : "cross_origin",
    };
  }

  // `Origin` absent. Nothing below can substitute for it; the fetch-site value
  // only makes the rejection reason more precise.
  if (fetchSite === "absent" || fetchSite === "same-origin") {
    return { allowed: false, reason: "missing_provenance" };
  }
  return { allowed: false, reason: "disallowed_fetch_site" };
}

/**
 * The trusted application origin for a request: the origin the browser actually
 * addressed. See the file header for why this needs no configuration value and
 * why no forwarding header is consulted.
 */
export function trustedOriginFor(request: Request): string {
  return new URL(request.url).origin;
}
