/**
 * ASSET-01 — the Assets collection route (`/assets`, the "All" view).
 *
 * Replaces the PX-03 `ModuleComingSoon` placeholder. The trusted server boundary for
 * the bounded, workspace-scoped Assets collection: it reads the authoritative
 * `AssetRepository` through the shared collection loader (full-collection filtering,
 * sorting and cursor pagination in SQL), then renders the presentational
 * `AssetsCollectionView`. Degrades to a calm error state, never a 500.
 */

import { requireAuthenticatedSession } from "~/platform/request";

import { AssetsCollectionView } from "../AssetsCollection";
import { loadAssetsCollection } from "../assets-collection-data";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Assets · DalyHub" },
    {
      name: "description",
      content: "Things of value — physical, digital or financial.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadAssetsCollection(request, session, "all");
}

export default function AssetsRoute({ loaderData }: Route.ComponentProps) {
  return <AssetsCollectionView data={loaderData} />;
}
