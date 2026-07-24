import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * AREA-04 — mobile-complete Areas & Goals.
 *
 * A real phone journey over the seeded Worker/D1 app, mirroring the
 * TODAY-06/PROJ-06 real-D1 mobile precedent (`today-mobile.spec.ts`,
 * `projects-mobile.spec.ts`): enter Areas from the mobile shell, create an
 * Area, drive its Summary/Goals/Projects/Activity tabs, create a Goal under
 * it, land on the canonical Goal record, edit its target date + definition of
 * done, complete and reopen it, create a Project + Task that advances it (so
 * its Alignment reads "Recently active" with real evidence), navigate the
 * Goal's Projects tab, open the `/goals` Alignment collection and see both an
 * active and a neglected Goal with an honest explanation, and prove
 * route-backed Drawer history, focus restoration, keyboard operation, touch
 * targets, axe cleanliness and no horizontal overflow throughout.
 *
 * Every alignment state is NOT re-created here (that would make one journey
 * brittle) — the pure evaluator's full state matrix (`completed`,
 * `no_structure`, `unreachable`, `active`, `neglected`) is covered by
 * `test/unit/alignment` and `test/unit/goals`; this journey proves two
 * REPRESENTATIVE states end to end (a Goal made active live through the UI,
 * and the permanently-seeded `g-align-neglected` Goal) exactly as
 * `goals-alignment.spec.ts` already establishes for desktop.
 */

const PHONE = { width: 390, height: 844 };
const SHORT_PHONE = { width: 320, height: 568 };
const AREA_TITLE_PREFIX = "Mobile AreaGoal workflow area ";
const GOAL_TITLE_PREFIX = "Mobile AreaGoal workflow goal ";
const PROJECT_TITLE_PREFIX = "Mobile AreaGoal workflow project ";
const TASK_TITLE_PREFIX = "Mobile AreaGoal workflow task ";

const MOBILE_ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = 'local-dev-workspace'
    AND (
      (type = 'area' AND title LIKE '${AREA_TITLE_PREFIX}%')
      OR (type = 'goal' AND title LIKE '${GOAL_TITLE_PREFIX}%')
      OR (type = 'project' AND title LIKE '${PROJECT_TITLE_PREFIX}%')
      OR (type = 'task' AND title LIKE '${TASK_TITLE_PREFIX}%')
    )
`;
const MOBILE_CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM task_details WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM project_details WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM goal_details WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM spine_records WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${MOBILE_ENTITY_QUERY});`,
  `DELETE FROM entity_links WHERE workspace_id = 'local-dev-workspace' AND (source_entity_id IN (${MOBILE_ENTITY_QUERY}) OR target_entity_id IN (${MOBILE_ENTITY_QUERY}));`,
  `DELETE FROM entities WHERE workspace_id = 'local-dev-workspace' AND id IN (${MOBILE_ENTITY_QUERY});`,
] as const;

function cleanupMobileFixtures() {
  for (const command of MOBILE_CLEANUP_SQL) {
    execFileSync(
      "pnpm",
      [
        "exec",
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--local",
        "--command",
        command,
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        stdio: "pipe",
      },
    );
  }
}

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

