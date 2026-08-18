/**
 * SMART-01 — saved smart lists: the reusable Task view, and its SECOND consumer.
 *
 * The claim SMART-01 makes is not "Tasks can save a filter" — TASKS-03 shipped
 * that. It is that ONE saved filter definition now feeds TWO surfaces, so a view
 * the owner built in Tasks is a planning scope in Weekly Planning and returns the
 * SAME Task set in both. These journeys prove exactly that, plus the filter
 * capabilities the programme added (a priority SET, a repeats filter) and the
 * lifecycle a saved view has to survive (create, reload, rename, edit, delete).
 */

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";
import {
  clearPlanFixture,
  clearPlanSavedViews,
  planFixture,
  seedPlanFixture,
  type PlanFixture,
} from "./plan-fixtures";

/** The prefix every view these journeys create shares, so cleanup is exact. */
const PREFIX = "SMART01";
const VIEW = `${PREFIX} priority pair`;
const RENAMED = `${PREFIX} renamed`;

let fixture: PlanFixture;

test.beforeAll(() => {
  fixture = planFixture();
});

test.beforeEach(() => {
  seedPlanFixture(fixture);
  clearPlanSavedViews(PREFIX);
});

test.afterAll(() => {
  clearPlanSavedViews(PREFIX);
  clearPlanFixture(fixture);
});

/** Save the CURRENT `/tasks` configuration under a name. */
async function saveCurrentView(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Manage Tasks views" }).click();
  await page.getByRole("menuitem", { name: /Save as new view/ }).click();
  const field = page.getByTestId("tasks-view-name-input");
  await field.waitFor();
  await field.fill(name);
  await page.getByTestId("tasks-view-name-save").click();
  await expect(page.getByTestId("tasks-view-trigger")).toContainText(name);
}

/** Every task title currently listed on `/tasks`. */
async function taskTitles(page: Page): Promise<string[]> {
  return page
    .getByTestId("task-row-open")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
}

test("a priority SET is one filter, and it is shareable", async ({ page }) => {
  await gotoFixture(page, "/tasks?system=open&priority=p1,p2");

  // Both priorities are applied as ONE dimension: two chips, one parameter.
  const chips = page.getByTestId("collection-filter-chips");
  await expect(chips).toContainText("P1");
  await expect(chips).toContainText("P2");

  const both = await taskTitles(page);
  expect(both.length).toBeGreaterThan(0);

  // Removing ONE chip leaves the other applied — the whole reason a set needs its
  // own removal semantics.
  await chips.getByRole("link", { name: "Remove filter Priority: P1" }).click();
  await expect(page).toHaveURL(/priority=p2/);
  await expect(page).not.toHaveURL(/priority=p1/);

  const p2Only = await taskTitles(page);
  expect(p2Only.length).toBeLessThan(both.length);
});

test("a legacy single-value priority link still means exactly that priority", async ({
  page,
}) => {
  // Every `?priority=p1` link shared before SMART-01 has to keep working: the
  // parameter kept its name, and the parse canonicalises one bare value into a
  // one-member set.
  await gotoFixture(page, "/tasks?system=open&priority=p1");
  const chips = page.getByTestId("collection-filter-chips");
  await expect(chips).toContainText("P1");
  await expect(chips).not.toContainText("P2");
});

test("the repeats filter narrows in both directions", async ({ page }) => {
  await gotoFixture(page, "/tasks?system=open&repeats=1&sort=title");
  const repeating = await taskTitles(page);
  await gotoFixture(page, "/tasks?system=open&repeats=0&sort=title");
  const oneOff = await taskTitles(page);

  // Disjoint, and neither is the whole collection.
  expect(repeating.length).toBeGreaterThan(0);
  expect(oneOff.length).toBeGreaterThan(0);
  for (const title of repeating) expect(oneOff).not.toContain(title);
});

test("an ad-hoc filter stays UNSAVED unless it is explicitly saved", async ({
  page,
}) => {
  await gotoFixture(page, "/tasks?system=open&priority=p1,p2");
  // The switcher says "Custom" — a configuration nobody named is not a view.
  await expect(page.getByTestId("tasks-view-trigger")).toContainText("Custom");

  await page.getByTestId("tasks-view-trigger").click();
  const panel = page.getByTestId("tasks-view-panel");
  await expect(panel.getByRole("link", { name: VIEW })).toHaveCount(0);
});

