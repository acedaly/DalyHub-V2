/**
 * FND-09 — the Areas module route (placeholder).
 *
 * Module-owned route module, referenced declaratively by the Areas manifest
 * (`file: "routes/index.tsx"`) and composed into the app route tree by the
 * platform route adapter. It renders a placeholder only; the Areas product
 * experience is a later roadmap item.
 */

import { ModulePlaceholder } from "~/shared/shell/ModulePlaceholder";

export function meta() {
  return [{ title: "Areas · DalyHub" }];
}

export default function AreasRoute() {
  return (
    <ModulePlaceholder
      name="Areas"
      summary="Areas are the permanent domains of your life — the top of the spine."
    />
  );
}
