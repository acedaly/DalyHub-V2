import { env } from "cloudflare:workers";

import { healthResponse } from "../lib/health";

/**
 * Lightweight health endpoint: `GET /health`.
 *
 * A resource route (no UI) that returns a small JSON liveness payload. Used by
 * smoke checks and future uptime monitoring. Exposes no secrets or internals.
 */
export function loader() {
  return healthResponse(env);
}
