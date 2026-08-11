/**
 * CAPTURE-02 — the global Capture affordance, and the rule that there is ONE.
 *
 * PR #123 made global Capture DalyHub's primary routine-creation mechanism and
 * removed the duplicate create buttons from collection headers. DEBT-96 then
 * found that a phone still had the same global action twice — a floating button
 * and the bottom bar's Capture slot, in the same corner — and this file is the
 * regression net for the rule that settled it: **at any window size there is
 * exactly one global capture control, and it is the one that belongs to that
 * shell.**
 *
 * ── What UIX-01 changed under this file (HARDEN-01, 2026-08-11) ─────────────
 * The floating button is GONE at every width. M3 gives an application one FAB
 * for its most frequent creative act and DalyHub's was capture; UIX-01 moved
 * Create to the top app bar (`.dh-topbar__create`), where the reference design
 * puts it and where it is in normal flow. The geometry half of this file — an
 * overlap sweep proving a `position: fixed` circle trapped nothing in the
 * bottom-right corner — therefore lost its subject entirely, and is deleted
 * rather than re-pointed. See the note on the second block for why that was the
 * right call rather than the lazy one.
 *
 * What survives is measured from the real DOM rather than compared against a
 * screenshot: which control exists is a fact about the document, and a
 * screenshot baseline would fail for a hundred reasons that are not this one.
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

/** The desktop top app bar's Create control — the global capture action above `md`. */
function topBarCreate(page: Page) {
  return page.getByTestId("topbar-create");
}

/** The phone bar's Capture slot. */
function barCapture(page: Page) {
  return page
    .locator("[data-testid='bottom-nav']")
    .getByRole("button", { name: "Capture" });
}

test.describe("compact widths — ONE global Capture affordance, not two", () => {
  for (const viewport of [COMPACT_SMALL, COMPACT, MEDIUM]) {
    test(`at ${viewport.width}px the bottom bar owns Capture, and it is the only one`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoFixture(page, "/today");

      // Exactly one global capture control, and it is the bar's.
      await expect(barCapture(page)).toBeVisible();
      await expectMinTouchTarget(barCapture(page));

      // The desktop bar's Create is the OTHER global capture control, and it
      // must be GONE here rather than merely invisible. A `visibility`/opacity
      // hide would leave a phantom Tab stop and a phantom node in the
      // accessibility tree, which is DEBT-96's duplicate all over again for a
      // keyboard or screen-reader user — so the display value is asserted, not
      // just `toBeHidden()`.
      await expect(topBarCreate(page)).toBeHidden();
      const topBarDisplay = await page.evaluate(() => {
        const bar = document.querySelector(".dh-topbar");
        return bar ? getComputedStyle(bar).display : null;
      });
      expect(topBarDisplay).toBe("none");

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
    // The SAME types the floating button offers elsewhere — the four routine
    // record types, and Asset (ASSET-03).
    for (const type of ["task", "note", "meeting", "diary", "asset"]) {
      await expect(sheet.getByTestId(`capture-choose-${type}`)).toHaveCount(1);
    }
    await expect(
      sheet.getByRole("group", { name: "Capture type" }).getByRole("button"),
    ).toHaveCount(5);
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

test.describe("larger windows — Create is the top bar's, and it floats over nothing", () => {
  /*
   * UIX-01 RETIRED the floating button, and this block used to assert it.
   *
   * What stood here was ~150 lines proving that a `position: fixed` 56px circle
   * in the bottom-right corner covered nothing: an overlap sweep across six
   * surfaces at two widths, a dark-appearance repeat, a three-width check that
   * it took no inline width from the pane, and a bulk-selection suppression
   * journey. Every one of them opened with `await expect(fab(page)).toBeVisible()`
   * against a `button.dh-fab` that no longer exists, and all 19 failed for that
   * one reason (measured on run 31473135291, shard 3).
   *
   * They were DELETED rather than re-pointed at `.dh-topbar__create`, and that
   * is the whole judgement: a button in normal flow at the top of the page
   * cannot cover, trap or float over anything, so the assertions have no subject
   * left. Retargeting them would have produced 19 green tests that prove
   * nothing — which is worse than none, because the next person would trust
   * them. `--app-fab-band` survives under its historical name and now measures
   * the phone navigation bar; the band it reserves is asserted where it is
   * still real, in the compact block above and in `mobile-shell.spec.ts`.
   *
   * What IS still true at these widths, and is worth one test rather than
   * nineteen, is the invariant the whole file exists for: exactly ONE global
   * capture affordance, whatever the window is.
   */
  for (const viewport of [EXPANDED, LARGE]) {
    test(`at ${viewport.width}px Create is the top bar's, and the phone bar is not also on screen`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await gotoFixture(page, "/today");

      const create = topBarCreate(page);
      await expect(create).toBeVisible();
      await expect(create).toHaveAccessibleName(/new/i);
      await expectMinTouchTarget(create);

      // The phone bar's Capture slot is the same action, so it must not be here.
      await expect(barCapture(page)).toBeHidden();

      // In normal FLOW, at the top: it takes its own space rather than floating
      // over the canvas. That is the property that made the deleted overlap
      // sweep meaningful and makes this arrangement not need one — so it is
      // asserted, rather than left as a claim in a comment. `relative` counts
      // (the control carries a state layer, which needs a containing block);
      // `fixed` or `absolute` would not, and would put the sweep back on the
      // table.
      expect(["static", "relative", "sticky"]).toContain(
        await create.evaluate((node) => getComputedStyle(node).position),
      );

      await expectNoHorizontalOverflow(page);
    });
  }
});
