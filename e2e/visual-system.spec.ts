/**
 * DS-14 / ADR-070 — shared visual-system contracts.
 *
 * These assertions stay behavioural enough for a visual system: they do not pin
 * pixels, but they do pin the hierarchy the owner asked for. In-flow surfaces sit
 * on the card plane above the page plane; floating command surfaces keep raised
 * elevation; Today's reference layout puts current work first at a normal desktop
 * width and preserves the phone stack.
 *
 * POLISH-02 changed HOW Today expresses that hierarchy (a full-width hero above
 * two columns, rather than two columns alone) and the first test was rewritten
 * against the new arrangement. The contract itself is unchanged.
 *
 * ADR-074 / M3-01 changed how a card expresses SEPARATION. It used to be a
 * hairline border on a tinted page with no shadow; it is now the M3 elevated
 * card — its own plane at `corner-large` with elevation 1 and no border — and
 * the `--dh-color-surface-*` tokens these tests read were renamed to
 * `--md-app-color-surface-*`. Both were missed when the vocabulary moved, so
 * these two tests had been failing on `main` ever since: `getPropertyValue` on a
 * token that no longer exists returns "", and "" === "", so every
 * surface-separation assertion here was comparing one empty string with another.
 * They are rewritten against the real model rather than deleted.
 */

import { expect, test } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";

function boxTop(selector: string) {
  return (page: import("@playwright/test").Page) =>
    page
      .locator(selector)
      .first()
      .boundingBox()
      .then((box) => box?.y ?? 0);
}