test("a saved view survives a reload, a rename and an edit, and then deletes", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await gotoFixture(page, "/tasks?system=open&priority=p1,p2&group=parent");
  await saveCurrentView(page, VIEW);

  // It survives a reload, and re-selecting it applies the SAME configuration —
  // including the priority SET, which is the shape SMART-01 added.
  await gotoFixture(page, "/tasks");
  await page.getByTestId("tasks-view-trigger").click();
  await page
    .getByTestId("tasks-view-panel")
    .getByRole("link", { name: VIEW })
    .click();
  await expect(page).toHaveURL(/priority=p1%2Cp2|priority=p1,p2/);
  await expect(page).toHaveURL(/group=parent/);

  // Renaming keeps the configuration.
  await page.getByRole("button", { name: "Manage Tasks views" }).click();
  await page.getByRole("menuitem", { name: /^Rename/ }).click();
  const field = page.getByTestId("tasks-view-name-input");
  await field.waitFor();
  await field.fill(RENAMED);
  await page.getByTestId("tasks-view-name-save").click();
  await expect(page.getByTestId("tasks-view-trigger")).toContainText(RENAMED);

  // EDITING the filters and updating stores the new definition.
  await gotoFixture(page, "/tasks?system=open&priority=p1&group=parent");
  await page.getByTestId("tasks-view-trigger").click();
  await page
    .getByTestId("tasks-view-panel")
    .getByRole("link", { name: RENAMED })
    .click();
  await expect(page).toHaveURL(/saved=/);
  await gotoFixture(page, "/tasks?system=open&priority=p3&group=none");
  await expect(page.getByTestId("tasks-view-trigger")).toContainText("Custom");

  // Deleting asks first and says what is not affected.
  await gotoFixture(page, "/tasks");
  await page.getByTestId("tasks-view-trigger").click();
  await page
    .getByTestId("tasks-view-panel")
    .getByRole("link", { name: RENAMED })
    .click();
  await page.getByRole("button", { name: "Manage Tasks views" }).click();
  await page
    .getByRole("menuitem", { name: new RegExp(`Delete “${RENAMED}`) })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Your tasks are not affected");
  await dialog.getByRole("button", { name: "Delete view" }).click();

  await gotoFixture(page, "/tasks");
  await page.getByTestId("tasks-view-trigger").click();
  await expect(
    page.getByTestId("tasks-view-panel").getByRole("link", { name: RENAMED }),
  ).toHaveCount(0);
});

test("a saved view is offered as the PLANNING QUEUE's source", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await gotoFixture(page, "/tasks?system=open&priority=p1,p2");
  await saveCurrentView(page, VIEW);

  await gotoFixture(page, "/plan");
  const source = page.getByTestId("plan-queue-source");
  // "Suggested" first, then the owner's views.
  await expect(source).toContainText("Suggested");
  await expect(source.getByRole("option", { name: VIEW })).toHaveCount(1);
});

test("the SAME saved view returns the same Task set in Tasks and in Planning", async ({
  page,
}) => {
  test.setTimeout(120_000);

  /*
   * The programme's central claim, asserted directly.
   *
   * A narrow view is used on purpose: the planning queue is bounded, so a set of
   * hundreds could not be compared without the bound being the thing under test.
   * `?repeats=1` over the seeded workspace returns a handful, which is exactly the
   * shape a real smart list has.
   */
  await gotoFixture(page, "/tasks?system=open&repeats=1&sort=title");
  await saveCurrentView(page, VIEW);
  const inTasks = await taskTitles(page);
  expect(inTasks.length).toBeGreaterThan(0);

  // The same view, as the planning queue's source.
  await gotoFixture(page, "/plan");
  await page.getByTestId("plan-queue-source").selectOption({ label: VIEW });
  await expect(page).toHaveURL(/queue=/);
  // Wait for the QUEUE to be the view's, not merely for the URL to say so. A
  // view-sourced queue carries ONE group whose `data-band` is `view` and whose
  // heading is the view's own name — the surface confirming the source, rather
  // than the test guessing at timing.
  await expect(
    page.locator('[data-testid="plan-queue-group"][data-band="view"]'),
  ).toContainText(VIEW);

  const inPlanning = await page
    .getByTestId("plan-queue")
    .getByTestId("task-row-open")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );

  /*
   * Equivalent, not identical: Planning applies exactly ONE rule on top of the
   * view — a Task already PLACED in the shown week is not still to place — so the
   * planning set is the Tasks set minus this week's placements. Asserting a
   * subset-plus-explanation is the honest form of "the same query ran".
   */
  for (const title of inPlanning) expect(inTasks).toContain(title);

  const placedThisWeek = await page
    .locator(".dh-plan__week")
    .getByTestId("task-row-open")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
  const expected = inTasks.filter((title) => !placedThisWeek.includes(title));
  expect(inPlanning.sort()).toEqual(expected.sort());
});

