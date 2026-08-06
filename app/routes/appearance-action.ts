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
 * Input is validated STRICTLY — a tampered, stale or missing value is a 400 that
 * writes nothing, rather than a silent reset to `system`. Authentication is
 * guaranteed by the Worker boundary before this action runs (ADR-016 §5.11); it
 * renders no shell, so it stays outside the app-shell layout.
 *
 * This action is not the only writer of the cookie: the app-shell loader
 * reconciles it from the record when the two disagree, which is what covers a
 * device that has never made a change here.
 */

import { env } from "cloudflare:workers";

import {
  AppPreferencesValidationError,
  parseAppearance,
} from "~/kernel/preferences";
import {
  isSecureAppearanceEnvironment,
  serializeAppearanceCookie,
  type AppearancePreference,
} from "~/kernel/preferences/appearance";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/appearance-action";

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }

  const session = requireAuthenticatedSession(context);
  const formData = await request.formData();

  const json = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  } as const;

  /*
   * The STRICT parser, not the coercing one.
   *
   * `parseAppearancePreference` coerces anything unrecognised to `system`, and
   * that is right where it is used — reading a cookie, or normalising a stored
   * row — because a bad value there must never break the page. A WRITE is the
   * opposite case: coercing a missing or malformed field would turn a stale form
   * post, a truncated request or a bug into a perfectly valid database write that
   * silently replaces the owner's explicit Light or Dark with `system`. Losing a
   * setting quietly is worse than refusing to change it, so an unrecognised value
   * is a 400 that mutates nothing.
   */
  let appearance: AppearancePreference;
  try {
    appearance = parseAppearance(formData.get("appearance"));
  } catch (cause) {
    if (cause instanceof AppPreferencesValidationError) {
      return new Response(JSON.stringify({ ok: false, error: cause.message }), {
        status: 400,
        headers: json,
      });
    }
    throw cause;
  }

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    await scope.appPreferences.update(session.user.subject, { appearance });
  } catch (cause) {
    // A validation error here would mean the registry and the validator disagree
    // — a real bug, worth surfacing.
    if (cause instanceof AppPreferencesValidationError) {
      throw cause;
    }
    /*
     * A STORAGE failure sets NO cookie, deliberately.
     *
     * Mirroring the choice anyway looks like graceful degradation and is the
     * opposite: the record is the authority, and `Layout` prefers the app-shell
     * loader's value over the cookie — so an authenticated page would keep
     * painting the OLD stored appearance while `/offline` and any root error
     * render used the NEW cookie. That is one browser showing two appearances,
     * for as long as the cookie lives, off the back of a save the owner was
     * already told had failed.
     *
     * Leaving the cookie alone keeps the mirror agreeing with the record it
     * mirrors. The owner sees the error toast, the control reverts to the stored
     * value, and nothing diverges.
     */
    return new Response(JSON.stringify({ ok: false, appearance }), {
      status: 500,
      headers: json,
    });
  }

  // Only now — the record is written, so the mirror is safe to refresh.
  return new Response(JSON.stringify({ ok: true, appearance }), {
    status: 200,
    headers: {
      ...json,
      "Set-Cookie": serializeAppearanceCookie(appearance, {
        secure: isSecureAppearanceEnvironment(env.ENVIRONMENT),
      }),
    },
  });
}
