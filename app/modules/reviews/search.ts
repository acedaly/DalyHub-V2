import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";

import { reviewPeriodLabel, REVIEW_TYPE_LABELS } from "./review-view";

const searchReviews: SearchExecutor = async (query, context) => {
  const text = query.text.trim();
  if (text.length === 0 || query.limit <= 0) return [];

  const workersSpecifier = "cloudflare:workers";
  const [{ env }, { bindWorkspaceRepositories }, { createSystemActorContext }] =
    await Promise.all([
      import(/* @vite-ignore */ workersSpecifier) as Promise<{
        env: import("~/platform/workspaces").WorkspaceScopeEnv;
      }>,
      import("~/platform/workspaces"),
      import("~/kernel/activity"),
    ]);

  const scope = bindWorkspaceRepositories(
    env,
    context.workspace,
    createSystemActorContext(),
  );
  const page = await scope.reviews.list({
    view: "current",
    query: text,
    limit: query.limit,
  });

  return page.items.map<SearchResultItem>((review) => ({
    id: `review:${review.id}`,
    entityId: review.id,
    title: review.title,
    subtitle: `${REVIEW_TYPE_LABELS[review.type]} · ${reviewPeriodLabel(
      review.type,
      review.periodStart,
      review.periodEnd,
      DEFAULT_APP_PREFERENCES.dateFormat,
    )}`,
    entityType: "review",
    target: { kind: "route", to: `/reviews/${encodeURIComponent(review.id)}` },
  }));
};

export const reviewsSearchProvider: SearchProviderContribution = {
  id: "reviews.search",
  label: "Reviews",
  entityTypes: ["review"],
  search: searchReviews,
};
