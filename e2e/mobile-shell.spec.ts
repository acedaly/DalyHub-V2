import { expect, test } from "@playwright/test";

import {
  TOUCH_TARGET_MIN,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * MOBILE-01 — the phone application shell, driven end to end at a real phone
 * viewport with touch emulation.
 *
 * This is the spec that proves the central claim of MOBILE-01: that the daily
 * destinations are reachable one-handed, that capture is one tap from anywhere,
 * and that the complete registry-driven navigation is still one tap away — while
 * the desktop rail, its landmarks and its keyboard model are untouched.
 *
 * It deliberately asserts the CONTRACT rather than the pixels: which controls
 * exist, what they are called, where they go, that exactly one is marked active,
 * and that nothing overflows or loses focus.
 */

const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 568 };
const LANDSCAPE = { width: 844, height: 390 };

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

/** The phone bottom bar. */
const bottomNav = "[data-testid='bottom-nav']";

test.describe("MOBILE-01 phone bottom navigation", () => {
  test("puts Today, Tasks, Capture, Diary and More within thumb reach", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    const bar = page.locator(bottomNav);
    await expect(bar).toBeVisible();

    // The registry-derived destinations plus the two shell controls, in order.
    const labels = await bar.locator(".dh-bottomnav__label").allTextContents();
    expect(labels).toEqual(["Today", "Tasks", "Capture", "Diary", "More"]);

    // It is its own labelled landmark, distinct from the sidebar's "Primary".
    await expect(
      page.getByRole("navigation", { name: "Quick navigation" }),
    ).toBeVisible();
  });

  test("marks exactly one destination active, by more than colour", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const bar = page.locator(bottomNav);

    // `aria-current` is the semantic signal; the indicator bar is the visual one.
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(bar.locator('[aria-current="page"]')).toContainText("Tasks");

    await gotoFixture(page, "/today");
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(bar.locator('[aria-current="page"]')).toContainText("Today");

    // A route that is not a phone destination marks none of them active rather
    // than leaving a stale highlight.
    await gotoFixture(page, "/settings");
    await expect(bar.locator('[aria-current="page"]')).toHaveCount(0);
  });

  test("navigates in one tap and honours browser Back", async ({ page }) => {
    await gotoFixture(page, "/today");

    await page.locator(bottomNav).getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/tasks/);

    await page.locator(bottomNav).getByRole("link", { name: "Diary" }).click();
    await expect(page).toHaveURL(/\/diary/);

    // Destinations are real links, so Back walks the history normally.
    await page.goBack();
    await expect(page).toHaveURL(/\/tasks/);
    await page.goBack();
    await expect(page).toHaveURL(/\/today/);
  });

  test("meets the 44px target on every control, including at 320px", async ({
    page,
  }) => {
    for (const viewport of [PHONE, NARROW]) {
      await page.setViewportSize(viewport);
      await gotoFixture(page, "/today");
      const controls = page.locator(`${bottomNav} .dh-bottomnav__control`);
      const count = await controls.count();
      expect(count).toBe(5);
      for (let index = 0; index < count; index += 1) {
        await expectMinTouchTarget(controls.nth(index));
      }
    }
  });

  test("keeps every label visible — no icon-only primary navigation", async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await gotoFixture(page, "/today");
    const labels = page.locator(`${bottomNav} .dh-bottomnav__label`);
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(labels.nth(index)).toBeVisible();
      expect(
        (await labels.nth(index).textContent())?.trim().length,
      ).toBeGreaterThan(0);
    }
  });

  test("is hidden on desktop, where the rail is unchanged", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFixture(page, "/today");
    await expect(page.locator(bottomNav)).toBeHidden();
    await expect(page.locator(".dh-sidebar--rail")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
  });
});

