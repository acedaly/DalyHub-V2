import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import { d1Execute } from "./d1";

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

function useSystemAppearance(): void {
  d1Execute(
    `UPDATE owner_app_preferences SET appearance = 'system' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

async function assertBrandedShell(page: Page): Promise<void> {
  const rail = page.getByTestId("sidebar-rail");
  const canvas = page.locator("#main-content");

  await expect(rail).toBeVisible();
  await expect
    .poll(() => rail.evaluate((node) => getComputedStyle(node).backgroundColor))
    .toBe("rgb(56, 34, 62)");
  await expect
    .poll(() =>
      canvas.evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .not.toBe("rgb(56, 34, 62)");
  await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
}

test.describe.serial("Branded Plum visual review", () => {
  test.beforeAll(() => useSystemAppearance());

  test("captures Today desktop light", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/today");
    await assertBrandedShell(page);
    await expectNoAxeViolations(page);
    await page.screenshot({
      path: "/tmp/dalyhub-branded-plum-today-light.png",
      fullPage: true,
    });
  });

  test("captures Today desktop dark", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/today");
    await assertBrandedShell(page);
    await expectNoAxeViolations(page);
    await page.screenshot({
      path: "/tmp/dalyhub-branded-plum-today-dark.png",
      fullPage: true,
    });
  });

  test("captures Tasks desktop light and dark", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/tasks");
    await assertBrandedShell(page);
    await page.screenshot({
      path: "/tmp/dalyhub-branded-plum-tasks-light.png",
      fullPage: true,
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/tasks");
    await assertBrandedShell(page);
    await page.screenshot({
      path: "/tmp/dalyhub-branded-plum-tasks-dark.png",
      fullPage: true,
    });
  });

  test("checks the tablet shell", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/today");
    await assertBrandedShell(page);
    await expect(page.getByTestId("sidebar-product-name")).toHaveClass(
      /sr-only/,
    );
  });

  test("captures mobile Branded Plum navigation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/today");
    await page
      .getByTestId("bottom-nav")
      .getByRole("button", { name: "More" })
      .click();

    const dialog = page.getByRole("dialog", { name: "Navigation" });
    const mobileSidebar = page.getByTestId("sidebar-overlay");
    await expect(dialog).toBeVisible();
    await expect
      .poll(() =>
        mobileSidebar.evaluate(
          (node) => getComputedStyle(node).backgroundColor,
        ),
      )
      .toBe("rgb(56, 34, 62)");
    await expect(
      dialog.getByRole("button", { name: "Close navigation" }),
    ).toBeFocused();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await page.screenshot({
      path: "/tmp/dalyhub-branded-plum-mobile-navigation.png",
      fullPage: true,
    });
  });

  test("captures the neutral command palette", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 });
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/today");
    await page.getByRole("button", { name: "Command palette" }).click();

    const input = page.getByRole("combobox", {
      name: "Search commands and records",
    });
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await page.screenshot({
      path: "/tmp/dalyhub-branded-plum-command-palette.png",
      fullPage: true,
    });
  });
});
