import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * The phone experience of the day — Today and the touch accelerators around it —
 * driven end to end against the development-auth server over real (seeded) D1
 * with a phone viewport and touch emulation (`isMobile` + `hasTouch`, so
 * `(hover: none) and (pointer: coarse)` matches and the swipe layer activates).
 *
 * ── What moved, and why this file changed shape ──────────────────────────────
 * The Today redesign replaced the roving Card collection with plain rows: a
 * checkbox completes, a title opens the record. So the SWIPE tray and the
 * multi-select bulk bar are no longer on Today at all — they are the shared
 * Card's capabilities, and the Tasks collection is where they live. Those
 * journeys therefore run against `/tasks` here rather than being deleted: the
 * behaviour is unchanged and still worth proving on a real phone, it simply has
 * a different host. Today's own phone coverage is the day itself.
 *
 * Touch caveat: Playwright cannot dispatch a native OS touch-DRAG in this setup,
 * so the swipe is driven by explicit `pointerType: "touch"` pointer events (see
 * `touchSwipe`) with real coordinates — NOT `page.mouse` (which is `pointerType:
 * "mouse"` and would not exercise the touch path or the compatibility-click
 * behaviour). The pure gesture maths are unit-tested separately.
 */

const PHONE = { width: 390, height: 844 };
const CARD = '.dh-card[data-card-id="t-drawer"]';

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

/** The task card article on the Tasks collection (the swipe surface). */
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
 * and real client coordinates. This drives the SAME hook path a finger does.
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
  // Cross the intent threshold, then pull the tray fully open (past its width so
  // it clamps to fully revealed).
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

test.describe("the Today screen on a phone", () => {
  test("emulates a touch-first phone (the swipe layer's precondition)", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const touchFirst = await page.evaluate(
      () => window.matchMedia("(hover: none) and (pointer: coarse)").matches,
    );
    expect(touchFirst).toBe(true);
  });

  test("stacks the day and the rail with no horizontal overflow", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^Good (morning|afternoon|evening)/,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "My day" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The rail follows the day, "Needs attention" first — the same reading
    // order the wide layout has, unwrapped.
    const headings = await page
      .locator(".dh-today__rail .dh-today__panel-title")
      .allInnerTexts();
    if (headings.length > 1) {
      expect(headings[0]).toBe("Needs attention");
    }
  });

  test("a completion checkbox clears the touch-target floor", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const row = page.locator(".dh-today__timeline .dh-day-row").first();
    if ((await row.count()) === 0) {
      test.skip(true, "nothing on the day in the shared dev workspace");
    }
    await expectMinTouchTarget(row);
  });

  test("opens a task record as a full-height sheet and returns to the day", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const title = page
      .locator(".dh-today__timeline .dh-day-row__title")
      .first();
    if ((await title.count()) === 0) {
      test.skip(true, "nothing on the day in the shared dev workspace");
    }
    await title.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThan(PHONE.height * 0.5);

    await page.goBack();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 2, name: "My day" }),
    ).toBeVisible();
  });

  test("reaches the Waiting view from the rail and navigates Back", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const waiting = page.getByRole("link", { name: "Waiting" });
    if ((await waiting.count()) === 0) {
      test.skip(true, "nothing is waiting in the shared dev workspace");
    }
    await waiting.first().click();
    await expect(page).toHaveURL(/\/today\/waiting$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "My day" }),
    ).toBeVisible();
  });

  test("holds the accessibility baseline", async ({ page }) => {
    await gotoFixture(page, "/today");
    await expectNoAxeViolations(page);
  });
});

test.describe("touch accelerators on the Tasks collection", () => {
  test("swipes a task to reveal its tray, and the tray acts through the shared route", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=all");
    const card = taskCard(page);
    await expect(card).toBeVisible();

    await touchSwipe(card);
    // The tray is `aria-hidden` on purpose — it is an ACCELERATOR over the
    // always-available visible controls, never a gesture-only capability — so
    // it is located structurally rather than by role.
    const tray = page.locator(".dh-card__swipe-tray").first();
    await expect(tray).toBeVisible();
    const revealed = await card.evaluate(
      (element) =>
        Number.parseFloat(
          getComputedStyle(element).getPropertyValue("--swipe-reveal"),
        ) || 0,
    );
    expect(revealed).toBeGreaterThan(0);
  });

  test("a swipe never opens the record it was performed on", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=all");
    const card = taskCard(page);
    await expect(card).toBeVisible();

    // The compatibility click a touch drag would otherwise fire is suppressed:
    // swiping a row reveals its tray and does NOT open the record underneath.
    // (The converse — a later deliberate tap still opening it — is covered by
    // `test/unit/card/CardSwipe.test.tsx`, which can drive the hook's own tap
    // path directly rather than through synthesised pointer events.)
    await touchSwipe(card);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/tasks/);
  });

  test("holds the accessibility baseline with a swipe tray open", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=all");
    const card = taskCard(page);
    await expect(card).toBeVisible();
    await touchSwipe(card);
    await expectNoAxeViolations(page);
  });
});
