import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * PROJ-01 — the Projects module, driven end to end against the development-auth
 * server over real (seeded) D1. Role-based and non-brittle: browse real projects,
 * open a project through normal navigation, verify its Area/Goal, create a task,
 * open it in the SAME shared Task Drawer used on Today, complete it and see the
 * roll-up progress change, test Back/Forward/Escape + focus restoration, reload for
 * persistence, complete + reopen the project, and hold the accessibility + responsive
 * baseline. Mutations target the seeded `pr-website` / `pr-launch` projects.
 */

test.describe("PROJ-01 — Projects", () => {
  test("browses projects from the sidebar and opens one by navigation", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    // The registry-driven sidebar exposes a real Projects route.
    await page.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);

    // Real project cards render with their Area context.
    const card = page.getByRole("link", { name: "Open Website relaunch" });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("href", "/projects/pr-website");

    // Selecting a project opens its overview through normal client navigation.
    await card.click();
    await expect(page).toHaveURL(/\/projects\/pr-website/);
    await expect(
      page.getByRole("heading", { name: "Website relaunch" }),
    ).toBeVisible();
    // The Area context is resolved from the hierarchy (not a copied label).
    await expect(page.getByText("DalyHub V2").first()).toBeVisible();
  });

  test("resolves a goal-advancing project's Goal and Area", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-launch");
    await expect(
      page.getByRole("heading", { name: "Launch checklist" }),
    ).toBeVisible();
    // The Goal is shown, and the Area is resolved THROUGH the Goal.
    await expect(page.getByText("Launch the site").first()).toBeVisible();
    await expect(page.getByText("DalyHub V2").first()).toBeVisible();
  });

  test("creates a task, opens it in the shared Drawer, completes it, and progress updates", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-website");

    const progress = page.locator(".dh-project-overview__progress");
    const before = (await progress.textContent()) ?? "";

    // Add a task through the shared create Drawer.
    await page.getByRole("link", { name: "Add task" }).first().click();
    const createDialog = page.getByRole("dialog", { name: "New task" });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/Title/).fill("E2E launch task");
    await createDialog.getByRole("button", { name: "Add task" }).click();

    // The new task opens in the SAME shared Task Drawer (deep-linkable URL).
    const taskDialog = page.getByRole("dialog");
    await expect(
      taskDialog.getByRole("heading", { name: "E2E launch task" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/drawer=task%3A/);

    // Complete the task through the shared Drawer.
    await taskDialog.getByRole("checkbox", { name: /Mark complete/ }).check();
    await expect(
      taskDialog.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();

    // Close the Drawer; the project roll-up progress reflects the change.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => (await progress.textContent()) ?? "")
      .not.toBe(before);

    // The completed task persists after a reload (seen under the Completed filter).
    await page.reload();
    await page.getByRole("link", { name: "Completed", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Open E2E launch task" }).first(),
    ).toBeVisible();
  });

  test("Back / Forward / Escape and focus restoration for an opened task", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-website");
    const taskLink = page
      .getByRole("link", { name: "Open Design the homepage" })
      .first();
    await taskLink.focus();
    await taskLink.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/drawer=task%3Apt-design/);

    // Back closes; Forward reopens (the stack lives in the URL — DS-03).
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Escape closes and restores focus to the originating task card link.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(taskLink).toBeFocused();
  });

  test("completes and reopens the project (tasks are untouched)", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-launch");

    await page.getByRole("button", { name: "Complete project" }).click();
    await expect(
      page.getByRole("button", { name: "Reopen project" }),
    ).toBeVisible();
    await expect(page.getByText("Completed").first()).toBeVisible();

    await page.getByRole("button", { name: "Reopen project" }).click();
    await expect(
      page.getByRole("button", { name: "Complete project" }),
    ).toBeVisible();
  });

  test("Today's Continue working opens the SAME canonical project record", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const section = page.getByRole("region", { name: "Continue working" });
    const link = section.getByRole("link", { name: "Open Website relaunch" });
    await expect(link).toHaveAttribute("href", "/projects/pr-website");
    await link.click();
    await expect(page).toHaveURL(/\/projects\/pr-website/);
    await expect(
      page.getByRole("heading", { name: "Website relaunch" }),
    ).toBeVisible();
  });

  test("is accessible: axe clean on the record and with the task Drawer open", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    await expectNoAxeViolations(page);

    await gotoFixture(page, "/projects/pr-website?drawer=task%3Apt-design");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("has no horizontal overflow across the responsive matrix", async ({
    page,
  }) => {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/projects/pr-website");
      await expect(
        page.getByRole("heading", { name: "Website relaunch" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test("meets touch targets on the narrow layout", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/projects");
    // The state-segment controls meet the 44px touch target.
    await expectMinTouchTarget(
      page.getByRole("link", { name: "Completed", exact: true }),
    );
  });
});
