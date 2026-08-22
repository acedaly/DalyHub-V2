import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  comboboxOption,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  pickCalendarDate,
} from "./helpers";

test.describe("AREA-02 — Goals", () => {
  test("create, edit details, link a Project, complete/reopen, review Activity", async ({
    page,
  }) => {
    /*
     * A real budget for the longest journey in this file. It creates a Goal,
     * edits its details, retargets its date through the inline picker, creates
     * and links a Project, completes and reopens the Goal, then reads the
     * Activity feed and scans it with axe — a dozen product navigations, each
     * settling the network. The default 30s was never sized for it; this is a
     * budget correction, not a retry, and every assertion is unchanged.
     */
    test.setTimeout(120_000);
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

    // 3. EDIT-02 — set the target date and the definition of done IN PLACE.
    // Both empty states are the controls, and both name the next action rather
    // than reporting an absence.
    const targetTrigger = page.getByRole("button", {
      name: "Target date: Add a target date",
    });
    const definitionTrigger = page.getByRole("button", {
      name: "Definition of done: Add a definition of done",
    });
    await expect(targetTrigger).toBeVisible();
    await expect(definitionTrigger).toBeVisible();

    // The dedicated Drawer entry points are gone — the values are the controls.
    await expect(
      page.getByRole("button", { name: "Edit details" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);

    await targetTrigger.focus();
    await targetTrigger.click();
    const datePopover = page.getByRole("dialog", { name: "Edit target date" });
    await expect(datePopover).toBeVisible();
    await expectNoAxeViolations(page);

    // Focus restoration: Escape closes and returns focus to the value.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(targetTrigger).toBeFocused();

    await targetTrigger.click();
    /*
     * CONTROL-01 — a month GRID, not a native date input, and it commits on
     * selection: a calendar day is a complete answer, so there is no Save after
     * it. The same interface the Task row's due date opens.
     */
    await pickCalendarDate(datePopover, "2027-01-01");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/1 Jan 2027/).first()).toBeVisible();

    await definitionTrigger.click();
    await page
      .getByRole("textbox", { name: "Definition of done" })
      .fill("Cross the finish line.\nCelebrate with the team.");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /^Definition of done: Cross the/ }),
    ).toBeVisible();

    // 3b. Regression: with the Activity tab already open (no navigation, no
    // reload), a FURTHER details-only edit is reflected immediately. The
    // details mutation only touches `goal_details`, never the spine record —
    // the Activity tab's reload key must be the Goal's EFFECTIVE updatedAt
    // (the later of the two) for the Timeline to notice and refetch.
    //
    // EDIT-02 — two events so far, because the target date and the definition
    // of done now save SEPARATELY (each posts only its own key, so changing one
    // can never revert the other). That is the intended trade: two honest
    // events instead of one covering a write the user did not make.
    await page.getByRole("tab", { name: "Activity" }).click();
    const activityFeed = page.getByRole("feed", { name: "Goal activity" });
    await expect(activityFeed.getByText("Updated goal details")).toHaveCount(2);

    await page.getByRole("button", { name: /^Target date: / }).click();
    await pickCalendarDate(
      page.getByRole("dialog", { name: "Edit target date" }),
      "2027-02-01",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Still on the Activity tab the whole time — the newest edit's event is
    // already visible, with no tab switch and no page reload. The Summary
    // (rendered alongside whichever tab is active, not a tab itself) reflects
    // the new target date too.
    await expect(activityFeed.getByText("Updated goal details")).toHaveCount(3);
    await expect(page.getByText(/1 Feb 2027/).first()).toBeVisible();

    // 4. Verify persistence after navigation (reload the canonical record).
    await gotoFixture(page, goalUrl);
    await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();
    await expect(page.getByText(/1 Feb 2027/).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Definition of done: Cross the/ }),
    ).toBeVisible();

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
    const newProjectDialog = page.getByRole("dialog", { name: "New Project" });
    const combo = newProjectDialog.getByRole("combobox", {
      name: /Area or Goal/,
    });
    await combo.click();
    await combo.fill(goalTitle);
    const goalOption = await comboboxOption(combo, new RegExp(goalTitle));
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

  /*
   * CONVERGE-01 §9 — ONE filter surface on Goals.
   *
   * The collection used to draw two control rails, one above the other: a
   * segmented `Active | Deleted` in the header's view slot and the four status
   * views as a tab rail beneath it. The audit's finding was the doubling, and
   * this is what "one grammar" has to mean in a browser — one rail, and nothing
   * in the header slot at all.
   */
  test("draws ONE filter rail, and the header's view slot is empty", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");

    const rail = page.getByTestId("goals-views");
    await expect(rail).toBeVisible();
    // Every scope the collection has, in one control the owner learns once.
    await expect(rail.locator(".dh-viewtabs__tab")).toHaveCount(5);
    await expect(rail.locator(".dh-viewtabs__tab").last()).toHaveText(
      "Deleted",
    );

    // Nothing left in the header's view slot — no second rail, no segmented
    // control beside the title.
    await expect(page.locator(".dh-pane-header__views")).toHaveCount(0);
    await expect(page.getByRole("group", { name: /Goal views/ })).toHaveCount(
      0,
    );
    await expectNoHorizontalOverflow(page);
  });

  test("the one rail reaches Deleted and comes back the same way", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    await page
      .getByTestId("goals-views")
      .getByRole("link", { name: "Deleted" })
      .click();
    await expect(page).toHaveURL(/state=deleted/);

    // The SAME rail is drawn on the deleted scope, with Deleted current — so
    // the way out is where the way in was, and the counts are gone because they
    // describe the active page.
    const rail = page.getByTestId("goals-views");
    await expect(rail.getByRole("link", { name: "Deleted" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(rail.getByRole("link", { name: "All" })).toBeVisible();

    await rail.getByRole("link", { name: "All" }).click();
    await expect(page).not.toHaveURL(/state=deleted/);
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
