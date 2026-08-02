/**
 * PWA-03 — the reachability probe (`GET /offline/ping`).
 *
 * The smallest authenticated response DalyHub can produce, and the ONE thing the
 * connection-state machine treats as authoritative. It exists because none of the
 * cheaper signals answer the actual question:
 *
 *   - `navigator.onLine` reports an interface, not reachability;
 *   - `/health` is a PUBLIC path at the DalyHub layer, so a 200 from it proves
 *     nothing about whether the owner's Access session is still valid;
 *   - a failed application request tells you something went wrong, but not
 *     whether the cause was the network, an expired sign-in, or DalyHub itself.
 *
 * This route runs BEHIND the Worker authentication boundary, so reaching it at
 * all proves a valid Cloudflare Access session. It answers with the
 * `X-DalyHub-Authenticated` header that `classifyProbe` requires: a 200 WITHOUT
 * that header is not treated as success, which is what distinguishes DalyHub
 * answering from an Access challenge page, a captive portal or a proxy answering
 * on its behalf.
 *
 * It deliberately carries NO workspace data, NO identity, NO token and no
 * database read: it must stay cheap enough to poll and safe enough that its
 * response is worthless to anyone who intercepts it.
 */

import { requireAuthenticatedSession } from "~/platform/request";

import type { Route } from "./+types/offline-ping";

export async function loader({ context }: Route.LoaderArgs) {
  // Re-check at the route as well as the boundary: the boundary is the guard,
  // this is the assertion that the guard ran (the pattern every other
  // authenticated resource route follows).
  requireAuthenticatedSession(context);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // The marker `classifyProbe` looks for. Only DalyHub's authenticated
      // Worker sets it.
      "x-dalyhub-authenticated": "1",
      "cache-control": "no-store",
    },
  });
}
