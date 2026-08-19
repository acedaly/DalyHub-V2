/**
 * PROJECT-02 — the evidence capture.
 *
 * Opt-in, like every other `*-screenshots.spec.ts` pass: an ordinary run never
 * collects this file (see `playwright.config.ts` → `testIgnore`). It asserts
 * nothing beyond "the surface rendered"; every behavioural claim PROJECT-02
 * makes is proven in `project-templates.spec.ts`.
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/project-templates-screenshots.spec.ts
 *
 * It also MEASURES, into `measurements.json`, because "looks calm" is not
 * evidence. What it measures is exactly the set of numbers PROJECT-02's
 * decisions rest on:
 *
 *   - the document's `scrollWidth` against its `clientWidth` at every width,
 *     including 320 — the overflow proof;
 *   - every template ROW's height and the width its name actually gets, which
 *     is the number behind "a list, not a gallery";
 *   - every interactive target on the row and on the record, and the smallest
 *     of them;
 *   - the create-from-template drawer's width and its two fields;
 *   - the template record's task rows and their step rows.
 *
 * Curated output lives in `docs/design/assets/v2-3-project-02/`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";
import {
  FIXTURE,
  removeTemplateFixtures,
  seedCanonicalProject,
} from "./project-template-fixtures";

const OUTPUT = join(process.cwd(), "test-results", "v2-3-project-02");

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

const measurements: Record<string, unknown> = {};

const TEMPLATES_URL = "/projects/templates";

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
  seedCanonicalProject();
});

test.afterAll(() => {
  removeTemplateFixtures();
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

    const targets = [
      ...sizes(".dh-template-row__name"),
      ...sizes(".dh-template-row__actions .dh-btn"),
      ...sizes(".dh-template-add .dh-btn"),
      ...sizes(".dh-template-task__head button"),
    ];

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        // The overflow proof, as a boolean derived from the two numbers above
        // rather than as a separate claim.
        overflows:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      },
      templateRows: sizes(".dh-template-row").map((size) => size.height),
      templateNameWidths: sizes(".dh-template-row__name").map((s) => s.width),
      templateTaskRows: sizes(".dh-template-task").map((size) => size.height),
      templateStepRows: sizes(".dh-template-task__step").map((s) => s.height),
      drawer: sizes('[role="dialog"]')[0] ?? null,
      smallestTarget:
        targets.length === 0
          ? null
          : Math.min(...targets.map((t) => Math.min(t.width, t.height))),
      targetCount: targets.length,
    };
  });
  flush();
}

/** Save the seeded Project as a template, exactly as an owner would. */
async function saveAsTemplate(page: Page): Promise<void> {
  await gotoFixture(page, `/projects/${FIXTURE.projectId}`);
  await page
    .getByRole("button", { name: /More actions/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  await expect(
    page.getByLabel("Notifications", { exact: true }).getByText(/^Saved /),
  ).toBeVisible({ timeout: 10_000 });
}

async function templateHref(page: Page): Promise<string> {
  await gotoFixture(page, TEMPLATES_URL);
  const href = await page
    .getByRole("link", { name: FIXTURE.projectTitle, exact: true })
    .first()
    .getAttribute("href");
  return href!;
}

test.describe("PROJECT-02 evidence", () => {
  test("captures every template surface at every required width", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await saveAsTemplate(page);
    const record = await templateHref(page);

    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      /* Templates — 1440 and 393 */
      for (const width of [1440, 393] as const) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 852,
        });
        await gotoFixture(page, TEMPLATES_URL);
        await shoot(page, `templates-${width}-${scheme}`, true);
        await measure(page, `templates-${width}-${scheme}`);
      }

      /* Template record — 1440 and 393 */
      for (const width of [1440, 393] as const) {
        await page.setViewportSize({
          width,
          height: width === 1440 ? 900 : 852,
        });
        await gotoFixture(page, record);
        await shoot(page, `template-record-${width}-${scheme}`, true);
        await measure(page, `template-record-${width}-${scheme}`);
      }
    }

    await page.emulateMedia({ colorScheme: "light" });

    /* Create from template — 1440 and 393 */
    for (const width of [1440, 393] as const) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 852 });
      await gotoFixture(page, TEMPLATES_URL);
      await page
        .getByRole("link", { name: /Create a project from/ })
        .first()
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      // The drawer slides in. A screenshot taken the instant it becomes
      // "visible" catches it mid-transition, which is evidence of an animation
      // rather than of a layout.
      await page.waitForTimeout(600);
      await shoot(page, `create-from-template-${width}`);
      await measure(page, `create-from-template-${width}`);
    }

    /* The instantiated Project — 1440 and 393 */
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, TEMPLATES_URL);
    await page
      .getByRole("link", { name: /Create a project from/ })
      .first()
      .click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByLabel("Project name").fill("September reporting");
    await drawer.getByRole("button", { name: "Create project" }).click();
    await expect(page).toHaveURL(
      /\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      { timeout: 15_000 },
    );
    const created = new URL(page.url()).pathname;
    for (const width of [1440, 393] as const) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 852 });
      await gotoFixture(page, created);
      await shoot(page, `instantiated-project-${width}`, true);
      await measure(page, `instantiated-project-${width}`);
    }

    /* 320 — the reflow proof, on every template surface. */
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, TEMPLATES_URL);
    await shoot(page, "templates-320", true);
    await measure(page, "templates-320");
    await gotoFixture(page, record);
    await shoot(page, "template-record-320", true);
    await measure(page, "template-record-320");

    /* The create flow, on the Projects collection, with a template offered. */
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/projects?drawer=new-project");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(600);
    await shoot(page, "new-project-with-template-1440");
    await measure(page, "new-project-with-template-1440");

    flush();
  });

  test("measures the touch targets a real phone actually gets", async ({
    browser,
  }) => {
    /*
     * A coarse POINTER, not merely a narrow window: the 44px floor is applied
     * by `@media (pointer: coarse)` on the density tokens, so the pass above —
     * which emulates a phone by WIDTH — correctly measures the 36px desktop
     * control height. Both numbers are recorded, because both are real.
     */
    const context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await gotoFixture(page, TEMPLATES_URL);
      await shoot(page, "templates-393-touch");
      await measure(page, "templates-393-touch");

      const record = await templateHref(page);
      await gotoFixture(page, record);
      await shoot(page, "template-record-393-touch");
      await measure(page, "template-record-393-touch");
    } finally {
      await context.close();
    }
    flush();
  });
});
