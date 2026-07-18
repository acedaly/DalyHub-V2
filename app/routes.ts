/**
 * FND-09 — the React Router framework route configuration.
 *
 * Routes are composed from two sources, neither of which requires editing a
 * central per-module list (ADR-016 §5.9, §5.10):
 *   - shell-owned routes declared here (`/health`, the theme action, the app-shell
 *     layout and the authenticated home index);
 *   - module-owned routes discovered automatically by globbing each module's
 *     declarative `routes.manifest.ts` and mapping the descriptors to framework
 *     route entries.
 *
 * This file is evaluated by React Router's bare config loader, which cannot
 * resolve the `~` path alias, so it uses relative imports only; the route adapter
 * it calls uses type-only kernel imports (erased at build time) and the globbed
 * manifests are pure data. `/health` and the theme action stay OUTSIDE the shell
 * layout; everything under the pathless `app-shell` layout renders inside the
 * authenticated application shell. Adding a module route requires only a manifest
 * entry plus its module-owned route file — never a change to this file.
 */

import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

import { composeModuleRouteConfig } from "./platform/modules/react-router-route-adapter";

const moduleRoutes = composeModuleRouteConfig(
  import.meta.glob("./modules/*/routes.manifest.ts", { eager: true }),
);

export default [
  route("health", "routes/health.ts"),
  route("preferences/theme", "routes/theme-action.ts"),
  layout("routes/app-shell.tsx", { id: "app-shell" }, [
    index("routes/home.tsx"),
    ...moduleRoutes,
  ]),
] satisfies RouteConfig;
