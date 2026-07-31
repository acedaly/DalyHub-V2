/**
 * FND-09 — the authenticated app-shell layout route.
 *
 * A pathless layout that wraps every authenticated page (home and the module
 * routes) in the application shell. Its loader runs on the server AFTER the Worker
 * boundary has authenticated the request, so it reads the validated session from
 * the trusted request context (never a client header) and derives the safe
 * display identity, the registry-driven navigation model and the persisted theme.
 * The raw JWT never enters loader data.
 *
 * THEME-01 — the theme comes from the owner's preferences record here, not from the
 * cookie. The root layout reads this loader's `theme` in preference to its own
 * cookie fallback, so the authoritative value is on `<html data-theme>` in the first
 * byte of every authenticated document.
 */

import { Outlet } from "react-router";
import { env } from "cloudflare:workers";

import { getPrimaryNavigation } from "~/platform/modules/primary-navigation";
import {
  getDisplayIdentity,
  requireAuthenticatedSession,
} from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { resolveNavigationPreferences } from "~/kernel/preferences";
import { AppShell } from "~/shared/shell/AppShell";

import type { Route } from "./+types/app-shell";

export async function loader({ context }: Route.LoaderArgs) {
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
  return {
    email,
    // THEME-01 — the STORED preference is the authority, so the theme follows the
    // owner to any browser. It is already normalised against the theme registry by
    // the kernel, so a value written by an older release (or naming a theme this
    // release removed) has degraded to the default before it reaches the document.
    // The root layout prefers this over the cookie mirror.
    theme: preferences.theme,
    navigation: navigation.filter(
      (item) => !hiddenModuleIds.has(item.moduleId),
    ),
  };
}

export default function AppShellLayout({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell
      email={loaderData.email}
      theme={loaderData.theme}
      navigation={loaderData.navigation}
    >
      <Outlet />
    </AppShell>
  );
}
