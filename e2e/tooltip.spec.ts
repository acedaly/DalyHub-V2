/**
 * M3-TIP — the ONE shared tooltip, in a real browser.
 *
 * The unit tests prove the primitive's behaviour in isolation. What only a real
 * browser can prove is the part the August 2026 audit's finding 2 was actually
 * about: that the tooltip reaches a KEYBOARD user (`:focus-visible` is a live
 * browser state, not something a DOM shim decides), that it is positioned
 * without pushing the page sideways at a viewport edge, and that adopting it on
 * the PR #124 editor toolbar left that toolbar's roving-tabindex model, its
 * disabled controls and its 44px targets exactly as they were.
 *
 * Light and Dark are both exercised, because the tooltip is the one surface in
 * the product painted with the `inverse-surface` pair.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const TOOLTIP = "[role='tooltip']";

function tooltip(page: Page): Locator {
  return page.locator(TOOLTIP);
}

/**
 * Hover a control and wait for ITS tooltip — the one `aria-describedby` points
 * at — to settle.
 *
 * The second `hover()` is not superstition. The editor toolbar is a horizontally
 * scrolling row with `scroll-snap`, so the first pointer move scrolls the
 * requested control into view and the snap then slides a DIFFERENT control under
 * the stationary pointer. Hovering again re-measures after the row has settled.
 * Asserting on the trigger's own `aria-describedby` rather than on "some tooltip
 * is visible" is what makes that observable instead of confusing.
 */
async function hover(control: Locator): Promise<void> {
  await control.hover();
  await control.hover();
  await expect(control).toHaveAttribute("aria-describedby", /.+/);
  await expect(tooltip(control.page())).toHaveCount(1);
}

/**
 * Focus a control the way a KEYBOARD user does.
 *
 * The tooltip opens on `:focus-visible`, not on bare focus — a pointer click
 * also focuses, and a tooltip answering a click is noise. `:focus-visible` is a
 * live browser state that depends on the last input MODALITY, so a test that
 * has just moved the mouse and then calls `.focus()` gets `:focus-visible`
 * false and no tooltip, correctly. Pressing a key first puts the browser back
 * into keyboard modality, which is the state being asserted about.
 */
async function focusByKeyboard(page: Page, control: Locator): Promise<void> {
  await page.keyboard.press("Tab");
  await control.evaluate((node: HTMLElement) => node.focus());
  await expect(control).toBeFocused();
}

/**
 * Reach a writing surface carrying the PR #124 shared editor toolbar.
 *
 * The SEEDED note, deliberately, and nothing here ever types into it. These
 * assertions are about hovering, focusing and arrowing across a toolbar — they
 * need a toolbar on screen, not a record of their own. An earlier draft created
 * a note per test through global capture, which was self-contained but wrote six
 * records into a database the whole suite shares, pushing older events out of
 * Today's Recent activity widget and breaking a spec that had nothing to do with
 * tooltips. A read-only fixture cannot do that.
 */
async function openNoteEditor(page: Page): Promise<void> {
  await gotoFixture(page, "/notes/n-search-e2e");
  await expect(page.locator(".dh-md-toolbar")).toBeVisible();
}

