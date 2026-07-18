/**
 * FND-09 — the Goals module route (placeholder).
 *
 * Module-owned route module referenced declaratively by the Goals manifest. It
 * renders a placeholder only; the Goals product experience is a later roadmap
 * item.
 */

import { ModulePlaceholder } from "~/shared/shell/ModulePlaceholder";

export function meta() {
  return [{ title: "Goals · DalyHub" }];
}

export default function GoalsRoute() {
  return (
    <ModulePlaceholder
      name="Goals"
      summary="Goals are the optional, aspirational outcomes you pursue under an Area."
    />
  );
}
