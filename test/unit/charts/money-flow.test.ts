/**
 * UNTITLED-16 — the money chart's two arithmetic contracts.
 *
 * Both are asserted as NUMBERS rather than against a rendered Recharts SVG, for
 * the reason `goal-charts.test.ts` gives for `niceDomain`: a chart's scale
 * correctness is decidable from the numbers, and asserting it against a rendered
 * plot in happy-dom tests the DOM implementation's layout engine instead of the
 * rule.
 *
 *   1. `moneyAxis` — a value axis that ends on a round figure money is actually
 *      counted in, so a peak of $4,120 reads 0 · $1k · $2k · $3k · $4k · $5k and
 *      never 0 · $1,030 · $2,060.
 *   2. `moneyTick` — an axis label drops the cents and goes compact once the
 *      figures are long, in the CURRENCY'S own minor-unit count. A stated figure
 *      does neither, which is why they are separate functions.
 */

import { describe, expect, it } from "vitest";

import { moneyAxis } from "~/shared/charts";
import { money, moneyTick } from "~/shared/finance";

describe("moneyAxis", () => {
  it("ends on a round step above the peak", () => {
    // $4,120.00 → a $1,000 step and a $5,000 top.
    const { top, ticks } = moneyAxis(412_000);
    expect(top).toBe(500_000);
    expect(ticks).toEqual([0, 100_000, 200_000, 300_000, 400_000, 500_000]);
  });

  it("offers at most five intervals, whatever the magnitude", () => {
    for (const peak of [137, 1_499, 25_000, 312_000, 9_900_000, 41_000_000]) {
      const { ticks } = moneyAxis(peak);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });

  it("does not waste the plot's height on an over-tall axis", () => {
    /*
     * The defect a nearest-rounded step produces: a peak of $4,120 under a
     * $2,000 step gives a $6,000 top, so the tallest bar is drawn at 69% of the
     * plot and every bar beneath it is proportionally squashed. The top is
     * never more than one full step above the peak.
     */
    for (const peak of [412_000, 137, 1_499, 25_000, 9_900_000]) {
      const { top, ticks } = moneyAxis(peak);
      const step = ticks[1]! - ticks[0]!;
      expect(top - peak).toBeLessThan(step);
    }
  });

  it("always starts at zero, because a bar's baseline means no money moved", () => {
    expect(moneyAxis(999_999).ticks[0]).toBe(0);
  });

  it("never puts the peak above the top of the axis", () => {
    for (const peak of [1, 99, 100, 101, 12_345, 999_999, 1_000_000]) {
      expect(moneyAxis(peak).top).toBeGreaterThanOrEqual(peak);
    }
  });

  it("steps only in the 1 / 2 / 2.5 / 5 family money is counted in", () => {
    for (const peak of [137, 1_499, 25_000, 312_000, 9_900_000]) {
      const { ticks } = moneyAxis(peak);
      const step = ticks[1]! - ticks[0]!;
      const magnitude = 10 ** Math.floor(Math.log10(step));
      expect([1, 2, 2.5, 5, 10]).toContain(step / magnitude);
    }
  });

  it("degrades to a usable axis rather than throwing on nothing", () => {
    // A window where every month was zero. The chart is still drawn — a run of
    // empty months is a real answer — so the axis has to be drawable.
    expect(moneyAxis(0)).toEqual({ top: 1, ticks: [0, 1] });
    expect(moneyAxis(-5).ticks[0]).toBe(0);
    expect(moneyAxis(Number.NaN).top).toBe(1);
  });
});

describe("moneyTick", () => {
  it("drops the cents a stated figure keeps", () => {
    expect(money(412_000, "AUD")).toBe("$4,120.00");
    expect(moneyTick(412_000, "AUD")).toBe("$4,120");
  });

  it("goes compact once a plain figure would crowd the plot", () => {
    // Five digits and up; four and under stay whole, because "$4,120" fits.
    expect(moneyTick(412_000, "AUD")).toBe("$4,120");
    expect(moneyTick(4_120_000, "AUD")).toBe("$41.2K");
  });

  it("divides by the CURRENCY'S minor units, not by a hundred", () => {
    /*
     * JPY has no minor unit. Dividing its stored minor units by a hundred would
     * print a figure a hundred times too small on the axis of a chart whose
     * tooltip printed the right one — the worst kind of wrong, because the two
     * disagree in the same frame.
     */
    expect(moneyTick(4_120, "JPY")).toContain("4,120");
    expect(moneyTick(4_120, "AUD")).toBe("$41");
  });

  it("falls back to the full figure for a currency Intl cannot format", () => {
    // Never a bare number: an amount without its currency is a number the owner
    // has to remember the units of.
    expect(moneyTick(1_000, "ZZZ")).toContain("ZZZ");
  });
});
