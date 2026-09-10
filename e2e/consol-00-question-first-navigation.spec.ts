/**
 * V2.16 CONSOL-00 - the question-first rail, driven end to end.
 *
 * The rail used to be grouped by SHAPE - daily / organise / more / system - and
 * `more` had become the second-largest block, holding money, commitments,
 * possessions, reflection, AI and a saved-perspective tool. V2.16 re-cut it into
 * the five QUESTIONS the product answers, so the rail says where to go for the
 * kind of question the owner has.
 *
 * What is proved HERE is only what is true of a running browser:
 *
 *   - the five questions are readable, in order, at a desktop width;
 *   - the grouping is in the accessibility tree rather than only on screen -
 *     each block's destinations are a list NAMED by its heading;
 *   - no URL moved, `/analytics` included, so a bookmark still works;
 *   - the phone bar is untouched at 393, and the sheet carries the same map;
 *   - the rail still fits, still has 44px targets on a coarse pointer, and
 *     still passes axe in both appearances.
 *
 * What is NOT here, and why: the model itself - group membership, ordering,
 * the hundred-band per group, the absence of a duplicate `navOrder`, the phone
 * opt-ins and every href - is asserted against the real registry in
 * `test/unit/modules/navigation-information-architecture.test.ts`, where it can
 * be falsified in milliseconds; `prefetch="intent"` on every row of every group
 * is `test/unit/shell/navigation-prefetch.test.tsx`, because React Router only
 * emits the tag from a built manifest and a browser assertion would pass
 * whatever the prop said. Only the claims a browser can settle are paid for
 * here.
 */

import { expect, test, type Locator } from "@playwright/test";

import {
  AXE_TAGS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  mobileNavigationOpener,
  waitForInteractive,
} from "./helpers";

/** The five questions, in rail order. `system` is separated by position. */
const QUESTIONS = ["Do", "Organise", "Deal with", "Money", "Understand"];

async function groupHeadings(scope: Locator): Promise<string[]> {
  return scope
    .locator("[data-nav-group] > span:not(.sr-only)")
    .allTextContents();
}

test.describe("V2.16 CONSOL-00 - the desktop rail reads as five questions", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("names each question once, in order, over the destinations it answers for", async ({
    page,
  }) => {
    await page.goto("/today");
    await waitForInteractive(page);
    const rail = page.getByRole("navigation", { name: "Primary" });

    // The headings, in the order the information architecture declares.
    expect(await groupHeadings(rail)).toEqual(QUESTIONS);

    /*
     * And they are not decoration: each block's destinations are a LIST that
     * carries the question as its accessible name, so a screen reader hears
     * "Money, list, 1 item" on entry rather than nothing at all. This is the
     * whole point of the release reaching a non-sighted owner.
     */
    for (const question of QUESTIONS) {
      const list = rail.getByRole("list", { name: question });
      await expect(list).toBeVisible();
      await expect(list.getByRole("listitem")).not.toHaveCount(0);
    }
    // The tools block is named too, because "separated by position" is a claim
    // about pixels and a screen reader has none.
    await expect(
      rail.getByRole("list", { name: "Tools and settings" }),
    ).toBeVisible();
  });

  test("puts each destination under the question it answers", async ({
    page,
  }) => {
    await page.goto("/today");
    await waitForInteractive(page);
    const rail = page.getByRole("navigation", { name: "Primary" });

    const within = async (question: string) =>
      rail
        .getByRole("list", { name: question })
        .getByRole("link")
        .allInnerTexts();

    expect(await within("Do")).toEqual([
      "Today",
      "Plan",
      "Inbox",
      "Upcoming",
      "Tasks",
    ]);
    expect(await within("Deal with")).toEqual(["Life Admin", "Assets"]);
    expect(await within("Money")).toEqual(["Finance"]);
    expect(await within("Understand")).toEqual([
      "Insight",
      "Reports",
      "Reviews",
      "AI",
    ]);
    expect(
      await rail
        .getByRole("list", { name: "Tools and settings" })
        .getByRole("link")
        .allInnerTexts(),
    ).toEqual(["Views", "Settings", "Help", "About"]);
  });

  test("moves no URL, and keeps the current row current", async ({ page }) => {
    // A relabel is not a migration. `/analytics` is the one most at risk: its
    // LABEL has said Insight since V2.13 and its route deliberately did not move.
    await page.goto("/today");
    await waitForInteractive(page);
    const rail = page.getByRole("navigation", { name: "Primary" });

    await expect(rail.getByRole("link", { name: "Insight" })).toHaveAttribute(
      "href",
      "/analytics",
    );
    await expect(rail.getByRole("link", { name: "Finance" })).toHaveAttribute(
      "href",
      "/finance",
    );
    await expect(
      rail.getByRole("link", { name: "Life Admin" }),
    ).toHaveAttribute("href", "/obligations");

    // Navigate into the Money block and stay anchored.
    await rail.getByRole("link", { name: "Finance" }).click();
    await expect(page).toHaveURL(/\/finance$/);
    await expect(rail.getByRole("link", { name: "Finance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(await rail.locator('[aria-current="page"]').count()).toBe(1);

    // …and the rail never says the retired product label.
    await expect(rail.getByText("Analytics", { exact: false })).toHaveCount(0);
  });

  test("keeps keyboard order equal to visual order", async ({ page }) => {
    // The blocks are separate lists now. If the DOM order and the painted order
    // disagreed, tabbing would jump between blocks - which is the failure a
    // grouped rebuild is most likely to introduce.
    await page.goto("/today");
    await waitForInteractive(page);
    const rail = page.getByRole("navigation", { name: "Primary" });
    const links = rail.getByRole("link");
    const count = await links.count();
    let previousBottom = -1;
    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box, `row ${index} should be laid out`).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(previousBottom);
      previousBottom = box!.y;
    }
    expect(count).toBe(24);
  });

  test("passes axe in both appearances, and fits without scrolling sideways", async ({
    page,
  }) => {
    await page.goto("/today");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page, {
      include: "[data-testid='sidebar-rail']",
    });

    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page, {
      include: "[data-testid='sidebar-rail']",
    });
    await page.emulateMedia({ colorScheme: "light" });
  });
});

