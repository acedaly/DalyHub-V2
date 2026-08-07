/**
 * CAPTURE-02 — the global Capture affordance, as GEOMETRY.
 *
 * PR #123 made global Capture DalyHub's primary routine-creation mechanism and
 * removed the duplicate create buttons from collection headers. The August 2026
 * interaction audit then found two things still wrong with it, and this file is
 * the regression net for both:
 *
 *   1. **The floating button covered content** (finding 1, high). It is
 *      `position: fixed` in the bottom-right corner, and any page whose content
 *      reached that corner put a control underneath it — on Settings, a combobox
 *      a pointer user could not fully click. The fix is a shell-level corner
 *      reservation (`--app-fab-band` / `--app-fab-inline-band`, consumed by
 *      `.dh-pane`), so the assertions below are geometric: no interactive
 *      element's rectangle may intersect the button's, on any representative
 *      page, at any scroll position.
 *   2. **A phone had the same global action twice** (DEBT-96) — the floating
 *      button and the bottom bar's Capture slot, in the same corner. The bar
 *      wins at those widths and the button is not rendered at all.
 *
 * Everything here is measured from the real DOM rather than compared against a
 * screenshot: an overlap is a fact about two rectangles, and a screenshot
 * baseline would fail for a hundred reasons that are not this one.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/** M3's window-size classes, which is what the shell actually answers. */
const COMPACT = { width: 400, height: 860 }; // < 600
const COMPACT_SMALL = { width: 320, height: 720 };
const MEDIUM = { width: 700, height: 1000 }; // 600–839
const EXPANDED = { width: 900, height: 1000 }; // 840–1199
const LARGE = { width: 1400, height: 1000 }; // 1200+

/** The pages whose content genuinely reaches the bottom-right corner. */
const SURFACES = [
  "/settings",
  "/settings?section=ai",
  "/today",
  "/tasks",
  "/projects",
  "/notes",
] as const;

/** The floating global Capture control. */
function fab(page: Page) {
  return page.locator("button.dh-fab");
}

/** The phone bar's Capture slot. */
function barCapture(page: Page) {
  return page
    .locator("[data-testid='bottom-nav']")
    .getByRole("button", { name: "Capture" });
}

/**
 * Every interactive element whose rectangle currently intersects the FAB's.
 *
 * Returns a short, human-readable description of each, so a failure names the
 * control that got covered rather than just saying "1 !== 0".
 */
async function overlappedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const button = document.querySelector("button.dh-fab");
    if (!button) {
      return [];
    }
    const rect = button.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return [];
    }
    const INTERACTIVE = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='combobox']",
      "[role='checkbox']",
      "[role='switch']",
      "[role='link']",
      "[tabindex]:not([tabindex='-1'])",
    ].join(", ");

    const hits: string[] = [];
    for (const element of document.querySelectorAll(INTERACTIVE)) {
      if (element === button || button.contains(element)) {
        continue;
      }
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) {
        continue;
      }
      // A tooltip is deliberately click-through and can be asked to appear
      // beside the button itself; it is not content the button is covering.
      if (element.closest("[role='tooltip']")) {
        continue;
      }
      const intersects =
        box.left < rect.right &&
        box.right > rect.left &&
        box.top < rect.bottom &&
        box.bottom > rect.top;
      if (intersects) {
        const name =
          element.getAttribute("aria-label") ??
          element.textContent?.trim().slice(0, 40) ??
          "";
        hits.push(
          `${element.tagName.toLowerCase()}.${String(element.className).split(" ")[0]} “${name}”`,
        );
      }
    }
    return hits;
  });
}

/** Scroll the document to its very end and let layout settle. */
async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(150);
}

test.describe("compact widths — ONE global Capture affordance, not two", () => {
  for (const viewport of [COMPACT_SMALL, COMPACT, MEDIUM]) {
    test(`at ${viewport.width}px the bottom bar owns Capture and the floating button is absent`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoFixture(page, "/today");

      // Exactly one global capture control, and it is the bar's.
      await expect(fab(page)).toBeHidden();
      await expect(barCapture(page)).toBeVisible();
      await expectMinTouchTarget(barCapture(page));

      // Hidden means GONE — not merely invisible. A `visibility`/opacity hide
      // would leave a phantom Tab stop and a phantom node in the accessibility
      // tree, which is the duplicate all over again for a keyboard or screen
      // reader user.
      expect(await fab(page).count()).toBeGreaterThan(0);
      expect(
        await page.evaluate(() => {
          const node = document.querySelector("button.dh-fab");
          return node ? getComputedStyle(node).display : null;
        }),
      ).toBe("none");

      await expectNoHorizontalOverflow(page);
    });
  }

  test("the bar's Capture opens the same global flow, with every type", async ({
    page,
  }) => {
    await page.setViewportSize(COMPACT);
    await gotoFixture(page, "/today");

    await barCapture(page).click();
    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();

    const changeType = sheet.getByTestId("capture-change-type");
    if (await changeType.isVisible()) {
      await changeType.click();
    }
    // The SAME four routine record types the floating button offers elsewhere.
    for (const type of ["task", "note", "meeting", "diary"]) {
      await expect(sheet.getByTestId(`capture-choose-${type}`)).toHaveCount(1);
    }
    await expect(
      sheet.getByRole("group", { name: "Capture type" }).getByRole("button"),
    ).toHaveCount(4);
  });

  test("closing capture returns focus to the bar's Capture control", async ({
    page,
  }) => {
    await page.setViewportSize(COMPACT);
    await gotoFixture(page, "/today");

    await barCapture(page).focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(barCapture(page)).toBeFocused();
  });

  test("contextual and empty-state creation are untouched by the rule", async ({
    page,
  }) => {
    // The rule removed a DUPLICATE of the global action. Controls that supply
    // context the global sheet cannot — the Diary header's create, which opens
    // capture on the DAY being viewed — are deliberately still there, and so is
    // the collection's empty-state creation action.
    await page.setViewportSize(COMPACT);
    await gotoFixture(page, "/diary");
    await expect(page.locator(".dh-diary-header-create")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "New Diary entry" }).first(),
    ).toBeVisible();
  });
});

