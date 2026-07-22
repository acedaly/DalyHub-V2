import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * PROJ-04 — the project Activity tab, driven for real against local D1 (the deployed
 * path). It proves an owner can open a project, select the Activity tab, review the
 * project's real seeded event history rendered by the shared DS-05 Timeline, watch a
 * live mutation appear without a hard reload, page through more than one page, open a
 * referenced entity through the shared Drawer, and that the bare record + Activity tab
 * are accessible (light and dark) with no horizontal overflow across the width matrix.
 *
 * The `pr-activity` project is seeded with a real Activity history (creation, its Area
 * link, one link event per child task, a rename) — over one page of events — plus a
 * real child task the timeline links to. `pr-empty` has no events (the empty state).
 */

const RECORD = "/projects/pr-activity";

test.describe("PROJ-04 project Activity tab", () => {
  test("opens Activity from the project record and shows the real timeline", async ({
    page,
  }) => {
    // Open the Projects collection, then the project record.
    await gotoFixture(page, "/projects");
    await gotoFixture(page, RECORD);
    await expect(
      page.getByRole("heading", { name: "Activity showcase" }),
    ).toBeVisible();

    // Tabs follow the shared vocabulary: Tasks, Key links, Activity LAST.
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveText(["Tasks", "Key links", "Activity"]);

    await page.getByRole("tab", { name: "Activity" }).click();
    const feed = page.getByRole("feed", { name: "Project activity" });
    await expect(feed).toBeVisible();
    // Real event articles from the shared Activity model (not a bespoke list).
    await expect(feed.getByRole("article").first()).toBeVisible();
    // The seeded rename (entity.updated) is the newest event.
    await expect(
      feed.getByText("Updated", { exact: false }).first(),
    ).toBeVisible();
  });

  test("loads a second page and never duplicates events", async ({ page }) => {
    await gotoFixture(page, RECORD);
    await page.getByRole("tab", { name: "Activity" }).click();
    const feed = page.getByRole("feed", { name: "Project activity" });
    await expect(feed).toBeVisible();

    const firstPage = await feed.getByRole("article").count();
    expect(firstPage).toBeGreaterThan(0);

    // More than one page exists (33 project-subject events > the 30 page size).
    const loadMore = page.getByRole("button", { name: /load more/i });
    await expect(loadMore).toBeVisible();
    await loadMore.click();

    await expect(page.getByText(/reached the beginning/i)).toBeVisible();
    const total = await feed.getByRole("article").count();
    expect(total).toBeGreaterThan(firstPage);

    // No duplicate events across the page boundary: every article's accessible name
    // is unique.
    const names = await feed
      .getByRole("article")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
    expect(new Set(names).size).toBe(names.length);
  });

  test("reflects lifecycle events without a hard reload", async ({ page }) => {
    // pr-activity is seeded COMPLETED (so it stays out of Today's "Continue working").
    await gotoFixture(page, RECORD);
    await page.getByRole("tab", { name: "Activity" }).click();
    const feed = page.getByRole("feed", { name: "Project activity" });
    await expect(feed).toBeVisible();

    // Reopening the project (a header action available from any tab) records a
    // project.reopened event; the Timeline revalidates in place — no hard reload.
    await page.getByRole("button", { name: "Reopen project" }).click();
    await expect(
      feed.getByText("Reopened project", { exact: false }).first(),
    ).toBeVisible();

    // Completing it again records project.completed and it too appears without a
    // reload — and leaves the project completed (out of "Continue working").
    await page.getByRole("button", { name: "Complete project" }).click();
    await expect(
      feed.getByText("Completed project", { exact: false }).first(),
    ).toBeVisible();
  });

  test("opens a referenced task through the shared Drawer and restores context", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    await page.getByRole("tab", { name: "Activity" }).click();
    const feed = page.getByRole("feed", { name: "Project activity" });
    await expect(feed).toBeVisible();

    // A child-task link event references the task as a navigable entity.
    const taskLink = feed.getByRole("link", { name: /Activity task/ }).first();
    await taskLink.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Escape closes the Drawer (Back/Forward + focus handled by the shared Drawer),
    // and the Activity tab is still selected — loaded pages are preserved.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(feed).toBeVisible();
  });

  test("shows the empty state for a project with no events", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-empty");
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(page.getByText(/No activity yet/i)).toBeVisible();
  });

  test("survives a direct reload back onto the Activity tab", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Project activity" }),
    ).toBeVisible();

    await page.reload();
    // The record is intact; re-selecting Activity re-reads the timeline.
    await expect(
      page.getByRole("heading", { name: "Activity showcase" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Project activity" }),
    ).toBeVisible();
  });

  test("is keyboard operable: reach and open the Activity tab", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    // Focus the Tasks tab, then arrow to Activity (WAI-ARIA Tabs pattern) and it
    // activates on focus.
    await page.getByRole("tab", { name: "Tasks" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Activity" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(
      page.getByRole("feed", { name: "Project activity" }),
    ).toBeVisible();
  });

  test("Tasks and Key links tabs and project health remain intact", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    // Health signal still renders on the record header.
    await expect(page.getByText("Health").first()).toBeVisible();
    // Tasks tab still lists the project's tasks.
    await expect(
      page.getByRole("heading", { name: /Activity task/ }).first(),
    ).toBeVisible();
    // Key links tab still shows relationships.
    await page.getByRole("tab", { name: "Key links" }).click();
    await expect(
      page.getByRole("region", { name: "Relationships" }),
    ).toBeVisible();
  });
});

test.describe("PROJ-04 accessibility (light)", () => {
  test("bare project record and Activity tab are axe-clean", async ({
    page,
  }) => {
    // The BARE record (no Drawer open) — the DEBT-21 regression gate: a non-skipping
    // heading outline (record h1 → section h2 → content h3).
    await gotoFixture(page, RECORD);
    await expectNoAxeViolations(page);

    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Project activity" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("PROJ-04 accessibility (dark)", () => {
  test.use({ colorScheme: "dark" });

  test("bare project record and Activity tab are axe-clean (dark)", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    await expectNoAxeViolations(page);

    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Project activity" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("PROJ-04 responsive", () => {
  test("no horizontal overflow on the Activity tab across the width matrix", async ({
    page,
  }) => {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, RECORD);
      await page.getByRole("tab", { name: "Activity" }).click();
      await expect(
        page.getByRole("feed", { name: "Project activity" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("the Activity tab meets the 44px touch target on a narrow layout", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, RECORD);
    await expectMinTouchTarget(page.getByRole("tab", { name: "Activity" }));
  });
});
