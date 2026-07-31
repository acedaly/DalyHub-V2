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
