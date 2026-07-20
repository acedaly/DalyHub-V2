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

// DS-02/DS-03/DS-04/DS-05/DS-06/DS-07 ship development-only demonstration fixtures
// (the Record Layout, the Shared Drawer, the Shared Cards & Filters, the Shared
// Timeline & Activity Feed, and the Shared Forms & field controls). They are added
// to the
// route tree ONLY when NOT building for production, so they never reach a deployed
// Worker (React Router's config runs in Node during `react-router build`, where
// `NODE_ENV` is `production`). They are not modules and do not appear in
// registry-driven navigation.
const devFixtureRoutes =
  process.env.NODE_ENV === "production"
    ? []
    : [
        route("design/record-layout", "routes/design-record-layout.tsx"),
        route("design/drawer", "routes/design-drawer.tsx"),
        route("design/cards-filters", "routes/design-cards-filters.tsx"),
        route(
          "design/collection-layout",
          "routes/design-collection-layout.tsx",
        ),
        route("design/activity-feed", "routes/design-activity-feed.tsx"),
        route("design/forms", "routes/design-forms.tsx"),
        route("design/search", "routes/design-search.tsx"),
        route("design/command-palette", "routes/design-command-palette.tsx"),
        route("design/feedback", "routes/design-feedback.tsx"),
        route("design/settings", "routes/design-settings.tsx"),
      ];

export default [
  route("health", "routes/health.ts"),
  route("preferences/theme", "routes/theme-action.ts"),
  // DS-08 global Search endpoint — a JSON resource route behind the Worker auth
  // boundary. It renders no shell, so it stays OUTSIDE the app-shell layout.
  route("search", "routes/search.ts"),
  // DS-09 Command Palette endpoints — a JSON catalogue (GET) and the authenticated
  // command-execution boundary (POST /commands/:commandId). Resource routes; they
  // render no shell, so they stay OUTSIDE the app-shell layout.
  route("commands", "routes/commands.ts"),
  route("commands/:commandId", "routes/command-execute.ts"),
  layout("routes/app-shell.tsx", { id: "app-shell" }, [
    index("routes/home.tsx"),
    ...moduleRoutes,
    ...devFixtureRoutes,
  ]),
] satisfies RouteConfig;
