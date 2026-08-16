/**
 * POLISH-01 — a meter says how the work is GOING.
 *
 * The audit's finding, stated as a test: a progress bar was painted from the
 * record's IDENTITY colour, so a Goal reading "60% — Ahead" drew a red bar
 * because red was that Goal's chosen colour, a completed Project drew an orange
 * one, and a healthy Goal drew the same amber the product spends on "needs
 * attention".
 *
 * These assertions are about the CONTRACT rather than about a pixel: the
 * mapping from a status the product already derived to the ramp a meter paints
 * from, and the DOM attribute that carries it. The colours themselves are held
 * by `test/unit/tokens/dalyhub-primitive-contrast.test.ts`.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ProgressTrack,
  meterStatusAttribute,
  meterStatusFromTone,
} from "~/shared/progress";
import {
  GOAL_PROGRESS_METER_STATUSES,
  goalProgressMeterStatus,
} from "~/shared/goal-progress";
import type { GoalProgressStatus } from "~/shared/goal-progress";

describe("meterStatusFromTone", () => {
  it("passes the four status tones straight through", () => {
    expect(meterStatusFromTone("success")).toBe("success");
    expect(meterStatusFromTone("warning")).toBe("warning");
    expect(meterStatusFromTone("danger")).toBe("danger");
    expect(meterStatusFromTone("info")).toBe("info");
  });

  it("narrows the ACCENT tone to neutral", () => {
    /*
     * `accent` is the application's brand colour. A bar painted in the brand is
     * a bar that has not been asked "how is this going?" — which is exactly the
     * state every meter in the product was in before POLISH-01.
     */
    expect(meterStatusFromTone("accent")).toBe("neutral");
  });

  it("treats an absent tone as neutral rather than as good news", () => {
    expect(meterStatusFromTone(null)).toBe("neutral");
    expect(meterStatusFromTone(undefined)).toBe("neutral");
  });
});

describe("goalProgressMeterStatus", () => {
  it("never calls work that has not started a success", () => {
    // The failure this guards is a dashboard congratulating the owner for a
    // Goal it was never told how to measure.
    for (const status of [
      "not_measured",
      "not_started",
      "in_progress",
      "stale",
    ] as const) {
      expect(goalProgressMeterStatus(status), status).toBe("neutral");
    }
  });

  it("paints the three genuinely-positive states as success", () => {
    for (const status of ["on_track", "ahead", "achieved"] as const) {
      expect(goalProgressMeterStatus(status), status).toBe("success");
    }
  });

  it("separates a slope from a passed deadline", () => {
    // The one place the meter ramp is deliberately stricter than the chip ramp.
    expect(goalProgressMeterStatus("needs_attention")).toBe("warning");
    expect(goalProgressMeterStatus("overdue")).toBe("danger");
  });

  it("maps every status the evaluator can produce", () => {
    const statuses: readonly GoalProgressStatus[] = [
      "not_measured",
      "not_started",
      "in_progress",
      "on_track",
      "ahead",
      "needs_attention",
      "achieved",
      "overdue",
      "stale",
    ];
    for (const status of statuses) {
      expect(GOAL_PROGRESS_METER_STATUSES[status], status).toBeDefined();
    }
    expect(Object.keys(GOAL_PROGRESS_METER_STATUSES)).toHaveLength(
      statuses.length,
    );
  });
});

describe("meterStatusAttribute", () => {
  it("emits nothing for neutral, so the CSS default IS the neutral paint", () => {
    expect(meterStatusAttribute("neutral")).toEqual({});
    expect(meterStatusAttribute(null)).toEqual({});
    expect(meterStatusAttribute(undefined)).toEqual({});
  });

  it("emits the attribute for every status that says something", () => {
    expect(meterStatusAttribute("danger")).toEqual({
      "data-meter-status": "danger",
    });
  });
});

describe("ProgressTrack", () => {
  it("carries the status on the element the fill is painted from", () => {
    render(
      <ProgressTrack
        label="Reach 70 kg"
        percent={60}
        valueText="60 of 70 kg"
        status="success"
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Reach 70 kg" });
    expect(bar).toHaveAttribute("data-meter-status", "success");
  });

  it("states the value in words regardless, so colour is never the channel", () => {
    render(
      <ProgressTrack
        label="Reach 70 kg"
        percent={60}
        valueText="60 of 70 kg"
        status="danger"
      />,
    );
    expect(
      screen.getByRole("progressbar", { name: "Reach 70 kg" }),
    ).toHaveAttribute("aria-valuetext", "60% — 60 of 70 kg");
  });

  it("defaults to no status rather than to the brand colour", () => {
    render(
      <ProgressTrack label="Captured" percent={30} valueText="12 of 40" />,
    );
    expect(
      screen.getByRole("progressbar", { name: "Captured" }),
    ).not.toHaveAttribute("data-meter-status");
  });
});
