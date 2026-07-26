/**
 * TASKS-02 — the shared task signal components (PriorityIndicator + UrgencyChip).
 *
 * Proves the acceptance criteria the 2026-07 UI/UX audit set (DEBT-27/28): priority
 * and urgency each carry their meaning in TEXT (never colour alone), the components
 * degrade calmly (render nothing when there is nothing to signal), the untriaged
 * "No priority" affordance is opt-in, and the tone is exposed as a data attribute
 * (reinforcement) rather than being the only signal.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";
import { UrgencyChip } from "~/shared/task-record/UrgencyChip";

describe("PriorityIndicator", () => {
  it("renders the short tag AND the full action word for assistive tech", () => {
    render(<PriorityIndicator priority="p1" data-testid="pi" />);
    const el = screen.getByTestId("pi");
    // The visible tag is short; the full text content includes the action word so a
    // screen-reader user hears "P1 priority — Do", never a bare colour.
    expect(el).toHaveTextContent("P1");
    expect(el).toHaveTextContent(/priority — Do/);
    // Colour is reinforcement only — the meaning-bearing attribute is the value.
    expect(el).toHaveAttribute("data-priority", "p1");
  });

  it("maps each priority to its action word", () => {
    for (const [priority, word] of [
      ["p1", "Do"],
      ["p2", "Defer"],
      ["p3", "Delegate"],
      ["p4", "Delete / Review"],
    ] as const) {
      const { unmount } = render(
        <PriorityIndicator priority={priority} data-testid="pi" />,
      );
      expect(screen.getByTestId("pi")).toHaveTextContent(
        new RegExp(`priority — ${word.replace("/", "\\/")}`),
      );
      unmount();
    }
  });

  it("renders nothing for an untriaged task by default", () => {
    const { container } = render(<PriorityIndicator priority={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an explicit 'No priority' chip when showEmpty is set", () => {
    render(<PriorityIndicator priority={null} showEmpty data-testid="pi" />);
    const el = screen.getByTestId("pi");
    expect(el).toHaveTextContent("No priority");
    expect(el).toHaveAttribute("data-priority", "none");
  });
});

describe("UrgencyChip", () => {
  const TODAY = "2026-07-20";

  it("renders the word Overdue with a danger tone for a past open due date", () => {
    render(
      <UrgencyChip
        task={{ completedAt: null, dueDate: "2026-07-10", scheduledDate: null }}
        todayIso={TODAY}
        data-testid="uc"
      />,
    );
    const el = screen.getByTestId("uc");
    expect(el).toHaveTextContent("Overdue");
    expect(el).toHaveAttribute("data-tone", "danger");
    expect(el).toHaveAttribute("data-kind", "overdue");
  });

  it("renders 'Due today' distinctly from a future due date", () => {
    const { rerender } = render(
      <UrgencyChip
        task={{ completedAt: null, dueDate: TODAY, scheduledDate: null }}
        todayIso={TODAY}
        data-testid="uc"
      />,
    );
    expect(screen.getByTestId("uc")).toHaveTextContent("Due today");
    rerender(
      <UrgencyChip
        task={{ completedAt: null, dueDate: "2026-08-01", scheduledDate: null }}
        todayIso={TODAY}
        data-testid="uc"
      />,
    );
    expect(screen.getByTestId("uc")).toHaveTextContent("Due 1 Aug 2026");
    expect(screen.getByTestId("uc")).not.toHaveTextContent("today");
  });

  it("renders 'Scheduled today' for a task planned for today", () => {
    render(
      <UrgencyChip
        task={{ completedAt: null, dueDate: null, scheduledDate: TODAY }}
        todayIso={TODAY}
        data-testid="uc"
      />,
    );
    expect(screen.getByTestId("uc")).toHaveTextContent("Scheduled today");
  });

  it("renders nothing when the task has no due or scheduled date", () => {
    const { container } = render(
      <UrgencyChip
        task={{ completedAt: null, dueDate: null, scheduledDate: null }}
        todayIso={TODAY}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hides its glyph from assistive tech (the label carries the meaning)", () => {
    render(
      <UrgencyChip
        task={{ completedAt: null, dueDate: "2026-07-10", scheduledDate: null }}
        todayIso={TODAY}
        data-testid="uc"
      />,
    );
    expect(screen.getByTestId("uc").querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
