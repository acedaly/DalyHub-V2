/**
 * CAPTURE-02 — the global Capture affordance, as GEOMETRY.
 *
 * PR #123 made global Capture DalyHub's primary routine-creation mechanism and
 * removed the duplicate create buttons from collection headers. The August 2026
 * interaction audit then found two things still wrong with it, and this file is
 * the regression net for both:
 *
 *   1. **The floating button covered content** (finding 1, high). It is
 *      `position: fixed` in the bottom-right corner, and content that reached
 *      that corner ended up underneath it. The contract this file pins is that
 *      nothing is ever TRAPPED there: `.dh-pane` reserves `--app-fab-band` at
 *      the end of its scroll, so the last interactive control on any page clears
 *      the button, and a page that does not scroll at all never puts one under
 *      it. A fixed button may still float OVER content mid-scroll — that is what
 *      floating means, and M3 says so. Reserving the button's COLUMN as well was
 *      implemented and reverted: it cost the entity galleries a whole grid track
 *      (2→1 columns at 900px, 4→3 at 1440px), which is the shared card geometry
 *      paying for the shell. The last test in this file pins that reversal.
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
      test(`at ${viewport.width}px nothing is trapped under the button on ${path}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await gotoFixture(page, path);
        await expect(fab(page)).toBeVisible();

        // Scrolled to the very end of the document, where the LAST interactive
        // control of the page lives. This is the case the reserved band buys and
        // the one that actually traps a user: a control they cannot reach by
        // scrolling, because there is no further to scroll.
        await scrollToEnd(page);
        expect(await overlappedControls(page)).toEqual([]);

        // A page that does not scroll at all has no "scroll it clear" escape
        // hatch, so it must be clear where it opens.
        const scrollable = await page.evaluate(
          () =>
            document.documentElement.scrollHeight >
            document.documentElement.clientHeight + 1,
        );
        if (!scrollable) {
          expect(await overlappedControls(page)).toEqual([]);
        }

        await expectNoHorizontalOverflow(page);
      });
    }
  }

  test("traps nothing in the DARK appearance either", async ({ page }) => {
    // The reservation is layout, not colour, so this is a cheap proof that the
    // fix is not accidentally appearance-specific — and it exercises the same
    // page the audit's own screenshot came from.
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize(LARGE);
    await gotoFixture(page, "/settings");
    await expect(fab(page)).toBeVisible();
    await scrollToEnd(page);
    expect(await overlappedControls(page)).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await page.emulateMedia({ colorScheme: null });
  });

  test("a control the button floats over can always be scrolled clear", async ({
    page,
  }) => {
    // The Settings combobox in the audit's own screenshot. A fixed button floats
    // over it where the page opens; what must be true is that the owner can get
    // it out from under the button, and that the page HAS somewhere to scroll to
    // do it. "Reachable by scrolling" is the honest contract for a floating
    // control — "never overlapped at any offset" was the stronger one, and it
    // cost the galleries a column to buy.
    await page.setViewportSize(LARGE);
    await gotoFixture(page, "/settings");

    const combobox = page.getByRole("combobox", {
      name: "Default task destination",
    });
    await expect(combobox).toBeVisible();

    await scrollToEnd(page);
    expect(await overlappedControls(page)).toEqual([]);
    // ...and it is still on screen down there, rather than having been scrolled
    // past — so "scroll it clear" is a real remedy and not a technicality.
    await expect(combobox).toBeInViewport();
  });

  /**
   * The FAB never buys its clearance from the content's width.
   *
   * An earlier draft reserved the button's COLUMN on `.dh-pane` as well as its
   * end band. It worked — nothing was under the button at any scroll offset —
   * and it was reverted, because the bill landed on the entity galleries: at
   * 900px Areas/Projects/Goals dropped from two columns to one (by EIGHT pixels
   * of `minmax()` boundary) and at 1440px from four to three, making a Projects
   * page 45% longer to scroll. That is the shared card/grid geometry paying for
   * the shell, and it lands hardest on the window class the audit's findings 4
   * and 5 already call starved.
   *
   * This asserts the reversal directly, at the widths where it cost the most, so
   * nobody re-introduces it without meeting this test.
   */
  /** The gallery column count each window earns from its own measure. */
  const GALLERY_COLUMNS: Readonly<Record<number, number>> = {
    900: 2,
    1024: 2,
    1440: 4,
  };

  for (const width of [900, 1024, 1440]) {
    test(`at ${width}px the button takes no inline width from the pane`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await gotoFixture(page, "/projects");
      await expect(fab(page)).toBeVisible();

      const pane = await page.evaluate(() => {
        const node = document.querySelector(".dh-pane") as HTMLElement;
        const style = getComputedStyle(node);
        return {
          inlineEnd: Math.round(parseFloat(style.paddingInlineEnd)),
          inlineStart: Math.round(parseFloat(style.paddingInlineStart)),
        };
      });
      expect(pane.inlineEnd).toBe(0);
      expect(pane.inlineStart).toBe(0);

      // ...and the gallery still gets every column its own measure affords.
      const columns = await page.evaluate(() => {
        const grid = document.querySelector(".dh-ecard-grid");
        if (!grid) return null;
        return getComputedStyle(grid)
          .gridTemplateColumns.split(" ")
          .filter(Boolean).length;
      });
      expect(columns).toBe(GALLERY_COLUMNS[width]);
    });
  }

  test("steps aside while a bulk selection is live, and comes back after", async ({
    page,
  }) => {
    // The bulk-action bar sits in normal flow at the end of the collection, so
    // its trailing Cancel lands in the button's corner. The suppression rule
    // PR #121 added still holds — it simply matters at these widths now rather
    // than on a phone, where there is no floating button to suppress.
    //
    // Driven against `/tasks` rather than `/today`: the Today redesign replaced
    // the dashboard's multi-select collection with plain rows, so the Tasks
    // collection is where a bulk selection now lives. The rule under test — a
    // live selection hides the floating button so it cannot eat the bar's
    // trailing control — is unchanged, and is a SHARED CollectionLayout
    // behaviour rather than a Today one.
    await page.setViewportSize(EXPANDED);
    await gotoFixture(page, "/tasks?system=all");
    await expect(fab(page)).toBeVisible();

    const checkbox = page.getByRole("checkbox", { name: /^Select / }).first();
    await checkbox.check();

    const bulkBar = page.getByRole("group", { name: /1 selected/ });
    await expect(bulkBar).toBeVisible();
    await expect(fab(page)).toBeHidden();

    // The click the button used to intercept.
    await bulkBar.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("group", { name: /selected/ })).toHaveCount(0);
    await expect(fab(page)).toBeVisible();
  });
});
