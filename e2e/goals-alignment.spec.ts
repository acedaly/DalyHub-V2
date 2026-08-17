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
    const newProjectDialog = page.getByRole("dialog", { name: "New Project" });
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
    const newTaskDialog = page.getByRole("dialog", { name: "New Task" });
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

    /*
     * ── Where the alignment WORD lives on this surface ─────────────────────
     * REDESIGN-04 (#184) replaced the Goals gallery with the master–detail
     * workspace, and made a deliberate, recorded decision about ADR-040's
     * alignment state: the ROW does not draw it — a bar beside a row already
     * answers "how is it going?", and a second state word next to it competes
     * with the measure — so it is carried by the row's ACCESSIBLE NAME
     * (`openAriaLabel` in `GoalWorkspace`) and shown in full on the pane
     * beside the list, which step 4 below asserts.
     *
     * So this step asserts ATTRIBUTION — that the Goal this test just gave
     * genuinely recent Task activity is classified `active`, and the seeded
     * 2020-anchored Goal is not — through the name the product actually
     * publishes. The rule under test is unchanged; only the assumption that
     * the word is a visible text node has been dropped, and it was dropped by
     * #184, not by the audit implementation.
     */
    const activeCard = page.getByRole("article", { name: goalTitle });
    await expect(activeCard).toBeVisible();
    await expect(
      activeCard.getByRole("link", { name: /Recently active/ }),
    ).toBeVisible();

    /*
     * The seeded Goal has a contributing Project but no recent Task activity,
     * so it reads `neglected` with the honest reason attached to the same
     * name. The reason sentence is NOT a separate visible paragraph on the
     * row — it would restate, in a list, what the pane explains in full.
     */
    const neglectedCard = page.getByRole("article", { name: "Learn Spanish" });
    await expect(neglectedCard).toBeVisible();
    await expect(
      neglectedCard.getByRole("link", { name: /No recent action/ }),
    ).toBeVisible();
    /*
     * And it draws NO meter. `Learn Spanish` is seeded with a contributing
     * Project but no measurable target, and REDESIGN-04's rule for that case is
     * explicit — "no bar, and no zero, for a Goal nothing advances"
     * (`goalRowValue` returns `null` and the row draws no track). A 0% bar here
     * would be fabricated precision: it would state a measurement the owner
     * never asked for, in the position the eye reads as progress.
     *
     * This replaces an assertion that the card DID draw a bar, which described
     * the M3X-02 Goal card that #184 retired along with the gallery.
     */
    await expect(neglectedCard.getByRole("progressbar")).toHaveCount(0);
    await expect(
      neglectedCard.getByText(
        "Projects exist, but no recent Task activity was found.",
      ),
    ).toHaveCount(0);

    /*
     * 3. Keyboard operation: focus the active Goal's row link and activate it
     * with Enter (no pointer).
     *
     * REDESIGN-04 made `/goals` a master–detail workspace, so activating a row
     * is a change of SELECTION rather than a change of page: it stays on
     * `/goals` and updates the pane beside the list, which is what makes Back
     * leave the workspace instead of walking every Goal the owner glanced at.
     * The keyboard contract under test — reachable, focusable, Enter opens the
     * Goal — is unchanged; only the destination is the workspace's own URL.
     */
    const openLink = activeCard.getByRole("link", {
      name: new RegExp(goalTitle),
    });
    await openLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/goals\?goal=/);
    /*
     * Scoped to the PANE, because on a master–detail workspace the Goal's name
     * is legitimately on screen twice — once as the selected row's heading and
     * once as the pane's. Asking the page for "the heading called X" is a
     * question with two right answers there; the one this step is making a claim
     * about is the pane, since the claim is "the pane opened on this Goal".
     */
    await expect(
      page.getByTestId("goal-workspace-pane").getByRole("heading", {
        name: goalTitle,
      }),
    ).toBeVisible();

    /*
     * 4. The Goal RECORD's summary explains WHY this Goal reads as active, and
     * lists the real contributing Task with working navigation.
     *
     * RECORD-01 — the alignment STATE is the summary band's chip beside the
     * contribution meter it explains, and its reasons are the band's signal
     * line. The evidence keeps its own section, headed "Recent contribution"
     * and rendered only where there is evidence.
     */
    await gotoFixture(page, goalUrl);
    const goalSummary = page.getByRole("region", { name: "Summary" });
    await expect(goalSummary.getByText("Recently active")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Recent contribution", exact: true }),
    ).toBeVisible();
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
    // The band's signal line carries the reason, with no full browser refresh.
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
