/**
 * FND-09 — the authenticated app-shell layout route.
 *
 * A pathless layout that wraps every authenticated page (home and the module
 * routes) in the application shell. Its loader runs on the server AFTER the Worker
 * boundary has authenticated the request, so it reads the validated session from
 * the trusted request context (never a client header) and derives the safe
 * display identity and the registry-driven navigation model.
 * The raw JWT never enters loader data.
 *
 * DalyHub ships FIVE generated light/dark pairs — one per colour scheme
 * (THEME-01) — over one design system. This loader publishes the two owner values
 * that decide which of them paints: the System/Light/Dark APPEARANCE
 * (APPEARANCE-01) and the COLOUR SCHEME (THEME-01). The record here is the
 * authority for both, and `root.tsx` prefers these over the first-paint cookies
 * when they resolve.
 *
 * This loader is also where those cookies are RECONCILED against the record,
 * which is what makes calling them mirrors true rather than aspirational. See the
 * note on the `Set-Cookie` below.
 */

import { Outlet, data } from "react-router";
import { env } from "cloudflare:workers";

import { getPrimaryNavigation } from "~/platform/modules/primary-navigation";
import {
  getDisplayIdentity,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { resolveNavigationPreferences } from "~/kernel/preferences";
import {
  isSecureAppearanceEnvironment,
  readAppearancePreference,
  serializeAppearanceCookie,
} from "~/kernel/preferences/appearance";
import {
  isSecureColorSchemeEnvironment,
  readColorSchemePreference,
  serializeColorSchemeCookie,
} from "~/kernel/preferences/color-scheme";
import { AppShell } from "~/shared/shell/AppShell";

import type { Route } from "./+types/app-shell";

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const { email } = getDisplayIdentity(context);
  const navigation = getPrimaryNavigation();
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const preferences = await scope.appPreferences.get(session.user.subject);
  const resolvedNavigation = resolveNavigationPreferences(
    preferences.navigation,
    navigation.map((item) => ({ moduleId: item.moduleId, label: item.label })),
  );
  const hiddenModuleIds = new Set(
    resolvedNavigation.preferences.hiddenModuleIds,
  );
  const payload = {
    email,
    appearance: preferences.appearance,
    colorScheme: preferences.colorScheme,
    navigation: navigation.filter(
      (item) => !hiddenModuleIds.has(item.moduleId),
    ),
  };

  /*
   * Reconcile the first-paint cookies with the record — the ONE place that can.
   *
   * Each preference action writes its cookie, but only on the device that made
   * the change. Sign in on a second browser and the record says `dark` and
   * `electric` while that browser has no cookies at all: the shell still renders
   * correctly, because `Layout` prefers this loader's values, but every document
   * that does NOT reach this loader — `/offline`, a root error boundary — falls
   * back to the cookies and paints the defaults indefinitely. The owner would
   * have to set their appearance and scheme again, per device, to fix values that
   * already followed them there. That is not a mirror; it is a cache that is only
   * ever written by accident.
   *
   * So: when a cookie is missing or disagrees, refresh it from the record. The
   * comparison is deliberate — a header is emitted only on the renders that
   * actually need it (a new device, a cleared cookie, a change made elsewhere),
   * not on every shell response, and the two are checked independently so a
   * matching appearance does not suppress a stale scheme.
   */
  const cookieHeader = request.headers.get("Cookie");
  const headers: string[] = [];
  if (readAppearancePreference(cookieHeader) !== preferences.appearance) {
    headers.push(
      serializeAppearanceCookie(preferences.appearance, {
        secure: isSecureAppearanceEnvironment(env.ENVIRONMENT),
      }),
    );
  }
  if (readColorSchemePreference(cookieHeader) !== preferences.colorScheme) {
    headers.push(
      serializeColorSchemeCookie(preferences.colorScheme, {
        secure: isSecureColorSchemeEnvironment(env.ENVIRONMENT),
      }),
    );
  }
  if (headers.length === 0) {
    return payload;
  }
  // `Headers` is the multi-value form: two `Set-Cookie` headers, not one header
  // carrying two cookies (which browsers parse as a single malformed cookie).
  const responseHeaders = new Headers();
  for (const cookie of headers) {
    responseHeaders.append("Set-Cookie", cookie);
  }
  return data(payload, { headers: responseHeaders });
}

export default function AppShellLayout({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell
      email={loaderData.email}
      appearance={loaderData.appearance}
      navigation={loaderData.navigation}
    >
      <Outlet />
    </AppShell>
  );
}
