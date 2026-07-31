/**
 * THEME-01 — the theme preference action (`POST /preferences/theme`).
 *
 * A protected, POST-only, same-origin action that persists the owner's chosen
 * theme and redirects back to where they were. It does two things, in this order:
 *
 *   1. writes the validated theme to the owner/workspace preferences record — the
 *      AUTHORITY, so the choice follows the owner to any browser;
 *   2. mirrors the same value into the first-paint cookie, so the very next
 *      document already carries the right `<html data-theme>` even on a render
 *      that never reaches the authenticated shell loader (a root error boundary).
 *
 * Because the action redirects, React Router treats a JS-enabled submit as a
 * client navigation with revalidation: the new theme paints immediately, with no
 * page reload. Without JavaScript it is a plain form post, which still works.
 *
 * Input is parsed against the theme registry, so a tampered or stale form value can
 * never reach `data-theme`, the cookie or the database. Authentication is
 * guaranteed by the Worker boundary before this action runs (ADR-016 §5.11,
 * ADR-061).
 */

import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import { AppPreferencesValidationError } from "~/kernel/preferences";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
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

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }

  const session = requireAuthenticatedSession(context);
  const formData = await request.formData();
  // `parseThemePreference` coerces rather than throws, so an unrecognised value
  // lands the owner on the default theme instead of on an error page. Switching
  // theme must never be able to break the surface the owner is looking at.
  const preference = parseThemePreference(formData.get("theme"));

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    await scope.appPreferences.update(session.user.subject, {
      theme: preference,
    });
  } catch (cause) {
    // A validation error here would mean the registry and the validator disagree
    // — a real bug, worth surfacing. A STORAGE failure is different: the cookie
    // mirror below still applies the choice in this browser, and the next
    // successful write reconciles the record, so it is better to apply the theme
    // than to throw the owner onto an error page over a preference write.
    if (cause instanceof AppPreferencesValidationError) {
      throw cause;
    }
  }

  const secure = SECURE_ENVIRONMENTS.has(
    (env.ENVIRONMENT ?? "").trim().toLowerCase(),
  );

  return redirect(safeRedirectTarget(request), {
    headers: { "Set-Cookie": serializeThemeCookie(preference, { secure }) },
  });
}
