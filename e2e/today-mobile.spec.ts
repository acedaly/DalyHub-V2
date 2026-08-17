import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  taskRow,
  taskRows,
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

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

/**
 * The task row on the Tasks collection — the swipe surface.
 *
 * It was `.dh-card[data-card-id="t-drawer"]`. DS-04 §5 replaced the generic
 * Card on this collection with `TaskRow` and records that it "did not keep the
 * swipe tray — it went with the Card", replacing it with the row's own two
 * COMMITTING gestures (`useTaskRowSwipe`): pull towards the inline end to
 * complete, towards the inline start to open the scheduler. A tray is a mode;
 * a commit is an act, in the hook's own words.
 *
 * So the three journeys below assert the gesture the product HAS, on the
 * surface they always ran against (`/tasks`, at a phone viewport with touch
 * emulated). `today-task-convergence.spec.ts` proves the same layer on Today;
 * this file is what proves it on the collection.
 */
function taskSwipeRow(page: Page): Locator {
  return taskRows(page).first();
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
 *
 * `release: false` leaves the finger DOWN, which is the only way to observe the
 * row mid-gesture: the edge is drawn while `[data-swipe-edge]` is set and the
 * hook clears it on release (`useTaskRowSwipe` — a permanent transform would
 * move every anchored popover the row opens, so the attribute cannot outlive
 * the gesture).
 */
async function touchSwipe(
  row: Locator,
  { release = true }: { release?: boolean } = {},
) {
  const box = await row.boundingBox();
  if (box === null) {
    throw new Error("task row has no layout box");
  }
  const y = box.y + box.height / 2;
  const startX = box.x + 24;
  const endX = box.x + box.width - 8;
  const base = { pointerId: 1, pointerType: "touch", bubbles: true } as const;
  await row.dispatchEvent("pointerdown", {
    ...base,
    button: 0,
    clientX: startX,
    clientY: y,
  });
  // Cross the intent threshold, then pull well past the commit point.
  for (let step = 1; step <= 6; step += 1) {
    await row.dispatchEvent("pointermove", {
      ...base,
      clientX: startX + ((endX - startX) * step) / 6,
      clientY: y,
    });
  }
  if (release) {
    await row.dispatchEvent("pointerup", {
      ...base,
      clientX: endX,
      clientY: y,
    });
  }
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
      page.getByRole("heading", { level: 2, name: "Today’s plan" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // UIX-01 — the day's supporting regions follow the Focus column in DOM
    // order, "Needs attention" first: the same reading order the wide layout
    // has, unwrapped. The two-column rail became three sibling regions, so the
    // panels are read off the body rather than off a `__rail` wrapper.
    const headings = await page
      .locator(".dh-today__rank--support .dh-today__panel-title")
      .allInnerTexts();
    if (headings.length > 1) {
      expect(headings[0]).toBe("Needs attention");
    }
  });

  test("a completion checkbox clears the touch-target floor", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const row = page.locator(".dh-today__timeline .dh-taskrow").first();
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
      .locator(".dh-today__timeline .dh-taskrow__title")
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
      page.getByRole("heading", { level: 2, name: "Today’s plan" }),
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
      page.getByRole("heading", { level: 2, name: "Today’s plan" }),
    ).toBeVisible();
  });

  test("holds the accessibility baseline", async ({ page }) => {
    await gotoFixture(page, "/today");
    await expectNoAxeViolations(page);
  });
});

test.describe("touch accelerators on the Tasks collection", () => {
  test("swipes a task to complete it, through the row's own control", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=all");
    const row = taskSwipeRow(page);
    await expect(row).toBeVisible();
    // The gesture layer arms itself after mount, and only on a touch-first
    // device — so this attribute is also the precondition for the two tests
    // below, which would otherwise pass by doing nothing.
    await expect(row).toHaveAttribute("data-swipe-enabled", "true");
    const title = (await row.getByTestId("task-row-open").innerText()).trim();

    // Mid-gesture the row draws the edge it would commit; on release it fires
    // that edge's action. Pulling towards the inline END reveals the START
    // edge, which is completion.
    await touchSwipe(row, { release: false });
    await expect(row).toHaveAttribute("data-swipe-edge", "start");
    await row.dispatchEvent("pointerup", {
      pointerId: 1,
      pointerType: "touch",
      bubbles: true,
      clientX: (await row.boundingBox())!.x + 360,
      clientY: (await row.boundingBox())!.y + 8,
    });

    /*
     * The accelerator fires the row's OWN control, never a swipe-only mutation
     * (`useTaskRowSwipe`: "Complete calls `onCompletedChange`, which is the
     * checkbox's own handler"), so the proof is the checkbox's own state.
     */
    await expect(
      taskRow(page, title).getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeChecked();
  });

  test("a swipe never opens the record it was performed on", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=all");
    const row = taskSwipeRow(page);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-swipe-enabled", "true");

    // The compatibility click a touch drag would otherwise fire is suppressed
    // by the hook's capture-phase guard: swiping a row acts on it and does NOT
    // open the record underneath. (The converse — a later deliberate tap still
    // opening it — is covered by the hook's own unit tests, which can drive the
    // tap path directly rather than through synthesised pointer events.)
    await touchSwipe(row);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/\/tasks/);
  });

  test("holds the accessibility baseline mid-swipe", async ({ page }) => {
    await gotoFixture(page, "/tasks?system=all");
    const row = taskSwipeRow(page);
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-swipe-enabled", "true");
    // Scanned with the finger still DOWN, because that is the only state in
    // which the row draws its swipe affordance at all.
    await touchSwipe(row, { release: false });
    await expect(row).toHaveAttribute("data-swipe-edge", "start");
    await expectNoAxeViolations(page);
  });
});