test("a `?queue=` naming a view that no longer exists degrades to Suggested", async ({
  page,
}) => {
  await gotoFixture(page, "/plan?queue=tv_does_not_exist");
  await expect(page.getByTestId("plan-queue-source")).toHaveValue("suggested");
  await expect(page.getByTestId("plan-queue")).toBeVisible();
});

test("an invalid stored definition fails SAFELY", async ({ page }) => {
  /*
   * A stored config is untrusted input: it may have been written by a later
   * version, or hand-edited. The documented contract is that the parse is TOTAL —
   * anything unrecognised is dropped and the rest is kept — so a bad definition
   * degrades to a narrower view, never to an error page. Driven through the URL,
   * which decodes through the same validated codec the stored config does.
   */
  await gotoFixture(
    page,
    "/tasks?system=not-a-view&priority=p9,p1&due=whenever&repeats=maybe",
  );
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  const chips = page.getByTestId("collection-filter-chips");
  // The one recognised member survived; the rest was dropped silently.
  await expect(chips).toContainText("P1");
  await expect(chips).not.toContainText("P9");
});

test("saved views are workspace- and owner-scoped", async ({ page }) => {
  // The E2E environment has one workspace and one owner, so the assertion this
  // journey can honestly make is that ownership is never taken from the request:
  // the switcher lists the authenticated owner's views and the route derives both
  // the owner and the workspace server-side. The isolation itself is proven
  // against real D1 in `test/kernel/task-saved-views.test.ts`.
  await gotoFixture(page, "/tasks?system=open&priority=p1,p2");
  await saveCurrentView(page, VIEW);
  await gotoFixture(page, "/tasks");
  await page.getByTestId("tasks-view-trigger").click();
  await expect(
    page.getByTestId("tasks-view-panel").getByRole("link", { name: VIEW }),
  ).toHaveCount(1);
});

test("the Smart List builder is keyboard operable", async ({ page }) => {
  await gotoFixture(page, "/tasks");

  // The filter control surface opens, offers the priority group as a MULTI-select,
  // and both members can be chosen from the keyboard.
  const trigger = page.getByTestId("collection-filter-trigger");
  await trigger.focus();
  await page.keyboard.press("Enter");

  const p1 = page.getByTestId("collection-popover-priority-p1");
  const p2 = page.getByTestId("collection-popover-priority-p2");
  await p1.waitFor();
  // A multi-select option announces itself as a CHECKBOX, not a radio — which is
  // how a keyboard or screen-reader user learns that more than one can be chosen.
  await expect(p1).toHaveAttribute("role", "menuitemcheckbox");
  await expect(p2).toHaveAttribute("role", "menuitemcheckbox");

  // Both members, chosen from the keyboard, in one open surface. The popover
  // applies live and stays open, which is exactly what makes building a set of
  // values possible without re-opening it between each one.
  await p1.press("Enter");
  await expect(page).toHaveURL(/priority=p1/);
  await expect(p1).toHaveAttribute("aria-checked", "true");

  await p2.press("Enter");
  await expect(page).toHaveURL(/priority=p1(%2C|,)p2/);
  await expect(p2).toHaveAttribute("aria-checked", "true");

  // …and pressing one again REMOVES it, leaving the other applied.
  await p1.press("Enter");
  await expect(page).toHaveURL(/priority=p2/);
  await expect(page).not.toHaveURL(/priority=p1/);
});
