import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";

import { ReviewsCollectionView } from "../ReviewsCollection";
import { loadReviewsCollection } from "../review-collection-data";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Reviews · DalyHub" },
    {
      name: "description",
      content:
        "Periodic reflection records for closing loops and planning ahead.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  return loadReviewsCollection(env, request, session);
}

export default function ReviewsRoute({ loaderData }: Route.ComponentProps) {
  return <ReviewsCollectionView data={loaderData} />;
}
