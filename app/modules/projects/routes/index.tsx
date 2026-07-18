/**
 * FND-09 — the Projects module route (placeholder).
 *
 * Module-owned route module referenced declaratively by the Projects manifest. It
 * renders a placeholder only; the Projects product experience is a later roadmap
 * item.
 */

import { ModulePlaceholder } from "~/shared/shell/ModulePlaceholder";

export function meta() {
  return [{ title: "Projects · DalyHub" }];
}

export default function ProjectsRoute() {
  return (
    <ModulePlaceholder
      name="Projects"
      summary="Projects are the finite bodies of work you run under an Area or a Goal."
    />
  );
}
