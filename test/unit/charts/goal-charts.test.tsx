/**
 * The chart primitives' correctness contracts.
 *
 * ── UNTITLED-12: what these tests are now ───────────────────────────────────
 *
 * UIX-03 wrote them against `TrendLine`, which is deleted: every dated series in
 * the product is `MeasurementTrend` over `application/charts-base` now. The
 * contracts themselves are not TrendLine's, they are the CHART's, and every one
 * of them survives the move:
 *
 *   - a target far below every reading still frames, so the chart answers "am I
 *     getting there?" rather than only "have I moved?" — the regression UIX-03
 *     was written for;
 *   - a series with a natural floor of zero is never given a negative tick;
 *   - a COUNT series offers no half-values (UNTITLED-12 — the reason Analytics'
 *     two plots needed their own pass before they could move);
 *   - the chart refuses to draw a line from one point.
 *
 * The first three are decided by `niceDomain`, which is the value-domain rule
 * and is exported for exactly this. They are asserted on the NUMBERS rather than
 * on a rendered SVG: `MeasurementTrend` is Recharts inside a `ResponsiveContainer`
 * that measures its parent, so a jsdom render of it asserts jsdom's layout engine
 * — which reports every box as zero — and not the chart.
 *
 * `Sparkline` is tested for the one thing a tiny chart can get dangerously
 * wrong: asserting a direction the data does not support.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  MeasurementTrend,
  Sparkline,
  niceDomain,
  type MeasurementTrendPoint,
} from "~/shared/charts";

/** The brief's acceptance series: down from 85, with an honest backslide. */
const WEIGHT: MeasurementTrendPoint[] = [
  { key: "a", date: "2026-06-10", value: 85 },
  { key: "b", date: "2026-07-10", value: 80.1 },
  { key: "c", date: "2026-07-17", value: 80.6 },
  { key: "d", date: "2026-08-08", value: 79.3 },
];

const values = WEIGHT.map((point) => point.value);

describe("the value domain — the target belongs on the scale", () => {
  it("frames a target that is far below every reading", () => {
    /*
     * The regression UIX-03 exists to fix, restated on the rule that now decides
     * it. With a reading-only domain the readings span 79.3–85 and a target of
     * 70 falls outside it, so the reference is silently dropped: the chart
     * answers "have I moved?" and refuses "am I getting there?".
     *
     * `MeasurementTrend` pushes the target into the domain before calling this
     * (see its `model` memo), so what has to hold here is that a domain built
     * from readings AND target contains the target with room around it.
     */
    const withTarget = niceDomain(
      Math.min(...values, 70),
      Math.max(...values, 70),
      4,
    );
    expect(withTarget.domain[0]).toBeLessThanOrEqual(70);
    expect(withTarget.domain[1]).toBeGreaterThanOrEqual(85);

    // And the readings-only domain genuinely would not have: this is the
    // falsifier, so the assertion above cannot pass for the wrong reason.
    const readingsOnly = niceDomain(
      Math.min(...values),
      Math.max(...values),
      4,
    );
    expect(readingsOnly.domain[0]).toBeGreaterThan(70);
  });

  it("never puts a negative tick under a measure that cannot go below zero", () => {
    // A "run 100 km" Goal drew a −50 km tick, because the head-room padding had
    // pushed the floor under a bound the MEASURE itself has.
    const { domain, ticks } = niceDomain(0, 100, 4);
    expect(domain[0]).toBe(0);
    expect(ticks.every((tick) => tick >= 0)).toBe(true);
  });

  it("offers round numbers rather than the readings' own extremes", () => {
    // "93.4, 88.6, 82.6, 76.6" is four arbitrary numbers, and an axis a reader
    // has to decode is an axis they will not use.
    const { ticks } = niceDomain(76.6, 93.4, 4);
    expect(ticks.length).toBeGreaterThan(1);
    for (const tick of ticks) {
      expect(Number.isFinite(tick)).toBe(true);
    }
    // Every step is the same size, which is what makes it a scale.
    const steps = ticks.slice(1).map((tick, index) => tick - ticks[index]!);
    for (const step of steps) {
      expect(step).toBeCloseTo(steps[0]!, 6);
    }
  });

  it("offers no half-values for a series of COUNTS", () => {
    /*
     * UNTITLED-12 — the reason Analytics' two plots needed a data pass before
     * they could move. Tasks completed and items overdue are counts: "2.5 Tasks"
     * does not exist, and an axis offering it is wrong rather than merely ugly.
     * Same rule ADR-104 states for Habits' adherence chart.
     */
    const { ticks } = niceDomain(0, 9, 4, true);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks.every((tick) => Number.isInteger(tick))).toBe(true);

    // The step must not collapse to zero on a tiny range, which would be a loop
    // that never terminates rather than a wrong axis.
    const tiny = niceDomain(0, 1, 4, true);
    expect(tiny.ticks.every((tick) => Number.isInteger(tick))).toBe(true);
    expect(tiny.ticks.length).toBeGreaterThan(1);
  });
});

