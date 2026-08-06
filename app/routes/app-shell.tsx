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
 * M3-01 removed the theme this loader used to publish: DalyHub ships one
 * generated light/dark pair selected by `prefers-color-scheme`, so there is
 * nothing appearance-related left for the server to resolve (ADR-074).
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
    navigation: navigation.filter(
      (item) => !hiddenModuleIds.has(item.moduleId),
    ),
  };
}

export default function AppShellLayout({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell email={loaderData.email} navigation={loaderData.navigation}>
      <Outlet />
    </AppShell>
  );
}
