import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TODAY-06 — the mobile Today experience, driven end to end against the
 * development-auth server over real (seeded) D1 with a phone viewport and touch
 * emulation (`isMobile` + `hasTouch`, so `(hover: none) and (pointer: coarse)`
 * matches and the swipe layer activates). It exercises the highest-value phone
 * workflow: review the planning sections, swipe a task to expose its action tray,
 * run a planning action through the SAME trusted route the desktop controls use,
 * confirm the persisted result after revalidation, open + edit + close the task
 * Drawer without losing context, use mobile selection + the bulk bar, visit
 * Waiting, navigate Back/Forward, and hold the accessibility + no-overflow baseline
 * with the swipe tray open.
 *
 * It mutates only the dedicated `t-drawer` task's scheduled date (which the seed
 * resets each server start) and restores it to "planned for today", so the other
 * journeys stay stable. See `normalisePlannedToday` for why that baseline changed
 * from "unplanned".
 *
 * Touch caveat: Playwright cannot dispatch a native OS touch-DRAG in this setup, so
 * the swipe is driven by explicit `pointerType: "touch"` pointer events (see
 * `touchSwipe`) with real coordinates — NOT `page.mouse` (which is `pointerType:
 * "mouse"` and would not exercise the touch path or the compatibility-click
 * behaviour). The pure gesture maths are unit-tested separately.
 */

const PHONE = { width: 390, height: 844 };
const CARD = '.dh-card[data-card-id="t-drawer"]';
const TITLE = "Draft the proposal";

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

/** The task card article (the swipe surface). */
function taskCard(page: Page): Locator {
  return page.locator(CARD);
}

/**
 * Drive a horizontal swipe with explicit TOUCH-pointer events.
 *
 * Playwright's high-level input (`page.mouse`, `page.touchscreen.tap`) cannot
 * dispatch a native OS touch-DRAG gesture, and `page.mouse` reports
 * `pointerType: "mouse"` — which would NOT exercise the touch code path or the
 * touch compatibility-click behaviour this feature depends on. So we dispatch the
 * real `pointerdown`/`pointermove`/`pointerup` sequence with `pointerType: "touch"`
 * and real client coordinates (the trusted pointer-event approach the repo's
 * Playwright setup supports). This drives the SAME hook path a finger does; mouse
 * input is never used to claim touch compatibility-click coverage.
 */
async function touchSwipe(card: Locator) {
  const box = await card.boundingBox();
  if (box === null) {
    throw new Error("task card has no layout box");
  }
  const y = box.y + box.height / 2;
  const startX = box.x + box.width - 16;
  const base = { pointerId: 1, pointerType: "touch", bubbles: true } as const;
  await card.dispatchEvent("pointerdown", {
    ...base,
    button: 0,
    clientX: startX,
    clientY: y,
  });
  // Cross the intent threshold, then pull the tray fully open (past its width so it
  // clamps to fully revealed).
  await card.dispatchEvent("pointermove", {
    ...base,
    clientX: startX - 30,
    clientY: y,
  });
  await card.dispatchEvent("pointermove", {
    ...base,
    clientX: startX - box.width,
    clientY: y,
  });
  await card.dispatchEvent("pointerup", {
    ...base,
    clientX: startX - box.width,
    clientY: y,
  });
}

