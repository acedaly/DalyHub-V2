/**
 * The Reviews module's repository-backed search provider (DS-08).
 *
 * RECALL-01 — a Review is findable by what the owner REFLECTED in it, not only
 * by its name. The dedicated `searchReviews` projection matches the title and
 * every authored section body in ONE bounded, workspace-scoped statement and
 * returns each Review once, with an honest match source and a bounded,
 * syntax-free excerpt cut in SQL. It replaced a `list` call that read every
 * result's sections in a SECOND statement and never matched them.
 */

import type {
  SearchExecutor,
  SearchProviderContribution,
  SearchResultItem,
} from "~/kernel/modules";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { reviewSectionLabel, type ReviewSearchHit } from "~/kernel/reviews";
import { searchSubtitle } from "~/shared/search/subtitle";

import { reviewPeriodLabel, REVIEW_TYPE_LABELS } from "./review-view";

/** The user-facing name for where a hit matched. Never a raw enum value. */
function matchLabel(hit: ReviewSearchHit): string {
  if (hit.matchSource === "title") return "Title";
  return hit.sectionId ? reviewSectionLabel(hit.sectionId) : "Reflection";
}

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
  const hits = await scope.reviews.searchReviews({
    text,
    limit: query.limit,
  });

  return hits.map<SearchResultItem>((review) => ({
    id: `review:${review.id}`,
    entityId: review.id,
    title: review.title,
    // The shared RECALL-01 grammar: match source · type · period · excerpt.
    subtitle: searchSubtitle([
      matchLabel(review),
      REVIEW_TYPE_LABELS[review.type],
      reviewPeriodLabel(
        review.type,
        review.periodStart,
        review.periodEnd,
        DEFAULT_APP_PREFERENCES.dateFormat,
      ),
      review.excerpt,
    ]),
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
