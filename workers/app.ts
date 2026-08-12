// Adapted from the Cloudflare create-cloudflare (C3) React Router template
// (https://developers.cloudflare.com/workers/framework-guides/web-apps/react-router/)
// @ react-router 8.0.0 / @cloudflare/vite-plugin 1.45.1, MIT, retrieved 2026-07-17.
// Changes (FND-09, ADR-016 §5.5, §10): delegate to the authenticated request
// boundary, which authenticates BEFORE the React Router handler runs so no
// protected loader or action can execute before authentication succeeds.
// Changes (CAPTURE-01): add the `email` handler so inbound capture mail reaches
// the SAME Worker, with the SAME bindings and the SAME capture application
// service the HTTP endpoint uses. It is inert unless Cloudflare Email Routing is
// configured to deliver to this Worker AND the capture addresses are configured,
// so an ordinary deployment gains nothing it did not ask for.
// Changes (CAL-01): add the `scheduled` handler so the external calendar refresh
// runs on the SAME Worker with the SAME bindings, on a Cloudflare Cron Trigger.
// No page request ever fetches a calendar feed.
import { createRequestHandler } from "react-router";

import {
  runScheduledCalendarRefresh,
  type ScheduledCalendarEnv,
} from "~/platform/calendar/scheduled-refresh.server";
import {
  handleCaptureEmail,
  type EmailCaptureEnv,
} from "~/platform/capture/email-capture.server";
import { handleAuthenticatedRequest } from "~/platform/request";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env) {
    return handleAuthenticatedRequest(request, env, requestHandler);
  },
  async email(message, env) {
    await handleCaptureEmail(message, env as unknown as EmailCaptureEnv);
  },
  // CAL-01: the background calendar refresh, on the Worker's own cron trigger.
  // Same Worker, same bindings, no new infrastructure. It is inert unless a
  // cron trigger is configured AND the owner has added a calendar source, so an
  // ordinary deployment gains nothing it did not ask for. It never throws: a
  // failed tick costs one tick, and the next is fifteen minutes away.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runScheduledCalendarRefresh(env as unknown as ScheduledCalendarEnv),
    );
  },
} satisfies ExportedHandler<Env>;
