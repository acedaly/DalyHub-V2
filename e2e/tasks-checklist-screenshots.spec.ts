/**
 * TASKS-13 — the evidence capture.
 *
 * Opt-in, like every other `*-screenshots.spec.ts` pass: an ordinary run never
 * collects this file (see `playwright.config.ts` → `testIgnore`). It asserts
 * nothing beyond "the surface rendered"; every behavioural claim TASKS-13 makes
 * is proven in `tasks-checklist.spec.ts`.
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/tasks-checklist-screenshots.spec.ts
 *
 * It also MEASURES, into `measurements.json`, because "looks calm" is not
 * evidence. What it measures is exactly the set of numbers TASKS-13's decisions
 * rest on:
 *
 *   - the document's `scrollWidth` against its `clientWidth` — the overflow proof
 *     at every width, including 320;
 *   - every checklist row's HEIGHT, and the height of a row holding a
 *     seventy-six-character step, so "it wraps rather than truncating" is a
 *     number;
 *   - every touch target in the section, and the smallest of them;
 *   - the width the step title actually gets;
 *   - the Task record's own width;
 *   - and the one number the row decision rests on: the height of a Task row
 *     WITH checklist progress against one without.
 *
 * Curated output lives in `docs/design/assets/v2-3-tasks-13-checklists/`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { test, type Page } from "@playwright/test";

import { gotoFixture, ownerToday } from "./helpers";
import {
  cleanupAllChecklistTasks,
  seedChecklistTask,
} from "./checklist-fixtures";

const OUTPUT = join(process.cwd(), "test-results", "v2-3-tasks-13-checklists");

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

const measurements: Record<string, unknown> = {};

const SHORT = "e2e-cl-shot-short";
const LONG = "e2e-cl-shot-long";
const PLAIN = "e2e-cl-shot-plain";
const TODAY_TASK = "e2e-cl-shot-today";

const TASKS_URL = "/tasks?view=list&group=none&sort=created&dir=desc";

function recordUrl(taskId: string): string {
  return `${TASKS_URL}&drawer=task%3A${taskId}`;
}

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
  seedChecklistTask({
    id: SHORT,
    title: "Prepare camper for trip",
    items: [
      { title: "Check tyre pressures", completed: true },
      { title: "Fill water tanks", completed: true },
      { title: "Charge batteries" },
      { title: "Pack the fridge" },
    ],
  });
  seedChecklistTask({
    id: LONG,
    title: "Prepare camper for the long trip",
    items: [
      {
        title:
          "Confirm that the camper registration and roadside assistance are both current",
        completed: true,
      },
      { title: "Check tyre pressures on all six wheels, including the spare" },
      { title: "Fill water tanks" },
      { title: "Charge batteries" },
      { title: "Pack the fridge" },
      { title: "Empty the toilet cassette" },
      { title: "Test the gas bottle regulator" },
      { title: "Check the awning for tears" },
    ],
  });
  seedChecklistTask({ id: PLAIN, title: "A task with no steps at all" });
  seedChecklistTask({
    id: TODAY_TASK,
    title: "Prepare camper before the weekend",
    scheduledDate: ownerToday(),
    items: [
      { title: "Check tyre pressures", completed: true },
      { title: "Fill water tanks" },
    ],
  });
});

test.afterAll(() => {
  cleanupAllChecklistTasks();
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

    const rows = sizes(".dh-checklist__item").map((size) => size.height);
    const labels = sizes(".dh-checklist__label").map((size) => size.width);
    const targets = [
      ...sizes(".dh-checklist__check"),
      ...sizes(".dh-checklist__overflow"),
      ...sizes(".dh-checklist__input"),
      ...sizes('[data-testid="checklist-add"]'),
    ];
    const taskRows = [
      ...document.querySelectorAll<HTMLElement>(".dh-taskrow"),
    ].map((node) => {
      const figure = node.querySelector<HTMLElement>(
        '[data-testid="task-row-checklist"]',
      );
      return {
        title:
          node
            .querySelector(".dh-taskrow__title")
            ?.textContent?.trim()
            .slice(0, 48) ?? "",
        height: Math.round(node.getBoundingClientRect().height),
        checklist: figure?.textContent?.trim() ?? null,
        /*
         * DRAWN, not merely present. `textContent` reads through `display:
         * none`, so the count alone would suggest the figure is on a phone row
         * when the rule below `md` says it is not — and that is exactly the
         * claim this file exists to evidence.
         */
        checklistDrawn: figure !== null && figure.getClientRects().length > 0,
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
      record: box(".dh-task-record"),
      checklistSection: box(".dh-checklist"),
      progress: (
        document.querySelector('[data-testid="checklist-progress"]')
          ?.textContent ?? ""
      ).trim(),
      rowHeights: rows,
      tallestRow: rows.length === 0 ? null : Math.max(...rows),
      shortestRow: rows.length === 0 ? null : Math.min(...rows),
      titleWidths: labels,
      narrowestTitle: labels.length === 0 ? null : Math.min(...labels),
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

