import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

/**
 * DHDS-13 — the geometry half of the commercial-quality gate's boundary.
 *
 * Everything here is a MEASUREMENT, because everything here was found by
 * measuring: a two-character priority mark sliced mid-glyph on every phone row,
 * a Project name reduced to one letter on Today's hero card, the product's
 * primary action rendered as a blank coloured block on a tablet, and one page
 * that never sat on the frame every other page shares. None of those is
 * expressible as "the CSS says X" — the CSS said the right thing in two of the
 * four cases and did nothing.
 *
 * The source-side half (which rules exist, which contracts are wired up) is
 * `test/unit/ui/dhds-13-commercial-quality.test.ts`.
 */

/** Every phone width the responsive matrix carries, plus the large handset. */
const PHONES = [
  { label: "320", width: 320, height: 720 },
  { label: "360", width: 360, height: 800 },
  { label: "375", width: 375, height: 812 },
  { label: "393", width: 393, height: 852 },
  { label: "430", width: 430, height: 932 },
] as const;

/**
 * The band in which the rail collapses to glyphs (DALYHUB_DESIGN_SYSTEM D38).
 * It opens ABOVE 768: the shell hides the rail entirely at exactly `48rem` and
 * gives that width the phone bar instead, so 768 itself is a phone.
 */
const TABLETS = [
  { label: "800", width: 800, height: 900 },
  { label: "900", width: 900, height: 900 },
  { label: "1023", width: 1023, height: 900 },
] as const;

/**
 * How many priority marks are painted WIDER than the box that clips them.
 *
 * `.dh-inline-select__label` is `overflow: hidden` so a long Project name can
 * ellipsise; when the priority cell hugged 4px short of its own mark, that same
 * rule chopped the digit in half — "P1" rendered as "P" plus a sliced stroke.
 * Comparing the two widths is the only way to catch it: nothing overflows the
 * document, no axe rule fires, and the row looks fine until you zoom.
 */
async function slicedPriorityMarks(page: Page): Promise<number> {
  return page.evaluate(() => {
    let sliced = 0;
    for (const cell of document.querySelectorAll(
      ".dh-taskrow__cell--priority",
    )) {
      const clip = cell.querySelector(".dh-inline-select__label");
      const mark = cell.querySelector(".dh-priority");
      if (!clip || !mark) continue;
      if (
        mark.getBoundingClientRect().width >
        clip.getBoundingClientRect().width + 0.5
      ) {
        sliced += 1;
      }
    }
    return sliced;
  });
}

test.describe("DHDS-13 — the phone task row prints what it draws", () => {
  for (const phone of PHONES) {
    test(`no priority mark is sliced at ${phone.label}px`, async ({ page }) => {
      await page.setViewportSize(phone);

      for (const route of ["/tasks", "/today"]) {
        await gotoFixture(page, route);
        expect(
          await slicedPriorityMarks(page),
          `${route} at ${phone.label}px slices its priority marks`,
        ).toBe(0);
      }
    });
  }

  test("keeps a readable Project stub on Today's Now row at 393px", async ({
    page,
  }) => {
    /*
     * 393px is the width most current handsets report, and it is where Today's
     * Now card landed between the tiers: the row's list is one container deeper
     * than the plain `/tasks` list, so the long relative date ("Over a year
     * ago") fitted and the Project paid for it. MEASURED before the fix: a 28px
     * label on a 99px name — "C…", which D32 already records as a fact that has
     * stopped carrying information.
     */
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoFixture(page, "/today");

    const painted = await page.evaluate(() => {
      const label = document.querySelector(
        ".dh-taskrow__cell--project .dh-inline-select__label",
      );
      if (!label) return null;
      return {
        painted: label.getBoundingClientRect().width,
        wanted: label.scrollWidth,
      };
    });

    expect(painted).not.toBeNull();
    // At least four fifths of the name, rather than a single character.
    expect(painted!.painted).toBeGreaterThan(painted!.wanted * 0.8);
  });

  /*
   * DEBT-193 — a hugging metadata cell paints its OWN content, or it is genuinely
   * out of room. There is no third case.
   *
   * The entry recorded this as an intrinsic-sizing quirk that six candidate
   * corrections failed to move; V2.4-GATE-02 found the actual cause, which was
   * neither intrinsic sizing nor unfixable: `task-list.css` has always declared
   * `margin-inline: 0` on a cell's inline-edit trigger ("no optical pull-back in
   * a grid: the CELL aligns the column"), and the rule lost the cascade to the
   * shared `[data-presentation="meta"]` rule, which is one compound selector
   * heavier. So every metadata trigger in a task row kept a `-4px` start margin —
   * subtracted from the hugging cell's intrinsic contribution and not given back
   * in layout.
   *
   * MEASURED on `/today` at 393px before the fix: 94.7 painted against 99 wanted
   * ("Conference t…"), 69.9 against 74, 49.1 against 53. After: 98.7 against 99,
   * 73.9 against 74, 53.1 against 53.
   *
   * The test asks the entry's own question — *does a label whose cell has spare
   * width paint its full `scrollWidth`?* — so a label that ellipsises because the
   * row is genuinely full is not a failure. "Spare width" is the metadata run's
   * leftover space beyond its own flex gaps.
   */
  /*
   * ONE test over both routes and every phone width, rather than one per width.
   *
   * A viewport change re-runs the media and container queries without a
   * navigation, and this assertion is pure geometry — so two page loads answer
   * the question ten would. The gate's partition budget is measured test time
   * (`scripts/e2e-partitions.mjs`), and ten redundant loads is real minutes.
   */
  test("a Project label with room paints its whole name at every phone width", async ({
    page,
  }) => {
    const offenders: string[] = [];
    for (const route of ["/today", "/tasks"]) {
      await page.setViewportSize(PHONES[0]);
      await gotoFixture(page, route);
      for (const phone of PHONES) {
        await page.setViewportSize(phone);
        await expect(page.getByTestId("task-row").first()).toBeVisible();
        offenders.push(
          ...(await page.evaluate((width) => {
            const found: string[] = [];
            for (const cell of document.querySelectorAll(
              ".dh-taskrow__cell--project",
            )) {
              const label = cell.querySelector(".dh-inline-select__label");
              const meta = cell.closest(".dh-taskrow__meta");
              if (!label || !meta) continue;
              const gap =
                Number.parseFloat(getComputedStyle(meta).columnGap || "0") || 0;
              const children = [...meta.children];
              const used = children.reduce(
                (total, child) => total + child.getBoundingClientRect().width,
                0,
              );
              const spare =
                meta.getBoundingClientRect().width -
                used -
                gap * Math.max(0, children.length - 1);
              const painted = label.getBoundingClientRect().width;
              const wanted = label.scrollWidth;
              // One pixel of tolerance: `scrollWidth` is an integer and the
              // painted box is fractional, so an exact fit reads as 98.69 vs 99.
              if (spare > 1 && painted < wanted - 1) {
                found.push(
                  `${width}px — ${label.textContent?.trim()}: painted ${painted.toFixed(1)} of ${wanted} with ${spare.toFixed(1)}px spare`,
                );
              }
            }
            return found;
          }, phone.width)),
        );
      }
    }
    expect(
      offenders,
      "a phone truncates a Project name that had room for it",
    ).toEqual([]);
  });
});

