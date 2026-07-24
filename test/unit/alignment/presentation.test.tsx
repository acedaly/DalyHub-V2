import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AlignmentIndicator,
  GoalAlignmentPanel,
  type GoalAlignment,
  type SerializedGoalAlignmentEvidence,
} from "~/shared/alignment";

/**
 * AREA-03 — the shared Alignment presentation components (ADR-040). Verifies
 * the toned pill carries text (never colour alone), the record panel shows
 * every reason without duplicates, evidence links navigate to the real Task
 * and Project records, and the bounded evidence page shows an honest
 * "more exist" note rather than silently truncating.
 */

function alignment(overrides: Partial<GoalAlignment> = {}): GoalAlignment {
  return {
    state: "neglected",
    label: "No recent action",
    tone: "info",
    reasons: [
      {
        code: "structure_without_recent_activity",
        tone: "info",
        summary: "Projects exist, but no recent Task activity was found.",
      },
      {
        code: "last_contribution",
        tone: "info",
        summary: "Most recent contributing Task activity was 23 days ago.",
        days: 23,
      },
    ],
    evaluatedAtIso: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

function evidence(
  over: Partial<SerializedGoalAlignmentEvidence> = {},
): SerializedGoalAlignmentEvidence {
  return {
    taskId: "t1",
    taskTitle: "Run 5k",
    projectId: "p1",
    projectTitle: "Training plan",
    occurredAt: "2026-07-20T00:00:00.000Z",
    ...over,
  };
}

describe("AlignmentIndicator", () => {
  it("renders a toned pill with a text label (never colour-only)", () => {
    render(<AlignmentIndicator alignment={alignment()} showReason />);
    const pill = screen.getByText("No recent action");
    expect(pill).toHaveAttribute("data-tone", "info");
    expect(
      screen.getByText(
        "Projects exist, but no recent Task activity was found.",
      ),
    ).toBeInTheDocument();
  });

  it("omits the reason when not requested", () => {
    render(<AlignmentIndicator alignment={alignment()} />);
    expect(screen.getByText("No recent action")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Projects exist, but no recent Task activity was found.",
      ),
    ).not.toBeInTheDocument();
  });

  it("never renders a warning/danger tone (calm by construction)", () => {
    render(
      <AlignmentIndicator
        alignment={alignment({ tone: "success", label: "Recently active" })}
      />,
    );
    const pill = screen.getByText("Recently active");
    expect(pill.getAttribute("data-tone")).not.toBe("warning");
    expect(pill.getAttribute("data-tone")).not.toBe("danger");
  });
});

describe("GoalAlignmentPanel", () => {
  it("shows every reason once, with no duplicates", () => {
    render(
      <GoalAlignmentPanel
        alignment={alignment()}
        evidence={[]}
        evidenceHasMore={false}
        todayIso="2026-07-24"
        onOpenTask={() => {}}
      />,
    );
    const reasons = screen.getByRole("list");
    const items = within(reasons).getAllByRole("listitem");
    const texts = items.map((li) => li.textContent);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("lists real contributing Tasks with a working Project link and an open-Task action", () => {
    const onOpenTask = vi.fn();
    render(
      <GoalAlignmentPanel
        alignment={alignment({ state: "active", tone: "success" })}
        evidence={[evidence()]}
        evidenceHasMore={false}
        todayIso="2026-07-24"
        onOpenTask={onOpenTask}
      />,
    );
    expect(screen.getByRole("link", { name: "Training plan" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    const taskButton = screen.getByRole("button", { name: "Run 5k" });
    fireEvent.click(taskButton);
    expect(onOpenTask).toHaveBeenCalledWith("t1");
  });

  it("shows an honest 'more exist' note rather than silently truncating evidence", () => {
    render(
      <GoalAlignmentPanel
        alignment={alignment({ state: "active", tone: "success" })}
        evidence={[evidence()]}
        evidenceHasMore
        todayIso="2026-07-24"
        onOpenTask={() => {}}
      />,
    );
    expect(
      screen.getByText(/More contributing Tasks exist/),
    ).toBeInTheDocument();
  });

  it("renders no evidence section for a Goal with none", () => {
    render(
      <GoalAlignmentPanel
        alignment={alignment({ state: "no_structure" })}
        evidence={[]}
        evidenceHasMore={false}
        todayIso="2026-07-24"
        onOpenTask={() => {}}
      />,
    );
    expect(
      screen.queryByText("Recent contributing Tasks"),
    ).not.toBeInTheDocument();
  });
});
