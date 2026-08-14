/**
 * FND-09 — the React Router framework route configuration.
 *
 * Routes are composed from two sources, neither of which requires editing a
 * central per-module list (ADR-016 §5.9, §5.10):
 *   - shell-owned routes declared here (`/health`, the appearance action, the
 *     app-shell layout and the authenticated home index);
 *   - module-owned routes discovered automatically by globbing each module's
 *     declarative `routes.manifest.ts` and mapping the descriptors to framework
 *     route entries.
 *
 * This file is evaluated by React Router's bare config loader, which cannot
 * resolve the `~` path alias, so it uses relative imports only; the route adapter
 * it calls uses type-only kernel imports (erased at build time) and the globbed
 * manifests are pure data. `/health` and the appearance action stay OUTSIDE the shell
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
        // DS-02 — the generic UI primitive gallery. The surface every DS-02
        // screenshot is taken of, and the one place the primitives can be
        // compared side by side in both appearances.
        route("design/primitives", "routes/design-primitives.tsx"),
        route("design/record-layout", "routes/design-record-layout.tsx"),
        route("design/drawer", "routes/design-drawer.tsx"),
        route("design/cards-filters", "routes/design-cards-filters.tsx"),
        route("design/card-family", "routes/design-card-family.tsx"),
        // Gate D — the Area/Project collection states real seeded data cannot
        // reach (empty, filtered-empty, the progress extremes).
        route(
          "design/collection-states",
          "routes/design-collection-states.tsx",
        ),
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
        // PWA-01 — the icon review surface. Dev-only, like its siblings, so the
        // review page never reaches a deployed Worker.
        route("design/app-icon", "routes/design-app-icon.tsx"),
      ];

export default [
  route("health", "routes/health.ts"),
  // APPEARANCE-01 — the appearance preference action. A POST-only JSON resource
  // route: it writes the owner's System/Light/Dark choice and mirrors it into the
  // first-paint cookie. It renders no shell, so it stays OUTSIDE the app-shell
  // layout — and it must, because the account menu submits it from every route.
  route("preferences/appearance", "routes/appearance-action.ts"),
  // THEME-01 — the colour-scheme preference action, the appearance action's twin
  // for the other half of the display preference. Same shape, same reasons: a
  // POST-only JSON resource route outside the shell layout.
  route("preferences/color-scheme", "routes/color-scheme-action.ts"),
  // DS-08 global Search endpoint — a JSON resource route behind the Worker auth
  // boundary. It renders no shell, so it stays OUTSIDE the app-shell layout.
  route("search", "routes/search.ts"),
  // DS-09 Command Palette endpoints — a JSON catalogue (GET) and the authenticated
  // command-execution boundary (POST /commands/:commandId). Resource routes; they
  // render no shell, so they stay OUTSIDE the app-shell layout.
  route("commands", "routes/commands.ts"),
  route("commands/:commandId", "routes/command-execute.ts"),
  // The Universal Relationship System — one shared, authenticated links endpoint
  // (list/search/summary via GET, link/unlink via POST) every record's Linked
  // Items section uses, so no module needs bespoke link routes. Renders no shell.
  route("links", "routes/links.ts"),
  // CAPTURE-01 — the ONE external capture endpoint. A POST-only JSON resource
  // route authenticated by a scoped capture token rather than by Cloudflare
  // Access, so an Apple Shortcut, Siri or the Share Sheet can reach it from a
  // phone with no DalyHub session. The Worker request boundary knows this exact
  // path and only bypasses Access for it (see `request-boundary.ts`). It renders
  // no shell, so it stays OUTSIDE the app-shell layout.
  route("api/capture", "routes/api-capture.ts"),
  // MOBILE-01 shared Quick Capture context — the owner timezone, today's calendar
  // date and the re-verified default Task capture parent the shared capture sheet
  // needs. A shell-owned JSON resource route; it renders no shell.
  route("capture/context", "routes/capture-context.ts"),
  // PWA — the offline surfaces. All three are authenticated (Cloudflare Access
  // gates them like everything else); none of them renders the app shell.
  //   /offline           the cacheable offline shell DOCUMENT. It sits outside the
  //                      app-shell layout deliberately: the shell's loader reads
  //                      the owner's identity and preferences, and none of that
  //                      may be baked into a document a service worker caches.
  //   /offline/snapshot  the minimised seven-day snapshot (JSON resource route).
  //   /offline/ping      the reachability probe (JSON resource route).
  route("offline", "routes/offline.tsx"),
  route("offline/snapshot", "routes/offline-snapshot.ts"),
  route("offline/ping", "routes/offline-ping.ts"),
  layout("routes/app-shell.tsx", { id: "app-shell" }, [
    index("routes/home.tsx"),
    ...moduleRoutes,
    ...devFixtureRoutes,
  ]),
] satisfies RouteConfig;
