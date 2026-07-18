// Adapted from the Cloudflare create-cloudflare (C3) React Router template
// (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0 / @cloudflare/vite-plugin 1.45.1, MIT, retrieved 2026-07-17.
// Changes (FND-09, ADR-016 §5.5, §10): delegate to the authenticated request
// boundary, which authenticates BEFORE the React Router handler runs so no
// protected loader or action can execute before authentication succeeds.
import { createRequestHandler } from "react-router";

import { handleAuthenticatedRequest } from "~/platform/request";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    return handleAuthenticatedRequest(request, env, requestHandler);
  },
} satisfies ExportedHandler<Env>;
