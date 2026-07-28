import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, gotoFixture } from "./helpers";

/**
 * Non-diary post-merge audit — the browser-level proof for the four primary
 * deliverables over real (seeded) D1:
 *   - the shared Record Layout has a clear, contained visual boundary (the tab
 *     content no longer dissolves into the page canvas), in light AND dark;
 *   - visible structural relationships and generic EntityLinks are navigable to
 *     their canonical records (deliverable 4);
 *   - the Goal record's Projects tab opens its contributing Projects (DEBT-22
 *     wiring; exhaustive pagination is proven at the route/unit layer).
 *
 * Uses the permanent seeded fixtures: Area `a-dh` (DalyHub V2), Goal `g-launch`
 * (Launch the site), Project `pr-launch` (Launch checklist, advancing g-launch),
 * Project `pr-website` (Website relaunch, directly under a-dh).
 */

test.describe("Record Layout boundary (deliverable 3)", () => {
  test("the active tab panel is a contained, bordered surface (light)", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-dh");
    const panel = page.locator(".record-tabs__panel").first();
    await expect(panel).toBeVisible();
    const box = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        width: parseFloat(s.borderTopWidth),
        style: s.borderTopStyle,
        radius: parseFloat(s.borderTopLeftRadius),
        padding: parseFloat(s.paddingTop),
      };
    });
    expect(box.width).toBeGreaterThan(0); // a visible boundary
    expect(box.style).not.toBe("none");
    expect(box.radius).toBeGreaterThan(0);
    expect(box.padding).toBeGreaterThan(0);
    // No doubled border: the summary card and the panel are siblings, not nested.
    const summaryInsidePanel = await panel.locator(".record-summary").count();
    expect(summaryInsidePanel).toBe(0);
  });

  test.describe("dark theme", () => {
    test.use({ colorScheme: "dark" });
    test("the tab panel keeps a restrained but visible boundary (dark)", async ({
      page,
    }) => {
      await gotoFixture(page, "/goals/g-launch");
      const panel = page.locator(".record-tabs__panel").first();
      await expect(panel).toBeVisible();
      const width = await panel.evaluate((el) =>
        parseFloat(getComputedStyle(el).borderTopWidth),
      );
      expect(width).toBeGreaterThan(0);
    });
  });

  test("Area, Goal and Project records stay overflow-free at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    for (const path of [
      "/areas/a-dh",
      "/goals/g-launch",
      "/projects/pr-launch",
    ]) {
      await gotoFixture(page, path);
      await expectNoHorizontalOverflow(page);
    }
  });
});

test.describe("Relationship navigation (deliverable 4)", () => {
  test("Project → Goal opens the canonical Goal record", async ({ page }) => {
    await gotoFixture(page, "/projects/pr-launch");
    await page
      .getByRole("link", { name: "Goal: Launch the site" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/goals\/g-launch$/);
  });

  test("Project → Area opens the canonical Area record", async ({ page }) => {
    await gotoFixture(page, "/projects/pr-website");
    await page.getByRole("link", { name: "Area: DalyHub V2" }).first().click();
    await expect(page).toHaveURL(/\/areas\/a-dh$/);
  });

  test("Goal Projects tab opens a contributing Project record", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals/g-launch");
    await page.getByRole("tab", { name: /Projects/ }).click();
    await page.getByRole("link", { name: "Open Launch checklist" }).click();
    await expect(page).toHaveURL(/\/projects\/pr-launch$/);
  });

  test("Goal Projects tab shows only the active Goal’s Projects across navigation (scope isolation)", async ({
    page,
  }) => {
    // DEBT-22 pagination is scoped per Goal: navigating between Goal records must
    // never leak one Goal's Projects into another's tab. (The exact late-response
    // interleaving is proven deterministically in the GoalProjectsTab unit test;
    // this asserts the observable no-cross-contamination guarantee.)
    await gotoFixture(page, "/goals/g-launch");
    await page.getByRole("tab", { name: /Projects/ }).click();
    await expect(
      page.getByRole("link", { name: "Open Launch checklist" }),
    ).toBeVisible();

    await gotoFixture(page, "/goals/g-align-neglected");
    await page.getByRole("tab", { name: /Projects/ }).click();
    await expect(
      page.getByRole("link", { name: "Open Spanish course" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Launch checklist" }),
    ).toHaveCount(0);
  });

  test("Project Linked relationship rows are navigable, back/forward works", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-launch");
    await page.getByRole("tab", { name: /Linked/ }).click();
    const goalLink = page
      .getByRole("link", { name: "Goal: Launch the site" })
      .first();
    await expect(goalLink).toBeVisible();
    await goalLink.click();
    await expect(page).toHaveURL(/\/goals\/g-launch$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/pr-launch/);
  });
});
