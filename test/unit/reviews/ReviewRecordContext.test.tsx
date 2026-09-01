/**
 * V2.7 RECALL-04 — the Review record's period tabs say what they hold
 * (DEBT-235).
 *
 * Three claims, all of them about the agreement between a LABEL and the rows
 * beneath it, which is the whole of RECALL-04's third part:
 *
 *   1. the tab called "People & Meetings" held meetings alone — the label now
 *      matches the content;
 *   2. the overdue list is CURRENT-STATE data and now says `now` in its own
 *      heading, so nothing about a closed period is implied by it (the recorded
 *      decision — see `review-period-context.ts`);
 *   3. a list that truncated says so, rather than reading as a complete answer.
 */

import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { REVIEW_SECTION_IDS } from "~/kernel/reviews";
import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";
import { ReviewRecord } from "~/modules/reviews/ReviewRecord";
import {
  REVIEW_PERIOD_CONTEXT_LIMIT,
  type ReviewContextList,
  type ReviewPeriodContext,
} from "~/modules/reviews/review-period-context";
import type { SerializedReview } from "~/modules/reviews/review-view";

import { buildInsights } from "../../support/review-insights";

function review(): SerializedReview {
  return {
    id: "r1",
    title: "Weekly Review — 24 Aug–6 Sep 2026",
    type: "weekly",
    typeLabel: "Weekly",
    periodStart: "2026-08-24",
    periodEnd: "2026-09-06",
    periodLabel: "24 August 2026–6 September 2026",
    status: "in_progress",
    statusLabel: "In progress",
    templateId: "weekly.v1",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    updatedLabel: "7 September 2026",
    completedAt: null,
    completedLabel: "Not completed",
    archivedAt: null,
    archived: false,
    authoredSections: 0,
    totalSections: REVIEW_SECTION_IDS.length,
    completionLabel: "0 of 10 sections authored",
    sections: REVIEW_SECTION_IDS.map((sectionId) => ({
      sectionId,
      label: sectionId,
      body: "",
      updatedAt: "2026-09-07T00:00:00.000Z",
    })),
  };
}

function list(titles: readonly string[], bounded = false): ReviewContextList {
  return {
    items: titles.map((title, index) => ({
      id: `item-${index}-${title}`,
      title,
      dateLabel: "2026-08-25",
      target: { kind: "drawer", drawerKey: `task:item-${index}` },
    })),
    bounded,
  };
}

function context(over: Partial<ReviewPeriodContext> = {}): ReviewPeriodContext {
  return {
    completedTasks: list(["Finished then"]),
    openNowTasks: list(["Overdue right now"]),
    diaryEntries: list(["Wrote something"]),
    meetings: list(["Design review"]),
    note: "Live period context is read from the source modules.",
    ...over,
  };
}

function renderRecord(value: ReviewPeriodContext, tabId = "tasks") {
  const element = (
    <FeedbackProvider>
      <DrawerProvider renderDrawer={() => null}>
        <ReviewRecord
          review={review()}
          context={value}
          insights={buildInsights()}
          activeTabId={tabId}
          onTabChange={() => {}}
          onSaved={() => {}}
        />
      </DrawerProvider>
    </FeedbackProvider>
  );
  const router = createMemoryRouter(
    [
      { path: "/reviews/:id", element },
      { path: "*", element: <div /> },
    ],
    { initialEntries: ["/reviews/r1"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("the period tabs' labels match their contents", () => {
  it("names the Meetings tab after what it holds", () => {
    renderRecord(context(), "people");
    expect(screen.getByRole("tab", { name: "Meetings" })).toBeInTheDocument();
    // The label that promised People and delivered meetings alone.
    expect(screen.queryByRole("tab", { name: /People/ })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Meetings in this period" }),
    ).toBeInTheDocument();
  });

  it("separates what happened in the period from what is true NOW", () => {
    renderRecord(context());
    // The period fact, named as one.
    expect(
      screen.getByRole("heading", { name: "Completed in this period" }),
    ).toBeInTheDocument();
    /*
     * The current-state fact, named as one. Before RECALL-04 this list read
     * "Open or overdue tasks" under a historic period's title while its query
     * was bound to TODAY in SQL — the period name and the rows beneath it
     * describing different time windows.
     */
    expect(
      screen.getByRole("heading", { name: "Open and overdue now" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^Open or overdue/ }),
    ).toBeNull();
  });
});

describe("a bounded period list says so", () => {
  it("stays silent when the whole period fits", () => {
    renderRecord(context());
    expect(screen.queryByTestId("review-context-bounded")).toBeNull();
  });

  it("states the bound when it truncated", () => {
    renderRecord(
      context({
        completedTasks: list(
          Array.from(
            { length: REVIEW_PERIOD_CONTEXT_LIMIT },
            (_, i) => `T${i}`,
          ),
          true,
        ),
      }),
    );
    const section = screen
      .getByRole("heading", { name: "Completed in this period" })
      .closest("section")!;
    expect(
      within(section).getByTestId("review-context-bounded"),
    ).toHaveTextContent(
      `Showing the first ${REVIEW_PERIOD_CONTEXT_LIMIT} of this period's completed tasks`,
    );
  });
});
