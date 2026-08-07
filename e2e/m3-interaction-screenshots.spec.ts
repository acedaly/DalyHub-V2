/**
 * M3-INT / EDIT-02 — visual evidence for PR #127.
 *
 * Opt-in, like every other screenshot pass in this suite:
 *
 *     pnpm run build
 *     CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
 *       e2e/m3-interaction-screenshots.spec.ts --workers=1
 *
 * Two of this PR's defects were VISUAL — a title wrapping with room to spare,
 * and a caret opening near the middle of its editor — and a DOM assertion alone
 * is not evidence that either is fixed. These frames are the evidence. They
 * assert almost nothing; the geometry is pinned by `record-header-title.spec.ts`
 * and `editor-geometry.spec.ts`, which fail against the pre-fix CSS.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "m3-interaction-2026-08",
);

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 900, height: 1000 };
const LAPTOP = { width: 1280, height: 900 };
const LARGE = { width: 1440, height: 900 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

async function openFirstNote(page: Page) {
  await gotoFixture(page, "/notes");
  await page.locator("a[href^='/notes/']").first().click();
  await page.locator(".cm-content").first().waitFor({ timeout: 60_000 });
}

test.describe("Record header — title width priority", () => {
  test("short title at laptop and narrow widths, light and dark", async ({
    page,
  }) => {
    for (const [label, size] of [
      ["laptop-1280", LAPTOP],
      ["narrow-900", NARROW],
      ["large-1440", LARGE],
    ] as const) {
      await page.setViewportSize(size);
      await gotoFixture(page, "/design/record-layout");
      await shot(page, `record-short-title-${label}-light`);

      await page.emulateMedia({ colorScheme: "dark" });
      await shot(page, `record-short-title-${label}-dark`);
      await page.emulateMedia({ colorScheme: "light" });
    }
  });

  test("a real Project record, and a deliberately long title", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP);
    await gotoFixture(page, "/projects/pr-website");
    await page.getByRole("heading", { name: "Website relaunch" }).waitFor();
    await shot(page, "record-project-laptop-light");

    await page.setViewportSize(NARROW);
    await shot(page, "record-project-900-light");

    await page.setViewportSize(LAPTOP);
    await gotoFixture(page, "/design/record-layout");
    await page
      .getByRole("region", { name: "Long content record" })
      .scrollIntoViewIfNeeded();
    await shot(page, "record-long-title-laptop-light");
  });

  test("a Goal record — surfaces and action hierarchy", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await gotoFixture(page, "/goals");
    const goal = page.locator("a[href^='/goals/']").first();
    if ((await goal.count()) > 0) {
      await goal.click();
      await page.waitForTimeout(500);
      await shot(page, "record-goal-laptop-light");
      await page.emulateMedia({ colorScheme: "dark" });
      await shot(page, "record-goal-laptop-dark");
      await page.emulateMedia({ colorScheme: "light" });
    }
  });
});

test.describe("Writing surface — where the text starts", () => {
  test("empty and populated, phone through large", async ({ page }) => {
    for (const [label, size] of [
      ["phone-390", PHONE],
      ["desktop-1024", { width: 1024, height: 900 }],
      ["laptop-1280", LAPTOP],
      ["large-1440", LARGE],
    ] as const) {
      await page.setViewportSize(size);
      await openFirstNote(page);
      await shot(page, `note-editor-populated-${label}-light`);

      // The headline frame: an EMPTY note. This is where the caret used to open
      // near the horizontal middle of the surface.
      await page.locator(".cm-content").click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      await page.waitForTimeout(300);
      await shot(page, `note-editor-empty-${label}-light`);

      await page.emulateMedia({ colorScheme: "dark" });
      await shot(page, `note-editor-empty-${label}-dark`);
      await page.emulateMedia({ colorScheme: "light" });
    }
  });

  test("Read mode keeps the same left edge", async ({ page }) => {
    await page.setViewportSize(LARGE);
    await openFirstNote(page);
    await shot(page, "note-editor-write-1440-light");
    await page.getByRole("button", { name: "Read", exact: true }).click();
    await page.waitForTimeout(300);
    await shot(page, "note-editor-read-1440-light");
  });
});

test.describe("Settings — one selection control and the shared switch", () => {
  test("selects and switches, light and dark", async ({ page }) => {
    await page.setViewportSize(LAPTOP);

    await gotoFixture(page, "/settings");
    await shot(page, "settings-selects-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await shot(page, "settings-selects-dark");
    await page.emulateMedia({ colorScheme: "light" });

    await gotoFixture(page, "/settings?section=navigation");
    await shot(page, "settings-switches-light");
    await page.emulateMedia({ colorScheme: "dark" });
    await shot(page, "settings-switches-dark");
    await page.emulateMedia({ colorScheme: "light" });

    // An open combobox — the migrated control showing its full option list.
    await gotoFixture(page, "/settings");
    await page.getByRole("combobox", { name: "Default landing page" }).click();
    await page.getByRole("option").first().waitFor();
    await shot(page, "settings-select-open-light");
  });

  test("keyboard focus is visible on the shared controls", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await gotoFixture(page, "/settings?section=navigation");
    const first = page.locator("input[role='switch']:not(:disabled)").first();
    await first.focus();
    await shot(page, "settings-switch-focus-light");

    await gotoFixture(page, "/design/record-layout");
    await page
      .getByRole("region", { name: "Short title record", exact: true })
      .getByRole("button", { name: "Complete project" })
      .focus();
    await shot(page, "record-action-focus-light");
  });
});
