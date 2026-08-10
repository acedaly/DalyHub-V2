/**
 * UIX-02 — the Projects & Areas redesign screenshot matrix.
 *
 * Same shape as `uix-01-screenshots.spec.ts`, and for the same reason: the brief
 * is comparative, so one spec captures one matrix and writes it under a
 * `before-` prefix or none, chosen by an environment variable. Both halves run
 * the same routes, the same viewports and the same seeded workspace, so nothing
 * between a `before-` and its pair differs except the product.
 *
 *     node e2e/today-fixtures.mjs gallery
 *     CAPTURE_SCREENSHOTS=1 SHOT_PREFIX=before- pnpm exec playwright test \
 *       --config scratch.playwright.config.ts e2e/uix-02-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test \
 *       --config scratch.playwright.config.ts e2e/uix-02-screenshots.spec.ts
 *
 * The `gallery` scenario (not `typical`) is the dataset: it seeds six Areas
 * across the whole identity ramp and eight Projects covering every status,
 * health state and progress shape the two surfaces render, which is what makes
 * "is this gallery any good?" a question the screenshots can actually answer.
 *
 * The phone contexts declare `isMobile`/`hasTouch` because a desktop Chromium
 * narrowed to 390px still answers `(hover: hover)` — without it this
 * photographs the mouse layout at phone width and files it under the phone.
 *
 * Detail pages are reached through the first card's OWN href rather than through
 * a hardcoded fixture id, so the matrix keeps working when the seed changes and
 * a wrong destination still fails the capture.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "uix-02-2026-08",
);

/** `before-` for the baseline half of the comparison, empty for the result. */
const PREFIX = process.env.SHOT_PREFIX ?? "";

const LAPTOP = { width: 1280, height: 1000 };
const WIDE = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${PREFIX}${name}.png`) });
}

/** Open the first record in a collection through its own card/row link. */
async function openFirstRecord(page: Page, testId: string) {
  const first = page.getByTestId(testId).first();
  await expect(first).toBeVisible();
  /*
   * Read the destination off the card, then navigate to it.
   *
   * Clicking works — and the journey specs assert that it does, which is where
   * that belongs. Here it made the capture a race: a client-side navigation is
   * still in flight when `networkidle` resolves against the document being left,
   * and a screenshot taken in that window photographs the collection and files
   * it under the record. Taking the href from the card keeps the destination
   * under test (a wrong href fails this) while making the capture deterministic.
   */
  const href = await first.getByRole("link").first().getAttribute("href");
  expect(href).toBeTruthy();
  await gotoFixture(page, href!);
  await page.waitForTimeout(300);
}

/* -------------------------------------------------------------------------- */
/* Desktop — light                                                            */
/* -------------------------------------------------------------------------- */

test.describe("desktop light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  test("projects index 1280", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await shoot(page, "projects-1280-light");
  });

  test("project detail 1280", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await openFirstRecord(page, "project-card");
    await shoot(page, "project-detail-1280-light");
  });

  test("areas index 1280", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await shoot(page, "areas-1280-light");
  });

  test("area detail 1280", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await openFirstRecord(page, "area-card");
    await shoot(page, "area-detail-1280-light");
  });
});

test.describe("desktop wide light", () => {
  test.use({ viewport: WIDE, colorScheme: "light" });

  test("projects index 1440", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await shoot(page, "projects-1440-light");
  });

  test("areas index 1440", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await shoot(page, "areas-1440-light");
  });
});

/* -------------------------------------------------------------------------- */
/* Desktop — dark                                                             */
/* -------------------------------------------------------------------------- */

test.describe("desktop dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  test("projects index 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await shoot(page, "projects-1280-dark");
  });

  test("project detail 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await openFirstRecord(page, "project-card");
    await shoot(page, "project-detail-1280-dark");
  });

  test("areas index 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await shoot(page, "areas-1280-dark");
  });

  test("area detail 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await openFirstRecord(page, "area-card");
    await shoot(page, "area-detail-1280-dark");
  });
});

/* -------------------------------------------------------------------------- */
/* Phone — light                                                              */
/* -------------------------------------------------------------------------- */

test.describe("phone light", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });

  test("projects index 390", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await shoot(page, "projects-390-light");
  });

  test("project detail 390", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await openFirstRecord(page, "project-card");
    await shoot(page, "project-detail-390-light");
  });

  test("areas index 390", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await shoot(page, "areas-390-light");
  });

  test("area detail 390", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await openFirstRecord(page, "area-card");
    await shoot(page, "area-detail-390-light");
  });
});

/* -------------------------------------------------------------------------- */
/* Phone — dark                                                               */
/* -------------------------------------------------------------------------- */

test.describe("phone dark", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });

  test("projects index 390 dark", async ({ page }) => {
    await gotoFixture(page, "/projects");
    await shoot(page, "projects-390-dark");
  });

  test("areas index 390 dark", async ({ page }) => {
    await gotoFixture(page, "/areas");
    await shoot(page, "areas-390-dark");
  });
});
