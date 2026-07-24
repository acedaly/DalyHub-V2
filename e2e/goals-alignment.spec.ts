import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * AREA-03 — the Alignment view (`/goals` collection + the Goal record's
 * Alignment Summary panel), driven end to end over real (seeded) D1 (ADR-040).
 *
 * Uses ONE wall-clock-INDEPENDENT seeded Goal (`g-align-neglected`, its only
 * qualifying Task activity anchored in 2020 — mirrors PROJ-02's
 * `pr-stale`/`pht-stale` pattern) to prove the `neglected` state and its
 * reason, and creates a SECOND Goal + Project + Task live through the UI (so
 * its Task activity is genuinely recent) to prove the `active` state and
 * real evidence links end to end. Verifies correct attribution, an
 * understandable neglected reason, navigation to the canonical Goal/Project/
 * Task records, keyboard operation, axe cleanliness, no horizontal overflow
 * at phone and desktop widths, and that completing the Goal updates the
 * Alignment panel via revalidation with no full browser refresh.
 */

test.describe("AREA-03 — Alignment view", () => {
  test("attributes recent activity, surfaces a neglected Goal with an understandable reason, and navigates to real records", async ({
    page,
  }) => {
    const stamp = Date.now();
    const goalTitle = `Alignment e2e ${stamp}`;
    const projectTitle = `Alignment e2e project ${stamp}`;
    const taskTitle = `Alignment e2e task ${stamp}`;

    // 1. Create a Goal, a Project advancing it, and a Task under that
    // Project — all live through the UI, so this Goal's activity is
    // genuinely recent (no seeded/backdated data).
    await gotoFixture(page, "/areas/a-dh");
    await page.getByRole("tab", { name: "Goals" }).click();
    await page.getByRole("link", { name: "New Goal" }).first().click();
    const newGoalDialog = page.getByRole("dialog", { name: "New Goal" });
    await newGoalDialog.getByLabel(/Title/).fill(goalTitle);
    await newGoalDialog.getByRole("button", { name: "Create Goal" }).click();
    await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);
    const goalUrl = page.url();

    await gotoFixture(page, "/projects");
    await page.getByRole("link", { name: "New project" }).first().click();
    const newProjectDialog = page.getByRole("dialog", { name: "New project" });
    const combo = newProjectDialog.getByRole("combobox", {
      name: /Area or Goal/,
    });
    await combo.click();
    await combo.fill(goalTitle);
    await newProjectDialog
      .getByRole("option", { name: new RegExp(goalTitle) })
      .click();
    await newProjectDialog.getByLabel(/Title/).fill(projectTitle);
    await newProjectDialog
      .getByRole("button", { name: "Create project" })
      .click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);

    await page.getByRole("link", { name: "Add task" }).first().click();
    const newTaskDialog = page.getByRole("dialog", { name: "New task" });
    await newTaskDialog.getByLabel(/Title/).fill(taskTitle);
    await newTaskDialog.getByRole("button", { name: "Add task" }).click();
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: taskTitle }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 2. The Alignment collection shows BOTH Goals with correctly attributed
    // states: the live-created Goal is "Recently active"; the seeded Goal
    // (its only activity anchored in 2020) is "No recent action" with an
    // understandable, honest reason grounded in real facts.
    await gotoFixture(page, "/goals");
    await expectNoAxeViolations(page);

    const activeCard = page.getByRole("article", { name: goalTitle });
    await expect(activeCard).toBeVisible();
    await expect(activeCard.getByText("Recently active")).toBeVisible();

    const neglectedCard = page.getByRole("article", { name: "Learn Spanish" });
    await expect(neglectedCard).toBeVisible();
    await expect(neglectedCard.getByText("No recent action")).toBeVisible();
    await expect(
      neglectedCard.getByText(
        "Projects exist, but no recent Task activity was found.",
      ),
    ).toBeVisible();

    // 3. Keyboard operation: focus the active Goal's open link and activate
    // it with Enter (no pointer), landing on the canonical Goal record.
    const openLink = activeCard.getByRole("link", {
      name: `Open ${goalTitle}`,
    });
    await openLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(goalUrl);
    await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();

    // 4. The Alignment Summary panel explains WHY this Goal reads as active,
    // and lists the real contributing Task with working navigation.
    await expect(
      page.getByRole("heading", { name: "Alignment", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Recently active")).toBeVisible();
    const taskButton = page.getByRole("button", { name: taskTitle });
    await expect(taskButton).toBeVisible();
    await expect(
      page.getByRole("link", { name: projectTitle, exact: true }),
    ).toHaveAttribute("href", /\/projects\//);

    // Follow the Project link to the canonical Project record.
    await page.getByRole("link", { name: projectTitle, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: projectTitle }),
    ).toBeVisible();

    // Back to the Goal record, open the Task via the shared Drawer.
    await gotoFixture(page, goalUrl);
    await page.getByRole("button", { name: taskTitle }).click();
    const taskDialog = page.getByRole("dialog");
    await expect(
      taskDialog.getByRole("heading", { name: taskTitle }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 5. Completing the Goal updates the Alignment panel to "Completed" via
    // revalidation — no full browser refresh.
    await page.getByRole("button", { name: "Complete" }).click();
    await expect(page.locator(".record-status")).toHaveText(/Completed/);
    await expect(
      page.getByRole("heading", { name: "Alignment", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("This Goal is already completed."),
    ).toBeVisible();
    // Reopen so a re-run of this journey starts from the same known state.
    await page.getByRole("button", { name: "Reopen" }).click();
    await expect(page.locator(".record-status")).toHaveText(/Open/);

    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("has no horizontal overflow across representative desktop and mobile widths", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    for (const viewport of [
      RESPONSIVE_VIEWPORTS[0],
      RESPONSIVE_VIEWPORTS[3],
      RESPONSIVE_VIEWPORTS[6],
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expectNoHorizontalOverflow(page);
    }

    await gotoFixture(page, "/goals/g-launch");
    for (const viewport of [RESPONSIVE_VIEWPORTS[0], RESPONSIVE_VIEWPORTS[5]]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expectNoHorizontalOverflow(page);
    }
  });
});
