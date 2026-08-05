/**
 * REVIEW-02 / REVIEW-04 — the guided weekly Review shell, exercised as behaviour.
 *
 * These assert the accessibility semantics the WCAG 2.2 AA requirements turn on —
 * the heading outline, the exposed current step, the non-colour state labels, the
 * "Step 3 of 7" progress a screen reader hears — plus the two rules that make the
 * flow honest: continuing never marks a step done, and a blocked completion says
 * exactly what remains.
 *
 * Rendered inside the data router + Drawer + Feedback frame the route provides.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  deriveWeeklyReviewProgress,
  weeklyReviewStep,
  type Review,
  type WeeklyReviewProgressFacts,
  type WeeklyReviewStepId,
} from "~/kernel/reviews";
import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";

import { ReviewGuide } from "~/modules/reviews/guided/ReviewGuide";
import type { ReviewGuideStepData } from "~/modules/reviews/guided/review-guide-context";
import { serializeReview } from "~/modules/reviews/review-view";

const SECTION_IDS = [
  "summary.overall",
  "summary.highlights",
  "summary.challenges",
  "summary.lessons",
  "summary.decisions",
  "summary.next_focus",
  "progress.commentary",
  "tasks.commentary",
  "diary.commentary",
  "people_meetings.commentary",
] as const;

function review(overrides: Partial<Review> = {}): Review {
  return {
    id: "rev-1",
    workspaceId: "ws" as Review["workspaceId"],
    title: "Weekly Review — 27 July–2 August 2026",
    type: "weekly",
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
    status: "in_progress",
    templateId: "review.weekly.v1",
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    completedAt: null,
    archivedAt: null,
    deletedAt: null,
    sections: SECTION_IDS.map((sectionId) => ({
      sectionId,
      body: "",
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    })),
    ...overrides,
  };
}

function facts(
  overrides: Partial<WeeklyReviewProgressFacts> = {},
): WeeklyReviewProgressFacts {
  return {
    status: "in_progress",
    answeredSectionIds: [],
    inboxRemaining: 0,
    acknowledgedSteps: [],
    bookmarkedStep: null,
    ...overrides,
  };
}

const PERIOD_STEP_DATA: ReviewGuideStepData = {
  kind: "period",
  period: {
    tasksCompleted: { value: 12, hasMore: false },
    tasksOverdue: { value: 3, hasMore: false },
    diaryEntries: { value: 2, hasMore: false },
    meetings: { value: 1, hasMore: false },
    activeProjects: { value: 4, hasMore: true },
    goalsWithRecentProgress: null,
  },
};

function renderGuide(options: {
  readonly stepId: WeeklyReviewStepId;
  readonly stepData: ReviewGuideStepData;
  readonly progressFacts?: Partial<WeeklyReviewProgressFacts>;
  readonly reviewOverrides?: Partial<Review>;
  readonly notice?: string | null;
}) {
  const model = review(options.reviewOverrides);
  const progress = deriveWeeklyReviewProgress(
    facts({
      status: model.status,
      bookmarkedStep: options.stepId,
      ...options.progressFacts,
    }),
  );
  const element: ReactElement = (
    <FeedbackProvider>
      <DrawerProvider renderDrawer={() => null}>
        <ReviewGuide
          review={serializeReview(model, "d_mmm_yyyy")}
          stepId={options.stepId}
          step={weeklyReviewStep(options.stepId)}
          progress={progress}
          stepData={options.stepData}
          inboxRemaining={options.progressFacts?.inboxRemaining ?? 0}
          workflowRevision={3}
          todayIso="2026-08-02"
          notice={options.notice ?? null}
          onNoticeDismissed={() => undefined}
        />
      </DrawerProvider>
    </FeedbackProvider>
  );
  const router = createMemoryRouter([{ path: "/", element }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

describe("the guided weekly Review shell", () => {
  it("keeps one non-skipping heading outline: the Review, then the step", () => {
    renderGuide({ stepId: "overview", stepData: PERIOD_STEP_DATA });
    expect(
      screen.getByRole("heading", { level: 1, name: /Weekly Review/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Settle in" }),
    ).toBeTruthy();
  });

  it("exposes the current step semantically, not only visually", () => {
    renderGuide({ stepId: "projects", stepData: { kind: "sections" } });
    const rail = screen.getByRole("form", { name: "Review steps" });
    const current = within(rail).getByRole("button", { current: "step" });
    expect(current.getAttribute("aria-label")).toBe(
      "Step 3 of 7: Review Projects, current step",
    );
  });

  it("labels completed, current and upcoming steps in words", () => {
    renderGuide({
      stepId: "projects",
      stepData: { kind: "sections" },
      progressFacts: { inboxRemaining: 0, acknowledgedSteps: ["overview"] },
    });
    const rail = screen.getByRole("form", { name: "Review steps" });
    expect(within(rail).getAllByText("Done").length).toBeGreaterThan(0);
    expect(within(rail).getAllByText("Not started").length).toBeGreaterThan(0);
    expect(within(rail).getByText("Current step")).toBeTruthy();
  });

  it("announces progress as a position a screen reader can read", () => {
    renderGuide({ stepId: "alignment", stepData: { kind: "sections" } });
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("4");
    expect(bar.getAttribute("aria-valuemax")).toBe("7");
    expect(bar.getAttribute("aria-valuetext")).toBe("Step 4 of 7");
  });

  it("offers Back and Continue naming where they go", () => {
    renderGuide({ stepId: "projects", stepData: { kind: "sections" } });
    expect(screen.getByRole("button", { name: "Back: Inbox" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue: Alignment" }),
    ).toBeTruthy();
  });

  it("keeps acknowledgement a separate, explicit decision from continuing", () => {
    renderGuide({ stepId: "projects", stepData: { kind: "sections" } });
    // Continuing is one control; marking the step reviewed is another.
    expect(
      screen.getByRole("button", { name: "Mark Projects reviewed" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Continue: Alignment" }),
    ).toBeTruthy();
  });

  it("offers to undo an acknowledgement", () => {
    renderGuide({
      stepId: "projects",
      stepData: { kind: "sections" },
      progressFacts: { acknowledgedSteps: ["projects"] },
    });
    expect(screen.getByRole("button", { name: "Undo ‘reviewed’" })).toBeTruthy();
  });

  it("always offers a way out that keeps the Review", () => {
    renderGuide({ stepId: "overview", stepData: PERIOD_STEP_DATA });
    expect(
      screen.getAllByRole("link", { name: "Open the full Review" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Save and exit" })).toBeTruthy();
  });

  it("states a bounded count honestly rather than silently truncating", () => {
    renderGuide({ stepId: "overview", stepData: PERIOD_STEP_DATA });
    expect(screen.getByText("4+")).toBeTruthy();
  });
});

describe("the completion step", () => {
  it("summarises what the Review covered and what remains", () => {
    renderGuide({
      stepId: "complete",
      stepData: { kind: "summary" },
      progressFacts: { inboxRemaining: 6 },
    });
    expect(screen.getByText("6 still waiting")).toBeTruthy();
    // Both the Projects and the Goals/Areas lines are unmarked in this fixture.
    expect(screen.getAllByText("Not marked reviewed")).toHaveLength(2);
    expect(screen.getByText("0 of 7 answered")).toBeTruthy();
  });

  it("refuses completion while a required step is outstanding, and says why", () => {
    renderGuide({ stepId: "complete", stepData: { kind: "summary" } });
    const complete = screen.getByRole("button", { name: "Complete Review" });
    expect((complete as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/write at least one prompt/)).toBeTruthy();
    expect(screen.getByText(/record a focus/)).toBeTruthy();
  });

  it("does not block on the Inbox or on unanswered optional prompts", () => {
    renderGuide({
      stepId: "complete",
      stepData: { kind: "summary" },
      progressFacts: {
        inboxRemaining: 40,
        answeredSectionIds: ["summary.overall", "summary.next_focus"],
      },
    });
    const complete = screen.getByRole("button", { name: "Complete Review" });
    expect((complete as HTMLButtonElement).disabled).toBe(false);
  });

  it("gives the blocked reason a live alert when completion was refused", () => {
    renderGuide({
      stepId: "complete",
      stepData: { kind: "summary" },
      notice: "blocked",
    });
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("offers reopen — never a second completion flag — once completed", () => {
    renderGuide({
      stepId: "complete",
      stepData: { kind: "summary" },
      reviewOverrides: {
        status: "completed",
        completedAt: new Date("2026-08-02T10:00:00.000Z"),
      },
      progressFacts: { status: "completed" },
    });
    expect(screen.getByRole("button", { name: "Reopen Review" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Complete Review" })).toBeNull();
  });
});

describe("the reflection step", () => {
  it("shows one prompt at a time, with the Review's own template question", () => {
    renderGuide({ stepId: "reflection", stepData: { kind: "sections" } });
    expect(screen.getByText("Prompt 1 of 7")).toBeTruthy();
    expect(
      screen.getByText("What went well? What was difficult?"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Next prompt" }),
    ).toBeTruthy();
  });

  it("makes a completed Review's reflection read-only rather than editable", () => {
    renderGuide({
      stepId: "reflection",
      stepData: { kind: "sections" },
      reviewOverrides: { status: "completed", completedAt: new Date() },
      progressFacts: { status: "completed" },
    });
    expect(screen.getByText("Nothing written for this prompt.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