describe("MeasurementTrend — one point is not a trend", () => {
  it("draws nothing at all from fewer than two readings", () => {
    // The caller renders the "more measurements needed" state; the chart never
    // invents a flat line from one point. This is decidable without layout,
    // because the component returns null before it reaches Recharts.
    const { container } = render(
      <MeasurementTrend
        points={[WEIGHT[0]!]}
        summary="One measurement."
        formatValue={(value) => `${value} kg`}
        formatDate={(iso) => iso}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("One measurement.")).not.toBeInTheDocument();
  });
});

describe("Sparkline", () => {
  it("draws nothing from a single reading", () => {
    // One point has no direction. A horizontal line through it would assert
    // "steady", which is a claim the data cannot support.
    const { container } = render(
      <Sparkline points={[{ key: "a", date: "2026-08-01", value: 5 }]} />,
    );
    expect(container.querySelector(".dh-spark")).toBeNull();
  });

  it("reads a FALLING series as improving when lower is better", () => {
    const { container } = render(
      <Sparkline
        points={[
          { key: "a", date: "2026-06-10", value: 85 },
          { key: "b", date: "2026-08-08", value: 79.3 },
        ]}
        direction="decrease"
      />,
    );
    // Tone follows movement TOWARDS the target, never the sign of the gradient:
    // a weight coming down and savings going up are both improving.
    expect(container.querySelector(".dh-spark")).toHaveAttribute(
      "data-tone",
      "improving",
    );
  });

  it("reads the same falling series as regressing when higher is better", () => {
    const { container } = render(
      <Sparkline
        points={[
          { key: "a", date: "2026-06-10", value: 85 },
          { key: "b", date: "2026-08-08", value: 79.3 },
        ]}
        direction="increase"
      />,
    );
    expect(container.querySelector(".dh-spark")).toHaveAttribute(
      "data-tone",
      "regressing",
    );
  });

  it("stays neutral when the caller has no direction to give", () => {
    const { container } = render(
      <Sparkline
        points={[
          { key: "a", date: "2026-06-10", value: 85 },
          { key: "b", date: "2026-08-08", value: 79.3 },
        ]}
      />,
    );
    expect(container.querySelector(".dh-spark")).toHaveAttribute(
      "data-tone",
      "level",
    );
  });

  it("is decorative, because every fact it shows is printed beside it", () => {
    const { container } = render(
      <Sparkline
        points={[
          { key: "a", date: "2026-06-10", value: 85 },
          { key: "b", date: "2026-08-08", value: 79.3 },
        ]}
        direction="decrease"
      />,
    );
    // Unlike `MeasurementTrend`, which is `role="img"` with a required summary: a card
    // states its reading, target and percentage as text, and a fourth reading
    // of the same facts would be noise in a screen reader.
    expect(container.querySelector(".dh-spark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
