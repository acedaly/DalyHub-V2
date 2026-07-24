import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

test.describe("AREA-02 — Goals", () => {
  test("create, edit details, link a Project, complete/reopen, review Activity", async ({
    page,
  }) => {
    const stamp = Date.now();
    const goalTitle = `Goal e2e ${stamp}`;
    const projectTitle = `Goal e2e project ${stamp}`;

    // 1. Navigate to the existing fixture Area and open New Goal.
    await gotoFixture(page, "/areas/a-dh");
    await page.getByRole("tab", { name: "Goals" }).click();
    await page.getByRole("link", { name: "New Goal" }).first().click();
    const newGoalDialog = page.getByRole("dialog", { name: "New Goal" });
    await expect(newGoalDialog).toBeVisible();
    await expectNoAxeViolations(page);

    await newGoalDialog.getByRole("button", { name: "Create Goal" }).click();
    await expect(
      newGoalDialog.getByText("A title is required").first(),
    ).toBeVisible();

    await newGoalDialog.getByLabel(/Title/).fill(goalTitle);
    await newGoalDialog.getByRole("button", { name: "Create Goal" }).click();

    // 2. Lands on the canonical /goals/:goalId record.
    await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);
    const goalUrl = page.url();
    await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(
      breadcrumb.getByRole("link", { name: "Areas" }),
    ).toHaveAttribute("href", "/areas");
    await expect(breadcrumb.getByText("DalyHub V2")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.locator(".record-status")).toHaveText(/Open/);
    await expect(page.getByText("No Projects contributing yet")).toBeVisible();
    await expect(
      page.getByText("No definition of done recorded yet."),
    ).toBeVisible();
    await expect(page.getByText("No target date set")).toBeVisible();

    // 3. Set target date and definition of done via the "Edit details" Drawer.
    const editDetailsButton = page.getByRole("button", {
      name: "Edit details",
    });
    await editDetailsButton.focus();
    await editDetailsButton.click();
    const detailsDialog = page.getByRole("dialog", { name: "Goal details" });
    await expect(detailsDialog).toBeVisible();
    await expectNoAxeViolations(page);

    // Focus restoration: Escape returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editDetailsButton).toBeFocused();

    await editDetailsButton.click();
    await detailsDialog.getByLabel(/Target date/).fill("2027-01-01");
    await detailsDialog
      .getByLabel(/Definition of done/)
      .fill("Cross the finish line.\nCelebrate with the team.");
    await detailsDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await expect(page.getByText(/1 Jan 2027/).first()).toBeVisible();
    await expect(page.getByText("Cross the finish line.")).toBeVisible();

    // 3b. Regression: with the Activity tab already open (no navigation, no
    // reload), a SECOND details-only edit is reflected immediately. The
    // details mutation only touches `goal_details`, never the spine record —
    // the Activity tab's reload key must be the Goal's EFFECTIVE updatedAt
    // (the later of the two) for the Timeline to notice and refetch.
    await page.getByRole("tab", { name: "Activity" }).click();
    const activityFeed = page.getByRole("feed", { name: "Goal activity" });
    await expect(activityFeed.getByText("Updated goal details")).toHaveCount(1);

    await editDetailsButton.click();
    await detailsDialog.getByLabel(/Target date/).fill("2027-02-01");
    await detailsDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Still on the Activity tab the whole time — the second edit's event is
    // already visible, with no tab switch and no page reload. The Summary
    // (rendered alongside whichever tab is active, not a tab itself) reflects
    // the new target date too.
    await expect(activityFeed.getByText("Updated goal details")).toHaveCount(2);
    await expect(page.getByText(/1 Feb 2027/).first()).toBeVisible();

    // 4. Verify persistence after navigation (reload the canonical record).
    await gotoFixture(page, goalUrl);
    await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();
    await expect(page.getByText(/1 Feb 2027/).first()).toBeVisible();
    await expect(page.getByText("Cross the finish line.")).toBeVisible();

    // 5. The Area Goal card links back to the canonical record and shows the
    // target date, batched with every other Goal card (no per-Goal fetch).
    await gotoFixture(page, "/areas/a-dh");
    await page.getByRole("tab", { name: "Goals" }).click();
    const goalCard = page.getByRole("article", { name: goalTitle });
    await expect(goalCard).toBeVisible();
    await expect(goalCard.getByText("1 Feb 2027")).toBeVisible();
    await goalCard.getByRole("link", { name: `Open ${goalTitle}` }).click();
    await expect(page).toHaveURL(goalUrl);

    // 6. Create a Project through the EXISTING New Project flow, selecting
    // this new Goal via the searchable Area/Goal picker — proving a Goal
    // created through AREA-02 is a valid Project parent with no second
    // Goal-selection model.
    await gotoFixture(page, "/projects");
    await page.getByRole("link", { name: "New project" }).first().click();
    const newProjectDialog = page.getByRole("dialog", { name: "New project" });
    const combo = newProjectDialog.getByRole("combobox", {
      name: /Area or Goal/,
    });
    await combo.click();
    await combo.fill(goalTitle);
    const goalOption = newProjectDialog.getByRole("option", {
      name: new RegExp(goalTitle),
    });
    await expect(goalOption).toBeVisible();
    await goalOption.click();
    await newProjectDialog.getByLabel(/Title/).fill(projectTitle);
    await newProjectDialog
      .getByRole("button", { name: "Create project" })
      .click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);
    await expect(
      page.getByRole("heading", { name: projectTitle }),
    ).toBeVisible();

    // 7. The linked Project now contributes to the Goal's derived progress.
    await gotoFixture(page, goalUrl);
    await page.getByRole("tab", { name: /Projects/ }).click();
    await expect(
      page.getByRole("link", { name: `Open ${projectTitle}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: /Projects/ }).first(),
    ).toHaveText("Projects1");
    await expect(page.getByText("0 of 1 Project complete")).toBeVisible();

    // 8. Complete, then reopen — explicit completion, kept separate from the
    // (still-incomplete) derived Project progress.
    const completeButton = page.getByRole("button", { name: "Complete" });
    await completeButton.click();
    await expect(page.locator(".record-status")).toHaveText(/Completed/);
    await expect(page.getByText("0 of 1 Project complete")).toBeVisible();
    const reopenButton = page.getByRole("button", { name: "Reopen" });
    await reopenButton.click();
    await expect(page.locator(".record-status")).toHaveText(/Open/);

    // 9. Review Activity.
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Goal activity" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("feed", { name: "Goal activity" })
        .getByRole("article")
        .first(),
    ).toBeVisible();

    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("has no horizontal overflow across representative desktop and mobile widths", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas/a-dh");
    await page.getByRole("tab", { name: "Goals" }).click();
    await page.getByRole("link", { name: "Open Launch the site" }).click();
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
  });
});