test.describe("the shared tooltip", () => {
  test("appears on pointer hover and goes when the pointer leaves", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const palette = page.locator(".dh-topbar__utility").first();

    await expect(tooltip(page)).toHaveCount(0);
    await hover(palette);
    await expect(tooltip(page)).toHaveText(/Command palette/);

    await page.mouse.move(4, 400);
    await expect(tooltip(page)).toHaveCount(0);
  });

  test("appears on KEYBOARD focus — the case `title` never covered", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const palette = page.locator(".dh-topbar__utility").first();

    // Focus arrives by keyboard, so the browser reports `:focus-visible` and the
    // tooltip is shown. This is the whole point of replacing `title`.
    await focusByKeyboard(page, palette);
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page)).toHaveText(/Command palette/);
  });

  test("is correctly associated with its trigger, and is not a Tab stop", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const palette = page.locator(".dh-topbar__utility").first();
    await hover(palette);

    const id = await tooltip(page).getAttribute("id");
    expect(id).toBeTruthy();
    await expect(palette).toHaveAttribute("aria-describedby", id!);
    // The NAME stays on the control; the tooltip only describes it.
    await expect(palette).toHaveAccessibleName("Command palette");
    await expect(tooltip(page)).not.toHaveAttribute("tabindex", /.*/);
    expect(
      await tooltip(page).evaluate(
        (node: HTMLElement) =>
          node.querySelectorAll("a[href], button, input, [tabindex]").length,
      ),
    ).toBe(0);
  });

  test("dismisses on Escape without disturbing focus", async ({ page }) => {
    await gotoFixture(page, "/today");
    const palette = page.locator(".dh-topbar__utility").first();
    await focusByKeyboard(page, palette);
    await expect(tooltip(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(tooltip(page)).toHaveCount(0);
    await expect(palette).toBeFocused();
  });

  test("positions safely at the viewport edge, with no horizontal overflow", async ({
    page,
  }) => {
    // The floating capture button sits hard against the right edge of the
    // window, which is the position most likely to push a naively-placed
    // tooltip past it and give the document a sideways scroll.
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoFixture(page, "/today");
    const capture = page.locator("button.dh-fab");
    await hover(capture);

    const box = await tooltip(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1024);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    await expectNoHorizontalOverflow(page);
  });

  test("renders in Light and in Dark", async ({ page }) => {
    // The stored preference is `system`, so emulating the DEVICE is the honest
    // way to exercise both halves of the one generated scheme — no preference
    // write, no second source of truth (APPEARANCE-01).
    const painted: string[] = [];
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await gotoFixture(page, "/today");
      const palette = page.locator(".dh-topbar__utility").first();
      await hover(palette);
      const background = await tooltip(page).evaluate(
        (node: HTMLElement) => getComputedStyle(node).backgroundColor,
      );
      // Painted, not transparent — the M3 plain-tooltip pair resolves in both.
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      painted.push(background);
      await page.mouse.move(4, 400);
    }
    // ...and it is a genuinely different container in each, rather than one
    // appearance quietly inheriting the other's.
    expect(painted[0]).not.toBe(painted[1]);
    await page.emulateMedia({ colorScheme: null });
  });

  test("reaches the phone shell's icon controls at a MEDIUM width", async ({
    page,
  }) => {
    // At 700px — M3's medium class — DalyHub still shows the phone top bar, whose
    // Back and Search are icon-only. A window this size is very often a pointer
    // AND keyboard device, which is exactly the user finding 2 said `title` was
    // failing.
    await page.setViewportSize({ width: 700, height: 1000 });
    await gotoFixture(page, "/today");

    const search = page.locator(".dh-mobilebar__action").last();
    await focusByKeyboard(page, search);
    await expect(tooltip(page)).toHaveText(/Search/);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(tooltip(page)).toHaveCount(0);
  });

  test("explains the shared overflow (⋯) trigger, and steps out of the way of its menu", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    // A CARD's ⋯ trigger — the same component the record header and every
    // EntityCard render, and the highest-traffic icon-only control in the
    // product. Its tooltip must say exactly what its accessible name says.
    const overflow = page.locator(".dh-card__action--overflow").first();
    const name = await overflow.getAttribute("aria-label");
    expect(name).toBeTruthy();
    // UIQ-002 — the rail is pointer-inert until its row is hovered; point at
    // the row first, as a person does, so the trigger can receive the pointer.
    await page
      .locator(".dh-card--list")
      .filter({ has: overflow })
      .first()
      .hover();
    await hover(overflow);
    await expect(tooltip(page)).toHaveText(name!);

    // Opening the menu retires the tooltip — the panel says far more than the
    // trigger's own label, and a tooltip floating over it is noise.
    await overflow.click();
    await expect(page.locator("[role='menu']").first()).toBeVisible();
    await expect(tooltip(page)).toHaveCount(0);
  });
});

