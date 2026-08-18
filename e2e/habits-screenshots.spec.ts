/**
 * HABITS-01 — the evidence capture.
 *
 * Opt-in, like every other `*-screenshots.spec.ts` pass: an ordinary run never
 * collects this file (see `playwright.config.ts` → `testIgnore`). It asserts
 * nothing beyond "the surface rendered"; every behavioural claim this item makes
 * is proven in `habits.spec.ts`.
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/habits-screenshots.spec.ts
 *
 * It also MEASURES, into `measurements.json`, because "looks calm" is not
 * evidence: page and document widths (the overflow proof), the habit row's
 * height, the title's usable width, every check control's touch target, the
 * history grid's width — and, on Today, the vertical position of the FIRST TASK
 * both with and without the routine band, which is the number TODAY-TASK-01
 * spent a whole pass protecting.
 *
 * Curated output lives in `docs/design/assets/v2-3-habits-01/`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";
import {
  clearHabitEvidence,
  seedHabitEvidence,
} from "./habits-evidence-fixtures";

const OUTPUT = join(process.cwd(), "test-results", "v2-3-habits-01");

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

const measurements: Record<string, unknown> = {};

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
  seedHabitEvidence();
});

test.afterAll(() => {
  clearHabitEvidence();
});

/**
 * The measurement file is written after EVERY measurement, not once at the end:
 * Playwright may retire the worker that owns this module between tests, and a
 * capture pass whose evidence silently comes out empty is worse than one that
 * fails.
 */
function flush(): void {
  writeFileSync(
    join(OUTPUT, "measurements.json"),
    `${JSON.stringify(measurements, null, 2)}\n`,
  );
}

async function shoot(page: Page, name: string, fullPage = false) {
  await page.screenshot({ path: join(OUTPUT, `${name}.png`), fullPage });
}

async function measure(page: Page, name: string) {
  measurements[name] = await page.evaluate(() => {
    const box = (selector: string) => {
      const node = document.querySelector(selector);
      if (node === null) return null;
      const rect = node.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        top: Math.round(rect.top + window.scrollY),
      };
    };
    const targets = [
      ...document.querySelectorAll<HTMLElement>(
        "label.dh-check-circle-target, .dh-toggle-group__option",
      ),
    ]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((target) => target.width > 0 && target.height > 0);
    const titles = [
      ...document.querySelectorAll<HTMLElement>(".dh-habit-row__title"),
    ].map((node) => Math.round(node.getBoundingClientRect().width));
    const rows = [
      ...document.querySelectorAll<HTMLElement>(".dh-habit-row"),
    ].map((node) => Math.round(node.getBoundingClientRect().height));
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      },
      habitList: box(".dh-habit-list"),
      habitsPanel: box(".dh-today__habits-panel"),
      historyGrid: box(".dh-habit-history__grid"),
      rowHeights: rows,
      titleWidths: titles,
      smallestTitleWidth: titles.length === 0 ? null : Math.min(...titles),
      touchTargets: targets,
      smallestTouchTarget:
        targets.length === 0
          ? null
          : Math.min(...targets.map((t) => Math.min(t.width, t.height))),
      // TODAY-TASK-01's protected number: where the day's FIRST TASK starts.
      firstTaskY: box('[data-testid="today-plan"] .dh-taskrow')?.top ?? null,
      todayPlanY: box('[data-testid="today-plan"]')?.top ?? null,
    };
  });
  flush();
}

async function withAppearance(page: Page, appearance: "light" | "dark") {
  await page.emulateMedia({
    colorScheme: appearance === "dark" ? "dark" : "light",
  });
}

