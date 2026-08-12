/**
 * CAL-01 — the feed-URL policy: what DalyHub's Worker is allowed to fetch.
 *
 * ── The threat ──────────────────────────────────────────────────────────────
 * "Add a calendar" is a control that makes the SERVER issue an HTTP request to
 * an address the owner types. That is server-side request forgery by design, and
 * the only thing separating it from a generic internal-network HTTP proxy is
 * this file. Cloudflare Workers have no private network to reach into, which
 * bounds the blast radius considerably — but "the platform happens to make it
 * hard" is not a control, and a deployment behind Cloudflare Tunnel or on a
 * self-hosted runtime would not have that protection.
 *
 * ── The policy ──────────────────────────────────────────────────────────────
 *   1. **`https:` only**, with `webcal:` accepted and REWRITTEN to `https:`.
 *      Plain `http:` is refused: the URL is a credential (anyone holding it can
 *      read the calendar), and sending it in clear is not a trade DalyHub makes
 *      for the convenience of one non-TLS publisher. Every other scheme —
 *      `file:`, `data:`, `ftp:`, `gopher:` — is refused outright.
 *   2. **No credentials in the URL.** A `user:pass@host` form is refused rather
 *      than stripped: silently changing what the owner pasted is how a source
 *      "works" in validation and fails forever afterwards.
 *   3. **No loopback, private, link-local, unique-local or reserved target.**
 *      Both as a literal IP and as a hostname that cannot be anything else
 *      (`localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`).
 *   4. **No non-standard port.** 443 only, which is what an HTTPS publisher
 *      uses and what removes port scanning from the surface entirely.
 *   5. **Redirects are bounded and REVALIDATED.** The fetch layer follows at
 *      most {@link MAX_FEED_REDIRECTS} hops and runs every destination back
 *      through this same function, so a publisher cannot redirect DalyHub
 *      somewhere the policy would have refused at entry.
 *
 * ── The residual risk, stated rather than implied ───────────────────────────
 * A hostname is not resolved here — a Worker cannot resolve DNS before fetching,
 * so a name that resolves to a private address (DNS rebinding) passes rules 3–4
 * on its literal form. What that buys an attacker on Cloudflare's edge is a
 * request to an address the Worker cannot route to anyway; what it would buy on
 * a self-hosted runtime is real, and is recorded as a deliberate, documented
 * limitation in the CAL-01 product document rather than papered over.
 */

/** Why a URL was refused. A CODE — the sentence for it is written once, in the UI. */
export type FeedUrlRejection =
  "malformed" | "scheme" | "credentials" | "port" | "blocked_host";

export class FeedUrlError extends Error {
  constructor(readonly reason: FeedUrlRejection) {
    super(FEED_URL_MESSAGES[reason]);
    this.name = "FeedUrlError";
  }
}

/** The owner-facing sentence for each refusal. Never echoes the URL back. */
export const FEED_URL_MESSAGES: Readonly<Record<FeedUrlRejection, string>> = {
  malformed: "That does not look like a calendar address.",
  scheme:
    "Calendar addresses must start with https:// or webcal:// — a plain http:// address would send your private calendar link unencrypted.",
  credentials:
    "Remove the username and password from the address. Publish the calendar with a secret link instead.",
  port: "Calendar addresses must use the standard https port.",
  blocked_host:
    "That address points at a private or local network, which DalyHub will not fetch.",
};

/** Host names that can only ever mean "this machine" or "this network". */
const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
];
const BLOCKED_HOST_EXACT = new Set(["localhost", "local", "internal"]);

/** `1.2.3.4` — four decimal octets, and nothing else. */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Is this literal IPv4 address one DalyHub refuses to fetch?
 *
 * Loopback, this-network, private (RFC 1918), CGNAT, link-local (which includes
 * the `169.254.169.254` cloud metadata endpoint), benchmarking, documentation,
 * multicast and reserved. Everything not on the list is public.
 */
function isBlockedIpv4(host: string): boolean {
  const match = IPV4.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((value) => Number.isNaN(value) || value > 255)) return true;
  const [a, b] = octets as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10/8 private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12 private
  if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24
  if (a === 192 && b === 168) return true; // 192.168/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // documentation
  if (a === 203 && b === 0) return true; // documentation
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

