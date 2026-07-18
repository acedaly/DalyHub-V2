/**
 * FND-09 — the theme preference action (`POST /preferences/theme`).
 *
 * A protected, POST-only, same-origin action that persists the theme preference
 * as a cookie and redirects back to where the user was (ADR-016 §5.11). It writes
 * no database row and records no Activity. Invalid input safely falls back to
 * `system`. The cookie is `Secure` in non-development environments. Authentication
 * is guaranteed by the Worker boundary before this action runs.
 */

import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import {
  parseThemePreference,
  serializeThemeCookie,
} from "~/shared/shell/theme";

import type { Route } from "./+types/theme-action";

/** Environments where the theme cookie must be marked `Secure`. */
const SECURE_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "production",
  "staging",
  "preview",
]);

/** Resolve a safe, same-origin redirect target from the request's Referer. */
function safeRedirectTarget(request: Request): string {
  const referer = request.headers.get("Referer");
  if (referer !== null) {
    try {
      const url = new URL(referer);
      const requestUrl = new URL(request.url);
      if (url.origin === requestUrl.origin) {
        return `${url.pathname}${url.search}`;
      }
    } catch {
      // Fall through to the safe default.
    }
  }
  return "/";
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }

  const formData = await request.formData();
  const preference = parseThemePreference(formData.get("theme"));
  const secure = SECURE_ENVIRONMENTS.has(
    (env.ENVIRONMENT ?? "").trim().toLowerCase(),
  );

  return redirect(safeRedirectTarget(request), {
    headers: { "Set-Cookie": serializeThemeCookie(preference, { secure }) },
  });
}
