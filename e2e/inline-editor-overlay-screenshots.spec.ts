/**
 * EDIT-03 — the approval capture for the inline editors' overlay layer.
 *
 * Opt-in exactly like every other screenshot pass, so the ordinary CI gate
 * neither slows down nor writes into the repository:
 *
 *     pnpm run build
 *     CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
 *       e2e/inline-editor-overlay-screenshots.spec.ts --workers=1
 *
 * What has to be visible in every frame is the same thing: THE WHOLE LIST OF
 * CHOICES. The defect these replace showed a 45px sliver of the menu carrying
 * the value the owner already had, so the awkward positions are the point —
 * a row at the top of the list, one in the middle, one near the foot of the
 * viewport where the surface has to flip, and the phone, where the same field
 * is a sheet rather than a dropdown.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "edit-03-2026-08",
);

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

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

/** Open an editor and wait until its surface has been measured and placed. */
async function open(page: Page, trigger: Locator) {
  await trigger.click();
  await expect(page.locator(".dh-anchored, .dh-sheet")).toBeVisible();
  await page.waitForTimeout(150);
}

async function close(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.locator(".dh-anchored, .dh-sheet")).toHaveCount(0);
}

/** The row whose editor sits closest to `y` in the viewport. */
async function editorNear(page: Page, testId: string, y: number) {
  const editors = page.locator(`[data-testid="${testId}"]`);
  const count = Math.min(await editors.count(), 40);
  let best: { index: number; distance: number } | null = null;
  for (let index = 0; index < count; index += 1) {
    const box = await editors.nth(index).boundingBox();
    if (!box) continue;
    const distance = Math.abs(box.y - y);
    if (!best || distance < best.distance) best = { index, distance };
  }
  return editors
    .nth(best?.index ?? 0)
    .locator("button")
    .first();
}

test.describe("EDIT-03 — desktop, 1280", () => {
  test.use({ viewport: DESKTOP });

  test("captures each editor open, at the top, middle and foot of the list", async ({
    page,
  }) => {
    test.slow();
    await gotoFixture(page, "/tasks");

    await open(page, await editorNear(page, "task-row-priority", 360));
    await shot(page, "desktop-priority-top");
    await close(page);

    await open(page, await editorNear(page, "task-row-parent", 360));
    await shot(page, "desktop-project-top");
    await close(page);

    await open(page, await editorNear(page, "task-row-due-date", 360));
    await shot(page, "desktop-due-top");
    await close(page);

    // The middle of the list: a long Project menu that cannot fit either side
    // whole, clamped and scrolling inside itself.
    await open(page, await editorNear(page, "task-row-parent", 500));
    await shot(page, "desktop-project-middle");
    await close(page);

    // The foot of the viewport: the surface flips above its trigger.
    await open(page, await editorNear(page, "task-row-priority", 730));
    await shot(page, "desktop-priority-bottom");
    await close(page);

    await open(page, await editorNear(page, "task-row-due-date", 730));
    await shot(page, "desktop-due-bottom");
    await close(page);
  });

  test("captures a menu opened from inside the Task record drawer", async ({
    page,
  }) => {
    // The case the overlay layer's z-index exists for: a surface opened from
    // inside a DS-03 Drawer has to render above it, not behind it.
    await gotoFixture(page, "/today?drawer=task%3At-drawer");
    await open(page, page.locator('[data-testid="task-priority-edit"] button'));
    await shot(page, "desktop-drawer-priority");
    await close(page);
  });
});

test.describe("EDIT-03 — phone, 390", () => {
  test.use({ viewport: MOBILE });

  test("captures the sheet presentation of each selector", async ({ page }) => {
    test.slow();

    // The row keeps its due date on a phone (UIX-01: circle · title · date), so
    // this is the one inline editor a phone list reaches directly.
    await gotoFixture(page, "/tasks");
    await open(
      page,
      page.locator('[data-testid="task-row-due-date"] button').first(),
    );
    await shot(page, "mobile-due");
    await close(page);

    // Priority is edited on the record, where a phone has always reached it.
    await gotoFixture(page, "/today?drawer=task%3At-drawer");
    await open(page, page.locator('[data-testid="task-priority-edit"] button'));
    await shot(page, "mobile-priority");
    await close(page);

    // The Project chooser a phone reaches: the row's own quick-edit panel,
    // whose searchable picker is the right control for a set this large. It is
    // unchanged by EDIT-03 and captured so the trio can be compared.
    await gotoFixture(page, "/tasks");
    const card = page.locator(".dh-card").first();
    await card.getByRole("button", { name: /^More actions for / }).click();
    await page.getByRole("menuitem", { name: /Priority, dates/ }).click();
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await shot(page, "mobile-project");
  });
});