test("the Habits collection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/habits");
  await measure(page, "habits-1440-light");
  await shoot(page, "habits-1440-light");

  await withAppearance(page, "dark");
  await gotoFixture(page, "/habits");
  await measure(page, "habits-1440-dark");
  await shoot(page, "habits-1440-dark");

  await withAppearance(page, "light");
  await page.setViewportSize({ width: 820, height: 1000 });
  await gotoFixture(page, "/habits");
  await measure(page, "habits-820");
  await shoot(page, "habits-820");

  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/habits");
  await measure(page, "habits-393-light");
  await shoot(page, "habits-393-light");

  await withAppearance(page, "dark");
  await gotoFixture(page, "/habits");
  await measure(page, "habits-393-dark");
  await shoot(page, "habits-393-dark");

  await withAppearance(page, "light");
  await page.setViewportSize({ width: 320, height: 720 });
  await gotoFixture(page, "/habits");
  await measure(page, "habits-320");
  await shoot(page, "habits-320");

  await page.setViewportSize({ width: 375, height: 812 });
  await gotoFixture(page, "/habits");
  await measure(page, "habits-375");

  await page.setViewportSize({ width: 430, height: 932 });
  await gotoFixture(page, "/habits");
  await measure(page, "habits-430");

  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoFixture(page, "/habits");
  await measure(page, "habits-1280");
});

test("the Habit record", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/habits/h-ev-strength");
  await measure(page, "habit-record-1440");
  await shoot(page, "habit-record-1440");
  await shoot(page, "habit-record-1440-full", true);

  await withAppearance(page, "dark");
  await gotoFixture(page, "/habits/h-ev-read");
  await measure(page, "habit-record-1440-dark");
  await shoot(page, "habit-record-1440-dark");

  await withAppearance(page, "light");
  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/habits/h-ev-strength");
  await measure(page, "habit-record-393");
  await shoot(page, "habit-record-393");
  await shoot(page, "habit-record-393-full", true);

  await page.setViewportSize({ width: 320, height: 720 });
  await gotoFixture(page, "/habits/h-ev-strength");
  await measure(page, "habit-record-320");
  await shoot(page, "habit-record-320");
});

test("Today, with and without the routine band", async ({ page }) => {
  /*
   * The comparison TODAY-TASK-01 asks for, made properly: the SAME viewport,
   * the same seeded day, measured with the habits present and then again with
   * them removed. The number that matters is `firstTaskY` — if it moves, the
   * band was put in the wrong place.
   */
  for (const [width, height, name] of [
    [1440, 1000, "today-1440"],
    [393, 852, "today-393"],
    [320, 720, "today-320"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await withAppearance(page, "light");
    await gotoFixture(page, "/today");
    await measure(page, `${name}-with-habits`);
    await shoot(page, `${name}-with-habits`);
    await shoot(page, `${name}-with-habits-full`, true);
  }

  clearHabitEvidence();
  for (const [width, height, name] of [
    [1440, 1000, "today-1440"],
    [393, 852, "today-393"],
    [320, 720, "today-320"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await gotoFixture(page, "/today");
    await measure(page, `${name}-without-habits`);
  }
  seedHabitEvidence();
});

test("creating and editing", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/habits/new");
  await measure(page, "habit-new-1440");
  await shoot(page, "habit-new-1440");

  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/habits/new");
  await measure(page, "habit-new-393");
  await shoot(page, "habit-new-393");
  await shoot(page, "habit-new-393-full", true);

  await page.setViewportSize({ width: 320, height: 720 });
  await gotoFixture(page, "/habits/new");
  await measure(page, "habit-new-320");
  await shoot(page, "habit-new-320");

  // The schedule editor, where the weekday toggles actually appear.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFixture(page, "/habits/h-ev-walk?tab=schedule");
  await measure(page, "habit-schedule-1440");
  await shoot(page, "habit-schedule-1440");

  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/habits/h-ev-walk?tab=schedule");
  await measure(page, "habit-schedule-393");
  await shoot(page, "habit-schedule-393");
});

test("the supporting sections and the planning band", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/goals/g-launch");
  await measure(page, "goal-supporting-1440");
  await shoot(page, "goal-supporting-1440-full", true);

  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/goals/g-launch");
  await measure(page, "goal-supporting-393");
  await shoot(page, "goal-supporting-393-full", true);

  await page.setViewportSize({ width: 1440, height: 1100 });
  await gotoFixture(page, "/plan");
  await measure(page, "plan-routines-1440");
  await shoot(page, "plan-routines-1440-full", true);

  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/plan");
  await measure(page, "plan-routines-393");
  await shoot(page, "plan-routines-393-full", true);

  await page.setViewportSize({ width: 1440, height: 1100 });
  await gotoFixture(page, "/areas/a-dh");
  await measure(page, "area-habits-1440");
  await shoot(page, "area-habits-1440-full", true);
});
