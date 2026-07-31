/**
 * RELEASE-01 — the About product module manifest (navigation shell only).
 *
 * About is a cross-cutting information surface, not an entity type — like Today,
 * Help and Settings it declares no `entityTypes`, so it names its own navigation
 * glyph through `meta.navIcon` rather than falling back to a placeholder.
 *
 * It is its own module rather than a third Settings section because it answers a
 * different question ("what am I running?", not "how do I want this configured?"),
 * and because a deployment check should be able to link straight to it.
 */

import { defineModule } from "~/kernel/modules";

import routes from "./routes.manifest";

export default defineModule({
  id: "about",
  name: "About",
  description: "What this DalyHub is, and which version is running.",
  order: 320,
  routes,
});
