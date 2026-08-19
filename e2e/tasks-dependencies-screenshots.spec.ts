/**
 * TASKS-12 — the evidence capture.
 *
 * Opt-in, like every other `*-screenshots.spec.ts` pass: an ordinary run never
 * collects this file (see `playwright.config.ts` → `testIgnore`). It asserts
 * nothing beyond "the surface rendered"; every behavioural claim TASKS-12 makes
 * is proven in `tasks-dependencies.spec.ts`.
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/tasks-dependencies-screenshots.spec.ts
 *
 * It also MEASURES, into `measurements.json`, because "looks calm" is not
 * evidence. What it measures is exactly the set of numbers TASKS-12's decisions
 * rest on:
 *
 *   - the document's `scrollWidth` against its `clientWidth` — the overflow proof
 *     at every width, including 320;
 *   - the height of a Task row that is BLOCKED against one that is not, which is
 *     the whole claim behind putting the blocked line on the title's own row;
 *   - whether the blocked line is DRAWN (not merely present) at each width —
 *     unlike the checklist figure, it must be, including on a phone;
 *   - every touch target in the dependency section, and the smallest of them;
 *   - the width the blocker title actually gets, and each dependency row's
 *     height, so "it wraps rather than truncating" is a number;
 *   - the recurrence editor's own dimensions, open on its longest form.
 *
 * Curated output lives in `docs/design/assets/v2-3-tasks-12/`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, type Page } from "@playwright/test";

import { gotoFixture, ownerToday } from "./helpers";
import {
  cleanupAllDependencyTasks,
  seedDependency,
  seedDependencyTask,
} from "./dependency-fixtures";

const OUTPUT = join(process.cwd(), "test-results", "v2-3-tasks-12");

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

const measurements: Record<string, unknown> = {};

const BLOCKED = "e2e-dep-shot-blocked";
const BLOCKER_ONE = "e2e-dep-shot-blocker-1";
const BLOCKER_TWO = "e2e-dep-shot-blocker-2";
const HELD = "e2e-dep-shot-held";
const PLAIN = "e2e-dep-shot-plain";
const REPEATING = "e2e-dep-shot-repeat";

const TASKS_URL = "/tasks?view=list&group=none&sort=created&dir=desc";

function recordUrl(taskId: string): string {
  return `${TASKS_URL}&drawer=task%3A${taskId}`;
}

test.beforeAll(() => {
  // A blocker that is DONE and one that is not, so the section shows both
  // states; a Task the blocked one holds up, so "Blocks" is populated; and a
  // plain Task beside it, which is the row the height comparison needs.
  seedDependencyTask({
    id: BLOCKER_ONE,
    title: "Prepare the draft",
    completed: true,
  });
  seedDependencyTask({
    id: BLOCKER_TWO,
    title: "Get director approval",
    scheduledDate: ownerToday(),
  });
  seedDependencyTask({
    id: BLOCKED,
    title: "Publish the quarterly report",
    scheduledDate: ownerToday(),
  });
  seedDependencyTask({ id: HELD, title: "Send the report to the board" });
  seedDependencyTask({
    id: PLAIN,
    title: "Book the venue for the AGM",
    scheduledDate: ownerToday(),
  });
  seedDependencyTask({
    id: REPEATING,
    title: "Board pack review",
    scheduledDate: "2026-08-28",
    repeat: {
      frequency: "month",
      seriesId: "e2e-dep-shot-series",
      weekdays: [5],
      ordinal: "last",
      anchorDay: 28,
      weekendRule: "before",
      endsAfterCount: 12,
    },
  });
  seedDependency(BLOCKED, BLOCKER_ONE);
  seedDependency(BLOCKED, BLOCKER_TWO);
  seedDependency(HELD, BLOCKED);
  mkdirSync(OUTPUT, { recursive: true });
});

test.afterAll(() => {
  cleanupAllDependencyTasks();
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
      };
    };
    const sizes = (selector: string) =>
      [...document.querySelectorAll<HTMLElement>(selector)]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((size) => size.width > 0 && size.height > 0);

    const dependencyRows = sizes(".dh-task-dependencies__row").map(
      (size) => size.height,
    );
    const titles = sizes(".dh-task-dependencies__title").map(
      (size) => size.width,
    );
    const targets = [
      ...sizes(".dh-task-dependencies__row .dh-btn"),
      ...sizes(".dh-task-dependencies__add .dh-btn"),
      ...sizes(".dh-task-dependencies__actions .dh-btn"),
    ];
    const taskRows = [
      ...document.querySelectorAll<HTMLElement>(".dh-taskrow"),
    ].map((node) => {
      const blocked = node.querySelector<HTMLElement>(
        '[data-testid="task-row-blocked"]',
      );
      return {
        title:
          node
            .querySelector(".dh-taskrow__title")
            ?.textContent?.trim()
            .slice(0, 48) ?? "",
        height: Math.round(node.getBoundingClientRect().height),
        blocked: blocked?.textContent?.trim() ?? null,
        /*
         * DRAWN, not merely present. `textContent` reads through
         * `display: none`, and the claim TASKS-12 makes — unlike TASKS-13's
         * checklist figure — is that this line IS drawn at every width,
         * including the phone.
         */
        blockedDrawn: blocked !== null && blocked.getClientRects().length > 0,
        statePill:
          node
            .querySelector('[data-testid="task-row-state"]')
            ?.textContent?.trim() ?? null,
      };
    });

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        horizontalOverflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      },
      dependencySection: box(".dh-task-dependencies"),
      recurrenceEditor: box(".dh-recurrence-editor"),
      recurrenceCustom: box(".dh-recurrence-editor__custom"),
      blockedState: (
        document.querySelector('[data-testid="task-blocked-state"]')
          ?.textContent ?? ""
      ).trim(),
      recurrenceSummary: (
        document.querySelector('[data-testid="task-recurrence-summary"]')
          ?.textContent ?? ""
      ).trim(),
      dependencyRowHeights: dependencyRows,
      tallestDependencyRow:
        dependencyRows.length === 0 ? null : Math.max(...dependencyRows),
      blockerTitleWidths: titles,
      narrowestBlockerTitle: titles.length === 0 ? null : Math.min(...titles),
      touchTargets: targets,
      smallestTouchTarget:
        targets.length === 0
          ? null
          : Math.min(...targets.map((t) => Math.min(t.width, t.height))),
      taskRows,
    };
  });
  flush();
}

