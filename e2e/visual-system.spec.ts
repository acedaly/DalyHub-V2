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
   * POLISH-02 supersedes the DS-15 arrangement this test used to pin.
   *
   * DS-15 put `morning-brief` in the SECONDARY column beside `my-day`, and the
   * assertion here was that My day started to the left of the brief on the same
   * row. Today is now three regions rather than two columns: the brief is a
   * full-width HERO band above both columns, because a greeting, the date and the
   * day's at-a-glance counts are orientation for the whole page rather than
   * reference material for one column of it.
   *
   * The hierarchy DS-15 was protecting is unchanged and is still pinned below —
   * current work leads, secondary context sits to its right — so this is the same
   * contract measured against the arrangement that now expresses it.
   */
  test("leads with a full-width hero, then current work with secondary context beside it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/today");

    const hero = page.locator('[data-widget="morning-brief"]');
    const myDay = page.locator('[data-widget="my-day"]');
    const secondary = page.locator(".dh-today__column--secondary > *").first();
    await expect(hero).toBeVisible();
    await expect(myDay).toBeVisible();
    await expect(secondary).toBeVisible();

    const heroBox = (await hero.boundingBox())!;
    const myDayBox = (await myDay.boundingBox())!;
    const secondaryBox = (await secondary.boundingBox())!;
    const columnsWidth = (await page
      .locator(".dh-today__columns")
      .boundingBox())!.width;

    // The hero spans the surface and sits above the columns.
    expect(heroBox.width).toBeGreaterThan(columnsWidth * 0.95);
    expect(heroBox.y).toBeLessThan(myDayBox.y);
    expect(heroBox.y).toBeLessThan(secondaryBox.y);

    // Current work leads the primary column; secondary context is beside it, on
    // the same row and genuinely narrower.
    expect(myDayBox.x).toBeLessThan(secondaryBox.x);
    expect(Math.abs(myDayBox.y - secondaryBox.y)).toBeLessThanOrEqual(4);
    expect(secondaryBox.width).toBeLessThan(myDayBox.width);
  });

  test("keeps the phone layout stacked without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, "/today");

    const briefTop = await boxTop('[data-widget="morning-brief"]')(page);
    const myDayTop = await boxTop('[data-widget="my-day"]')(page);
    expect(briefTop).toBeLessThan(myDayTop);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("visual system — surface hierarchy", () => {
  test("in-flow cards sit on the card plane, above the page plane", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/today");

    const widgetStyle = await page
      .locator('[data-widget="my-day"]')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const root = getComputedStyle(document.documentElement);
        return {
          background: style.backgroundColor,
          borderStyle: style.borderTopStyle,
          borderRadius: style.borderTopLeftRadius,
          boxShadow: style.boxShadow,
          card: root.getPropertyValue("--md-app-color-surface-card").trim(),
          page: root.getPropertyValue("--md-app-color-surface-page").trim(),
          raised: root.getPropertyValue("--md-app-color-surface-raised").trim(),
        };
      });

    // ADR-074 replaced the bordered-card model this test used to pin. An M3
    // card separates itself from the page by its own PLANE plus elevation, not
    // by a hairline outline, so `border: none` here is the design, not a
    // regression — the assertion is inverted rather than deleted so the border
    // cannot quietly come back.
    expect(widgetStyle.borderStyle).toBe("none");
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
