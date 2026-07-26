import { expect, test } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TASKS-01 — the first-class Tasks module, driven end to end against the
 * development-auth server over real (seeded) D1. Role-based and non-brittle: it
 * exercises the workspace-wide views (All, Matrix, Time Sectors), opens a real task
 * in the ONE canonical shared Task Drawer, proves the P1–P4 priority label and the
 * URL-backed view/drawer state, and holds the accessibility + responsive baseline.
 * It only READS the seeded spine (`t-drawer` "Draft the proposal", priority p1), so
 * it never disturbs the Today/Search/Waiting journeys.
 */

test.describe("TASKS-01 — desktop", () => {
  test("lists workspace tasks and opens one in the canonical Drawer", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=all");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();

    // A real seeded task is listed and opens the shared Task Drawer.
    await page
      .getByRole("link", { name: "Draft the proposal" })
      .first()
      .click();
    await expect(page).toHaveURL(/drawer=task%3At-drawer/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible();
    // TASKS-02: the canonical priority renders as the shared coloured
    // PriorityIndicator — the short "P1" tag is visible and the full action word
    // "Do" is carried in the element (available to assistive tech), never colour
    // alone.
    const priority = dialog.locator('.dh-priority[data-priority="p1"]');
    await expect(priority).toBeVisible();
    await expect(priority).toContainText("P1");
    await expect(priority).toContainText("Do");

    // Escape closes the Drawer and restores the Tasks context.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/tasks\?view=all$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("renders the shared priority + urgency signals on task cards (TASKS-02)", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=all");

    // The always-overdue seeded task (`pht-overdue`, due 2000-01-01) shows the
    // Overdue urgency chip — the WORD, not merely a red date (DEBT-28). The smart
    // sort surfaces overdue work first, so it is on the first page.
    const overdueCard = page
      .locator(".dh-card")
      .filter({ hasText: "Submit the abstract" })
      .first();
    const overdue = overdueCard.locator('.dh-urgency[data-kind="overdue"]');
    await expect(overdue).toBeVisible();
    await expect(overdue).toContainText("Overdue");

    // The p1 seeded task shows the coloured PriorityIndicator on its card — priority
    // is no longer an absent/colour-free grey chip (DEBT-27).
    const p1Card = page
      .locator(".dh-card")
      .filter({ hasText: "Draft the proposal" })
      .first();
    const priority = p1Card.locator('.dh-priority[data-priority="p1"]');
    await expect(priority).toBeVisible();
    await expect(priority).toContainText("P1");
  });

  test("switches to the Eisenhower Matrix and shows the four quadrants", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=matrix");
    for (const label of [
      "P1 · Do",
      "P2 · Defer",
      "P3 · Delegate",
      "P4 · Delete / Review",
    ]) {
      // The section heading carries a count suffix, e.g. "P1 · Do (1)".
      await expect(
        page.getByRole("heading", { name: label }).first(),
      ).toBeVisible();
    }
    // The p1 task sits in the Do quadrant.
    const doQuadrant = page.getByRole("region", { name: "P1 · Do" });
    await expect(
      doQuadrant.getByRole("link", { name: "Draft the proposal" }),
    ).toBeVisible();
  });

  test("switches to Time Sectors and shows the sector sections", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=sectors");
    for (const label of ["Inbox", "This Week", "Next Week", "Long Term"]) {
      // The section heading carries a count suffix, e.g. "Inbox (6)".
      await expect(
        page.getByRole("heading", { name: label }).first(),
      ).toBeVisible();
    }
  });

  test("the Drawer is URL-backed and Back/Forward correct", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=all");
    // Opening a task pushes a history entry (the drawer state lives in the URL).
    await page
      .getByRole("link", { name: "Draft the proposal" })
      .first()
      .click();
    await expect(page).toHaveURL(/drawer=task%3At-drawer/);
    await expect(page.getByRole("dialog")).toBeVisible();
    // Back closes the drawer; Forward reopens it.
    await page.goBack();
    await expect(page).toHaveURL(/\/tasks\?view=all$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/drawer=task%3At-drawer/);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("switching the primary view updates the URL", async ({ page }) => {
    await gotoFixture(page, "/tasks?view=all");
    await page.getByRole("link", { name: "Matrix", exact: true }).click();
    await expect(page).toHaveURL(/view=matrix/);
    await expect(
      page.getByRole("heading", { name: "P1 · Do" }).first(),
    ).toBeVisible();
  });
});

test.describe("TASKS-01 — accessibility & responsive", () => {
  test("Matrix is axe-clean in light and dark", async ({ page }) => {
    await gotoFixture(page, "/tasks?view=matrix");
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
  });

  test("the default Focus view (and All) are axe-clean in light and dark", async ({
    page,
  }) => {
    // Mirrors what the shared accessibility sweep scans: the default /tasks
    // landing (Focus → This Week, empty for the seed → EmptyState) and All.
    for (const path of ["/tasks", "/tasks?view=all"]) {
      await gotoFixture(page, path);
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "light" });
    }
  });

  test("no horizontal overflow from 320px to desktop across views", async ({
    page,
  }) => {
    for (const view of ["all", "matrix", "sectors"]) {
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await gotoFixture(page, `/tasks?view=${view}`);
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});

test.describe("TASKS-01 — mobile 375px", () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test("Matrix stacks into readable sections on a phone", async ({ page }) => {
    await gotoFixture(page, "/tasks?view=matrix");
    await expect(
      page.getByRole("heading", { name: "P1 · Do" }).first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
