/**
 * ASSET-01 — the Assets "Archived assets" collection view (`/assets/archived`).
 *
 * A label-less sub-view route (reached through the collection's in-page view
 * switcher, not the sidebar). Shares the same trusted collection loader and
 * presentational view as `/assets`, fixed to the `archived` view.
 */

import { requireAuthenticatedSession } from "~/platform/request";

import { AssetsCollectionView } from "../AssetsCollection";
import { loadAssetsCollection } from "../assets-collection-data";
import type { Route } from "./+types/archived";

export function meta() {
  return [{ title: "Assets · DalyHub" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadAssetsCollection(request, session, "archived");
}

export default function AssetsViewRoute({ loaderData }: Route.ComponentProps) {
  return <AssetsCollectionView data={loaderData} />;
}
