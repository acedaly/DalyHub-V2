import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * TODAY-01 / TODAY-04 — the Today dashboard, driven end to end against the
 * development-auth server. Role-based and non-brittle: it asserts the sidebar
 * entry, the pane header, the planning sections + summary, the preserved fixture
 * sections, inert quick capture, a card opening the Drawer, and the
 * no-horizontal-overflow invariant on desktop and at 320px. Planning MUTATIONS are
 * driven in `planning.spec.ts` against a dedicated task, so this structural spec
 * does not interfere with the shared dev database.
 */

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

test.describe("TODAY-01 — desktop", () => {
  test("is reachable from the sidebar and renders the pane header", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Today" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
  });

  test("renders the planning and fixture sections", async ({ page }) => {
    await page.goto("/today");
    // The planning summary is always present (operational awareness).
    await expect(
      page.getByRole("group", { name: /Today at a glance/ }),
    ).toBeVisible();
    // The Today commitment section + the preserved fixture sections.
    for (const name of [
      /^Today/,
      /On your calendar/,
      /Continue working/,
      /Recent notes/,
      /Daily timeline/,
      /Quick capture/,
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    // The seeded, unplanned tasks appear under Anytime.
    await expect(
      page.getByRole("heading", { level: 2, name: /Anytime/ }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("quick capture is structured but does not persist", async ({ page }) => {
    await page.goto("/today");
    await page.locator('.dh-today[data-hydrated="true"]').waitFor();
    const capture = page.getByRole("button", { name: "Capture", exact: true });
    await expect(capture).toBeDisabled();
    await page
      .getByPlaceholder("What needs your attention?")
      .fill("Call the plumber");
    await expect(capture).toBeEnabled();
    await capture.click();
    await expect(page.getByRole("status")).toContainText(/has not been saved/i);
    await expect(
      page.getByPlaceholder("What needs your attention?"),
    ).toHaveValue("Call the plumber");
  });

  test("opens a record in the Drawer over the pane", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "Finish PX-02" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Finish PX-02" }),
    ).toBeVisible();
  });
});

test.describe("TODAY-01 — mobile (320px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("has no horizontal overflow", async ({ page }) => {
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});
