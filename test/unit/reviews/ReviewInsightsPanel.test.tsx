/**
 * REVIEW-03 — the evidence surface.
 *
 * These assert what the owner reads and reaches, not how it is built: the
 * heading outline, that a classification is never shown without its reason,
 * that every claim is a real link to an existing destination, that absence
 * renders less, and that the trend's numbers survive without the chart.
 */

import { render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import type { ReviewInsights } from "~/kernel/review-insights";
import { ReviewInsightsPanel } from "~/modules/reviews/insights/ReviewInsightsPanel";

import {
  areaFact,
  buildInsights,
  carryOverFact,
  goalFact,
  previousSnapshot,
  projectFact,
  storedSnapshot,
} from "../../support/review-insights";

function renderPanel(insights: ReviewInsights, title?: string) {
  const element: ReactElement = (
    <ReviewInsightsPanel insights={insights} headingLevel={3} title={title} />
  );
  const router = createMemoryRouter([{ path: "/", element }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

const BUSY_WEEK = () =>
  buildInsights({
    previousReviewId: "review-previous",
    previousSnapshot: previousSnapshot({
      projects: [
        { id: "p-loft", health: "on_track", openTasks: 3, overdueTasks: 0 },
      ],
      carryOverTaskIds: ["task-1"],
    }),
    tasksCompleted: 7,
    projects: [
      projectFact({
        id: "p-kitchen",
        title: "Kitchen renovation",
        tasksCompletedInPeriod: 7,
      }),
      projectFact({
        id: "p-loft",
        title: "Loft conversion",
        healthState: "at_risk",
        overdueTasks: 2,
      }),
    ],
    goals: [
      goalFact({
        id: "g-home",
        title: "A finished home",
        tasksCompletedInPeriod: 7,
        contributingProjectsWithWork: 1,
      }),
    ],
    areas: [
      areaFact({ id: "a-home", title: "Home", tasksCompletedInPeriod: 7 }),
      areaFact({
        id: "a-health",
        title: "Health & Fitness",
        activeProjects: 1,
      }),
    ],
    overdueCarryOver: 1,
    carryOver: [carryOverFact({ id: "task-1", title: "Renew the insurance" })],
    series: [
      {
        key: "review-previous",
        periodStart: "2026-07-20",
        periodEnd: "2026-07-26",
        tasksCompleted: 3,
        projectsCompleted: 0,
        goalsCompleted: 0,
      },
      {
        key: "current",
        periodStart: "2026-07-27",
        periodEnd: "2026-08-02",
        tasksCompleted: 7,
        projectsCompleted: 0,
        goalsCompleted: 0,
      },
    ],
  });

describe("the Review evidence surface", () => {
  it("answers the Review's five questions, each under its own heading", () => {
    renderPanel(BUSY_WEEK());
    for (const heading of [
      "What changed",
      "Where the work contributed",
      "How Project health moved",
      "What needs attention",
      "Where effort landed",
      "Over recent Reviews",
    ]) {
      expect(
        screen.getByRole("heading", { level: 3, name: heading }),
      ).toBeTruthy();
    }
  });

  it("never shows a classification without the reason behind it", () => {
    renderPanel(BUSY_WEEK());
    const goals = screen
      .getByRole("heading", { level: 3, name: "Where the work contributed" })
      .closest("section");
    expect(goals).toBeTruthy();
    expect(within(goals as HTMLElement).getByText("Moving")).toBeTruthy();
    expect(
      within(goals as HTMLElement).getByText(
        "7 Tasks completed this period, across 1 contributing Project.",
      ),
    ).toBeTruthy();
  });

  it("makes every claim inspectable through ordinary links to existing records", () => {
    renderPanel(BUSY_WEEK());
    expect(
      screen
        .getByRole("link", { name: "Loft conversion" })
        .getAttribute("href"),
    ).toBe("/projects/p-loft");
    expect(
      screen
        .getByRole("link", { name: "A finished home" })
        .getAttribute("href"),
    ).toBe("/goals/g-home");
    expect(
      screen
        .getByRole("link", { name: "Renew the insurance" })
        .getAttribute("href"),
    ).toBe("/tasks?task=task-1");
    expect(
      screen
        .getByRole("link", { name: "Health & Fitness" })
        .getAttribute("href"),
    ).toBe("/areas/a-health");
  });

  it("shows the health transition with both states named, not by colour", () => {
    renderPanel(BUSY_WEEK());
    expect(screen.getByText("On track → At risk")).toBeTruthy();
  });

  it("states the trend in words as well as bars", () => {
    renderPanel(BUSY_WEEK());
    const chart = screen.getByRole("img", { name: /Tasks completed over/ });
    expect(chart).toBeTruthy();
    // The same sentence is on the page, so a printed or narrow view keeps it.
    expect(
      screen.getByText(/up from 3 to 7/, { selector: ".dh-trend__summary" }),
    ).toBeTruthy();
  });

  it("renders one sentence, not five empty sections, for a first Review", () => {
    renderPanel(buildInsights(), "Evidence for this period");
    expect(screen.queryByRole("heading", { name: "What changed" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "What needs attention" }),
    ).toBeNull();
    expect(screen.getByText(/This is your first Review/)).toBeTruthy();
    // No zeros anywhere.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("says what it cannot compare when the previous Review has no evidence", () => {
    renderPanel(
      buildInsights({
        previousReviewId: "review-previous",
        previousSnapshot: null,
        tasksCompleted: 2,
        projects: [projectFact({ tasksCompletedInPeriod: 2 })],
      }),
    );
    expect(
      screen.getByText(/before DalyHub started recording Review evidence/),
    ).toBeTruthy();
  });

  it("says a failed read is unavailable rather than reporting nothing happened", () => {
    renderPanel(buildInsights({ historyAvailable: false }));
    expect(screen.getByText("Movement is not available")).toBeTruthy();
  });

  it("states that ancestry is attributed as records are structured today", () => {
    renderPanel(BUSY_WEEK());
    expect(
      screen.getByText(
        /attributed to the Goal and Area its Project belongs to today/,
      ),
    ).toBeTruthy();
  });
});

describe("the across-Reviews section (V2.9 INS-02)", () => {
  it("renders each claim with its reason, under its own heading", () => {
    renderPanel(
      buildInsights({
        snapshotSeries: [
          storedSnapshot("review-1", {
            periodStart: "2026-08-03",
            periodEnd: "2026-08-09",
            projects: [
              {
                id: "project-1",
                health: "on_track",
                openTasks: 3,
                overdueTasks: 0,
              },
            ],
          }),
          storedSnapshot("review-2", {
            periodStart: "2026-08-10",
            periodEnd: "2026-08-16",
            projects: [
              {
                id: "project-1",
                health: "at_risk",
                openTasks: 4,
                overdueTasks: 2,
              },
            ],
          }),
        ],
        projects: [projectFact({ healthState: "at_risk", overdueTasks: 2 })],
      }),
    );
    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Across recent Reviews",
    });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section!).getByText(
        "Kitchen renovation: At risk at 1 of the last 2 Reviews",
      ),
    ).toBeInTheDocument();
    // The claim never appears without the reason that produced it.
    expect(
      within(section!).getByText(/over your last 2 Reviews/),
    ).toBeInTheDocument();
  });

  it("renders no section at all when there is no series — absence renders less", () => {
    renderPanel(buildInsights({ tasksCompleted: 3 }));
    expect(
      screen.queryByRole("heading", { name: "Across recent Reviews" }),
    ).toBeNull();
  });
});
