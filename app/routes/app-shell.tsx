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
 * DalyHub ships ONE generated light/dark pair (ADR-074) and no palettes.
 * APPEARANCE-01 publishes the one appearance value that pair still needs — the
 * owner's System/Light/Dark preference — because the record here is its authority
 * and `root.tsx` prefers this over the first-paint cookie when it resolves.
 *
 * This loader is also where the first-paint cookie is RECONCILED against that
 * record, which is what makes calling it a mirror true rather than aspirational.
 * See the note on the `Set-Cookie` below.
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
    navigation: navigation.filter(
      (item) => !hiddenModuleIds.has(item.moduleId),
    ),
  };

  /*
   * Reconcile the first-paint cookie with the record — the ONE place that can.
   *
   * The appearance action writes the cookie, but only on the device that made
   * the change. Sign in on a second browser and the record says `dark` while
   * that browser has no cookie at all: the shell still renders correctly,
   * because `Layout` prefers this loader's value, but every document that does
   * NOT reach this loader — `/offline`, a root error boundary — falls back to
   * the cookie and paints `system` indefinitely. The owner would have to set
   * their appearance again, per device, to fix a value that already followed
   * them there. That is not a mirror; it is a cache that is only ever written
   * by accident.
   *
   * So: when the cookie is missing or disagrees, refresh it from the record.
   * The comparison is deliberate — the header is emitted only on the renders
   * that actually need it (a new device, a cleared cookie, a change made
   * elsewhere), not on every shell response.
   */
  const mirrored = readAppearancePreference(request.headers.get("Cookie"));
  if (mirrored === preferences.appearance) {
    return payload;
  }
  return data(payload, {
    headers: {
      "Set-Cookie": serializeAppearanceCookie(preferences.appearance, {
        secure: isSecureAppearanceEnvironment(env.ENVIRONMENT),
      }),
    },
  });
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
