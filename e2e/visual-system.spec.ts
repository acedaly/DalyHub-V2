/**
 * DS-14 / ADR-070 — shared visual-system contracts.
 *
 * These assertions stay behavioural enough for a visual system: they do not pin
 * pixels, but they do pin the hierarchy the owner asked for. In-flow surfaces are
 * card-on-tint with a full border and no raised shadow; floating command surfaces
 * keep raised elevation; Today's reference layout puts current work first at a
 * normal desktop width and preserves the phone stack.
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
  test("puts My day first on desktop, with secondary context on the right", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/today");

    const myDay = page.locator('[data-widget="my-day"]');
    const brief = page.locator('[data-widget="morning-brief"]');
    await expect(myDay).toBeVisible();
    await expect(brief).toBeVisible();

    const myDayBox = await myDay.boundingBox();
    const briefBox = await brief.boundingBox();
    expect(myDayBox).not.toBeNull();
    expect(briefBox).not.toBeNull();
    expect(myDayBox!.x).toBeLessThan(briefBox!.x);
    expect(Math.abs(myDayBox!.y - briefBox!.y)).toBeLessThanOrEqual(4);
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
  test("in-flow cards use card surfaces, full borders and no raised shadow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/today");

    const widgetStyle = await page
      .locator('[data-widget="my-day"]')
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          borderStyle: style.borderTopStyle,
          borderWidth: style.borderTopWidth,
          borderRadius: style.borderTopLeftRadius,
          boxShadow: style.boxShadow,
          card: getComputedStyle(document.documentElement)
            .getPropertyValue("--dh-color-surface-card")
            .trim(),
          page: getComputedStyle(document.documentElement)
            .getPropertyValue("--dh-color-surface-page")
            .trim(),
          raised: getComputedStyle(document.documentElement)
            .getPropertyValue("--dh-color-surface-raised")
            .trim(),
        };
      });

    expect(widgetStyle.borderStyle).toBe("solid");
    expect(parseFloat(widgetStyle.borderWidth)).toBeGreaterThan(0);
    expect(parseFloat(widgetStyle.borderRadius)).toBeGreaterThanOrEqual(15);
    expect(widgetStyle.boxShadow).toBe("none");
    expect(widgetStyle.card).not.toBe(widgetStyle.page);
    expect(widgetStyle.raised).not.toBe(widgetStyle.card);

    await gotoFixture(page, "/tasks");
    const rowShadow = await page
      .locator(".dh-card-collection--list .dh-card")
      .first()
      .evaluate((element) => getComputedStyle(element).boxShadow);
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
            .getPropertyValue("--dh-color-surface-raised")
            .trim(),
        };
      });

    expect(panelStyle.boxShadow).not.toBe("none");
    expect(panelStyle.raised).not.toBe("");
    expect(panelStyle.background).not.toBe("");
  });
});