test.describe("MOBILE-01 the More navigation sheet", () => {
  test("opens the COMPLETE registry navigation and restores focus on close", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    const more = page.locator(bottomNav).getByRole("button", { name: "More" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.click();

    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await expect(sheet).toBeVisible();

    // Every module the bottom bar does not carry is still one tap away.
    for (const label of [
      "Meetings",
      "Projects",
      "Areas",
      "Goals",
      "Notes",
      "People",
      "Assets",
      "Reviews",
    ]) {
      await expect(sheet.getByRole("link", { name: label })).toBeVisible();
    }
    await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();

    // Escape closes only this surface and returns focus to what opened it.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
  });

  test("reaches Search in no more than two taps", async ({ page }) => {
    await gotoFixture(page, "/today");
    // One: the compact top bar's Search control. (The More sheet is the second
    // route to it, so Search is never more than two taps from anywhere.)
    await page
      .locator(".dh-mobilebar")
      .getByRole("button", { name: "Search" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("MOBILE-01 shared Quick Capture", () => {
  test("opens from the bottom bar and offers all four types", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Capture" })
      .click();

    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();

    // Addressed by test id, not by accessible name: each option's name is its
    // label PLUS its description, so "Note" is legitimately a substring of both
    // the Note option and the Diary option's "A note about today". The visible
    // labels are asserted separately below.
    for (const type of ["task", "diary", "meeting", "note", "asset"]) {
      await expect(sheet.getByTestId(`capture-choose-${type}`)).toBeVisible();
    }

    // Every option carries a real, visible word — never an unlabelled glyph.
    const labels = await sheet
      .locator(".dh-sheet-option__label")
      .allTextContents();
    expect(labels).toEqual(["Task", "Diary entry", "Meeting", "Note", "Asset"]);
  });

  test("captures a Task from title plus Enter, then offers the next step", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Capture" })
      .click();

    const sheet = page.getByTestId("capture-sheet");
    await sheet.getByTestId("capture-choose-task").click();

    // Choosing a type focuses the field being captured, so the interaction is
    // tap-type-Enter with no hunting for the input.
    const title = sheet.getByLabel("Title");
    await expect(title).toBeFocused();

    /*
     * TASKS-04's contract is unchanged — the sheet ALWAYS states where the task
     * will be filed, because "somewhere" is the one thing a trustworthy inbox
     * may never be. UIX-01 changed only WHERE it says so: the "Filing under …"
     * sentence and its two chip rows are gone, and the destination is now a
     * metadata row like every other.
     *
     * TaskCapturePanel draws that row two ways — a fixed read-only row when the
     * capture has a default parent, and the Project picker (empty value reading
     * "Inbox", a real destination rather than the absence of one) when it does
     * not — and which one the seeded owner gets is fixture state this test has
     * no business pinning. Asserting the ROW rather than either rendering keeps
     * the contract exactly as strong: the test fails if the sheet stops saying
     * where the task goes, and passes for either way of saying it.
     */
    await expect(
      sheet.locator(".dh-capture-row").filter({ hasText: "Project" }).first(),
    ).toBeVisible();

    await title.fill("Phone-captured task");
    await title.press("Enter");

    // Done / Open task / Add another — the same three next steps for every type.
    const result = page.getByTestId("capture-result");
    await expect(result).toBeVisible();
    await expect(page.getByTestId("capture-add-another")).toBeVisible();
    await expect(page.getByTestId("capture-open-record")).toBeVisible();
    await expect(page.getByTestId("capture-done")).toBeVisible();
  });

  test("clears the form and refocuses for a repeated capture", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Capture" })
      .click();
    const sheet = page.getByTestId("capture-sheet");
    await sheet.getByTestId("capture-choose-task").click();

    const title = sheet.getByLabel("Title");
    await title.fill("First captured task");
    await title.press("Enter");
    await expect(page.getByTestId("capture-result")).toBeVisible();

    await page.getByTestId("capture-add-another").click();
    const nextTitle = sheet.getByLabel("Title");
    await expect(nextTitle).toHaveValue("");
    await expect(nextTitle).toBeFocused();
  });

  test("keeps the chooser one tap away from any panel", async ({ page }) => {
    await gotoFixture(page, "/today");
    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Capture" })
      .click();
    const sheet = page.getByTestId("capture-sheet");
    await sheet.getByTestId("capture-choose-note").click();
    await expect(sheet.getByLabel("Title")).toBeVisible();

    await sheet.getByTestId("capture-change-type").click();
    await expect(sheet.getByTestId("capture-choose-task")).toBeVisible();
  });

  test("closes on Escape without opening a nested trap", async ({ page }) => {
    await gotoFixture(page, "/today");
    const capture = page
      .locator(bottomNav)
      .getByRole("button", { name: "Capture" });
    await capture.click();
    await expect(page.getByTestId("capture-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("capture-sheet")).toBeHidden();
    await expect(capture).toBeFocused();
  });
});

test.describe("MOBILE-01 phone shell baseline", () => {
  const ROUTES = [
    "/today",
    "/tasks",
    "/diary",
    "/meetings",
    "/projects",
    "/people",
    "/settings",
  ];

  for (const route of ROUTES) {
    test(`never overflows horizontally at 390px, 320px or landscape: ${route}`, async ({
      page,
    }) => {
      for (const viewport of [PHONE, NARROW, LANDSCAPE]) {
        await page.setViewportSize(viewport);
        await gotoFixture(page, route);
        await expectNoHorizontalOverflow(page);
        // The bar must never sit on top of the content it navigates.
        const bar = page.locator(bottomNav);
        if (await bar.isVisible()) {
          const box = await bar.boundingBox();
          expect(box).not.toBeNull();
          if (box) {
            expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
          }
        }
      }
    });
  }

  test("is axe-clean with the bottom bar and the capture sheet open", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await expectNoAxeViolations(page);

    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Capture" })
      .click();
    await expect(page.getByTestId("capture-sheet")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("is axe-clean in dark mode", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/today");
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  /*
   * WCAG 1.4.10 reflow, at the width the requirement actually implies.
   *
   * 200% zoom on a 390px phone is equivalent to halving the CSS viewport, which
   * is ~195px — narrower than any width in the shared responsive matrix, and the
   * width at which two reflow defects were measured and fixed by #158.
   *
   * HARDEN-01 widened this from `/today` alone to the core routes. The shell is
   * shared, so a change to it (this pass made one, to the Tasks row's trailing
   * band) can move the overflow from the page that was checked to one that was
   * not — and a reflow check on one route is a check on one route, not on the
   * shell. `/today` stays first because it is where the residual was reported.
   */
  for (const path of [
    "/today",
    "/tasks",
    "/projects",
    "/goals",
    "/notes",
    "/settings",
  ]) {
    test(`stays usable at 200% zoom: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 195, height: 422 });
      await gotoFixture(page, path);
      // The document must not require sideways scrolling…
      await expectNoHorizontalOverflow(page);
      // …and navigation must still be REACHABLE, because "no overflow" is
      // trivially satisfiable by hiding things and that is not the contract.
      const bar = page.locator(bottomNav);
      await expect(bar).toBeVisible();
      const capture = bar.getByRole("button", { name: "Capture" });
      await expect(capture).toBeVisible();

      /*
       * Target size against WCAG 2.2 AA (SC 2.5.8, 24x24 CSS px), NOT against
       * DalyHub's own 44px floor.
       *
       * MEASURED: five destinations across a 195px viewport give each one 39px
       * of width. That is the arithmetic of the width, not a defect — the bar
       * keeps its 44px HEIGHT, which is the axis a thumb travels on, and every
       * control stays hittable. Asserting 44 on both axes here would be
       * inventing a requirement the specification does not make and that no
       * arrangement of five labelled destinations can meet at 195px, and the
       * only way to "pass" it would be to redesign the bar.
       */
      const box = await capture.boundingBox();
      expect(box, "the Capture control has a box").not.toBeNull();
      expect(
        Math.min(box?.width ?? 0, box?.height ?? 0),
        "WCAG 2.2 AA target size (24x24)",
      ).toBeGreaterThanOrEqual(24);
      expect(
        box?.height ?? 0,
        "the bar keeps its 44px height",
      ).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN - 0.5);
    });
  }
});
