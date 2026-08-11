/**
 * THEME-01 — the colour-scheme action (`POST /preferences/color-scheme`).
 *
 * The exact twin of the appearance action (`appearance-action.ts`), for the
 * other half of the display preference, and deliberately a SEPARATE resource
 * rather than one endpoint taking two fields: the two settings are independent
 * (§3), they are changed at different moments, and a shared endpoint would make
 * every appearance change carry a scheme it did not mean to assert.
 *
 * A protected, POST-only, same-origin resource route. It does two things, in this
 * order:
 *
 *   1. writes the validated scheme to the owner/workspace preferences record —
 *      the AUTHORITY, so the choice follows the owner to any browser;
 *   2. mirrors the same value into the first-paint cookie, so the very next
 *      document already carries the right `<html data-color-scheme>` even on a
 *      render that never reaches the authenticated shell loader (`/offline`, a
 *      root error boundary).
 *
 * It returns JSON rather than a redirect, and is submitted through a `useFetcher`.
 * That is what makes changing scheme a non-navigation: React Router revalidates
 * the loaders after the fetcher settles, the root loader re-reads the cookie, and
 * `<html data-color-scheme>` changes — no history entry, no scroll reset, no
 * reload, and the Settings section the owner is standing in stays exactly where
 * it was (§25).
 *
 * Input is validated STRICTLY — a tampered, stale or missing value is a 400 that
 * writes nothing, rather than a silent reset to Daly Violet. Authentication is
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
  parseColorScheme,
} from "~/kernel/preferences";
import {
  isSecureColorSchemeEnvironment,
  serializeColorSchemeCookie,
  type ColorScheme,
} from "~/kernel/preferences/color-scheme";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/color-scheme-action";

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
   * `parseColorSchemePreference` coerces anything unrecognised to Daly Violet,
   * and that is right where it is used — reading a cookie, or normalising a
   * stored row — because a bad value there must never break the page. A WRITE is
   * the opposite case: coercing a missing or malformed field would turn a stale
   * form post, a truncated request or a bug into a perfectly valid database write
   * that silently replaces the owner's explicit Electric with the default.
   */
  let colorScheme: ColorScheme;
  try {
    colorScheme = parseColorScheme(formData.get("colorScheme"));
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
    await scope.appPreferences.update(session.user.subject, { colorScheme });
  } catch (cause) {
    // A validation error here would mean the registry and the validator disagree
    // — a real bug, worth surfacing.
    if (cause instanceof AppPreferencesValidationError) {
      throw cause;
    }
    /*
     * A STORAGE failure sets NO cookie, deliberately — the same reasoning the
     * appearance action records. The record is the authority and `Layout`
     * prefers the app-shell loader's value over the cookie, so mirroring a
     * failed write would leave authenticated pages painting the OLD scheme while
     * `/offline` and any root error render used the NEW one: one browser showing
     * two colour schemes, off the back of a save the owner was already told had
     * failed.
     */
    return new Response(JSON.stringify({ ok: false, colorScheme }), {
      status: 500,
      headers: json,
    });
  }

  // Only now — the record is written, so the mirror is safe to refresh.
  return new Response(JSON.stringify({ ok: true, colorScheme }), {
    status: 200,
    headers: {
      ...json,
      "Set-Cookie": serializeColorSchemeCookie(colorScheme, {
        secure: isSecureColorSchemeEnvironment(env.ENVIRONMENT),
      }),
    },
  });
}
