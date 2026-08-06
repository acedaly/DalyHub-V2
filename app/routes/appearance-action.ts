/**
 * APPEARANCE-01 — the appearance preference action (`POST /preferences/appearance`).
 *
 * A protected, POST-only, same-origin resource route that persists the owner's
 * chosen appearance. It does two things, in this order:
 *
 *   1. writes the validated preference to the owner/workspace preferences record —
 *      the AUTHORITY, so the choice follows the owner to any browser;
 *   2. mirrors the same value into the first-paint cookie, so the very next
 *      document already carries the right `<html data-appearance>` even on a
 *      render that never reaches the authenticated shell loader (`/offline`, a
 *      root error boundary).
 *
 * It returns JSON rather than a redirect, and is submitted through a `useFetcher`.
 * That is what makes changing appearance a non-navigation: React Router
 * revalidates the loaders after the fetcher settles, the root loader re-reads the
 * cookie, and `<html data-appearance>` changes — no history entry, no scroll
 * reset, and the account menu the owner is standing in stays open.
 *
 * Input is coerced through the kernel appearance contract, so a tampered or stale
 * form value can never reach `data-appearance`, the cookie or the database.
 * Authentication is guaranteed by the Worker boundary before this action runs
 * (ADR-016 §5.11); it renders no shell, so it stays outside the app-shell layout.
 */

import { env } from "cloudflare:workers";

import { AppPreferencesValidationError } from "~/kernel/preferences";
import {
  parseAppearancePreference,
  serializeAppearanceCookie,
} from "~/kernel/preferences/appearance";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/appearance-action";

/** Environments where the appearance cookie must be marked `Secure`. */
const SECURE_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "production",
  "staging",
  "preview",
]);

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }

  const session = requireAuthenticatedSession(context);
  const formData = await request.formData();
  // Coerces rather than throws: an unrecognised value lands the owner on `System`
  // instead of on an error page. Changing appearance must never be able to break
  // the surface the owner is looking at.
  const appearance = parseAppearancePreference(formData.get("appearance"));

  const secure = SECURE_ENVIRONMENTS.has(
    (env.ENVIRONMENT ?? "").trim().toLowerCase(),
  );
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "Set-Cookie": serializeAppearanceCookie(appearance, { secure }),
  };

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    await scope.appPreferences.update(session.user.subject, { appearance });
  } catch (cause) {
    // A validation error here would mean the registry and the validator disagree
    // — a real bug, worth surfacing. A STORAGE failure is different: the cookie
    // mirror still applies the choice in this browser and the next successful
    // write reconciles the record, so the response still carries the cookie and
    // reports the failure rather than throwing the owner onto an error page.
    if (cause instanceof AppPreferencesValidationError) {
      throw cause;
    }
    return new Response(JSON.stringify({ ok: false, appearance }), {
      status: 500,
      headers,
    });
  }

  return new Response(JSON.stringify({ ok: true, appearance }), {
    status: 200,
    headers,
  });
}
