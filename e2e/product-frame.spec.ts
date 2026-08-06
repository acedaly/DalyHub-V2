import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { mobileNavigationOpener } from "./helpers";

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
  test("renders the frame: drawer navigation, and search in the top app bar", async ({
    page,
  }) => {
    await page.goto("/");

    // The drawer keeps identity and destinations.
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();

    // Search and the palette live in the top app bar, not in the drawer. The
    // drawer used to open with two 56px pills before its first destination.
    const topBar = page.locator(".dh-topbar");
    await expect(
      topBar.getByRole("button", { name: /^Search DalyHub/ }),
    ).toBeVisible();
    await expect(
      topBar.getByRole("button", { name: /command palette/i }),
    ).toBeVisible();

    // And there is exactly ONE search landmark in the desktop shell.
    await expect(page.locator('[role="search"]')).toHaveCount(1);
  });

  test("the banner states the product, with the brand mark decorative", async ({
    page,
  }) => {
    // BRAND-01 — the rail used to render only the workspace name, so renaming
    // the workspace renamed DalyHub in the frame. The product name is now
    // stated deliberately, and the mark beside it is decorative because that
    // name is real text.
    await page.goto("/");
    const banner = page.getByRole("banner");
    await expect(banner.getByText("DalyHub")).toBeVisible();
    const mark = banner.locator(".dh-brand-mark");
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveAttribute("aria-hidden", "true");
    // The tagline belongs on About, not in a navigation rail.
    await expect(banner.getByText("Your life. Connected.")).toHaveCount(0);
  });

  test("user menu holds identity + sign out, and Escape restores focus", async ({
    page,
  }) => {
    await page.goto("/");
    // The account control moved into the top app bar with the rest of the
    // application's own utilities, and it is compact there — avatar and
    // chevron, with the name in its accessible label.
    const trigger = page
      .locator(".dh-topbar")
      .getByRole("button", { name: /^Account —/ });
    await trigger.click();
    await expect(page.getByText("owner@example.invalid")).toBeVisible();

    // There is NO theme quick-switch here. This assertion used to require one
    // ("Daly Light"), which ADR-074 deleted along with the whole theme feature
    // — so it had been failing on `main` since that merge. It is inverted
    // rather than removed, so the menu can never quietly grow a theme picker
    // back: DalyHub ships one generated light/dark pair chosen by the OS.
    for (const retired of ["Daly Light", "Daly Dark", "Match system"]) {
      await expect(
        page.getByRole("button", { name: retired, exact: true }),
      ).toHaveCount(0);
    }

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
      page.getByRole("heading", { name: "No Projects yet" }),
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
    const toggle = mobileNavigationOpener(page);
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
