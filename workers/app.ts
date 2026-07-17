// Adapted verbatim from the Cloudflare create-cloudflare (C3) React Router
// template (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0 / @cloudflare/vite-plugin 1.45.1, MIT, retrieved 2026-07-17.
// Changes: none (this is the standard Workers entry adapter for React Router).
import { createRequestHandler } from "react-router";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request) {
    return requestHandler(request);
  },
} satisfies ExportedHandler<Env>;
