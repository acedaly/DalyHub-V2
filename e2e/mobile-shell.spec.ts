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
  test("puts Today, Tasks, Add, Projects and More within thumb reach", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    const bar = page.locator(bottomNav);
    await expect(bar).toBeVisible();

    // The registry-derived destinations plus the two shell controls, in order.
    const labels = await bar.locator(".dh-bottomnav__label").allTextContents();
    expect(labels).toEqual(["Today", "Tasks", "Add", "Projects", "More"]);

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

    await page
      .locator(bottomNav)
      .getByRole("link", { name: "Projects" })
      .click();
    await expect(page).toHaveURL(/\/projects/);

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

  /*
   * MOBILE-02 §8 — the safe-area half, which needs a device that reports one.
   *
   * Chromium has no way to emulate `env(safe-area-inset-*)`, so the ONE token
   * layer that reads them is overridden instead. That is a fair test rather
   * than a convenient one: `tokens.css` is explicit that no rule anywhere else
   * may read a raw `env(safe-area-inset-*)`, so overriding those four names IS
   * what a notched device does to this product.
   */
  const SAFE_AREA_DEVICE = `:root{
    --app-safe-area-bottom:34px;
    --app-safe-area-left:59px;
    --app-safe-area-right:59px;
  }`;

  for (const size of [PHONE, NARROW]) {
    test(`no label clips inside the safe area at ${size.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await gotoFixture(page, "/today");
      await page.addStyleTag({ content: SAFE_AREA_DEVICE });

      const measured = await page
        .locator(`${bottomNav} .dh-bottomnav__label`)
        .evaluateAll((nodes) =>
          nodes.map((node) => ({
            text: node.textContent,
            // `scrollWidth > clientWidth` IS the ellipsis: the label sets
            // `text-overflow`, so this is the product telling us it gave up.
            truncated: node.scrollWidth > node.clientWidth + 0.5,
          })),
        );
      expect(measured.length).toBe(5);
      expect(measured.filter((label) => label.truncated)).toEqual([]);
    });
  }

  /*
   * …and the other half: the label's line is RESERVED, so the Capture control's
   * taller indicator cannot push its own label closer to the bar's edge than
   * its siblings'. Measured before this change at 393px: four labels 11px above
   * the bar's bottom and "Add" 4px above it.
   */
  test("every label sits the same distance from the bar's edge", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const clearances = await page.locator(bottomNav).evaluate((bar) => {
      const list = bar.querySelector(".dh-bottomnav__list");
      const bottom = list!.getBoundingClientRect().bottom;
      return [...bar.querySelectorAll(".dh-bottomnav__label")].map((label) =>
        Number((bottom - label.getBoundingClientRect().bottom).toFixed(1)),
      );
    });
    expect(clearances.length).toBe(5);
    // One value, whatever the glyph above it does.
    expect(new Set(clearances).size).toBe(1);
    expect(clearances[0]).toBeGreaterThan(0);
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
  /**
   * The capture surface enumerates the FIRST-CLASS RECORDS the product can
   * create, so this asserts the list rather than a count: the old name said
   * "all four types" while the body checked five, which is a test that had
   * already stopped describing the product once and would do it again.
   *
   * The pairing is what makes it truthful — each type is addressed by its own
   * test id AND its own visible label, so a chip cannot pass by being present
   * under someone else's word. Exact in both directions: a type quietly dropped
   * fails here, and so does one added without a deliberate decision.
   */
  const CAPTURE_TYPES = [
    { type: "task", label: "Task" },
    { type: "diary", label: "Diary entry" },
    { type: "meeting", label: "Meeting" },
    { type: "note", label: "Note" },
    { type: "asset", label: "Asset" },
    // HABITS-01 — a Habit is a first-class record, so the one global create
    // surface offers it rather than the module growing a "+" of its own.
    { type: "habit", label: "Habit" },
  ] as const;

  test("opens from the bottom bar and offers every capture type, Habit included", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Add", exact: true })
      .click();

    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();

    // Addressed by test id, not by accessible name: each option's name is its
    // label PLUS its description, so "Note" is legitimately a substring of both
    // the Note option and the Diary option's "A note about today".
    for (const { type, label } of CAPTURE_TYPES) {
      const chip = sheet.getByTestId(`capture-choose-${type}`);
      await expect(chip).toBeVisible();
      // Every type carries a real, visible word — never an unlabelled glyph —
      // and it is the word that belongs to THAT type.
      await expect(chip).toHaveText(label);
    }

    // MOBILE-02 — they are a CHIP ROW above the field rather than a list on a
    // screen of their own, so the labels are read from the chips. Compared as a
    // whole so an extra, a missing or a reordered chip all fail.
    const labels = await sheet.locator(".dh-capture-type").allTextContents();
    expect(labels).toEqual(CAPTURE_TYPES.map((entry) => entry.label));
    // No duplicates: two chips reading "Note" would be two ways to say one
    // thing, and the owner could not tell which one they had chosen.
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("says which capture type is active, and Habit can become it", async ({
    page,
  }) => {
    /*
     * HABITS-01 — the new type is not decoration on the row: choosing it makes
     * it the ACTIVE capture, announced by `aria-pressed` rather than by fill
     * alone, and exactly one type is active at a time.
     */
    await gotoFixture(page, "/today");
    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Add", exact: true })
      .click();
    const sheet = page.getByTestId("capture-sheet");
    const habit = sheet.getByTestId("capture-choose-habit");
    await habit.click();
    await expect(habit).toHaveAttribute("aria-pressed", "true");
    const pressed = sheet.locator('.dh-capture-type[aria-pressed="true"]');
    await expect(pressed).toHaveCount(1);
    // The chip row is a labelled group, so a screen-reader user can enumerate
    // the choice they are making.
    await expect(
      sheet.getByRole("group", { name: "Capture type" }),
    ).toBeVisible();
  });

  test("captures a Task from title plus Enter, then offers the next step", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page
      .locator(bottomNav)
      .getByRole("button", { name: "Add", exact: true })
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
     * TaskCapturePanel draws that destination two ways — plain text when the
     * capture has a default parent, and the searchable picker's trigger (empty
     * value reading "Inbox", a real destination rather than the absence of one)
     * when it does not — and which one the seeded owner gets is fixture state
     * this test has no business pinning. Asserting the metadata LINE rather than
     * either rendering keeps the contract exactly as strong: the test fails if
     * the sheet stops saying where the task goes, and passes for either way of
     * saying it.
     *
     * DHDS-09 moved it from a stacked form row to that line; the words it must
     * contain are unchanged.
     */
    await expect(
      sheet
        .locator(".dh-capture-meta")
        .filter({ hasText: /Project|Area|Inbox/ })
        .first(),
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
      .getByRole("button", { name: "Add", exact: true })
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
      .getByRole("button", { name: "Add", exact: true })
      .click();
    const sheet = page.getByTestId("capture-sheet");
    await sheet.getByTestId("capture-choose-note").click();
    await expect(sheet.getByLabel("Title")).toBeVisible();

    // MOBILE-02 — every type stays on screen while you write, so the other
    // types are one tap from any panel rather than one tap from a screen that
    // was one tap away.
    await expect(sheet.getByTestId("capture-choose-task")).toBeVisible();
  });

  test("closes on Escape without opening a nested trap", async ({ page }) => {
    await gotoFixture(page, "/today");
    const capture = page
      .locator(bottomNav)
      .getByRole("button", { name: "Add", exact: true });
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
      .getByRole("button", { name: "Add", exact: true })
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
      const capture = bar.getByRole("button", { name: "Add", exact: true });
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
