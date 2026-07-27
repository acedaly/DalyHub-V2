/**
 * ASSET-01 — the Assets "Expiring soon assets" collection view (`/assets/expiring`).
 *
 * A label-less sub-view route (reached through the collection's in-page view
 * switcher, not the sidebar). Shares the same trusted collection loader and
 * presentational view as `/assets`, fixed to the `expiring` view.
 */

import { requireAuthenticatedSession } from "~/platform/request";

import { AssetsCollectionView } from "../AssetsCollection";
import { loadAssetsCollection } from "../assets-collection-data";
import type { Route } from "./+types/expiring";

export function meta() {
  return [{ title: "Assets · DalyHub" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadAssetsCollection(request, session, "expiring");
}

export default function AssetsViewRoute({ loaderData }: Route.ComponentProps) {
  return <AssetsCollectionView data={loaderData} />;
}
