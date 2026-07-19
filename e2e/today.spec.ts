import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * TODAY-01 — the Today dashboard, driven end to end against the development-auth
 * server. Role-based and non-brittle: it asserts the sidebar entry, the pane
 * header, the six sections, optimistic completion, inert quick capture, a card
 * opening the Drawer, and the no-horizontal-overflow invariant on desktop and at
 * 320px. It composes only shared PX-02/DS parts — no bespoke chrome to assert.
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

  test("renders all six sections", async ({ page }) => {
    await page.goto("/today");
    for (const name of [
      /Today's focus/,
      /^Upcoming/,
      /Continue working/,
      /Recent notes/,
      /Daily timeline/,
      /Quick capture/,
    ]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("completes a focus task optimistically", async ({ page }) => {
    await page.goto("/today");
    const focus = page.getByRole("region", { name: /Today's focus/ });
    // Quick actions reveal on hover/focus (DS-04); hover the card so the action
    // is settled before clicking, then assert the optimistic completion.
    const firstCard = focus.locator(".dh-card").first();
    await firstCard.hover();
    await firstCard.getByRole("button", { name: "Complete" }).click();
    await expect(firstCard.getByText("Done")).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: "Reopen" }),
    ).toBeVisible();
  });

  test("quick capture is structured but does not persist", async ({ page }) => {
    await page.goto("/today");
    const capture = page.getByRole("button", { name: "Capture", exact: true });
    await expect(capture).toBeDisabled();
    await page
      .getByPlaceholder("What needs your attention?")
      .fill("Call the plumber");
    await expect(capture).toBeEnabled();
    await capture.click();
    // Nothing is stored, so the draft is preserved and the notice says so plainly.
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
