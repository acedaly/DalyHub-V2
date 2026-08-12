/**
 * MOBILE-01 (iPhone daily driver) — the review screenshots.
 *
 * Opt-in, like every other `*-screenshots.spec.ts` pass: an ordinary run never
 * collects this file at all (see `playwright.config.ts` → `testIgnore`). It
 * asserts nothing beyond "the surface rendered"; every behavioural claim this
 * pass makes is proven in `iphone-daily-driver.spec.ts`.
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/iphone-daily-driver-screenshots.spec.ts
 *
 * It photographs the surfaces the pass MATERIALLY CHANGED, and one that it
 * deliberately did not (Today), so the evidence document's non-changes are
 * visible rather than merely asserted. Both appearances only where appearance is
 * part of what changed — everything here is spacing, geometry and overlay
 * structure, which is identical in light and dark, so the dark pass is one
 * representative surface rather than a second copy of the set.
 *
 * Curated output lives in `docs/design/assets/mobile-01-iphone-2026-08/`.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUTPUT = join(process.cwd(), "test-results", "iphone-daily-driver");

/** iPhone 14/15 Pro logical resolution — the pass's primary review width. */
const IPHONE = { width: 390, height: 844 };
/** The narrowest supported viewport. */
const NARROW = { width: 320, height: 720 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
});

test.use({ viewport: IPHONE, isMobile: true, hasTouch: true });

async function shoot(
  page: Page,
  name: string,
  fullPage = false,
): Promise<void> {
  await page.screenshot({ path: join(OUTPUT, `${name}.png`), fullPage });
}

test("phone surfaces", async ({ page }) => {
  await gotoFixture(page, "/");
  await shoot(page, "today");

  await gotoFixture(page, "/tasks");
  await shoot(page, "tasks");

  await gotoFixture(page, "/tasks?drawer=task%3At-rc-k01");
  // The Drawer streams its record in after mount, so wait for the real content
  // rather than photographing the skeleton it shows for one frame.
  await page
    .locator(".drawer .record-title, [data-testid='task-drawer'] .record-title")
    .first()
    .waitFor();
  await shoot(page, "task-drawer");

  await gotoFixture(page, "/goals");
  await shoot(page, "goals-collection");

  await gotoFixture(page, "/goals/g-rc-move");
  await shoot(page, "goal-record");

  await gotoFixture(page, "/projects/pr-rc-kitchen");
  await shoot(page, "project-record");

  await gotoFixture(page, "/notes/n-rc-brief");
  await shoot(page, "note-editor");

  await gotoFixture(page, "/diary");
  await shoot(page, "diary");

  await gotoFixture(page, "/new/person");
  await shoot(page, "form-sticky-commitment");
});

test("the complex bottom sheet — a task row's overflow", async ({ page }) => {
  await gotoFixture(page, "/tasks");
  await page
    .locator(".dh-card__actions .dh-overflow-menu__trigger")
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await shoot(page, "overflow-sheet");
});

test("the narrowest supported viewport", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await gotoFixture(page, "/projects/pr-rc-kitchen");
  await shoot(page, "project-record-320");
  await gotoFixture(page, "/diary");
  await shoot(page, "diary-320");
});

test("dark appearance", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoFixture(page, "/tasks");
  await page
    .locator(".dh-card__actions .dh-overflow-menu__trigger")
    .first()
    .click();
  await page.getByRole("dialog").waitFor();
  await shoot(page, "overflow-sheet-dark");

  await gotoFixture(page, "/diary");
  await shoot(page, "diary-dark");
});
