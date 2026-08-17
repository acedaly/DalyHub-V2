/**
 * PLAN-01 + SMART-01 — the evidence capture.
 *
 * Opt-in, like every other `*-screenshots.spec.ts` pass: an ordinary run never
 * collects this file (see `playwright.config.ts` → `testIgnore`). It asserts
 * nothing beyond "the surface rendered"; every behavioural claim this programme
 * makes is proven in `plan-weekly-planning.spec.ts`,
 * `plan-smart-lists.spec.ts` and `plan-responsive.spec.ts`.
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/plan-smart-01-screenshots.spec.ts
 *
 * It also MEASURES, into `measurements.json`, because "looks polished" is not
 * evidence: page and document widths (the overflow proof), the agenda's usable
 * task-title width, the queue rail's width, the first actionable item's Y, and
 * every day-control's touch target.
 *
 * Curated output lives in `docs/design/assets/v2-3-plan-smart-01/`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";
import { clearPlanFixture, planFixture, seedPlanFixture } from "./plan-fixtures";

const OUTPUT = join(process.cwd(), "test-results", "v2-3-plan-smart-01");

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

const fixture = planFixture();
const measurements: Record<string, unknown> = {};

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
  seedPlanFixture(fixture);
});

test.afterAll(() => {
  clearPlanFixture(fixture);
});

/**
 * The measurement file is written after EVERY measurement, not once at the end.
 *
 * Playwright may retire and replace the worker that owns this module between
 * tests, which loses an in-memory accumulator — and a capture pass whose evidence
 * silently comes out empty is worse than one that fails.
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

/** Everything the design record quotes, measured rather than asserted by eye. */
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
    // Only the controls that are actually RENDERED: the phone day rail does not
    // exist above the phone tier, and a `display: none` element measures 0×0 —
    // which would report a touch-target failure for a control that is not there.
    const targets = [...document.querySelectorAll<HTMLElement>(
      '[data-testid="plan-place-day"], [data-testid="plan-rail-day"]',
    )]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((box) => box.width > 0 && box.height > 0);
    const firstTitle = document.querySelector(
      '[data-testid="plan-day"][data-selected="true"] .dh-taskrow__title',
    ) ?? document.querySelector('.dh-plan__week .dh-taskrow__title');
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      },
      page: box(".dh-plan"),
      agenda: box(".dh-plan__week"),
      queueRail: box(".dh-plan__side"),
      // The day the surface is SHOWING: every day above the phone tier, the
      // selected one below it.
      firstDaySection: box('[data-testid="plan-day"][data-selected="true"]'),
      taskTitleWidth:
        firstTitle === null
          ? null
          : Math.round(firstTitle.getBoundingClientRect().width),
      firstActionableY:
        box('[data-testid="plan-day"][data-selected="true"] .dh-taskrow')?.top ??
        box('[data-testid="plan-day"] .dh-taskrow')?.top ??
        null,
      dayControlTargets: targets,
      smallestDayControl:
        targets.length === 0
          ? null
          : Math.min(...targets.map((t) => Math.min(t.width, t.height))),
    };
  });
  flush();
}

/** Force an appearance, through the same preference the product uses. */
async function withAppearance(page: Page, appearance: "light" | "dark") {
  await page.emulateMedia({
    colorScheme: appearance === "dark" ? "dark" : "light",
  });
}

test("weekly planning — desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/plan");
  await measure(page, "plan-1440-light");
  await shoot(page, "plan-1440-light");
  await shoot(page, "plan-1440-light-full", true);

  await withAppearance(page, "dark");
  await gotoFixture(page, "/plan");
  await measure(page, "plan-1440-dark");
  await shoot(page, "plan-1440-dark");

  await withAppearance(page, "light");
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoFixture(page, "/plan");
  await measure(page, "plan-1280");
  await shoot(page, "plan-1280");

  await page.setViewportSize({ width: 820, height: 1000 });
  await gotoFixture(page, "/plan");
  await measure(page, "plan-820");
  await shoot(page, "plan-820");
});

test("weekly planning — next week and the Review focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/plan?week=next");
  await measure(page, "plan-next-week-1440");
  await shoot(page, "plan-next-week-1440");
});

test("weekly planning — phone", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/plan");
  await measure(page, "plan-393-light");
  await shoot(page, "plan-393-light");
  await shoot(page, "plan-393-light-full", true);

  await withAppearance(page, "dark");
  await gotoFixture(page, "/plan");
  await measure(page, "plan-393-dark");
  await shoot(page, "plan-393-dark");

  await withAppearance(page, "light");
  await page.setViewportSize({ width: 430, height: 932 });
  await gotoFixture(page, "/plan");
  await measure(page, "plan-430");
  await shoot(page, "plan-430");

  await page.setViewportSize({ width: 375, height: 812 });
  await gotoFixture(page, "/plan");
  await measure(page, "plan-375");
  await shoot(page, "plan-375");

  await page.setViewportSize({ width: 320, height: 720 });
  await gotoFixture(page, "/plan");
  await measure(page, "plan-320");
  await shoot(page, "plan-320");
});

test("weekly planning — 200% zoom reflow", async ({ page }) => {
  // WCAG 2.2 reflow: 1280 at 200% is a 640px CSS viewport.
  await page.setViewportSize({ width: 640, height: 512 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/plan");
  await measure(page, "plan-zoom-200");
  await shoot(page, "plan-zoom-200", true);
});

test("saved smart lists — Tasks and the planning queue source", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");

  // The Tasks collection with the multi-value priority filter applied — the
  // capability SMART-01 added to the shared control model.
  await gotoFixture(page, "/tasks?priority=p1,p2");
  await measure(page, "tasks-priority-set-1440");
  await shoot(page, "tasks-priority-set-1440");

  // The saved-view switcher, open, with its management menu.
  await gotoFixture(page, "/tasks");
  await page.getByTestId("tasks-view-trigger").click();
  await shoot(page, "tasks-saved-views-panel-1440");

  // The planning queue's source picker, which is where a saved view becomes a
  // planning scope.
  await gotoFixture(page, "/plan");
  await shoot(page, "plan-queue-source-1440");

  // On a phone, the same two surfaces.
  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/tasks");
  await shoot(page, "tasks-saved-views-393");
  await gotoFixture(page, "/plan");
  await shoot(page, "plan-queue-source-393");
});

test("the Review handoff", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/reviews");
  await shoot(page, "reviews-collection-1440");
});
