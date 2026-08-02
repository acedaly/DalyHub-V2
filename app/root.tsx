// Adapted from the Cloudflare create-cloudflare (C3) React Router template
// (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0, MIT, retrieved 2026-07-17.
// Changes: FND-09 reads the persisted theme preference in the root loader and
// applies it to <html data-theme> during SSR, so the page is rendered with the
// correct theme on the first byte (no light-to-dark flash and no client theme
// script). THEME-01 made the owner's preferences record the authority for that
// value and demoted the cookie to a first-paint mirror, so the layout below
// prefers the app shell's loader data and falls back to the cookie. Styling stays
// plain CSS; the design system is DS-01.
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import type { Location } from "react-router";

import type { Route } from "./+types/root";
import {
  DEFAULT_THEME,
  readThemePreference,
  type ThemePreference,
} from "./shared/shell/theme";
import "./app.css";

export function loader({ request }: Route.LoaderArgs) {
  // The FALLBACK theme, read from the first-paint cookie mirror. The root loader
  // deliberately does no database work: it runs for every document, including
  // renders where the authenticated shell never resolves. The cookie is not secret
  // and is safe to read here; the app shell supplies the authoritative value.
  return { theme: readThemePreference(request.headers.get("Cookie")) };
}

/**
 * PWA-01 — the browser/OS chrome colour for the resolved theme.
 *
 * Each curated theme's `--dh-color-bg`, duplicated here as a literal because
 * `theme-color` is read by the browser BEFORE any stylesheet is parsed — it
 * cannot reference a CSS custom property. `tokens.css` remains the source of
 * truth, and `test/unit/pwa/manifest-and-icons.test.ts` fails if these drift
 * apart, so the duplication cannot rot silently.
 *
 * `daly-light` is absent deliberately: it inherits the `:root` background rather
 * than declaring its own, so it uses the same fallback the map's default does.
 */
const THEME_CHROME: Partial<Record<ThemePreference, string>> = {
  "daly-dark": "#101215",
  "modern-light": "#f2eee6",
  "modern-dark": "#0f1116",
  eucalypt: "#f7f5ef",
  coastal: "#f4f7f9",
  ember: "#faf6f2",
};

/** The `:root` background, used by `daly-light` and as the light fallback. */
const LIGHT_CHROME = "#faf9f7";

/** The `daly-dark` background, used as the dark half of the `system` pair. */
const DARK_CHROME = "#101215";

function ThemeColor({ theme }: { readonly theme: ThemePreference }) {
  // `system` is the ONE preference that genuinely defers to the OS, so it is the
  // one that emits a `prefers-color-scheme` pair. Every other theme is already
  // decided server-side, and emitting a media query for it would let the OS
  // contradict the owner's explicit choice.
  if (theme === "system") {
    return (
      <>
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content={LIGHT_CHROME}
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content={DARK_CHROME}
        />
      </>
    );
  }
  return (
    <meta name="theme-color" content={THEME_CHROME[theme] ?? LIGHT_CHROME} />
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
  // THEME-01 — the theme is resolved from the most authoritative source that is
  // actually available for THIS render, so the very first byte is already correct:
  //
  //   1. the app shell's loader data, which read the owner's stored preference;
  //   2. the root loader's cookie mirror, for documents that never reach the shell
  //      (a shell loader failure rendering the root error boundary);
  //   3. `system`, if even the root loader has not resolved.
  //
  // `data-theme` is written server-side, so there is no light-to-dark flash and no
  // inline bootstrapping script. On a client-side theme change React patches this
  // one attribute, which is why switching is instant and reloads nothing.
  const rootData = useRouteLoaderData<typeof loader>("root");
  const shellData = useRouteLoaderData<{ theme?: ThemePreference }>(
    "app-shell",
  );
  const theme: ThemePreference =
    shellData?.theme ?? rootData?.theme ?? DEFAULT_THEME;
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
        {/* Favicons. The SVG is preferred by browsers that support it and scales
         * to any surface; the `.ico` covers the rest and the Windows shortcut. */}
        <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
        <link rel="icon" href="/icons/dalyhub-mark.svg" type="image/svg+xml" />
        {/* iOS/iPadOS home screen. Opaque and full-bleed: iOS applies its own
         * mask (PWA-01 icon system). */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        {/* The browser/OS chrome colour, matched to the resolved theme's page
         * background so an installed window's chrome continues the page rather
         * than framing it.
         *
         * Resolved SERVER-SIDE from the same `theme` that writes `data-theme`,
         * so every curated theme gets its own chrome — including eucalypt,
         * coastal and ember — with no client script and no first-paint
         * correction. Only `system` emits the `prefers-color-scheme` pair,
         * because only `system` genuinely defers the choice to the OS. */}
        <ThemeColor theme={theme} />
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