test("the Task record's checklist", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, recordUrl(SHORT));
  await page.waitForSelector('[data-testid="task-checklist"]');
  await measure(page, "record-1440-light");
  await shoot(page, "record-1440-light");

  await withAppearance(page, "dark");
  await gotoFixture(page, recordUrl(SHORT));
  await page.waitForSelector('[data-testid="task-checklist"]');
  await measure(page, "record-1440-dark");
  await shoot(page, "record-1440-dark");
});

test("the Task record's checklist on a phone", async ({ page }) => {
  for (const [width, name] of [
    [393, "record-393"],
    [320, "record-320"],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await withAppearance(page, "light");
    await gotoFixture(page, recordUrl(SHORT));
    await page.waitForSelector('[data-testid="task-checklist"]');
    await measure(page, `${name}-light`);
    await shoot(page, `${name}-light`);
  }

  await page.setViewportSize({ width: 393, height: 844 });
  await withAppearance(page, "dark");
  await gotoFixture(page, recordUrl(SHORT));
  await page.waitForSelector('[data-testid="task-checklist"]');
  await measure(page, "record-393-dark");
  await shoot(page, "record-393-dark");
});

test("editing a checklist", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, recordUrl(SHORT));
  await page.getByTestId("checklist-add").click();
  await page
    .getByTestId("checklist-composer")
    .fill("Empty the toilet cassette");
  await measure(page, "composer-1440");
  await shoot(page, "composer-1440");

  await page.setViewportSize({ width: 393, height: 844 });
  await gotoFixture(page, recordUrl(SHORT));
  await page.getByTestId("checklist-add").click();
  await page
    .getByTestId("checklist-composer")
    .fill("Empty the toilet cassette");
  await measure(page, "composer-393");
  await shoot(page, "composer-393");
});

test("a long checklist, and a long step", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await withAppearance(page, "light");
  await gotoFixture(page, recordUrl(LONG));
  await page.waitForSelector('[data-testid="task-checklist"]');
  await measure(page, "long-1440");
  await shoot(page, "long-1440");

  await page.setViewportSize({ width: 320, height: 900 });
  await gotoFixture(page, recordUrl(LONG));
  await page.waitForSelector('[data-testid="task-checklist"]');
  await measure(page, "long-320");
  await shoot(page, "long-320");
});

test("the Tasks collection's progress figure", async ({ page }) => {
  // The row decision's own evidence: a row WITH progress beside one without, at
  // every width the product is held to.
  for (const [width, height, name] of [
    [1440, 900, "tasks-1440"],
    [1280, 800, "tasks-1280"],
    [393, 844, "tasks-393"],
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

test("Today's progress figure", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await withAppearance(page, "light");
  await gotoFixture(page, "/today");
  await measure(page, "today-1440");
  await shoot(page, "today-1440");

  await page.setViewportSize({ width: 393, height: 844 });
  await gotoFixture(page, "/today");
  await measure(page, "today-393");
  await shoot(page, "today-393");
});
