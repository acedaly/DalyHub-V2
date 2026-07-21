import { expect, test } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TODAY-04 — the Planning workflow, driven end to end against the development-auth
 * server over real (seeded) D1. It plans the dedicated `t-drawer` task for today
 * from its Drawer's Planning section, confirms it appears in the Today planning
 * section, moves and clears the plan, and holds the accessibility + responsive
 * baseline. It mutates only `t-drawer`'s scheduled date (which the seed resets each
 * server start), so the other journeys stay stable. Dates are relative to the
 * owner's current day, so the test is robust regardless of the run date.
 */

const DRAWER_URL = "/today?drawer=task%3At-drawer";
const TITLE = "Draft the proposal";

async function openPlanning(page: import("@playwright/test").Page) {
  await gotoFixture(page, DRAWER_URL);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const planning = dialog.getByRole("group", { name: "Planning" });
  await expect(planning).toBeVisible();
  // Normalise to unplanned so each test starts from a known point.
  const clear = planning.getByRole("button", { name: "Clear" });
  if ((await clear.count()) > 0) {
    await clear.first().click();
    await expect(planning.getByText("Not planned")).toBeVisible();
  }
  return { dialog, planning };
}

test.describe("TODAY-04 — Planning", () => {
  test("plans a task for today and shows it in the Today section", async ({
    page,
  }) => {
    const { planning } = await openPlanning(page);

    await planning.getByRole("button", { name: "Today" }).click();
    // The read display leaves "Not planned" once the plan is saved.
    await expect(planning.getByText("Not planned")).toHaveCount(0);

    // Close the Drawer; the task now appears in the Today planning section.
    await page.keyboard.press("Escape");
    const todayList = page.getByRole("list", {
      name: "Tasks planned for today",
    });
    await expect(todayList.getByText(TITLE)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("moves the plan to tomorrow and clears it from the Drawer", async ({
    page,
  }) => {
    const { planning } = await openPlanning(page);

    await planning.getByRole("button", { name: "Today" }).click();
    await expect(planning.getByRole("button", { name: "Clear" })).toBeVisible();

    await planning.getByRole("button", { name: "Tomorrow" }).click();
    // Still planned (a Clear action remains available).
    await expect(planning.getByRole("button", { name: "Clear" })).toBeVisible();

    await planning.getByRole("button", { name: "Clear" }).click();
    await expect(planning.getByText("Not planned")).toBeVisible();
  });

  test("holds the accessibility and responsive baseline", async ({ page }) => {
    await gotoFixture(page, "/today");
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalOverflow(page);
  });
});
