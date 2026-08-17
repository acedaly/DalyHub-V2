import { expect, test } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TODAY-02 — the Task Drawer, driven end to end against the development-auth server
 * over real (seeded) D1. Role-based and non-brittle: it opens a real task from
 * Today, exercises the DS-03 URL/history contract, edits + saves + cancels through
 * DS-06 forms, completes + reopens, shows real relationships + activity, and holds
 * the accessibility + responsive baseline. It mutates only the dedicated
 * `t-drawer` task so the Today/Search journeys stay stable.
 */

const DRAWER_URL = "/today?drawer=task%3At-drawer";

/**
 * Put `t-drawer` on the day and return its opener row.
 *
 * The task has no dates in the seed, so it is on neither the day nor the overdue
 * block. These journeys are about opening a task FROM Today, which is worth
 * keeping exactly as written, so the task is first planned for today through its
 * own Drawer (using the product's own control, so the owner's calendar day is
 * never computed in the test).
 *
 * The opener is scoped to the day column, which is the only place on the screen
 * that lists tasks.
 */
async function openerOnToday(page: import("@playwright/test").Page) {
  await gotoFixture(page, "/today");
  const opener = page
    .locator(".dh-today__timeline")
    .getByRole("link", { name: "Draft the proposal" });

  // Plan it only if it is not already on the page. The dev database is shared and
  // reseeds only at server start, so an unconditional write here is an Activity
  // row that pushes the seeded events off the first page of the workspace feed
  // (which `activity-actor.spec.ts` reads). A normaliser should be a no-op when
  // the state is already correct.
  if ((await opener.count()) === 0) {
    await gotoFixture(page, DRAWER_URL);
    const planning = page
      .getByRole("dialog")
      .getByRole("group", { name: "Planning" });
    await planning.getByRole("button", { name: "Today", exact: true }).click();
    await expect(planning.getByRole("button", { name: "Clear" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }

  await expect(opener).toBeVisible();
  return opener;
}

test.describe("TODAY-02 — desktop", () => {
  test("opens a task from Today and updates the Drawer URL state", async ({
    page,
  }) => {
    await (await openerOnToday(page)).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible();
    // The open stack lives in the URL (DS-03).
    await expect(page).toHaveURL(/drawer=task%3At-drawer/);
    /*
     * Real fields render, and the priority carries the flag, the colour and the
     * label the locked contract requires.
     *
     * ── Short tag vs full label ──────────────────────────────────────────────
     * This asserted the short "P1" tag and the everyday word "Urgent". Both
     * belong to the ROW's rendering: the contract is a flag plus a short
     * P1/P2/P3/P4 tag in rows, and the FULL label ("Priority 1") in menus and on
     * the record, where there is room for the unambiguous word and no column of
     * fifty of them. The drawer draws the record form, so it says "Priority 1",
     * and forcing the row's tag back onto it to satisfy this line would break
     * the contract rather than test it.
     */
    const priority = dialog.locator('.dh-priority[data-priority="p1"]');
    await expect(priority).toBeVisible();
    await expect(priority).toContainText("Priority 1");
    await expect(priority).toHaveAttribute("aria-label", /Priority 1/);
    // The due date renders — now in both the Planning section and, since TASKS-02,
    // the shared UrgencyChip; assert the chip's ABSOLUTE form explicitly.
    //
    // The fixture's due date is far future ON PURPOSE (see `seed-tasks.sql`):
    // the chip only renders "Due <date>" while the date is neither today nor
    // past, so a near-future fixture would make this assertion fail on one
    // specific calendar day and every day after it.
    await expect(
      dialog.locator(".dh-urgency").getByText("Due 31 Dec 2099"),
    ).toBeVisible();
  });

  test("shows the real area relationship in the Linked tab", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Linked" }).click();
    const relationships = dialog.getByRole("region", { name: "Relationships" });
    await expect(relationships.getByText("DalyHub V2")).toBeVisible();
  });

  test("edits and saves, and the result persists after reload", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit details" }).click();

    const description = dialog.getByRole("textbox", { name: "Description" });
    await description.fill("Reviewed and ready to draft.");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    // Back in the read view, the saved description renders (through the shared
    // Markdown pipeline).
    await expect(
      dialog.getByText("Reviewed and ready to draft."),
    ).toBeVisible();

    // Persisted: a hard reload of the deep link shows the saved value.
    await gotoFixture(page, DRAWER_URL);
    await expect(
      page.getByRole("dialog").getByText("Reviewed and ready to draft."),
    ).toBeVisible();
  });

  test("cancels an edit without saving", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Edit details" }).click();
    // EDIT-02 — the title left this form for the record's own heading, so the
    // discardable value here is the description.
    const description = dialog.getByRole("textbox", { name: "Description" });
    await description.fill("A discarded description");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    // The read view returns and the discarded edit is not shown.
    await expect(
      dialog.getByRole("button", { name: "Edit details" }),
    ).toBeVisible();
    await expect(dialog.getByText("A discarded description")).toHaveCount(0);
  });

  test("EDIT-02: renames from the record heading, and cancels without saving", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    const trigger = dialog.getByRole("button", { name: /^Task title: / });
    const original = (await trigger.getAttribute("aria-label")) ?? "";

    await trigger.focus();
    await page.keyboard.press("Enter");
    const input = dialog.getByRole("textbox", { name: "Task title" });
    await expect(input).toBeFocused();
    await input.fill("A discarded title");
    await page.keyboard.press("Escape");

    await expect(
      dialog.getByRole("textbox", { name: "Task title" }),
    ).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-label", original);
  });

  test("completes and reopens the task", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    // Wait for the record body to load before toggling completion.
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible();
    /*
     * CONTROL-01 §4 — completion is the record HEADER's action now, not a
     * checkbox in the summary column. It is two named commands rather than one
     * toggle ("Complete task" / "Reopen task"), in the same slot and the same
     * words a Project's lifecycle act uses, so the record's one purpose is no
     * longer ranked alongside its properties.
     *
     * The control disables briefly while the act persists and revalidates, so
     * each step waits for the OTHER command to appear — which is the server's
     * answer, not an optimistic guess — before driving the next. Written as
     * "make it so" rather than "click twice" because this task is shared with
     * other journeys and may arrive in either state.
     */
    const setCompleted = async (target: boolean) => {
      const wanted = target ? "Complete task" : "Reopen task";
      const settled = target ? "Reopen task" : "Complete task";
      const action = dialog.getByRole("button", { name: wanted });
      const opposite = dialog.getByRole("button", { name: settled });
      /*
       * Already in the target state — but PROVE it rather than assume it.
       *
       * An early bare `return` here would let this whole test pass on a record
       * that renders NO completion control at all: all three calls would find no
       * `wanted` button, return, and assert nothing. The record must always
       * offer exactly one of the two commands, so the absence of one is a claim
       * that the other is present and usable.
       */
      if ((await action.count()) === 0) {
        await expect(opposite).toBeEnabled();
        return;
      }
      await expect(action).toBeEnabled();
      await action.click();
      await expect(opposite).toBeEnabled();
    };
    await setCompleted(false); // normalise to open
    await setCompleted(true); // complete
    await setCompleted(false); // reopen — reconciled with the persisted result
  });

  test("records activity after a mutation", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    const dialog = page.getByRole("dialog");
    // Make a mutation so there is at least one event.
    await dialog.getByRole("button", { name: "Edit details" }).click();
    await dialog
      .getByRole("textbox", { name: "Description" })
      .fill("Activity check.");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByText("Activity check.")).toBeVisible();

    await dialog.getByRole("tab", { name: "Activity" }).click();
    // The shared Timeline (role=feed) renders the task's real activity.
    await expect(
      dialog.getByRole("feed", { name: "Task activity" }),
    ).toBeVisible();
    await expect(dialog.getByRole("article").first()).toBeVisible();
  });

  test("closes on Escape and restores focus to the opener", async ({
    page,
  }) => {
    // Focus restores to this exact opener on Escape.
    const opener = await openerOnToday(page);
    await opener.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test("Back closes the Drawer and Forward reopens it", async ({ page }) => {
    await (await openerOnToday(page)).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("directly loading a valid task Drawer URL works", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(
      page
        .getByRole("dialog")
        .getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible();
  });

  test("shows the calm not-found for an invalid task id", async ({ page }) => {
    await gotoFixture(page, "/today?drawer=task%3Amissing-task");
    await expect(page.getByText(/We couldn.t find that task/)).toBeVisible();
  });

  test("has no horizontal overflow with the Drawer open", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("meets the 44px touch target on the completion control", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    /*
     * The completion control is the record header's action button (CONTROL-01
     * §4). It takes its 44px floor from the shared control layer rather than
     * from a task-specific rule, which is the point of moving it there — one
     * lifecycle act, one control, one measured target.
     */
    const control = page
      .getByRole("dialog")
      .getByRole("button", { name: /^(Complete|Reopen) task$/ });
    await expectMinTouchTarget(control);
  });
});

test.describe("TODAY-02 — mobile (320px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("opens as a full-height sheet with no horizontal overflow", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("TODAY-02 — accessibility (axe)", () => {
  test("passes axe with the Task Drawer open (light)", async ({ page }) => {
    await gotoFixture(page, DRAWER_URL);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test.describe("dark", () => {
    test.use({ colorScheme: "dark" });
    test("passes axe with the Task Drawer open (dark)", async ({ page }) => {
      await gotoFixture(page, DRAWER_URL);
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
});
