import type { AuthenticatedSession } from "~/kernel/auth";
import {
  REVIEW_TYPES,
  type ReviewSort,
  type ReviewType,
  type ReviewView,
} from "~/kernel/reviews";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import type { WorkspaceScopeEnv } from "~/platform/workspaces";

import { serializeReview, type SerializedReview } from "./review-view";

export interface ReviewsCollectionData {
  readonly reviews: readonly SerializedReview[];
  readonly view: ReviewView;
  readonly query: string;
  readonly type: ReviewType | "all";
  readonly sort: ReviewSort;
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly today: string;
  readonly failed: boolean;
}

function parseView(value: string | null): ReviewView {
  return value === "in_progress" ||
    value === "completed" ||
    value === "archived"
    ? value
    : "current";
}

function parseType(value: string | null): ReviewType | "all" {
  return value && (REVIEW_TYPES as readonly string[]).includes(value)
    ? (value as ReviewType)
    : "all";
}

function parseSort(value: string | null): ReviewSort {
  return value === "period" ? "period" : "recent";
}

export async function loadReviewsCollection(
  env: WorkspaceScopeEnv,
  request: Request,
  session: AuthenticatedSession,
): Promise<ReviewsCollectionData> {
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const url = new URL(request.url);
  const preferences = await scope.appPreferences.get(session.user.subject);
  const today = ownerCalendarIso(new Date(), preferences.timezone);
  const view = parseView(url.searchParams.get("view"));
  const type = parseType(url.searchParams.get("type"));
  const sort = parseSort(url.searchParams.get("sort"));
  const query = url.searchParams.get("q")?.trim() ?? "";
  const cursor = url.searchParams.get("cursor") ?? undefined;

  try {
    const page = await scope.reviews.list({
      view,
      type,
      sort,
      query,
      cursor,
      today,
      limit: 24,
    });
    return {
      reviews: page.items.map((review) =>
        serializeReview(review, preferences.dateFormat),
      ),
      view,
      query,
      type,
      sort,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      today,
      failed: false,
    };
  } catch {
    return {
      reviews: [],
      view,
      query,
      type,
      sort,
      nextCursor: null,
      hasMore: false,
      today,
      failed: true,
    };
  }
}
