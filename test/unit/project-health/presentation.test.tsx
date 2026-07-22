import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  HealthIndicator,
  ProjectHealthPanel,
  healthAccessibleSummary,
  healthNeedsAttention,
  healthReasonText,
  healthToneToCardTone,
} from "~/shared/project-health";

import { stubHealth } from "../../support/project-health";

describe("health-view helpers", () => {
  it("maps a health tone to the identical Card tone", () => {
    expect(healthToneToCardTone("danger")).toBe("danger");
    expect(healthToneToCardTone("info")).toBe("info");
  });

  it("formats a stale reason with warm, date-aware wording (no CRM guilt)", () => {
    const health = stubHealth({
      taskTotal: 3,
      taskCompleted: 0,
      lastMeaningfulActivityAt: new Date("2026-07-01T12:00:00.000Z"),
    });
    const stale = health.reasons.find((r) => r.code === "stale")!;
    const text = healthReasonText(stale);
    expect(text).toContain("No progress since");
    expect(text).not.toMatch(/inactive/i);
  });

  it("builds a concise accessible summary of state + primary reason", () => {
    const health = stubHealth({
      taskTotal: 4,
      taskCompleted: 0,
      overdueOpen: 2,
    });
    expect(healthAccessibleSummary(health)).toBe(
      "At risk — 2 tasks past their due date",
    );
  });

  it("flags attention only for at-risk/blocked/stale", () => {
    expect(healthNeedsAttention(stubHealth({ overdueOpen: 1 }))).toBe(true);
    expect(healthNeedsAttention(stubHealth())).toBe(false);
  });
});

describe("HealthIndicator", () => {
  it("renders a toned pill with a text label (never colour-only)", () => {
    render(
      <HealthIndicator health={stubHealth({ overdueOpen: 2 })} showReason />,
    );
    const pill = screen.getByText("At risk");
    expect(pill).toHaveAttribute("data-tone", "danger");
    expect(screen.getByText("2 tasks past their due date")).toBeInTheDocument();
  });

  it("omits the reason when not requested", () => {
    render(<HealthIndicator health={stubHealth({ overdueOpen: 2 })} />);
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(
      screen.queryByText("2 tasks past their due date"),
    ).not.toBeInTheDocument();
  });
});

describe("ProjectHealthPanel", () => {
  it("shows every reason once, with supporting facts", () => {
    const health = stubHealth({
      taskTotal: 6,
      taskCompleted: 1,
      overdueOpen: 1,
      waitingOpen: 2,
      upcomingDueOpen: 1,
    });
    render(<ProjectHealthPanel health={health} />);
    const reasons = screen.getByRole("list");
    const items = within(reasons).getAllByRole("listitem");
    // No duplicate reason codes → each list item is distinct.
    const texts = items.map((li) => li.textContent);
    expect(new Set(texts).size).toBe(texts.length);
    // Supporting facts present.
    expect(screen.getByText("Progress")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("gives a calm, reassuring statement when on track", () => {
    render(<ProjectHealthPanel health={stubHealth()} />);
    expect(screen.getByText("On track")).toBeInTheDocument();
  });

  it("presents an empty project calmly (no tasks, not 100%)", () => {
    render(
      <ProjectHealthPanel
        health={stubHealth({ taskTotal: 0, taskCompleted: 0 })}
      />,
    );
    expect(screen.getAllByText("No tasks yet").length).toBeGreaterThan(0);
  });
});