async function enterAreasFromMobileShell(page: Page) {
  await gotoFixture(page, "/today");
  const navButton = page.getByRole("button", { name: /open navigation/i });
  await expectMinTouchTarget(navButton);
  await navButton.click();

  const navSheet = page.getByRole("dialog", { name: /navigation/i });
  await expect(navSheet).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await navSheet.getByRole("link", { name: "Areas", exact: true }).click();

  await expect(page).toHaveURL(/\/areas$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Areas" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

test.describe("AREA-04 — mobile Areas & Goals", () => {
  test.beforeAll(() => cleanupMobileFixtures());
  test.afterEach(() => cleanupMobileFixtures());

  test("drives the complete Areas & Goals workflow on a phone", async ({
    page,
  }) => {
    const stamp = Date.now();
    const areaTitle = `${AREA_TITLE_PREFIX}${stamp} with a very long owner-visible name that must wrap calmly on a narrow phone`;
    const goalTitle = `${GOAL_TITLE_PREFIX}${stamp}`;
    const projectTitle = `${PROJECT_TITLE_PREFIX}${stamp}`;
    const taskTitle = `${TASK_TITLE_PREFIX}${stamp}`;

    // 1. Mobile navigation to Areas.
    await enterAreasFromMobileShell(page);

    // 2. Create an Area through the New Area sheet (route-backed Drawer).
    const newAreaTrigger = page.getByRole("link", { name: "New Area" }).first();
    await expectMinTouchTarget(newAreaTrigger);
    await newAreaTrigger.focus();
    await newAreaTrigger.click();
    const newAreaDialog = page.getByRole("dialog", { name: "New Area" });
    await expect(newAreaDialog).toBeVisible();
    await expect(page).toHaveURL(/drawer=new-area/);
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    // Escape closes it and restores focus to the trigger (no lost context).
    await page.keyboard.press("Escape");
    await expect(newAreaDialog).toHaveCount(0);
    await expect(newAreaTrigger).toBeFocused();

    // 12 (New Area). Browser Back/Forward for this route-backed Drawer too,
    // with focus restored once it's closed again.
    await newAreaTrigger.click();
    await expect(newAreaDialog).toBeVisible();
    await page.goBack();
    await expect(newAreaDialog).toHaveCount(0);
    await page.goForward();
    await expect(newAreaDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(newAreaDialog).toHaveCount(0);
    await expect(newAreaTrigger).toBeFocused();

    await newAreaTrigger.click();
    await newAreaDialog.getByLabel(/Title/).fill(areaTitle);
    await newAreaDialog.getByRole("button", { name: "Create Area" }).click();
    await expect(page).toHaveURL(/\/areas\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: areaTitle })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 3. Area record navigation across Summary, Goals, Projects, Activity.
    await expect(page.getByText("No active work")).toBeVisible();
    for (const tabName of ["Goals", "Projects", "Activity"] as const) {
      const tab = page.getByRole("tab", { name: tabName });
      await expectMinTouchTarget(tab);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expectNoHorizontalOverflow(page);
    }
    await expect(
      page.getByRole("feed", { name: "Area activity" }),
    ).toBeVisible();

    // 4. Create a Goal under the Area (route-backed New Goal Drawer).
    await page.getByRole("tab", { name: "Goals" }).click();
    const newGoalTrigger = page.getByRole("link", { name: "New Goal" }).first();
    await expectMinTouchTarget(newGoalTrigger);
    await newGoalTrigger.click();
    const newGoalDialog = page.getByRole("dialog", { name: "New Goal" });
    await expect(newGoalDialog).toBeVisible();
    await expect(page).toHaveURL(/drawer=new-goal/);
    await expectNoAxeViolations(page);

    // 12 (New Goal). Browser Back/Forward for this route-backed Drawer, with
    // focus restored to its trigger once closed again.
    await page.goBack();
    await expect(newGoalDialog).toHaveCount(0);
    await page.goForward();
    await expect(newGoalDialog).toBeVisible();

    await newGoalDialog.getByLabel(/Title/).fill(goalTitle);
    await newGoalDialog.getByRole("button", { name: "Create Goal" }).click();

    // 5. Lands on the canonical Goal record.
    await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);
    const goalUrl = page.url();
    await expect(page.getByRole("heading", { name: goalTitle })).toBeVisible();
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByText(areaTitle)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    // 6. Edit Goal details: target date + definition of done, via the
    // route-backed Drawer, with focus restoration on close.
    const editDetailsButton = page.getByRole("button", {
      name: "Edit details",
    });
    await expectMinTouchTarget(editDetailsButton);
    await editDetailsButton.focus();
    await editDetailsButton.click();
    const detailsDialog = page.getByRole("dialog", { name: "Goal details" });
    await expect(detailsDialog).toBeVisible();
    await expect(page).toHaveURL(/drawer=edit-details/);
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(detailsDialog).toHaveCount(0);
    await expect(editDetailsButton).toBeFocused();

    await editDetailsButton.click();
    await detailsDialog.getByLabel(/Target date/).fill("2027-03-15");
    await detailsDialog
      .getByLabel(/Definition of done/)
      .fill(
        "A long definition of done that spans several sentences and must wrap without any horizontal overflow on a narrow phone viewport.\nA second line after an explicit break.",
      );
    await expectNoHorizontalOverflow(page);
    await detailsDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/15 Mar 2027/).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 12 (part 1). Browser Back/Forward for a route-backed Drawer.
    await editDetailsButton.click();
    await expect(detailsDialog).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(detailsDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // 7. Complete, then reopen — explicit completion stays visually distinct
    // from derived Project-contribution progress.
    const completeButton = page.getByRole("button", { name: "Complete" });
    await expectMinTouchTarget(completeButton);
    await completeButton.click();
    await expect(page.locator(".record-status")).toHaveText(/Completed/);
    const reopenButton = page.getByRole("button", { name: "Reopen" });
    await expectMinTouchTarget(reopenButton);
    await reopenButton.click();
    await expect(page.locator(".record-status")).toHaveText(/Open/);
    await expectNoHorizontalOverflow(page);

    // 8. Create a Project (and a Task on it) that advances this Goal, live
    // through the UI, so the Goal's Alignment reads "Recently active" with
    // real evidence.
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
    await expectNoHorizontalOverflow(page);
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

    // 9. Navigate back to the canonical Goal record and its Projects tab.
    await gotoFixture(page, goalUrl);
    await page.getByRole("tab", { name: /Projects/ }).click();
    const projectLink = page.getByRole("link", {
      name: `Open ${projectTitle}`,
    });
    await expect(projectLink).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);
    await expect(
      page.getByRole("heading", { name: projectTitle }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(goalUrl);

    // 10. Open the Goals Alignment collection and see the just-created Goal
    // "Recently active", plus the permanently-seeded neglected Goal.
    await gotoFixture(page, "/goals");
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

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

    // 14. Keyboard operation: focus + Enter opens the active Goal (no pointer).
    const openActiveLink = activeCard.getByRole("link", {
      name: `Open ${goalTitle}`,
    });
    await openActiveLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(goalUrl);

    // 11. The Alignment Summary panel explains WHY, with working evidence
    // navigation to the real contributing Task via the shared Drawer.
    await expect(
      page.getByRole("heading", { name: "Alignment", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Recently active")).toBeVisible();
    const taskButton = page.getByRole("button", { name: taskTitle });
    await expect(taskButton).toBeVisible();
    await expectMinTouchTarget(taskButton);
    await taskButton.click();
    const taskDialog = page.getByRole("dialog");
    await expect(
      taskDialog.getByRole("heading", { name: taskTitle }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // 12 (Task Drawer). Browser Back/Forward for the Alignment evidence's
    // Task Drawer too, before closing it and restoring focus to the trigger.
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(taskDialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(taskButton).toBeFocused();

    // 13/15/17. Final accessibility + overflow baseline for the whole journey.
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("keeps the New Area sheet and Goal details usable on a short mobile viewport", async ({
    page,
  }) => {
    await page.setViewportSize(SHORT_PHONE);
    await gotoFixture(page, "/areas");
    await expectNoHorizontalOverflow(page);

    const trigger = page.getByRole("link", { name: "New Area" }).first();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "New Area" });
    await expect(dialog).toBeVisible();
    await expectMinTouchTarget(
      dialog.getByRole("button", { name: "Create Area" }),
    );
    await expectMinTouchTarget(dialog.getByRole("button", { name: "Cancel" }));
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await gotoFixture(page, "/goals/g-launch");
    await page.getByRole("button", { name: "Edit details" }).click();
    const detailsDialog = page.getByRole("dialog", { name: "Goal details" });
    await expect(detailsDialog).toBeVisible();
    await detailsDialog
      .getByLabel(/Definition of done/)
      .fill(
        "A long definition of done that must remain scrollable within the sheet and keep Save reachable on a short 568px-tall mobile viewport without being obscured.",
      );
    await expectNoHorizontalOverflow(page);
    await expectMinTouchTarget(
      detailsDialog.getByRole("button", { name: "Save" }),
    );
    await expectMinTouchTarget(
      detailsDialog.getByRole("button", { name: "Cancel" }),
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("wraps a long parent breadcrumb without a floating separator on a narrow phone", async ({
    page,
  }) => {
    // Regression coverage for the DS-02 RecordHeader breadcrumb fix: a long
    // Area title must wrap inside the breadcrumb without the "/" separator
    // detaching from the wrapped label (it used to render as a sibling flex
    // item, centred against the whole wrapped block instead of the label's
    // first line — see record-layout.css).
    await page.setViewportSize({ width: 320, height: 720 });
    const stamp = Date.now();
    const areaTitle = `${AREA_TITLE_PREFIX}${stamp} — a long enough title that it must wrap across several lines in the breadcrumb of any Goal underneath it`;
    const goalTitle = `${GOAL_TITLE_PREFIX}${stamp}`;

    await gotoFixture(page, "/areas");
    await page.getByRole("link", { name: "New Area" }).first().click();
    const newAreaDialog = page.getByRole("dialog", { name: "New Area" });
    await newAreaDialog.getByLabel(/Title/).fill(areaTitle);
    await newAreaDialog.getByRole("button", { name: "Create Area" }).click();
    await expect(page).toHaveURL(/\/areas\/[^/?#]+$/);

    await page.getByRole("tab", { name: "Goals" }).click();
    await page.getByRole("link", { name: "New Goal" }).first().click();
    const newGoalDialog = page.getByRole("dialog", { name: "New Goal" });
    await newGoalDialog.getByLabel(/Title/).fill(goalTitle);
    await newGoalDialog.getByRole("button", { name: "Create Goal" }).click();
    await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);

    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByRole("link", { name: "Areas" })).toBeVisible();
    await expect(breadcrumb.getByText(areaTitle)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Guards the root cause directly: the breadcrumb crumb must stay in
    // normal inline flow (not `flex`/`inline-flex`), or its separator can
    // detach from the wrapped label again.
    const liDisplay = await breadcrumb
      .locator("li")
      .nth(1)
      .evaluate((el) => getComputedStyle(el).display);
    expect(liDisplay).not.toMatch(/flex/);
  });
});
