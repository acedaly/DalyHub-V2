import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture } from "./helpers";

/**
 * MOBILE-01 — the phone screenshot pass.
 *
 * Captures the surfaces the mobile work changed, into the existing product-audit
 * asset convention (`docs/product/assets/<pass>/`), so a reviewer can see the
 * result without running the app. Every shot is taken against the SAME seeded
 * development database the journeys run on, so nothing here is a mock.
 *
 * Three passes, matching what actually needs looking at:
 *   - **390px portrait** — the reference phone, for every surface;
 *   - **320px portrait** — the narrowest supported viewport, for the surfaces
 *     most at risk of crowding (the shell, capture, Today, Tasks, the filter
 *     sheet and a full-screen record);
 *   - **844×390 landscape** — one pass, because a short viewport with sticky top
 *     and bottom chrome is a genuinely different constraint.
 *
 * This spec is **opt-in**: it is skipped unless `CAPTURE_SCREENSHOTS=1`, so the
 * ordinary `pnpm test:e2e` gate neither slows down nor writes into the repository.
 * Run it with:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/mobile-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "product",
  "assets",
  "mobile-01-2026-07",
);

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 568 };
const LANDSCAPE = { width: 844, height: 390 };

const bottomNav = "[data-testid='bottom-nav']";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** Save a full-page shot under the pass's asset directory. */
async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
}

/** Open the shared capture sheet on a type from the phone bottom bar. */
async function openCapture(page: Page, type: string) {
  await page
    .locator(bottomNav)
    .getByRole("button", { name: "Capture" })
    .click();
  const sheet = page.getByTestId("capture-sheet");
  await sheet.waitFor();
  const change = sheet.getByTestId("capture-change-type");
  if (await change.isVisible()) {
    await change.click();
  }
  if (type) {
    await sheet.getByTestId(`capture-choose-${type}`).click();
  }
  return sheet;
}

test.describe("MOBILE-01 screenshots — 390px", () => {
  test("captures the phone surfaces at the reference width", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "mobile-shell-390");
    await shoot(page, "today-390");

    // Quick Capture — the chooser, then a typed panel.
    await openCapture(page, "");
    await shoot(page, "quick-capture-390");
    await page.getByTestId("capture-choose-task").click();
    await shoot(page, "quick-capture-task-390");
    await page.keyboard.press("Escape");

    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-390");
    await page.getByTestId("collection-filter-trigger").click();
    await page.getByTestId("collection-sheet").waitFor();
    await shoot(page, "task-filter-sheet-390");
    await page.keyboard.press("Escape");

    // A full-screen phone record.
    await gotoFixture(page, "/tasks?view=list&system=active");
    await page.locator(".dh-card__open").first().click();
    await page.getByRole("dialog", { name: "Task" }).waitFor();
    await shoot(page, "task-record-390");
    await page.keyboard.press("Escape");

    await gotoFixture(page, "/diary");
    await shoot(page, "diary-timeline-390");
    await page
      .locator(".dh-pane-header")
      .getByRole("button", { name: "New diary entry" })
      .click();
    await page.getByRole("textbox", { name: /Title/ }).waitFor();
    await shoot(page, "diary-capture-390");

    await gotoFixture(page, "/meetings");
    await shoot(page, "meetings-collection-390");

    await gotoFixture(page, "/notes");
    await shoot(page, "notes-collection-390");

    await gotoFixture(page, "/people");
    await shoot(page, "people-390");
    await page.locator(".dh-card__open").first().click();
    await page.waitForLoadState("networkidle");
    await shoot(page, "person-record-390");

    await gotoFixture(page, "/projects");
    // Gate D moved the Projects collection onto the entity card, so this opens
    // through the card's accessible name rather than a styling class.
    await page
      .getByRole("link", { name: /^Open / })
      .first()
      .click();
    await page.waitForLoadState("networkidle");
    await shoot(page, "project-record-390");

    await gotoFixture(page, "/reviews");
    await shoot(page, "review-flow-390");

    await gotoFixture(page, "/settings");
    await shoot(page, "settings-390");

    // The complete registry navigation sheet.
    await gotoFixture(page, "/today");
    await page.locator(bottomNav).getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "Navigation" }).waitFor();
    await shoot(page, "navigation-sheet-390");
  });

  test("captures the dark-mode shell", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/today");
    await shoot(page, "mobile-shell-390-dark");
    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-390-dark");
  });
});

test.describe("MOBILE-01 screenshots — 320px", () => {
  test.use({ viewport: NARROW });

  test("captures the narrowest supported viewport", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "mobile-shell-320");
    await shoot(page, "today-320");

    await openCapture(page, "task");
    await shoot(page, "quick-capture-320");
    await page.keyboard.press("Escape");

    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-320");
    await page.getByTestId("collection-filter-trigger").click();
    await page.getByTestId("collection-sheet").waitFor();
    await shoot(page, "task-filter-sheet-320");
    await page.keyboard.press("Escape");

    await gotoFixture(page, "/tasks?view=list&system=active");
    await page.locator(".dh-card__open").first().click();
    await page.getByRole("dialog", { name: "Task" }).waitFor();
    await shoot(page, "task-record-320");
  });
});

test.describe("MOBILE-01 screenshots — phone landscape", () => {
  test.use({ viewport: LANDSCAPE });

  test("captures the short-viewport pass", async ({ page }) => {
    await gotoFixture(page, "/today");
    await shoot(page, "today-landscape");

    await gotoFixture(page, "/tasks");
    await shoot(page, "tasks-landscape");

    await openCapture(page, "task");
    await shoot(page, "quick-capture-landscape");
  });
});
