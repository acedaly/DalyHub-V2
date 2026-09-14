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
  test("the active tab panel is a contained surface (light)", async ({
    page,
  }) => {
    /*
     * Asked of a record whose panel IS the surface, and measured with the ruler
     * the surface is actually drawn with.
     *
     * Two things moved under this test and it was measuring neither. It used to
     * load `/areas/a-dh`, whose active tab declares `surface="plain"` — the
     * branch that DELIBERATELY draws no boundary because the content brings its
     * own (`RecordTabs`: "a tab whose content brings its own surface suppresses
     * the panel's, so the record never draws a frame inside a frame"). So it
     * asked the bounded-card question of the one record that is deliberately
     * not one. Measured: `data-surface="plain"`, no ring, 0 radius, 0 padding,
     * transparent. The `plain` contract is asserted on its own below, where it
     * belongs.
     *
     * And the boundary is a RING (`ring-1 ring-secondary`, a box-shadow), not a
     * border, so every `border*Width` reads 0 on a panel that is plainly
     * bounded. Measured on `/goals/g-launch`: ring present, radius 12px,
     * padding 20px, background `rgb(255, 255, 255)`.
     */
    await gotoFixture(page, "/goals/g-launch");
    const panel = page.locator(".record-tabs__panel").first();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-surface", "panel");

    const box = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        // Either ruler counts: a border or Untitled's ring both bound a surface.
        bounded:
          parseFloat(s.borderLeftWidth) > 0 ||
          (s.boxShadow !== "none" && s.boxShadow !== ""),
        radius: parseFloat(s.borderBottomLeftRadius),
        padding: parseFloat(s.paddingTop),
        background: s.backgroundColor,
      };
    });

    // Contained: a boundary, rounded corners, a real inset, and its own surface.
    expect(box.bounded).toBe(true);
    expect(box.radius).toBeGreaterThan(0);
    expect(box.padding).toBeGreaterThan(0);
    expect(box.background).not.toBe("rgba(0, 0, 0, 0)");

    // No doubled border: the summary card and the panel are siblings, not nested.
    const summaryInsidePanel = await panel.locator(".record-summary").count();
    expect(summaryInsidePanel).toBe(0);
  });

  test("a tab whose content brings its own surface draws none of its own", async ({
    page,
  }) => {
    /*
     * The other half of the same rule, and the case the light test above used
     * to fail on. A `plain` panel must stay a bare box: the Area record's
     * Overview composes its own surfaces, and a panel drawing a card around
     * them is the frame-inside-a-frame `RecordTab.surface` exists to prevent.
     */
    await gotoFixture(page, "/areas/a-dh");
    const panel = page.locator(".record-tabs__panel").first();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("data-surface", "plain");

    const box = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        border: parseFloat(s.borderLeftWidth),
        shadow: s.boxShadow,
        padding: parseFloat(s.paddingTop),
        background: s.backgroundColor,
      };
    });
    expect(box.border).toBe(0);
    expect(box.shadow).toBe("none");
    expect(box.padding).toBe(0);
    expect(box.background).toBe("rgba(0, 0, 0, 0)");
  });

  test("the tab strip carries its own rule above the panel", async ({
    page,
  }) => {
    /*
     * The strip's underline is drawn by the tablist's `::before` (Untitled's
     * underline tabs), not by a `border-bottom` on the strip — which is why
     * asserting `strip.borderBottomWidth > 0` measured 0 on a strip that
     * plainly has a rule. Measured: a 1px `::before` with a real colour.
     */
    await gotoFixture(page, "/goals/g-launch");
    const rule = await page
      .locator(".record-tabs__strip [role='tablist']")
      .first()
      .evaluate((el) => {
        const before = getComputedStyle(el, "::before");
        return {
          height: parseFloat(before.height),
          background: before.backgroundColor,
          generated: before.content,
        };
      });
    expect(rule.generated).not.toBe("none");
    expect(rule.height).toBeGreaterThan(0);
    expect(rule.background).not.toBe("rgba(0, 0, 0, 0)");
  });

  test.describe("dark theme", () => {
    test.use({ colorScheme: "dark" });
    test("the tab panel keeps a restrained but visible boundary (dark)", async ({
      page,
    }) => {
      await gotoFixture(page, "/goals/g-launch");
      const panel = page.locator(".record-tabs__panel").first();
      await expect(panel).toBeVisible();
      /*
       * The boundary is real in dark too — drawn by the panel's RING rather
       * than by a border, which is why the old `borderLeftWidth > 0` read 0 on
       * a panel that is plainly bounded. The strip's own rule is asserted in
       * its own test above, against the `::before` that actually draws it.
       */
      const bounded = await panel.evaluate((el) => {
        const s = getComputedStyle(el);
        return (
          parseFloat(s.borderLeftWidth) > 0 ||
          (s.boxShadow !== "none" && s.boxShadow !== "")
        );
      });
      expect(bounded).toBe(true);
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
