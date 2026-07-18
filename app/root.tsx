// Adapted from the Cloudflare create-cloudflare (C3) React Router template
// (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0, MIT, retrieved 2026-07-17.
// Changes: FND-09 reads the persisted theme preference from the request cookie in
// the root loader and applies it to <html data-theme> during SSR, so the page is
// rendered with the correct theme on the first byte (no light-to-dark flash and no
// client cookie reading). Styling stays plain CSS; the design system is DS-01.
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import {
  readThemePreference,
  type ThemePreference,
} from "./shared/shell/theme";
import "./app.css";

export function loader({ request }: Route.LoaderArgs) {
  // The theme preference is not secret: it is safe to read here (this loader runs
  // for authenticated pages) purely from the request cookie.
  return { theme: readThemePreference(request.headers.get("Cookie")) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // `useRouteLoaderData` returns undefined during an error render before the root
  // loader resolved; fall back to `system` so the document still renders safely.
  const data = useRouteLoaderData<typeof loader>("root");
  const theme: ThemePreference = data?.theme ?? "system";
  return (
    <html lang="en" data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
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