test.describe("the editor toolbar — the tooltip's reference adoption", () => {
  test("shows the command and its shortcut, on hover and on focus", async ({
    page,
  }) => {
    await openNoteEditor(page);
    const bold = page.locator(".dh-md-toolbar [data-action='bold']");

    await hover(bold);
    await expect(tooltip(page)).toHaveText(/Bold/);
    // The shortcut is now RENDERED by the shared formatter rather than written
    // into a `title` string, so it is right on both platforms. CI is Linux.
    await expect(tooltip(page)).toHaveText(/Ctrl\+B/);
    const id = await tooltip(page).getAttribute("id");
    await expect(bold).toHaveAttribute("aria-describedby", id!);

    // ...and the same on keyboard focus, which `title` could never do.
    await page.mouse.move(4, 400);
    await expect(tooltip(page)).toHaveCount(0);
    await focusByKeyboard(page, bold);
    await expect(tooltip(page)).toHaveText(/Bold/);
  });

  test("has retired `title` from every toolbar control", async ({ page }) => {
    await openNoteEditor(page);
    const titles = await page.locator(".dh-md-toolbar button[title]").count();
    expect(titles).toBe(0);
  });

  test("keeps ONE Tab stop, arrow navigation and disabled Undo intact", async ({
    page,
  }) => {
    await openNoteEditor(page);
    const toolbar = page.locator(".dh-md-toolbar");

    // Undo is disabled on a freshly opened editor and is deliberately OUTSIDE
    // the roving stop — the PR #124 fix this must not regress.
    const undo = toolbar.locator("[data-action='undo']");
    await expect(undo).toBeDisabled();
    expect(await undo.evaluate((node: HTMLElement) => node.tabIndex)).toBe(-1);

    // Exactly one tab stop across the whole row.
    expect(
      await toolbar.evaluate(
        (node: HTMLElement) =>
          Array.from(node.querySelectorAll("button")).filter(
            (button) => button.tabIndex === 0,
          ).length,
      ),
    ).toBe(1);

    // Arrowing still moves focus, and the tooltip follows the focus rather than
    // accumulating.
    const bold = toolbar.locator("[data-action='bold']");
    await focusByKeyboard(page, bold);
    await expect(tooltip(page)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(toolbar.locator("[data-action='italic']")).toBeFocused();
    await expect(tooltip(page)).toHaveCount(1);
    await expect(tooltip(page)).toHaveText(/Italic/);
  });

  test("keeps 44px targets and no horizontal overflow while a tooltip shows", async ({
    page,
  }) => {
    await openNoteEditor(page);
    const bold = page.locator(".dh-md-toolbar [data-action='bold']");
    await expectMinTouchTarget(bold);
    await hover(bold);
    await expectMinTouchTarget(bold);
    await expectNoHorizontalOverflow(page);
  });

  test("explains a disabled control without making it usable", async ({
    page,
  }) => {
    // "What is this greyed-out button?" is a question a tooltip exists to
    // answer, and it is what `title` answered on the same control. What must
    // not change is the control: PR #124 keeps a disabled Undo out of the
    // toolbar's single tab stop, and the tooltip touches neither fact.
    await openNoteEditor(page);
    const undo = page.locator(".dh-md-toolbar [data-action='undo']");
    await expect(undo).toBeDisabled();

    await undo.hover({ force: true });
    await undo.hover({ force: true });
    await expect(undo).toHaveAttribute("aria-describedby", /.+/);
    await expect(tooltip(page)).toHaveText(/Undo/);
    await expect(undo).toBeDisabled();
    expect(await undo.evaluate((node: HTMLElement) => node.tabIndex)).toBe(-1);
  });

  test("does not interfere with the control's own action", async ({ page }) => {
    await openNoteEditor(page);
    const toolbar = page.locator(".dh-md-toolbar");
    const more = toolbar.locator("[data-action='more']");

    await hover(more);
    await more.click();
    // The click did what it always did: the secondary commands appeared.
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(toolbar.locator("[data-action='table']")).toBeVisible();
  });
});
