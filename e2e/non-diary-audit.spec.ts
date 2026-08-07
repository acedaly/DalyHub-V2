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
  /*
   * M3-INT — the panel is still a contained surface; its TOP edge is now the tab
   * strip's rule rather than a second border of its own.
   *
   * This test used to measure `borderTopWidth` and `borderTopLeftRadius`, which
   * was the right question with the wrong ruler once the strip and the panel
   * became one surface. A gap plus a fully-rounded card underneath a bar reads
   * as "a tab bar, and separately, a card" — the segmented look the review
   * reported. What matters is unchanged and is asserted more strictly here: the
   * panel is a real, bounded surface distinct from the page canvas, it has no
   * doubled boundary, and the strip's rule and the panel's top edge COINCIDE.
   */
  test("the active tab panel is a contained surface, joined to its tab strip (light)", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-dh");
    const panel = page.locator(".record-tabs__panel").first();
    const strip = page.locator(".record-tabs__strip").first();
    await expect(panel).toBeVisible();

    const box = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        topWidth: parseFloat(s.borderTopWidth),
        sideWidth: parseFloat(s.borderLeftWidth),
        bottomWidth: parseFloat(s.borderBottomWidth),
        sideStyle: s.borderLeftStyle,
        topRadius: parseFloat(s.borderTopLeftRadius),
        bottomRadius: parseFloat(s.borderBottomLeftRadius),
        padding: parseFloat(s.paddingTop),
        background: s.backgroundColor,
      };
    });

    // Contained: sides, bottom, bottom corners, inset, and a surface of its own.
    expect(box.sideWidth).toBeGreaterThan(0);
    expect(box.bottomWidth).toBeGreaterThan(0);
    expect(box.sideStyle).not.toBe("none");
    expect(box.bottomRadius).toBeGreaterThan(0);
    expect(box.padding).toBeGreaterThan(0);
    expect(box.background).not.toBe("rgba(0, 0, 0, 0)");

    // Joined: no second top edge, no second set of top corners…
    expect(box.topWidth).toBe(0);
    expect(box.topRadius).toBe(0);

    // …and no gap, so the strip's rule IS the panel's top edge.
    const stripBox = (await strip.boundingBox())!;
    const panelBox = (await panel.boundingBox())!;
    expect(Math.abs(panelBox.y - (stripBox.y + stripBox.height))).toBeLessThan(
      2,
    );
    const stripRule = await strip.evaluate((el) =>
      parseFloat(getComputedStyle(el).borderBottomWidth),
    );
    expect(stripRule).toBeGreaterThan(0);

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
      const strip = page.locator(".record-tabs__strip").first();
      await expect(panel).toBeVisible();
      // The boundary is real in dark too — it is simply drawn by the strip on
      // top and by the panel on the other three sides.
      const sides = await panel.evaluate((el) =>
        parseFloat(getComputedStyle(el).borderLeftWidth),
      );
      const stripRule = await strip.evaluate((el) =>
        parseFloat(getComputedStyle(el).borderBottomWidth),
      );
      expect(sides).toBeGreaterThan(0);
      expect(stripRule).toBeGreaterThan(0);
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
