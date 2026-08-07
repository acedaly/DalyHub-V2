import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, gotoFixture } from "./helpers";

/**
 * M3-INT — the record header gives the record's NAME width priority.
 *
 * ── The defect this pins ─────────────────────────────────────────────────────
 * A production Project titled `Opo 1 2026` rendered as
 *
 *     Opo 1
 *     2026
 *
 * on an ordinary laptop, with hundreds of pixels of empty header beside it.
 * Measured on `/projects/pr-website` at 1440px before the fix: the title row was
 * 917px wide and the heading took 127px.
 *
 * The cause was NOT the flex sizing everyone looks at first. It was
 * `inline-size: 100%` on the inline heading editor's trigger
 * (`inline-edit.css`): a percentage inline-size cannot be resolved while the
 * ancestor it refers to is itself being measured, so the heading's max-content
 * contribution collapsed to roughly its longest word — and `.record-title` is a
 * flex item whose base size IS that contribution. That is why these tests
 * measure LINE BOXES rather than asserting a width: a width assertion would
 * have passed against several wrong implementations, and the thing that was
 * actually wrong was how many lines the owner saw.
 *
 * ── Why both headings ────────────────────────────────────────────────────────
 * The static heading was always correct; only the EDITABLE one wrapped. A suite
 * that covered static headings alone would not have caught this, so both
 * fixtures are measured at every width.
 */

/** The widths the review asked for, phone through wide desktop. */
const WIDTHS = [320, 400, 700, 900, 1024, 1280, 1440, 1920] as const;

/** How many line boxes an element's text occupies, measured in the browser. */
async function lineBoxes(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  });
}

/** The two fixture records that carry the reported short title. */
function shortTitleRegions(page: Page) {
  return {
    // `exact` matters: the inline region's name starts with the static one's.
    static: page.getByRole("region", {
      name: "Short title record",
      exact: true,
    }),
    inline: page.getByRole("region", {
      name: "Short title record with inline editing",
      exact: true,
    }),
  };
}

test.describe("M3-INT — record header title width priority", () => {
  for (const width of WIDTHS) {
    test(`\`Opo 1 2026\` stays on one line at ${width}px (static and inline-editable)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoFixture(page, "/design/record-layout");

      const regions = shortTitleRegions(page);
      for (const [kind, region] of Object.entries(regions)) {
        const title = region.locator(".record-title").first();
        await expect(title).toBeVisible();

        // The whole point: one line box, at every width, in both compositions.
        const text = region.locator(".record-title").first();
        const boxes = await lineBoxes(
          kind === "inline" ? text.locator(".dh-inline-edit__value") : text,
        );
        expect(
          boxes,
          `${kind} heading wrapped to ${boxes} lines at ${width}px`,
        ).toBe(1);

        // Ordinary words are never broken to achieve it.
        await expect(text).toContainText("Opo 1 2026");

        // The status chip and the actions are still there, beside or below it —
        // yielding space is allowed, disappearing is not.
        await expect(region.locator(".record-status")).toBeVisible();
        await expect(
          region.getByRole("button", { name: "Complete project" }),
        ).toBeVisible();
        await expect(
          region.getByRole("button", { name: /More actions/ }),
        ).toBeVisible();
      }

      await expectNoHorizontalOverflow(page);
    });
  }

  test("a genuinely long title still wraps naturally, with no overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await gotoFixture(page, "/design/record-layout");

    const region = page.getByRole("region", { name: "Long content record" });
    const title = region.locator(".record-title").first();
    await expect(title).toBeVisible();
    // Wrapping is the CORRECT behaviour here — the fix must not have bought
    // single-line short titles by refusing to wrap at all.
    expect(await lineBoxes(title)).toBeGreaterThan(1);
    await expectNoHorizontalOverflow(page);
  });

  test("the title takes the room it needs before the status chip is pushed away", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/design/record-layout");

    const region = shortTitleRegions(page).inline;
    const title = await region.locator(".record-title").first().boundingBox();
    const status = await region.locator(".record-status").boundingBox();
    const row = await region
      .locator(".record-header__titlerow")
      .first()
      .boundingBox();
    expect(title && status && row).toBeTruthy();

    // Beside the title, on the same line, not flung to the far edge of the row:
    // a header that stretches the heading to fill the row would "fix" the wrap
    // and leave the chip stranded a thousand pixels away from the name it
    // qualifies.
    expect(status!.y).toBeLessThan(title!.y + title!.height);
    expect(status!.x - (title!.x + title!.width)).toBeLessThan(64);
    // And the row itself is much wider than either — i.e. there was plenty of
    // space all along, which is what made the original wrap a defect.
    expect(row!.width).toBeGreaterThan(title!.width + status!.width + 200);
  });

  test("inline title editing still opens, saves and stays on one line", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, "/design/record-layout");

    const region = shortTitleRegions(page).inline;
    const trigger = region.getByRole("button", {
      name: /Project name: Opo 1 2026/,
    });
    await trigger.click();

    const input = region.getByRole("textbox", { name: "Project name" });
    await expect(input).toBeFocused();
    await input.fill("Q3 2026");
    await input.press("Enter");

    const value = region.locator(".dh-inline-edit__value");
    await expect(value).toHaveText("Q3 2026");
    expect(await lineBoxes(value)).toBe(1);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("M3-INT — the real Project record", () => {
  test("a seeded record's title is single-line and its header is quiet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/projects/pr-website");
    await expect(
      page.getByRole("heading", { name: "Website relaunch" }),
    ).toBeVisible();

    const title = page.locator(".record-title .dh-inline-edit__value").first();
    expect(await lineBoxes(title)).toBe(1);

    /*
     * The header shows at most one primary and one secondary action; everything
     * else lives in the shared overflow (`MAX_VISIBLE_SECONDARY_ACTIONS` in
     * `RecordHeader`). Counting CONTROLS rather than naming them keeps this
     * honest if the module changes which action it considers most important.
     */
    const controls = page.locator(
      ".record-header__actions button, .record-header__actions a",
    );
    expect(await controls.count()).toBeLessThanOrEqual(3); // primary + secondary + ⋯
    await expect(
      page.getByRole("button", { name: /More actions/ }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
