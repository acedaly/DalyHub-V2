import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * PX-02 — the application frame, driven end to end against the development-auth
 * server (where the dev-only Collection Layout fixture is mounted). Deliberately
 * role-based and non-brittle: it asserts the sidebar frame, the user menu, the
 * mobile overlay, the Collection Layout and its state slots, keyboard operation and
 * the no-horizontal-overflow invariant across desktop, laptop, tablet and 320px.
 */

const COLLECTION = "/design/collection-layout";

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

test.describe("PX-02 frame — desktop", () => {
  test("renders the sidebar frame with navigation, search and user menu", async ({
    page,
  }) => {
    await page.goto("/");

    // Sidebar: brand banner, Search + Command entries, primary navigation.
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Search$/ })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /command palette/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  });

  test("user menu holds identity + theme + sign out, and Escape restores focus", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: /owner/i });
    await trigger.click();
    await expect(page.getByText("owner@example.invalid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign out/i })).toBeVisible();

    // Keyboard: Escape closes the menu and restores focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(page.getByText("owner@example.invalid")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Collection Layout renders header, filter bar, cards and its state slots", async ({
    page,
  }) => {
    await page.goto(COLLECTION);

    await expect(
      page.getByRole("heading", { level: 1, name: "Projects" }),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "View" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Website relaunch" }),
    ).toBeVisible();

    // Loading state: skeletons replace the collection.
    await page.getByRole("radio", { name: "loading" }).check();
    await expect(page.locator(".dh-collection-skeleton")).toBeVisible();

    // Empty state: a teaching EmptyState with a next action.
    await page.getByRole("radio", { name: "empty" }).check();
    await expect(
      page.getByRole("heading", { name: "No projects yet" }),
    ).toBeVisible();

    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("a card opens the Drawer over the collection", async ({ page }) => {
    await page.goto(COLLECTION);
    await page.getByRole("link", { name: "Website relaunch" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Website relaunch" }),
    ).toBeVisible();
  });
});

test.describe("PX-02 frame — laptop", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test("no horizontal overflow", async ({ page }) => {
    await page.goto(COLLECTION);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("PX-02 frame — tablet", () => {
  test.use({ viewport: { width: 834, height: 1112 } });
  test("no horizontal overflow", async ({ page }) => {
    await page.goto(COLLECTION);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("PX-02 frame — mobile (320px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("collapses the rail to a focus-trapped overlay sheet", async ({
    page,
  }) => {
    await page.goto("/");

    // The persistent rail is hidden; the mobile bar's menu toggle opens the sheet.
    const toggle = page.getByRole("button", { name: /open navigation/i });
    await expect(toggle).toBeVisible();
    await toggle.click();

    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();

    // Escape closes it and returns focus to the toggle.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();

    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("the Collection Layout has no horizontal overflow at 320px", async ({
    page,
  }) => {
    await page.goto(COLLECTION);
    await expect(
      page.getByRole("heading", { level: 1, name: "Projects" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});