/**
 * Is this literal IPv6 address one DalyHub refuses to fetch?
 *
 * `::`, `::1`, unique-local (`fc00::/7`), link-local (`fe80::/10`), multicast
 * (`ff00::/8`) and any IPv4-mapped form, which is re-checked as IPv4 so
 * `::ffff:127.0.0.1` cannot walk past the v4 rules.
 */
function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.startsWith("[") || !hostname.endsWith("]")) return false;
  const inner = hostname.slice(1, -1).toLowerCase();
  if (inner === "::" || inner === "::1") return true;
  const mapped = inner.lastIndexOf(":");
  const tail = inner.slice(mapped + 1);
  if (IPV4.test(tail) && isBlockedIpv4(tail)) return true;
  const head = inner.split(":")[0] ?? "";
  if (head.startsWith("ff")) return true; // multicast
  if (/^f[cd]/.test(head)) return true; // unique-local fc00::/7
  if (/^fe[89ab]/.test(head)) return true; // link-local fe80::/10
  return false;
}

/**
 * Validate and normalise a feed address, returning the exact URL to fetch.
 *
 * Applied at THREE moments, and it must be the same function at all three: when
 * a source is added, when a source is edited, and on every redirect hop during a
 * refresh. A policy enforced only at entry is a policy a redirect walks around.
 */
export function normaliseFeedUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    throw new FeedUrlError("malformed");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new FeedUrlError("malformed");
  }

  // webcal:// is a presentation scheme for "subscribe to this ICS feed". It is
  // fetched over https, which is the ONLY rewrite performed here — an http URL
  // is refused rather than upgraded, because upgrading it would claim a
  // guarantee the publisher may not offer.
  if (url.protocol === "webcal:") {
    url = new URL(`https:${trimmed.slice(trimmed.indexOf(":") + 1)}`);
  }
  if (url.protocol !== "https:") {
    throw new FeedUrlError("scheme");
  }
  if (url.username !== "" || url.password !== "") {
    throw new FeedUrlError("credentials");
  }
  if (url.port !== "" && url.port !== "443") {
    throw new FeedUrlError("port");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname.length === 0) {
    throw new FeedUrlError("malformed");
  }
  if (
    BLOCKED_HOST_EXACT.has(hostname) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)) ||
    isBlockedIpv4(hostname) ||
    isBlockedIpv6(url.hostname.toLowerCase()) ||
    // A bare hostname with no dot cannot be a public name.
    !hostname.includes(".")
  ) {
    throw new FeedUrlError("blocked_host");
  }

  // The fragment is never sent and carries nothing a server can use, so it is
  // dropped: keeping it would make two identical feeds fingerprint differently.
  url.hash = "";
  return url.toString();
}

/**
 * The presentational provider guess, from the host alone.
 *
 * Host suffixes rather than substrings, so `outlook.evil.example` is not read as
 * Outlook. It is presentation only — see `CalendarProviderHint`.
 */
export function providerHintForUrl(
  normalisedUrl: string,
): "outlook" | "apple" | "google" | "fastmail" | "generic" {
  let host: string;
  try {
    host = new URL(normalisedUrl).hostname.toLowerCase();
  } catch {
    return "generic";
  }
  const endsWithHost = (suffix: string) =>
    host === suffix || host.endsWith(`.${suffix}`);
  if (
    endsWithHost("outlook.com") ||
    endsWithHost("outlook.office365.com") ||
    endsWithHost("office365.com") ||
    endsWithHost("live.com") ||
    endsWithHost("office.com")
  ) {
    return "outlook";
  }
  if (endsWithHost("icloud.com") || endsWithHost("me.com")) {
    return "apple";
  }
  if (endsWithHost("google.com") || endsWithHost("googleusercontent.com")) {
    return "google";
  }
  if (endsWithHost("fastmail.com") || endsWithHost("messagingengine.com")) {
    return "fastmail";
  }
  return "generic";
}

/**
 * The one safe thing that may be said ABOUT a feed URL in the product.
 *
 * The host, and never the path — the path is where a published-calendar secret
 * lives. Used only where the owner genuinely needs to tell two sources apart;
 * it is never logged, never put in an error and never sent to analytics.
 */
export function feedUrlHost(normalisedUrl: string): string | null {
  try {
    return new URL(normalisedUrl).hostname;
  } catch {
    return null;
  }
}
