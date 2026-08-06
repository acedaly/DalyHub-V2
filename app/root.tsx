// Adapted from the Cloudflare create-cloudflare (C3) React Router template
// (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0, MIT, retrieved 2026-07-17.
// Changes: the document shell renders DalyHub's own head — manifest, icons,
// preloaded UI font and the `theme-color` pair — and restores scroll by path
// rather than by history entry (ADR-018). Styling stays plain CSS; the design
// system is Material Design 3 (ADR-074), and the light/dark choice belongs to
// `prefers-color-scheme` rather than to a stored preference.
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Location } from "react-router";

import type { Route } from "./+types/root";
import {
  readThemePreference,
  type ThemePreference,
} from "./shared/shell/theme";
import { DARK_SCHEME, LIGHT_SCHEME } from "./shared/tokens";
import "./app.css";

export function loader({ request }: Route.LoaderArgs) {
  // The FALLBACK theme, read from the first-paint cookie mirror. The root loader
  // deliberately does no database work: it runs for every document, including
  // renders where the authenticated shell never resolves. The cookie is not secret
  // and is safe to read here; the app shell supplies the authoritative value.
  return { theme: readThemePreference(request.headers.get("Cookie")) };
}

/**
 * PWA-01 — the browser/OS chrome colour.
 *
 * The generated `--md-app-color-surface-page` for each scheme, imported from the
 * same `scheme.ts` the stylesheet is generated alongside, because `theme-color`
 * is read by the browser BEFORE any stylesheet is parsed and cannot reference a
 * CSS custom property.
 *
 * M3-01: there is one light/dark pair and the choice belongs to the OS, so the
 * document always emits the `prefers-color-scheme` pair. Nothing here depends on
 * a stored preference any more (ADR-074).
 */
function ThemeColor() {
  return (
    <>
      <meta
        name="theme-color"
        media="(prefers-color-scheme: light)"
        content={LIGHT_SCHEME["app-surface-page"]}
      />
      <meta
        name="theme-color"
        media="(prefers-color-scheme: dark)"
        content={DARK_SCHEME["app-surface-page"]}
      />
    </>
  );
}

/**
 * Scroll restoration keyed by PATH, not by history entry. A DS-03 Drawer (and a
 * DS-02 tab) is a query-only, same-document transition that must not move the
 * underlying page; keying scroll to the pathname means opening/closing a drawer
 * keeps one scroll position, while genuine page-to-page navigation still saves and
 * restores scroll per route (ADR-018).
 */
function scrollRestorationKey(location: Location): string {
  return location.pathname;
}

export function Layout({ children }: { children: React.ReactNode }) {
  // M3-01 — the theme feature is inert. `tokens.css` no longer carries a single
  // `[data-theme]` selector: there is one generated light/dark pair, selected by
  // `prefers-color-scheme`. The attribute is still written so nothing that reads
  // it breaks mid-migration, but it is pinned to `system` rather than resolved.
  // step 6 removes this, together with the loader, the cookie and the column.
  const theme: ThemePreference = "system";
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        {/* `viewport-fit=cover` opts the document into the display's full width
         * on devices with a display cutout (notch/rounded corners) so the
         * `env(safe-area-inset-*)` values the shell, Drawer, Inspector and toast
         * layer already reference resolve to real insets instead of 0 (DS-11). */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        {/* PWA-01 — installation and device metadata.
         *
         * `crossOrigin="use-credentials"` on the manifest is LOAD-BEARING, not
         * boilerplate: a manifest is fetched with `credentials: "omit"` by
         * default, and DalyHub sits entirely behind Cloudflare Access, so an
         * anonymous manifest fetch is redirected to the Access login page and the
         * browser concludes the app has no manifest — no install prompt, no
         * standalone launch, no icon. Sending credentials makes the fetch carry
         * the Access cookie, so the manifest resolves for an authenticated
         * device and 401s for anyone else. See PWA_AND_OFFLINE.md.
         */}
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="use-credentials"
        />
        {/* M3-01 — the one UI family, preloaded.
         *
         * Roboto Flex paints every piece of text in the product, chrome and
         * prose alike, so it is on the critical path of every page.
         *
         * `crossOrigin` is required even though the file is same-origin: a font
         * is always fetched in CORS mode, and a preload whose mode does not
         * match the eventual request is downloaded twice. `font-display: swap`
         * in `fonts.css` means the system stack paints while this is in flight,
         * so text is never invisible and this is an optimisation rather than a
         * dependency. */}
        <link
          rel="preload"
          href="/fonts/inter-4.1-latin-wght400-600.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Favicons. The SVG is preferred by browsers that support it and scales
         * to any surface; the `.ico` covers the rest and the Windows shortcut.
         *
         * BRAND-01 — the `-v2` suffix is the icon system's generation, and it is
         * load-bearing rather than tidy: a browser and an installed PWA both key
         * their icon caches by URL, so replacing the BYTES behind
         * `/icons/icon-192.png` can leave the superseded mark on a home screen
         * indefinitely. A new path is a new resource. `favicon.ico` cannot be
         * renamed — user agents request it at the origin root whether or not a
         * document links to one — so it carries the generation as a query
         * instead, which refreshes a returning visitor's tab icon while the bare
         * path keeps working for everything that guesses it. */}
        <link rel="icon" href="/favicon.ico?v=2" sizes="16x16 32x32 48x48" />
        <link
          rel="icon"
          href="/icons/dalyhub-mark-v2.svg"
          type="image/svg+xml"
        />
        {/* iOS/iPadOS home screen. Opaque and full-bleed: iOS applies its own
         * mask (BRAND-01 icon system). */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon-v2.png" />
        {/* The browser/OS chrome colour, matched to each scheme's page
         * background so an installed window's chrome continues the page rather
         * than framing it. Both halves are emitted with a media attribute, so
         * the OS picks the one that matches what the stylesheet is painting. */}
        <ThemeColor />
        {/* Standalone launch. `mobile-web-app-capable` is the standard name;
         * `apple-mobile-web-app-capable` is kept ALONGSIDE it because current
         * iOS Safari still reads only the Apple-prefixed name when deciding
         * whether an Add to Home Screen launch opens without browser chrome.
         * It is retained for that demonstrated compatibility reason, not habit. */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* `default` keeps the iOS status bar opaque and lets it follow the
         * system appearance. `black-translucent` would put content under the
         * status bar for no gain — the shell already respects safe-area insets. */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="DalyHub" />
        <meta name="application-name" content="DalyHub" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration getKey={scrollRestorationKey} />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="page">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