/** A deliberate, movement-free TOUCH tap on the card (a fresh pointer sequence). */
async function touchTap(card: Locator) {
  const box = await card.boundingBox();
  if (box === null) {
    throw new Error("task card has no layout box");
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const base = { pointerId: 2, pointerType: "touch", bubbles: true } as const;
  await card.dispatchEvent("pointerdown", {
    ...base,
    button: 0,
    clientX: x,
    clientY: y,
  });
  await card.dispatchEvent("pointerup", { ...base, clientX: x, clientY: y });
}

/**
 * Ensure `t-drawer` is planned for TODAY via its Drawer, then close it.
 *
 * This spec's baseline used to be "unplanned", which put the task in the Anytime
 * band. POLISH-02 previews that band on the landing page (the seeded workspace
 * has sixty-odd backlog tasks, and Today is not a place to read a backlog), and
 * this task — which has no due date — sorts well past the preview. The spec is
 * about swipe, selection and Drawer BEHAVIOUR on a task row, not about the
 * backlog, so it now bases its dedicated task in the Today band, which the
 * surface never truncates. That also removes this file's long-standing hidden
 * dependency on the seed's backlog ordering.
 */
async function normalisePlannedToday(page: Page) {
  // Check first, mutate only if needed. The dev database is shared and only
  // reseeds at server start, so every avoidable write here is an Activity row
  // that pushes the seeded events off the first page of the workspace feed —
  // which `activity-actor.spec.ts` reads. A normaliser should be a no-op when
  // the state is already correct.
  await gotoFixture(page, "/today");
  const alreadyToday = page
    .getByRole("list", { name: "Tasks planned for today" })
    .locator(CARD);
  if ((await alreadyToday.count()) > 0) {
    return;
  }

  await gotoFixture(page, "/today?drawer=task%3At-drawer");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const planning = dialog.getByRole("group", { name: "Planning" });
  await planning.getByRole("button", { name: "Today", exact: true }).click();
  await expect(planning.getByRole("button", { name: "Clear" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}

test.describe("TODAY-06 — mobile Today", () => {
  test("emulates a touch-first phone (the swipe layer’s precondition)", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const touchFirst = await page.evaluate(
      () => window.matchMedia("(hover: none) and (pointer: coarse)").matches,
    );
    expect(touchFirst).toBe(true);
  });

  test("renders the planning sections without horizontal overflow", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: /Today at a glance/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 3, name: /Anytime/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("swipes a task to reveal its tray and plans it through the shared route", async ({
    page,
  }) => {
    await normalisePlannedToday(page);
    await gotoFixture(page, "/today");

    const card = taskCard(page);
    await expect(card).toHaveAttribute("data-swipe-open", "false");
    await touchSwipe(card);
    await expect(card).toHaveAttribute("data-swipe-open", "true");
    // A handled swipe must not also open the Card (no drawer).
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Run the planning action from the revealed tray (same path as the visible
    // quick action / bulk bar / keyboard command). A task planned for today
    // offers "Tomorrow"; the assertion is that the tray's action mutates through
    // the trusted route and the row re-buckets, which is what makes the swipe a
    // real accelerator rather than a gesture with its own code path.
    const tray = page.locator(
      `.dh-card-swipe:has(${CARD}) .dh-card__swipe-tray`,
    );
    await tray.getByText("Tomorrow", { exact: true }).click();

    // After the mutation + revalidation the task has left Today for Upcoming
    // (planning persisted through the trusted /today/plan route).
    const upcomingList = page.getByRole("list", { name: "Upcoming tasks" });
    await expect(upcomingList.getByText(TITLE)).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Tasks planned for today" })
        .getByText(TITLE),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    // Restore: plan it back to today so the later journeys start where they expect.
    await normalisePlannedToday(page);
  });

  test("swipe suppresses its compatibility click but never swallows a later tap", async ({
    page,
  }) => {
    await normalisePlannedToday(page);
    await gotoFixture(page, "/today");
    const card = taskCard(page);
    const title = page.getByRole("link", { name: TITLE }).first();

    // The swipe reveals the tray, arms click-suppression, and does not open the Card.
    await touchSwipe(card);
    await expect(card).toHaveAttribute("data-swipe-open", "true");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A synthetic touch compatibility click on the title (what a real browser emits
    // right after a swipe) is swallowed — the Card must NOT open.
    await title.dispatchEvent("click", { bubbles: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // No further compatibility click arrives; a later DELIBERATE tap opens the Card
    // (its pointer-down clears any stale suppression — it is never swallowed).
    await touchTap(card);
    await title.dispatchEvent("click", { bubbles: true });
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("holds the accessibility baseline with a swipe tray open", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const card = taskCard(page);
    await touchSwipe(card);
    await expect(card).toHaveAttribute("data-swipe-open", "true");
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    await normalisePlannedToday(page);
  });

  test("opens the task Drawer as a full-height sheet and returns to Today", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.getByRole("link", { name: TITLE }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: TITLE }),
    ).toBeVisible();
    // The Planning + close controls are reachable on the narrow sheet.
    await expect(dialog.getByRole("group", { name: "Planning" })).toBeVisible();
    await expectMinTouchTarget(dialog.getByRole("button", { name: "Close" }));
    await expectNoHorizontalOverflow(page);

    // Back closes the Drawer and restores Today (context preserved).
    await page.goBack();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
    // Forward re-opens it (URL-driven history).
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("supports mobile selection with a bulk action bar", async ({ page }) => {
    await gotoFixture(page, "/today");
    const selectCheckbox = page.getByRole("checkbox", {
      name: `Select ${TITLE}`,
    });
    // The selection cell (the label wrapping the checkbox) is the 44px touch target.
    await expectMinTouchTarget(page.locator(`${CARD} .dh-card__select`));
    await selectCheckbox.check();

    const bulkBar = page.getByRole("group", { name: /Plan 1 selected task/ });
    await expect(bulkBar).toBeVisible();
    await expect(bulkBar.getByText("1 selected")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Exit selection without mutating (Cancel clears it).
    await bulkBar.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("group", { name: /Plan .* selected/ }),
    ).toHaveCount(0);
  });

  test("reaches the Waiting view and navigates Back to Today", async ({
    page,
  }) => {
    // Start on Today so Back has somewhere to return to, then open Waiting via a
    // real client navigation (the sidebar/command path lands here too).
    await gotoFixture(page, "/today");
    await gotoFixture(page, "/today/waiting");
    await expect(
      page.getByRole("heading", { level: 1, name: /Waiting/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.goBack();
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
  });
});
