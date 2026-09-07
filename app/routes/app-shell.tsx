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

import { Outlet, data, type ShouldRevalidateFunctionArgs } from "react-router";
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
import { isSameDocumentParameterChange } from "~/shared/router/revalidation";
import { AppShell } from "~/shared/shell/AppShell";

import type { Route } from "./+types/app-shell";

/**
 * The shell's data does not depend on the URL, so a same-page navigation must not
 * re-read it.
 *
 * This loader reads the session, the owner's preferences and the module registry
 * — none of which a search parameter can change. Yet React Router re-ran all of
 * it on every Drawer open and close, because opening a Drawer is a navigation
 * that writes `?drawer=…`: a preferences read and a workspace resolution, per
 * open, to produce byte-for-byte the same payload.
 *
 * PWA-12 — it is also the second half of what stops opening a task while OFFLINE
 * taking the page down. `/tasks` already declines to re-run its own query for a
 * Drawer parameter; the shell's loader sat behind it, and a loader that cannot
 * reach the server throws into the global error boundary. The fix in both places
 * is the same and is not a weakening: a request that is never needed cannot fail.
 *
 * A SUBMISSION still revalidates, and so does an EXPLICIT revalidation. A
 * preference change is a POST, and the shell showing a stale identity or
 * navigation after one would be exactly the kind of quiet wrongness this rule
 * must not introduce — see `isSameDocumentParameterChange` for the distinction
 * that makes the skip safe.
 */
export function shouldRevalidate(args: ShouldRevalidateFunctionArgs): boolean {
  return isSameDocumentParameterChange(args)
    ? false
    : args.defaultShouldRevalidate;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const { email } = getDisplayIdentity(context);
  const navigation = getPrimaryNavigation();
  const scope = await resolveAuthenticatedWorkspaceScope(env, session, {
    // PERF-01 — this loader reads the owner's preferences immediately, so the
    // read is started before the workspace check rather than after it.
    warmOwnerPreferences: true,
  });
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
    /*
     * NOTIFY-01 — the bell's count.
     *
     * One indexed COUNT over a partial index, in a loader that already runs once
     * per real navigation and is skipped for same-document parameter changes
     * (see `shouldRevalidate` above). That is deliberately the cheapest thing
     * that can be true: the alternative — polling, or a request per page — would
     * cost far more than a number that changes a couple of times a day.
     *
     * It degrades to 0 rather than failing the shell. A bell that cannot count
     * is a bell with no badge; a shell that cannot load is every page down.
     */
    unreadNotifications: await scope.notifications.unreadCount().catch(() => 0),
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
      unreadNotifications={loaderData.unreadNotifications}
    >
      <Outlet />
    </AppShell>
  );
}