test.describe("V2.16 CONSOL-00 - the tablet rail keeps every name", () => {
  // Between md and lg the rail collapses to a 68px column of glyphs and the
  // headings go with the labels. What must NOT go is the accessible name.
  test.use({ viewport: { width: 900, height: 900 } });

  test("collapses the headings and keeps every destination named", async ({
    page,
  }) => {
    await page.goto("/today");
    await waitForInteractive(page);
    const rail = page.getByRole("navigation", { name: "Primary" });
    for (const label of ["Today", "Finance", "Insight", "Settings"]) {
      await expect(rail.getByRole("link", { name: label })).toBeAttached();
    }
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("V2.16 CONSOL-00 - the phone is unchanged", () => {
  /*
   * `isMobile` + `hasTouch` is what makes Chromium report `(pointer: coarse)`,
   * and that is what restores the 44px navigation row (`--app-nav-row-height`
   * in `tokens.css`). A phone emulated by WIDTH alone reports `pointer: fine`
   * and measures the 36px cursor row - the exact mistake HARDEN-05 records
   * four journeys making.
   */
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });

  test("keeps the earned three-slot bar, and no more", async ({ page }) => {
    // A regroup makes Finance, Life Admin and Reports more prominent in the
    // rail. None of them earns a thumb slot for it: the bar is Today, Tasks,
    // Add, Projects, More for the whole of V2.
    await page.goto("/today");
    await waitForInteractive(page);
    const bar = page.locator("[data-testid='bottom-nav']");
    const labels = await bar.getByRole("link").allInnerTexts();
    const buttons = await bar.getByRole("button").allInnerTexts();
    expect(labels.map((label) => label.trim())).toEqual([
      "Today",
      "Tasks",
      "Projects",
    ]);
    expect(buttons.map((label) => label.trim())).toEqual(["Add", "More"]);
  });

  test("carries the complete grouped map in the sheet, with reachable targets", async ({
    page,
  }) => {
    await page.goto("/today");
    await waitForInteractive(page);
    await mobileNavigationOpener(page).click();
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await expect(sheet).toBeVisible();

    // The same five questions, readable at 393 - the sheet is where the whole
    // map lives on a phone, so this is where the grouping has to survive.
    expect(await groupHeadings(sheet)).toEqual(QUESTIONS);
    await expect(sheet.getByRole("list", { name: "Money" })).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Finance" })).toHaveAttribute(
      "href",
      "/finance",
    );

    // Every destination is still a 44px thumb target, and the sheet does not
    // push the page sideways.
    await expectMinTouchTarget(sheet.getByRole("link", { name: "Finance" }));
    await expectMinTouchTarget(sheet.getByRole("link", { name: "About" }));
    await expectNoHorizontalOverflow(page);

    await expectNoAxeViolations(page, { include: "[role='dialog']" });
    expect(AXE_TAGS.length).toBeGreaterThan(0);
  });
});