test.describe("larger windows — the floating button stays, and covers nothing", () => {
  for (const viewport of [EXPANDED, LARGE]) {
    test(`at ${viewport.width}px Capture floats, is a ≥44px target, and has an accessible name`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoFixture(page, "/today");

      await expect(fab(page)).toBeVisible();
      await expect(fab(page)).toHaveAccessibleName(/capture/i);
      await expectMinTouchTarget(fab(page));
      // ...and the bar it replaces is not also on screen.
      await expect(barCapture(page)).toBeHidden();
    });
  }

  for (const viewport of [EXPANDED, LARGE]) {
    for (const path of SURFACES) {
      test(`at ${viewport.width}px the button covers no control on ${path}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await gotoFixture(page, path);
        await expect(fab(page)).toBeVisible();

        // At rest, where the page opens.
        expect(await overlappedControls(page)).toEqual([]);

        // ...and at the very end of the content, where the LAST interactive
        // control of the page lives. This is the half the bottom band buys, and
        // the half a short, barely-scrollable page (Settings) used to fail.
        await scrollToEnd(page);
        expect(await overlappedControls(page)).toEqual([]);

        // Reserving the corner must not have bought it with a sideways scroll.
        await expectNoHorizontalOverflow(page);
      });
    }
  }

  test("covers nothing in the DARK appearance either", async ({ page }) => {
    // The reservation is layout, not colour, so this is a cheap proof that the
    // fix is not accidentally appearance-specific — and it exercises the same
    // page the audit's own screenshot came from.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize(LARGE);
    await gotoFixture(page, "/settings");
    await expect(fab(page)).toBeVisible();
    expect(await overlappedControls(page)).toEqual([]);
    await scrollToEnd(page);
    expect(await overlappedControls(page)).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await page.emulateMedia({ colorScheme: null });
  });

  test("keyboard focus never parks a control underneath the button", async ({
    page,
  }) => {
    // The keyboard case falls out of the INLINE reservation rather than needing
    // a rule of its own: content never enters the button's column, so a control
    // reached by Tab or by `scrollIntoView` cannot land underneath it wherever
    // the scroller stops. That matters because a pointer user can work around
    // an overlap by scrolling and a keyboard user cannot.
    //
    // It is asserted here rather than assumed because the first attempt at it
    // used `scroll-padding-block-end`, which reserves a full-width band for a
    // control that occupies a corner — over-reserving, and making every
    // `scrollIntoView` overshoot by 104px into the sticky top app bar.
    await page.setViewportSize(LARGE);
    await gotoFixture(page, "/settings");

    const combobox = page.getByRole("combobox", {
      name: "Default task destination",
    });
    await combobox.scrollIntoViewIfNeeded();
    await combobox.focus();
    await page.waitForTimeout(150);
    expect(await overlappedControls(page)).toEqual([]);
  });

  test("steps aside while a bulk selection is live, and comes back after", async ({
    page,
  }) => {
    // The bulk-action bar sits in normal flow at the end of the collection, so
    // its trailing Cancel lands in the button's corner. The suppression rule
    // PR #121 added still holds — it simply matters at these widths now rather
    // than on a phone, where there is no floating button to suppress.
    await page.setViewportSize(EXPANDED);
    await gotoFixture(page, "/today");
    await expect(fab(page)).toBeVisible();

    const checkbox = page.getByRole("checkbox", { name: /^Select / }).first();
    await checkbox.check();

    const bulkBar = page.getByRole("group", { name: /Plan 1 selected task/ });
    await expect(bulkBar).toBeVisible();
    await expect(fab(page)).toBeHidden();

    // The click the button used to intercept.
    await bulkBar.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.getByRole("group", { name: /Plan .* selected/ }),
    ).toHaveCount(0);
    await expect(fab(page)).toBeVisible();
  });
});
