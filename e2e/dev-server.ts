/**
 * The local server ports the Playwright suite drives, in ONE place.
 *
 * `playwright.config.ts` starts the servers and sets `baseURL` from these;
 * `helpers.ts` builds same-origin request headers from `DEV_ORIGIN`. They were
 * separate literals until AUDIT-FIX-04 gave the origin a second, security-
 * relevant consumer — and an origin that two files can disagree about is
 * exactly the kind of thing a CSRF guard turns into a confusing test failure.
 */

/** The DEV server (`react-router dev`) — development auth, the suite's `baseURL`. */
export const DEV_PORT = 4173;

/** The PRODUCTION-MODE server (`vite preview`) — Access mode, fails closed. */
export const PROD_PORT = 4174;

/** The origin DalyHub is served from during the suite. */
export const DEV_ORIGIN = `http://localhost:${DEV_PORT}`;

/**
 * A genuinely DIFFERENT origin backed by the SAME local server.
 *
 * `127.0.0.1` and `localhost` resolve to one machine but are two origins to the
 * browser — different cookie jars, different storage, and `Sec-Fetch-Site:
 * cross-site` between them. That makes it a real second origin for the
 * cross-origin regression test without standing up a second server.
 */
export const SECOND_ORIGIN = `http://127.0.0.1:${DEV_PORT}`;