test.describe("visual system — Today reference layout", () => {
  /*
   * The Today redesign supersedes both the DS-15 two-column arrangement and the
   * POLISH-02 hero/primary/secondary regions this test used to pin.
   *
   * The hierarchy each of those was protecting is unchanged and is still pinned
   * below — the day's work leads, supporting context sits to its right — so this
   * is the same contract measured against the arrangement that now expresses it:
   * a header block of page content, then two tonal columns.
   */
  test("leads with page content, then the day with its rail beside it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/today");

    const header = page.locator(".dh-today__head");
    const day = page.locator(".dh-today__timeline");
    const rail = page.locator(".dh-today__rail");
    await expect(header).toBeVisible();
    await expect(day).toBeVisible();
    await expect(rail).toBeVisible();

    const headerBox = (await header.boundingBox())!;
    const dayBox = (await day.boundingBox())!;
    const railBox = (await rail.boundingBox())!;

    // The greeting block is PAGE CONTENT above both columns — no card around it.
    expect(headerBox.y).toBeLessThan(dayBox.y);
    expect(headerBox.y).toBeLessThan(railBox.y);
    await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    // The day leads; the rail is beside it, on the same row and narrower.
    expect(dayBox.x).toBeLessThan(railBox.x);
    expect(Math.abs(dayBox.y - railBox.y)).toBeLessThanOrEqual(4);
    expect(railBox.width).toBeLessThan(dayBox.width);
  });

  test("each column is ONE tonal surface, with no outline and no shadow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/today");

    const style = await page
      .locator(".dh-today__timeline")
      .evaluate((element) => {
        const computed = getComputedStyle(element);
        const root = getComputedStyle(document.documentElement);
        return {
          background: computed.backgroundColor,
          borderStyle: computed.borderTopStyle,
          borderRadius: computed.borderTopLeftRadius,
          boxShadow: computed.boxShadow,
          page: root.getPropertyValue("--md-app-color-surface-page").trim(),
        };
      });

    // Separation is carried by SURFACE VALUE, not by an outline and not by a
    // shadow: nothing on this screen floats.
    expect(style.borderStyle).toBe("none");
    expect(style.boxShadow).toBe("none");
    expect(parseFloat(style.borderRadius)).toBeGreaterThanOrEqual(15);
    expect(style.background).not.toBe(style.page);
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("there is no card inside a column — rows are plain, with hairlines", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/today");
    // No panel-in-panel: a column holds rows, never nested cards.
    await expect(page.locator(".dh-today__panel .dh-card")).toHaveCount(0);
  });

  test("keeps the phone layout stacked without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, "/today");

    const headerTop = await boxTop(".dh-today__head")(page);
    const dayTop = await boxTop(".dh-today__timeline")(page);
    const railTop = await boxTop(".dh-today__rail")(page);
    expect(headerTop).toBeLessThan(dayTop);
    expect(dayTop).toBeLessThan(railTop);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("visual system — surface hierarchy", () => {
  test("in-flow cards sit on the card plane, above the page plane", async ({
    page,
  }) => {
    /*
     * Measured on a real CARD surface. Today's own columns are deliberately
     * shadowless tonal regions (pinned above), so the plane contract is asserted
     * where the product genuinely uses a card.
     *
     * WHICH card that is has changed. This used to read `.dh-card` — the shared
     * record Card — off the Projects grid, and pin ADR-074's rule for a Card
     * presented in a grid or on a board: the group's surface and hairline, and
     * no shadow. That rule now has nothing to govern. Projects, Goals and Areas
     * all moved their grids to `EntityCard`, and `CardCollection` is only ever
     * constructed with `presentation="list"`, so `.dh-card-collection--grid`
     * and `--board` have no consumer left and `/projects` carries no `.dh-card`
     * at all.
     *
     * The in-flow card of the product is therefore `.dh-ecard`, and the contract
     * it answers to is the card FAMILY's, stated in `card-family.css`: "the
     * generated card surface, `corner-large`, one hairline, and elevation 1 …
     * the hairline exists because the card sits only 2.5 tones above the page,
     * and tone alone leaves the edge ambiguous at that distance." So all three
     * treatments are still pinned; each is pinned to the value that file
     * actually decides on, rather than to the one the retired grid rule did.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/projects");

    const widgetStyle = await page
      .locator(".dh-ecard")
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const root = getComputedStyle(document.documentElement);
        return {
          background: style.backgroundColor,
          borderStyle: style.borderTopStyle,
          borderWidth: style.borderTopWidth,
          borderRadius: style.borderTopLeftRadius,
          boxShadow: style.boxShadow,
          card: root.getPropertyValue("--md-app-color-surface-card").trim(),
          page: root.getPropertyValue("--md-app-color-surface-page").trim(),
          raised: root.getPropertyValue("--md-app-color-surface-raised").trim(),
        };
      });

    // One hairline, `corner-large`, and a real elevation-1 shadow — the three
    // treatments the card family names, none of which may quietly disappear.
    expect(widgetStyle.borderStyle).toBe("solid");
    expect(parseFloat(widgetStyle.borderWidth)).toBeGreaterThan(0);
    expect(parseFloat(widgetStyle.borderRadius)).toBeGreaterThanOrEqual(15);
    expect(widgetStyle.boxShadow).not.toBe("none");

    // The tokens resolve at all (a renamed token silently returns "").
    expect(widgetStyle.card).not.toBe("");
    expect(widgetStyle.page).not.toBe("");
    expect(widgetStyle.raised).not.toBe("");

    // The separation that actually matters, and the one the neutral app-surface
    // layer exists to guarantee: a card is never the same colour as the page it
    // sits on. `raised` is deliberately NOT asserted to differ from `card` —
    // in the light scheme both are pure white and elevation is carried by the
    // shadow, which is exactly what M3 prescribes.
    expect(widgetStyle.card).not.toBe(widgetStyle.page);

    await gotoFixture(page, "/tasks");
    const rowShadow = await page
      .locator(".dh-card-collection--list .dh-card")
      .first()
      .evaluate((element) => getComputedStyle(element).boxShadow);
    // A row inside a collection is not a card in its own right: it must stay
    // flat so the collection reads as one surface rather than a pile.
    expect(rowShadow).toBe("none");
  });

  test("floating command surfaces retain raised elevation above the page", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/command-palette");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await waitForInteractive(page);

    const panelStyle = await page
      .locator(".dh-command__panel")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          boxShadow: style.boxShadow,
          background: style.backgroundColor,
          raised: getComputedStyle(document.documentElement)
            .getPropertyValue("--md-app-color-surface-raised")
            .trim(),
        };
      });

    expect(panelStyle.boxShadow).not.toBe("none");
    expect(panelStyle.raised).not.toBe("");
    expect(panelStyle.background).not.toBe("");
  });
});
