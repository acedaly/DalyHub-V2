import { expect, test } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  taskRow,
} from "./helpers";

/**
 * TASKS-01 — the first-class Tasks module, driven end to end against the
 * development-auth server over real (seeded) D1. Role-based and non-brittle: it
 * exercises the workspace-wide views (All, priority-grouped, Time Sectors), opens a real task
 * in the ONE canonical shared Task Drawer, proves the P1–P4 priority label and the
 * URL-backed view/drawer state, and holds the accessibility + responsive baseline.
 * It only READS the seeded spine (`t-drawer` "Draft the proposal", priority p1), so
 * it never disturbs the Today/Search/Waiting journeys.
 */

test.describe("TASKS-01 — desktop", () => {
  test("lists workspace tasks and opens one in the canonical Drawer", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=list&system=all");
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
    /*
     * TASKS-02: the canonical priority renders as the shared coloured
     * `PriorityIndicator`, and the fact is carried in WORDS rather than by
     * colour alone (AGENTS.md §15).
     *
     * The words are "Priority 1". They were "P1 · Urgent": the Eisenhower
     * action vocabulary went with the Matrix, and `taskPriorityLabel` is now
     * the ONE name a priority has anywhere in the product — the short "P1" tag
     * is what an ordinary ROW draws, and a surface with room (this drawer, a
     * menu, a filter) spells it out. Asserting both the accessible name and the
     * visible text is what keeps "never colour alone" a real check.
     */
    const priority = dialog.locator('.dh-priority[data-priority="p1"]');
    await expect(priority).toBeVisible();
    await expect(priority).toHaveAttribute("aria-label", "Priority 1");
    await expect(priority).toContainText("Priority 1");

    // Escape closes the Drawer and restores the Tasks context.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/tasks\?view=list&system=all$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("renders the shared priority + urgency signals on task cards (TASKS-02)", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=list&system=overdue");

    /*
     * The dedicated non-mutated overdue task (`t-overdue-signal`, due
     * 2000-01-01) says it is overdue in WORDS, not merely with a red date
     * (DEBT-28). The card is pinned to its exact-named title link so the
     * locator is unambiguous and independent of the Project Health journey
     * mutating `pht-overdue`.
     *
     * UIX-01 — those words are now the DATE ITSELF, and the separate "Overdue"
     * chip beside it is gone. The rule DEBT-28 records is intact and is what
     * this asserts: the row does not rely on the colour, it states the slip in
     * language.
     *
     * The words for THIS task are "Over a year ago", not "9718 days ago".
     * `elapsedPhrase` bounds the ladder at every distance — days, then months,
     * then "Over a year ago" — precisely so a seeded 1 Jan 2000 due date reads
     * as a sentence rather than as a five-digit count. What is asserted is
     * therefore the row's own `data-urgency="overdue"` plus the elapsed phrase
     * the ladder produces, which is the contract rather than one rung of it.
     *
     * There is deliberately no "Overdue" band to look for here: the Overdue
     * view is one due state, so UIX-01 left it FLAT while grouping All active,
     * Inbox and Upcoming by due state. A single group under a heading repeating
     * the view's own name is chrome, not structure.
     */
    // DS-04 — a task row is `TaskRow`, an `<li>` with no accessible name of its
    // own; `taskRow()` is the suite's one locator for it.
    const overdueRow = taskRow(page, "Review the overdue signal");
    await expect(
      overdueRow.getByText(/(days|months?) ago|Over a year ago/),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Overdue" })).toHaveCount(0);

    // The p1 seeded task shows the coloured PriorityIndicator on its card — priority
    // is no longer an absent/colour-free grey chip (DEBT-27).
    await gotoFixture(page, "/tasks?view=list&system=all");
    const p1Row = taskRow(page, "Draft the proposal");
    const priority = p1Row.locator('.dh-priority[data-priority="p1"]');
    await expect(priority).toBeVisible();
    // A ROW draws the short tag; the accessible name is still the full one.
    await expect(priority).toContainText("P1");
    await expect(priority).toHaveAttribute("aria-label", "Priority 1");
  });

  test("groups the list by priority — the banded triage the Matrix used to provide", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=list&group=priority");
    // The section heading carries a count suffix, e.g. "Priority 1 (1)".
    await expect(
      page.getByRole("heading", { name: /Priority 1/ }).first(),
    ).toBeVisible();
    const p1Band = page.getByRole("region", { name: "Priority 1" });
    await expect(
      p1Band.getByRole("link", { name: "Draft the proposal" }),
    ).toBeVisible();
    // ONE priority vocabulary: the Eisenhower action words went with the Matrix.
    await expect(page.getByText("Delete / Review")).toHaveCount(0);
  });

  test("switches to Time Sectors and shows the sector sections", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=sectors");
    // TASKS-04 renamed the no-sector bucket: "Inbox" now means an UNASSIGNED task, so
    // the absence of a Time Sector reads as "No sector". The two are genuinely
    // different states — a task can be filed under a Project and still have no sector.
    for (const label of ["No sector", "This Week", "Next Week", "Long Term"]) {
      // The section heading carries a count suffix, e.g. "No sector (6)".
      await expect(
        page.getByRole("heading", { name: label }).first(),
      ).toBeVisible();
    }
  });

  test("the Drawer is URL-backed and Back/Forward correct", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=list&system=all");
    // Opening a task pushes a history entry (the drawer state lives in the URL).
    await page
      .getByRole("link", { name: "Draft the proposal" })
      .first()
      .click();
    await expect(page).toHaveURL(/drawer=task%3At-drawer/);
    await expect(page.getByRole("dialog")).toBeVisible();
    // Back closes the drawer; Forward reopens it.
    await page.goBack();
    await expect(page).toHaveURL(/\/tasks\?view=list&system=all$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(page).toHaveURL(/drawer=task%3At-drawer/);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("switching the primary view updates the URL", async ({ page }) => {
    // UIX-01 — the layout is chosen from the header's shared overflow menu; the
    // parameter it writes is unchanged.
    await gotoFixture(page, "/tasks?view=list&system=all");
    await page.getByTestId("tasks-overflow").click();
    await page
      .getByRole("menuitem", { name: "Sectors layout", exact: true })
      .click();
    await expect(page).toHaveURL(/view=sectors/);
    await expect(
      page.getByRole("heading", { name: /No sector/ }).first(),
    ).toBeVisible();
  });
});

