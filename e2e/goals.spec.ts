import { expect, test } from "@playwright/test";

import {
  dayInMonthsAhead,
  ownerTodayIso,
  shortCalendarDate,
} from "./calendar-dates";
import {
  comboboxOption,
  RESPONSIVE_VIEWPORTS,
  expectGoalStoryOpenLink,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  goalStoryRow,
  gotoFixture,
  pickCalendarDate,
} from "./helpers";

/**
 * The two target dates the journey chooses in the picker and then reads back
 * in the product's rendered form. Derived from the owner's day, so the walk
 * to them is counted at run time and neither is a date the calendar can pass
 * (CONV-00-E).
 */
const FIRST_TARGET = dayInMonthsAhead(ownerTodayIso(), 4, 1);
const SECOND_TARGET = dayInMonthsAhead(ownerTodayIso(), 5, 1);
/** The seeded Goal under the fixture Area (`e2e/seed-tasks.sql`). */
const SEEDED_GOAL = { id: "g-launch", title: "Launch the site" } as const;

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
    const goalId = goalUrl.slice(goalUrl.lastIndexOf("/") + 1);
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
    await pickCalendarDate(datePopover, FIRST_TARGET);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText(shortCalendarDate(FIRST_TARGET)).first(),
    ).toBeVisible();

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
      SECOND_TARGET,
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Still on the Activity tab the whole time — the newest edit's event is
    // already visible, with no tab switch and no page reload. The Summary
    // (rendered alongside whichever tab is active, not a tab itself) reflects
    // the new target date too.
    await expect(activityFeed.getByText("Updated goal details")).toHaveCount(3);
    await expect(
      page.getByText(shortCalendarDate(SECOND_TARGET)).first(),
    ).toBeVisible();

    // 4. Verify persistence after navigation (reload the canonical record).
    await gotoFixture(page, goalUrl);
    await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();
    await expect(
      page.getByText(shortCalendarDate(SECOND_TARGET)).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Definition of done: Cross the/ }),
    ).toBeVisible();

    /*
     * 5. The Area's Goals tab tells this Goal's story through the shared
     * `GoalStoryRow` (STEER-03), batched with every other Goal (no per-Goal
     * fetch). The row is found by the machine key every row stamps, and its
     * open affordance by the accessible name the product composes — title,
     * then the derived answers (DEBT-215, CONV-00-B). This used to ask for a
     * Card named `Open <title>`, which the tab has not drawn since STEER-03.
     */
    await gotoFixture(page, "/areas/a-dh");
    await page.getByRole("tab", { name: "Goals" }).click();
    const goalRow = goalStoryRow(page, goalId);
    await expect(goalRow).toBeVisible();
    await expect(
      goalRow.getByText(shortCalendarDate(SECOND_TARGET)),
    ).toBeVisible();
    const openGoal = await expectGoalStoryOpenLink(goalRow, goalTitle);
    await expect(openGoal).toHaveAttribute("href", /^\/goals\//);
    await openGoal.click();
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
    // DHDS-09 — the listbox is portalled, so it is reached through the
    // combobox that owns it rather than through the dialog around the field.
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
    /*
     * Every scope the collection has, in one control the owner learns once.
     *
     * SIX since STEER-02 added the owner's own lens: All · On track · Needs
     * attention · Set aside · Completed · Deleted. "Set aside" is a lens over
     * a STORED owner condition rather than a derived status, which is why it
     * sits beside the derived ones rather than among them, and Deleted stays
     * last as the rail's least-frequent destination.
     */
    await expect(rail.locator(".dh-viewtabs__tab")).toHaveCount(6);
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
    // The seeded Goal's row on the Area's Goals tab, opened through the shared
    // row's own accessible name (STEER-03; DEBT-215).
    await (
      await expectGoalStoryOpenLink(
        goalStoryRow(page, SEEDED_GOAL.id),
        SEEDED_GOAL.title,
      )
    ).click();
    await expect(page).toHaveURL(new RegExp(`/goals/${SEEDED_GOAL.id}$`));
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
