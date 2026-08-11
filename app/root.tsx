// Adapted from the Cloudflare create-cloudflare (C3) React Router template
// (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0, MIT, retrieved 2026-07-17.
// Changes: the document shell renders DalyHub's own head — manifest, icons,
// preloaded UI font and the `theme-color` pair — and restores scroll by path
// rather than by history entry (ADR-018). Styling stays plain CSS; the design
// system is Material Design 3 (ADR-074).
//
// APPEARANCE-01 resolves the owner's appearance preference here and writes it to
// `<html data-appearance>` during SSR, so the first byte already carries the right
// appearance. There is no bootstrapping script — nothing to exempt from the CSP,
// nothing to run before paint, and nothing for React to disagree with at
// hydration, because the server and the client render the attribute from the same
// loader data.
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
  DEFAULT_APPEARANCE,
  readAppearancePreference,
  type AppearancePreference,
} from "./kernel/preferences/appearance";
import { DARK_SCHEME, LIGHT_SCHEME } from "./shared/tokens";
import "./app.css";

/**
 * APPEARANCE-01 — the FALLBACK appearance, read from the first-paint cookie
 * mirror.
 *
 * The root loader deliberately does no database work: it runs for every document,
 * including renders where the authenticated shell never resolves (`/offline`, a
 * root error boundary). The cookie is not secret and is safe to read here; the
 * app shell supplies the authoritative value when it resolves.
 */
export function loader({ request }: Route.LoaderArgs) {
  return {
    appearance: readAppearancePreference(request.headers.get("Cookie")),
  };
}

/**
 * PWA-01 — the browser/OS chrome colour.
 *
 * The generated `--md-app-color-surface-page` for each scheme, imported from the
 * same `scheme.ts` the stylesheet is generated alongside, because `theme-color`
 * is read by the browser BEFORE any stylesheet is parsed and cannot reference a
 * CSS custom property.
 *
 * `system` is the one preference that genuinely defers to the device, so it is the
 * one that emits a `prefers-color-scheme` PAIR — which is also what keeps the
 * chrome following the device when the system appearance changes mid-session. An
 * explicit Light or Dark is already decided server-side, and emitting a media
 * query for it would let the operating system contradict the owner's choice in the
 * one place the stylesheet cannot correct.
 */
function ThemeColor({
  appearance,
}: {
  readonly appearance: AppearancePreference;
}) {
  if (appearance === "system") {
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
  return (
    <meta
      name="theme-color"
      content={
        appearance === "dark"
          ? DARK_SCHEME["app-surface-page"]
          : LIGHT_SCHEME["app-surface-page"]
      }
    />
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
  // APPEARANCE-01 — the appearance is resolved from the most authoritative source
  // that is actually available for THIS render, so the very first byte is already
  // correct:
  //
  //   1. the app shell's loader data, which read the owner's stored preference;
  //   2. the root loader's cookie mirror, for documents that never reach the shell
  //      (`/offline`, or a shell loader failure rendering the root error boundary);
  //   3. `system`, if even the root loader has not resolved.
  //
  // `data-appearance` is written server-side, so there is no light-to-dark flash,
  // no inline bootstrapping script and no hydration mismatch. On a client-side
  // change React patches this ONE attribute, which is why switching is instant and
  // reloads nothing. `system` is passed straight through rather than resolved: the
  // server has no device signal, and the stylesheet's `prefers-color-scheme` block
  // resolves it — which is also what makes it keep up with the device while
  // DalyHub is open, with no listener and no re-render.
  const rootData = useRouteLoaderData<typeof loader>("root");
  const shellData = useRouteLoaderData<{
    appearance?: AppearancePreference;
  }>("app-shell");
  const appearance: AppearancePreference =
    shellData?.appearance ?? rootData?.appearance ?? DEFAULT_APPEARANCE;
  return (
    <html lang="en" data-appearance={appearance}>
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
          href="/fonts/roboto-flex-3.200-latin-wght400-700.woff2"
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
        <ThemeColor appearance={appearance} />
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
        {/* AUDIT-10 — `<Links>` is the ONE nonce-aware component given an
         * explicit EMPTY nonce, and it needs the explanation.
         *
         * `entry.server.tsx` passes the request's nonce to `<ServerRouter>`, so
         * every nonce-aware component inherits it from the framework context.
         * That is right for `<Scripts>` and `<ScrollRestoration>`, whose inline
         * scripts `script-src` will not run without it. It is wrong here, for
         * two reasons: everything `<Links>` emits is a `<link>` — stylesheets and
         * module preloads, matched by URL against `style-src 'self'` /
         * `script-src 'self'`, never by nonce — and browsers deliberately BLANK
         * the `nonce` content attribute once the element is parsed, so the
         * server's markup reads back as `nonce=""` while the client (which has
         * no server nonce) renders `undefined`. React reported that as a
         * hydration mismatch on every page.
         *
         * Passing `""` is not null, so the framework nonce is not consulted, and
         * both sides render the same empty value. Nothing loses a nonce it
         * needed: the only thing `<Links>` would nonce is an inline critical-CSS
         * `<style>`, which exists only on the dev server (production emits no
         * `criticalCss` at all) where `style-src` carries `'unsafe-inline'`. */}
        <Links nonce="" />
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

/**
 * The document-level error surface — including the NOT-FOUND route.
 *
 * ── UIX-06 ──────────────────────────────────────────────────────────────────
 * This was the template's own boundary, and it showed: a mistyped URL produced
 * the heading "404" and the sentence "The requested page could not be found."
 * on a bare canvas, with no shell, no navigation and no way back. It was the
 * one screen in the product that had never been designed, and it broke two
 * rules at once — AGENTS.md §6 ("no dead ends: every error explains the
 * recovery") and §42's "readable, actionable, safe".
 *
 * It cannot render the app shell: the boundary runs for documents where the
 * authenticated shell never resolved, so reaching for it here would fail in
 * exactly the cases that need this surface most. It uses the product's own
 * empty-state ANATOMY instead — a heading, one explanatory line, one primary
 * action — drawn with the shared tokens, which is the same shape the owner sees
 * for every other "nothing here" in the application.
 *
 * The stack stays development-only, so a deployed Worker never shows one (§42).
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "We couldn’t find that page";
  let details =
    "The address may have changed, or the record may have been deleted.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status !== 404) {
      message = "Something went wrong";
      details =
        error.statusText ||
        "DalyHub could not complete that request. Your data is unaffected.";
    }
  } else {
    message = "Something went wrong";
    details =
      "DalyHub could not complete that request. Your data is unaffected.";
    if (import.meta.env.DEV && error && error instanceof Error) {
      details = error.message;
      stack = error.stack;
    }
  }

  return (
    <main className="page dh-route-error">
      <h1>{message}</h1>
      <p>{details}</p>
      {/* A real anchor, not a router `Link`: the boundary renders outside the
          shell's route context, and a dead end that offers a broken control is
          worse than one that offers none. */}
      <p className="dh-route-error__actions">
        <a className="dh-btn dh-btn--primary" href="/today">
          Go to Today
        </a>
      </p>
      {stack && (
        <pre>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
