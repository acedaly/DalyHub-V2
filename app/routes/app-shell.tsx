/**
 * FND-09 — the authenticated app-shell layout route.
 *
 * A pathless layout that wraps every authenticated page (home and the module
 * routes) in the application shell. Its loader runs on the server AFTER the Worker
 * boundary has authenticated the request, so it reads the validated session from
 * the trusted request context (never a client header) and derives the safe
 * display identity, the registry-driven navigation model and the persisted theme.
 * The raw JWT never enters loader data.
 */

import { Outlet } from "react-router";

import { getPrimaryNavigation } from "~/platform/modules/primary-navigation";
import { getDisplayIdentity } from "~/platform/request";
import { AppShell } from "~/shared/shell/AppShell";
import { readThemePreference } from "~/shared/shell/theme";

import type { Route } from "./+types/app-shell";

export function loader({ request, context }: Route.LoaderArgs) {
  const { email } = getDisplayIdentity(context);
  return {
    email,
    theme: readThemePreference(request.headers.get("Cookie")),
    navigation: getPrimaryNavigation(),
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