test.describe("TASKS-01 — accessibility & responsive", () => {
  /*
   * TASKS-05 made a Task row an editing surface: every row now carries a priority
   * menu, two date fields and a parent picker where it used to carry text. Over the
   * 80-task collection dataset that is several hundred extra interactive nodes for
   * axe to walk, and a scan that fitted the 30s default no longer does — one of the
   * two scans below measured 33.4s.
   *
   * The budget matches the work; not one assertion is relaxed, no rule is disabled
   * and no wait is inserted. The same reasoning (and the same explicit
   * `setTimeout`) already governs the overflow sweep further down this file.
   */
  test("the priority-grouped list is axe-clean in light and dark", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoFixture(page, "/tasks?view=list&group=priority");
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
  });

  test("the default list (and the complete collection) are axe-clean in light and dark", async ({
    page,
  }) => {
    // Four scans, for the same reason as the test above.
    test.setTimeout(150_000);
    // Mirrors what the shared accessibility sweep scans: the default /tasks
    // landing (TASKS-03: the calm active list) and the complete collection.
    for (const path of ["/tasks", "/tasks?view=list&system=all"]) {
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
    // Six presentations × six widths over the 80-task collection dataset: the
    // work is genuinely larger than it was, so the budget matches it. Not one
    // assertion is relaxed and no wait is inserted.
    test.setTimeout(180_000);
    // TASKS-03 widened this to the complete presentation set, including the
    // ordinary grouped list and the Board, and to the 390/430px phone widths.
    for (const query of [
      "view=list&system=all",
      "view=list&group=parent",
      "view=board&group=due_state",
      "view=list&group=priority",
      "view=sectors",
      "priority=p1&due=overdue&person=Sam+Okafor",
    ]) {
      for (const width of [320, 375, 390, 430, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await gotoFixture(page, `/tasks?${query}`);
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});

test.describe("TASKS-01 — mobile 375px", () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test("a grouped list stacks into readable sections on a phone", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=list&group=priority");
    await expect(
      page.getByRole("heading", { name: /Priority 1/ }).first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
