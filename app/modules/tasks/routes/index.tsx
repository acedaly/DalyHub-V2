/**
 * FND-09 — the Tasks module route (placeholder).
 *
 * Module-owned route module referenced declaratively by the Tasks manifest. It
 * renders a placeholder only; the Tasks product experience is a later roadmap
 * item.
 */

import { ModulePlaceholder } from "~/shared/shell/ModulePlaceholder";

export function meta() {
  return [{ title: "Tasks · DalyHub" }];
}

export default function TasksRoute() {
  return (
    <ModulePlaceholder
      name="Tasks"
      summary="Tasks are the atomic units of action you complete under an Area or a Project."
    />
  );
}
