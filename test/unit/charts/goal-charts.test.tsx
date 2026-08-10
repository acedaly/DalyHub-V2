/**
 * UIX-03 — the two Goal-facing chart primitives.
 *
 * `TrendLine`'s job changed in this pass: it used to scale to the readings and
 * draw the target only if it happened to land inside them, which meant the
 * product's own acceptance Goal (85 kg → 79.3 kg, target 70 kg) never showed its
 * target at all. These tests pin the new contract — the target is on the scale,
 * both references are distinguishable without colour, and the chart still
 * refuses to draw a line from one point.
 *
 * `Sparkline` is tested for the one thing a tiny chart can get dangerously
 * wrong: asserting a direction the data does not support.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sparkline, TrendLine, type TrendLinePoint } from "~/shared/charts";

/** The brief's acceptance series: down from 85, with an honest backslide. */
const WEIGHT: TrendLinePoint[] = [
  { key: "a", date: "2026-06-10", value: 85 },
  { key: "b", date: "2026-07-10", value: 80.1 },
  { key: "c", date: "2026-07-17", value: 80.6 },
  { key: "d", date: "2026-08-08", value: 79.3 },
];

function renderTrend(over: Partial<Parameters<typeof TrendLine>[0]> = {}) {
  return render(
    <TrendLine
      points={over.points ?? WEIGHT}
      summary={over.summary ?? "Four measurements, down 5.7 kg."}
      startLabel="10 Jun 2026"
      endLabel="8 Aug 2026"
      lowLabel="70 kg"
      highLabel="85 kg"
      {...over}
    />,
  );
}

/** Read a `<line>`'s y as a fraction of the 0–100 plot space. */
function lineY(container: HTMLElement, className: string): number {
  const line = container.querySelector(`.${className}`);
  expect(line).not.toBeNull();
  return Number(line!.getAttribute("y1"));
}

describe("TrendLine — the target belongs on the scale", () => {
  it("draws the target even when it is far below every reading", () => {
    /*
     * The regression this pass exists to fix. With the old reading-only domain
     * the readings spanned 79.3–85 and a target of 70 fell outside it, so the
     * reference line was silently dropped: the chart answered "have I moved?"
     * and refused "am I getting there?".
     */
    const { container } = renderTrend({
      target: { value: 70, label: "Target 70 kg.", tag: "Target 70 kg" },
    });
    const target = container.querySelector(".dh-linechart__target");
    expect(target).not.toBeNull();
    // Below every reading, i.e. a LARGER y in SVG coordinates.
    const readings = [
      ...container.querySelectorAll(".dh-linechart__point"),
    ].map((point) =>
      Number(point.getAttribute("d")!.match(/M[\d.]+ ([\d.]+)/)![1]),
    );
    expect(Number(target!.getAttribute("y1"))).toBeGreaterThan(
      Math.max(...readings),
    );
  });

  it("puts the distance still to cover into the plot, not out of frame", () => {
    /*
     * The deliberate consequence of scaling to the target: a Goal 38% of the
     * way there draws its readings across the top of the plot and leaves the
     * rest as the distance remaining. That empty space IS the information.
     */
    const { container } = renderTrend({
      target: { value: 70, label: "Target 70 kg." },
    });
    const latest = container.querySelector(
      '.dh-linechart__point[data-latest="true"]',
    );
    const y = Number(latest!.getAttribute("d")!.match(/M[\d.]+ ([\d.]+)/)![1]);
    // 79.3 of a 68.5–86.5 padded domain sits in the upper half of the plot.
    expect(y).toBeLessThan(50);
  });

  it("honours scaleToTarget={false} for a caller whose target is off-axis", () => {
    const withTarget = renderTrend({
      target: { value: 70, label: "Target 70 kg." },
    });
    const readingsOnly = renderTrend({
      target: { value: 70, label: "Target 70 kg." },
      scaleToTarget: false,
    });
    // Out of the reading-only domain, the target is not drawn at all.
    expect(
      withTarget.container.querySelector(".dh-linechart__target"),
    ).not.toBeNull();
    expect(
      readingsOnly.container.querySelector(".dh-linechart__target"),
    ).toBeNull();
  });

  it("distinguishes the two references by dash pattern, never by colour", () => {
    const { container } = renderTrend({
      target: { value: 70, label: "Target 70 kg.", tag: "Target 70 kg" },
      baseline: { value: 90, label: "Started at 90 kg.", tag: "Start 90 kg" },
    });
    // Both drawn, at different heights, and both NAMED in text.
    expect(lineY(container, "dh-linechart__baseline")).toBeLessThan(
      lineY(container, "dh-linechart__target"),
    );
    expect(screen.getByText("Target 70 kg")).toBeInTheDocument();
    expect(screen.getByText("Start 90 kg")).toBeInTheDocument();
    expect(container.textContent).toContain("Target 70 kg.");
    expect(container.textContent).toContain("Started at 90 kg.");
  });

  it("omits a baseline the caller did not supply", () => {
    const { container } = renderTrend({
      target: { value: 70, label: "Target 70 kg." },
    });
    expect(container.querySelector(".dh-linechart__baseline")).toBeNull();
  });

  it("still refuses to draw a line through a single reading", () => {
    const { container } = renderTrend({ points: [WEIGHT[0]!] });
    expect(container.querySelector(".dh-linechart")).toBeNull();
  });

  it("carries the summary as the chart's accessible name and as visible text", () => {
    renderTrend({ summary: "Four measurements, down 5.7 kg." });
    expect(
      screen.getByRole("img", { name: /Four measurements, down 5.7 kg./ }),
    ).toBeInTheDocument();
    // The same sentence, readable without the chart.
    expect(
      screen.getByText(/Four measurements, down 5.7 kg./),
    ).toBeInTheDocument();
  });
});

describe("TrendLine — the point readout", () => {
  it("is one focusable group for the whole series, not one stop per reading", () => {
    const { container } = renderTrend({
      describePoint: (point) => `${point.value} kg on ${point.date}`,
    });
    // Fifty weigh-ins must not put fifty tab stops before the next control.
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(1);
    expect(screen.getByRole("group")).toBeInTheDocument();
  });

  it("names the latest reading before anything is selected", () => {
    renderTrend({
      describePoint: (point) => `${point.value} kg on ${point.date}`,
    });
    // Information rather than an instruction, and the same reading the record's
    // headline leads with, so the two agree.
    expect(screen.getByText("79.3 kg on 2026-08-08")).toBeInTheDocument();
  });

  it("is not interactive at all when the caller cannot describe a point", () => {
    const { container } = renderTrend();
    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(container.querySelectorAll(".dh-linechart__hit")).toHaveLength(0);
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
    // Unlike `TrendLine`, which is `role="img"` with a required summary: a card
    // states its reading, target and percentage as text, and a fourth reading
    // of the same facts would be noise in a screen reader.
    expect(container.querySelector(".dh-spark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
