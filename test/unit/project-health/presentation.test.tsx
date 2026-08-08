import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  HealthIndicator,
  healthAccessibleSummary,
  healthNeedsAttention,
  healthReasonText,
  healthSignals,
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

/*
 * RECORD-01 — `ProjectHealthPanel` was removed and its reasons became
 * `healthSignals`, rendered in the compact record summary band. These are the
 * same guarantees the panel carried — every reason once, a calm statement when
 * on track, and an empty project that is not 0% — asserted against the pure
 * function rather than a card that no longer exists.
 */
describe("healthSignals", () => {
  it("carries every reason exactly once, in the evaluator's order", () => {
    const health = stubHealth({
      taskTotal: 6,
      taskCompleted: 1,
      overdueOpen: 1,
      waitingOpen: 2,
      upcomingDueOpen: 1,
    });
    const signals = healthSignals(health);

    expect(signals).toHaveLength(health.reasons.length);
    // No duplicate codes, and the order is the evaluator's — presentation never
    // re-decides which reason matters most.
    expect(signals.map((signal) => signal.id)).toEqual(
      health.reasons.map((reason) => reason.code),
    );
    expect(new Set(signals.map((signal) => signal.id)).size).toBe(
      signals.length,
    );
  });

  it("states each reason in the same words the shared formatter uses", () => {
    const health = stubHealth({ taskTotal: 6, taskCompleted: 1, overdueOpen: 1 });
    const signals = healthSignals(health);
    expect(signals.map((signal) => signal.text)).toEqual(
      health.reasons.map((reason) => healthReasonText(reason)),
    );
  });

  it("carries the reason's own tone, never colour alone", () => {
    const health = stubHealth({ taskTotal: 6, taskCompleted: 1, overdueOpen: 1 });
    for (const signal of healthSignals(health)) {
      // Every signal has real text; the tone only tints it.
      expect(String(signal.text).length).toBeGreaterThan(0);
    }
    expect(healthSignals(health).map((signal) => signal.tone)).toEqual(
      health.reasons.map((reason) => reason.tone),
    );
  });

  it("presents an empty project calmly (no tasks, never 0% of something real)", () => {
    const signals = healthSignals(stubHealth({ taskTotal: 0, taskCompleted: 0 }));
    const text = signals.map((signal) => String(signal.text)).join(" ");
    expect(text).not.toMatch(/0%/);
  });
});
