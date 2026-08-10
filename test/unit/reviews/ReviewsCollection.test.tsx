import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewsCollectionView } from "~/modules/reviews/ReviewsCollection";
import type { ReviewsCollectionData } from "~/modules/reviews/review-collection-data";
import type { SerializedReview } from "~/modules/reviews/review-view";

function review(over: Partial<SerializedReview> = {}): SerializedReview {
  return {
    id: "r1",
    title: "Weekly Review — 27 Jul–2 Aug 2026",
    type: "weekly",
    typeLabel: "Weekly",
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
    periodLabel: "27 July 2026–2 August 2026",
    status: "in_progress",
    statusLabel: "In progress",
    templateId: "weekly.v1",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    updatedLabel: "2 August 2026",
    completedAt: null,
    completedLabel: "Not completed",
    archivedAt: null,
    archived: false,
    authoredSections: 4,
    totalSections: 6,
    completionLabel: "4 of 6 sections authored",
    sections: [],
    ...over,
  };
}

function data(
  reviews: readonly SerializedReview[],
  over: Partial<ReviewsCollectionData> = {},
): ReviewsCollectionData {
  return {
    reviews,
    view: "current",
    query: "",
    type: "all",
    sort: "recent",
    nextCursor: null,
    hasMore: false,
    today: "2026-08-10",
    failed: false,
    ...over,
  };
}

function renderCollection(value: ReviewsCollectionData) {
  const router = createMemoryRouter(
    [{ path: "/reviews", element: <ReviewsCollectionView data={value} /> }],
    { initialEntries: ["/reviews"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Reviews collection (UIX-05)", () => {
  // The period IS the identity: a Review is recognised by when it is.
  it("leads with the period and names the card by it", () => {
    renderCollection(data([review()]));
    const card = screen.getByRole("article", {
      name: /Weekly — 27 July 2026–2 August 2026/,
    });
    expect(
      within(card).getByRole("heading", { name: /27 July 2026/ }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("link", {
        name: /Open Weekly review — 27 July 2026/,
      }),
    ).toHaveAttribute("href", "/reviews/r1");
  });

  // The derived title says nothing the eyebrow and heading have not said.
  it("drops a title that is the product's own derived one", () => {
    renderCollection(data([review()]));
    expect(
      screen.queryByText(/Weekly Review — 27 Jul/),
    ).not.toBeInTheDocument();
  });

  it("keeps a title the owner gave the Review", () => {
    renderCollection(data([review({ title: "Post-Ekka reset" })]));
    expect(screen.getByText("Post-Ekka reset")).toBeInTheDocument();
  });

  // The measure is the reflection, stated as an exact fraction, not a percentage.
  it("draws the reflection as a bar with the fraction beside it", () => {
    renderCollection(data([review()]));
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "4");
    expect(bar).toHaveAttribute("aria-valuemax", "6");
    expect(bar).toHaveAttribute("aria-valuetext", "4 of 6 sections authored");
    expect(screen.getByTestId("review-card-figures")).toHaveTextContent(
      "4 of 6 written",
    );
  });

  // Rule 3 — a settled fact is not a live measure.
  it("draws no bar on a completed Review, and says when it closed", () => {
    renderCollection(
      data([
        review({
          status: "completed",
          statusLabel: "Completed",
          authoredSections: 6,
          completedAt: "2026-08-03T00:00:00.000Z",
          completedLabel: "3 August 2026",
        }),
      ]),
    );
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Completed 3 August 2026")).toBeInTheDocument();
  });

  it("offers Continue straight into the guided flow for unfinished work", () => {
    renderCollection(data([review()]));
    expect(
      screen.getByRole("link", { name: /Continue Weekly review/ }),
    ).toHaveAttribute("href", "/reviews/r1/guide");
  });

  it("says Start when nothing has been written yet", () => {
    renderCollection(data([review({ authoredSections: 0 })]));
    expect(
      screen.getByRole("link", { name: /Start Weekly review/ }),
    ).toBeInTheDocument();
  });

  it("offers no Continue on an archived Review, and says it is archived", () => {
    renderCollection(
      data([
        review({ archived: true, archivedAt: "2026-08-04T00:00:00.000Z" }),
      ]),
    );
    expect(screen.queryByRole("link", { name: /Continue/ })).toBeNull();
    expect(screen.getByText(/Archived · in progress/)).toBeInTheDocument();
  });

  it("shows a warm empty state with somewhere to learn what Reviews are for", () => {
    renderCollection(data([]));
    expect(screen.getByText("No Reviews yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "What Reviews are for" }),
    ).toBeInTheDocument();
  });
});