test.describe("DHDS-13 — the tablet rail keeps its primary action visible", () => {
  for (const tablet of TABLETS) {
    test(`Capture draws a glyph at ${tablet.label}px`, async ({ page }) => {
      await page.setViewportSize(tablet);
      await gotoFixture(page, "/today");

      const capture = page
        .getByRole("button", { name: "Capture", exact: true })
        .first();
      await expect(capture).toBeVisible();

      const glyph = await capture.locator("svg").first().boundingBox();
      expect(
        glyph?.width ?? 0,
        `the Capture button is a blank block at ${tablet.label}px`,
      ).toBeGreaterThan(8);
      expect(glyph?.height ?? 0).toBeGreaterThan(8);
    });
  }
});

test.describe("DHDS-13 — every page starts on the same vertical line", () => {
  const ROUTES = [
    "/today",
    "/tasks",
    "/plan",
    "/projects",
    "/goals",
    "/notes",
    "/areas",
    "/analytics",
  ];

  /** Desktop, the tablet glyph rail, a phone, and the narrowest supported. */
  const WIDTHS = [1440, 900, 393, 320];

  test("the page title takes the shell gutter at every width", async ({
    page,
  }) => {
    /*
     * One navigation per route, measured at all four widths — `setViewportSize`
     * re-lays out the document, so re-navigating per width would cost four
     * times the wall clock to assert exactly the same thing.
     */
    const gutters = new Map<string, Map<number, number>>();

    for (const route of ROUTES) {
      await gotoFixture(page, route);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const measured = await page.evaluate(() => {
          const heading = document.querySelector("h1");
          const pane = document.querySelector("main");
          if (!heading || !pane) return null;
          return Math.round(
            heading.getBoundingClientRect().x - pane.getBoundingClientRect().x,
          );
        });
        expect(measured, `${route} has no h1 inside the pane`).not.toBeNull();
        const byWidth = gutters.get(route) ?? new Map<number, number>();
        byWidth.set(width, measured!);
        gutters.set(route, byWidth);
      }
    }

    for (const width of WIDTHS) {
      const measured = ROUTES.map((route) => gutters.get(route)!.get(width)!);
      /*
       * One origin: every page agrees, and none of them is flush to the edge.
       *
       * The tolerance is ONE pixel and is not slack — `.dh-pane-header__title`
       * carries a 1px optical pull-back that Today's and Plan's own titles do
       * not, so a collection's `h1` sits one pixel to the left of theirs below
       * `md`. That is a sub-visual typographic nudge; a page sitting at 0 while
       * its neighbours sit at 16 — which is exactly what Plan did — is the
       * defect this guards, and the spread catches it either way.
       */
      const spread = Math.max(...measured) - Math.min(...measured);
      expect(
        spread,
        `pages disagree about the gutter at ${width}px: ${JSON.stringify(
          ROUTES.map((route, index) => [route, measured[index]]),
        )}`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.min(...measured),
        `a page is flush to the pane edge at ${width}px`,
      ).toBeGreaterThan(0);
    }
  });
});

test.describe("DHDS-13 — a record panel contains its own content", () => {
  for (const width of [1440, 1100]) {
    test(`nothing escapes the Task drawer at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await gotoFixture(page, "/tasks");
      await page.locator(".dh-taskrow a").first().click();

      const drawer = page.locator("[role='dialog']").first();
      await expect(drawer).toBeVisible();

      const escaping = await page.evaluate(() => {
        const panel = document.querySelector("[role='dialog']");
        if (!panel) return ["no drawer"];
        const bounds = panel.getBoundingClientRect();
        const out: string[] = [];
        for (const element of panel.querySelectorAll("*")) {
          const box = element.getBoundingClientRect();
          if (box.width === 0) continue;
          if (box.right > bounds.right + 0.5 || box.left < bounds.left - 0.5) {
            out.push(
              `${element.className || element.tagName}: ${(
                element.textContent ?? ""
              )
                .trim()
                .slice(0, 40)}`,
            );
          }
        }
        return out;
      });

      expect(escaping).toEqual([]);
    });
  }
});