async function withAppearance(page: Page, appearance: "light" | "dark") {
  await page.emulateMedia({
    colorScheme: appearance === "dark" ? "dark" : "light",
  });
}

/** Open the recurrence editor's CUSTOM form, which is its longest state. */
async function openCustomRepeat(page: Page): Promise<void> {
  const drawer = page.getByRole("dialog");
  const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
  await repeat.click();
  await repeat.fill("Custom");
  await drawer.getByRole("option", { name: /^Custom/ }).click();
  await page.waitForSelector(".dh-recurrence-editor__custom");
}

test("the recurrence editor", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await withAppearance(page, "light");
  await gotoFixture(page, recordUrl(REPEATING));
  await openCustomRepeat(page);
  await measure(page, "recurrence-1440-light");
  await shoot(page, "recurrence-1440-light");

  for (const [appearance, name] of [
    ["light", "recurrence-393-light"],
    ["dark", "recurrence-393-dark"],
  ] as const) {
    await page.setViewportSize({ width: 393, height: 852 });
    await withAppearance(page, appearance);
    await gotoFixture(page, recordUrl(REPEATING));
    await openCustomRepeat(page);
    await measure(page, name);
    await shoot(page, name);
  }
});

test("the Task record's dependencies", async ({ page }) => {
  for (const [width, height, name] of [
    [1440, 1000, "dependencies-1440"],
    [393, 852, "dependencies-393"],
    [320, 720, "dependencies-320"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await withAppearance(page, "light");
    await gotoFixture(page, recordUrl(BLOCKED));
    await page.waitForSelector('[data-testid="task-dependencies"]');
    await measure(page, `${name}-light`);
    await shoot(page, `${name}-light`);
  }

  await page.setViewportSize({ width: 393, height: 852 });
  await withAppearance(page, "dark");
  await gotoFixture(page, recordUrl(BLOCKED));
  await page.waitForSelector('[data-testid="task-dependencies"]');
  await measure(page, "dependencies-393-dark");
  await shoot(page, "dependencies-393-dark");
});

test("the Tasks collection's blocked state", async ({ page }) => {
  // The row decision's own evidence: a BLOCKED row beside an unblocked one, at
  // every width the product is held to.
  for (const [width, height, name] of [
    [1440, 900, "tasks-1440"],
    [1280, 800, "tasks-1280"],
    [820, 900, "tasks-820"],
    [393, 852, "tasks-393"],
    [320, 640, "tasks-320"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await withAppearance(page, "light");
    await gotoFixture(page, TASKS_URL);
    await page.waitForSelector(".dh-taskrow");
    await measure(page, name);
    await shoot(page, name);
  }
});

test("Today's blocked state", async ({ page }) => {
  for (const [width, height, name] of [
    [1440, 1000, "today-1440"],
    [393, 852, "today-393"],
    [320, 720, "today-320"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await withAppearance(page, "light");
    await gotoFixture(page, "/today");
    await measure(page, name);
    await shoot(page, name);
  }
});

test("Weekly Planning's blocked state", async ({ page }) => {
  for (const [width, height, name] of [
    [1440, 1000, "plan-1440"],
    [393, 852, "plan-393"],
    [320, 720, "plan-320"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await withAppearance(page, "light");
    await gotoFixture(page, "/plan");
    await measure(page, name);
    await shoot(page, name);
  }
});
