// Adapted from the Cloudflare create-cloudflare (C3) React Router template
// (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0 / @cloudflare/vite-plugin 1.45.1, MIT, retrieved 2026-07-17.
// Changes: removed SPA-mode handling (SPA mode is unused; ssr:true) and trimmed
// comments to DalyHub conventions.
//
// AUDIT-10: the render is given the request's CSP nonce, so every inline script
// the framework emits carries the SAME token the `Content-Security-Policy` header
// names. There are three emitters and this covers all of them:
//
//   - `<ServerRouter nonce>` puts the nonce on React Router's own inline scripts
//     (`<Scripts>`'s `window.__reactRouterContext` hand-off and module preloads,
//     and `<ScrollRestoration>`'s position restore) through the framework
//     context, so no component has to be threaded individually;
//   - `renderToReadableStream({ nonce })` puts it on React's streaming completion
//     instructions, the scripts React itself writes when a Suspense boundary
//     resolves;
//   - a route that renders its own inline script reads the nonce from the request
//     context (there is exactly one: `app/routes/offline.tsx`).
//
// The nonce comes from the request boundary via the load context, never from this
// module: minting one here would produce a token the response header does not
// name, which is the same as having no `script-src` at all.
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";

import { getCspNonce } from "~/platform/request";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: RouterContextProvider,
) {
  let shellRendered = false;
  const userAgent = request.headers.get("user-agent");
  // Empty only if a render somehow bypassed the boundary; an empty string is
  // passed through as `undefined` so React and React Router emit no `nonce`
  // attribute at all rather than an empty one that matches no policy.
  const nonce = getCspNonce(loadContext) || undefined;

  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} nonce={nonce} />,
    {
      nonce,
      onError(error: unknown) {
        responseStatusCode = 500;
        // Log streaming rendering errors from inside the shell. Don't log
        // errors encountered during initial shell rendering since they'll
        // reject and get logged in handleDocumentRequest.
        if (shellRendered) {
          console.error(error);
        }
      },
    },
  );
  shellRendered = true;

  // Ensure requests from bots wait for all content to load before responding.
  if (userAgent && isbot(userAgent)) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
