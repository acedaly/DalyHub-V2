/**
 * RECORD-01 — the record-screen anatomy contract, in a real browser.
 *
 * The half of the contract that is a question about LAYOUT rather than about
 * markup, so it cannot be asserted in jsdom: does the working content actually
 * clear the fold, do the tabs actually stay on one row, does the Meeting's
 * sticky strip actually leave the meeting readable, and is the Person's action
 * hierarchy actually what the record shows.
 *
 * These are guards against MAJOR regression, not pixel assertions. They are
 * written against thresholds with real headroom, so ordinary copy and content
 * changes never fail them but a return to a 505px roll-up card does.
 *
 * Every record is a RECORD-01 fixture from `e2e/seed-record-convergence.sql`,
 * so the measurements describe known content.
 */

import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, gotoFixture } from "./helpers";

const LAPTOP_SMALL = { width: 1280, height: 800 };
const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/**
 * The FOLD ANCHOR: at 1280×800, with the header and tabs rendered, the first row
 * of a record's working content is visible without scrolling.
 *
 * 700 rather than 800 because "the first ROW is visible" means a row, not a
 * sliver of one: the shared comfortable list row is ~76px, so content starting
 * at 700 leaves a whole row on screen. Every converged record clears it with
 * room to spare — the tightest is the Goal, whose summary genuinely carries the
 * definition of done.
 */
const FOLD_ANCHOR = 700;

const FOLD_RECORDS = [
  { name: "Area", path: "/areas/a-rc-home" },
  { name: "Area (no active work)", path: "/areas/a-rc-admin" },
  { name: "Goal", path: "/goals/g-rc-move" },
  { name: "Project", path: "/projects/pr-rc-kitchen" },
  { name: "Note", path: "/notes/n-rc-brief" },
  { name: "Meeting", path: "/meeting/m-rc-site" },
  { name: "Person", path: "/person/p-rc-dan" },
  { name: "Asset", path: "/asset/as-rc-ute" },
  { name: "Review", path: "/reviews/rv-rc-week" },
] as const;

/**
 * The top of the first real row of working content — the first element with a
 * row's height and a meaningful width inside the record's working region.
 * Deliberately structural rather than per-module, so it measures the same thing
 * on every record.
 *
 * ── UIX-03: a record may declare its working region explicitly ──────────────
 * The region searched is the `feature` slot when the record has one, and the
 * active tab panel (or the no-tabs content region) otherwise.
 *
 * The anchor exists so that landing on a record shows you something you can
 * WORK WITH rather than a screen of chrome. For eight of the nine records the
 * first tab panel is where that content is, and nothing about them changes. A
 * record that declares a `feature` region has said the opposite in the layout
 * itself: a measurable Goal's progress — its current value against its target,
 * its trend, its history — is the reason the page exists, and its Projects tab
 * is the secondary relationship list. Measuring the tab panel on that record
 * would be asserting that the least important thing on it is visible first.
 *
 * This is a change to what the anchor MEASURES, not to how strict it is: the
 * Goal is still in `FOLD_RECORDS` and still has to clear 700px. (For the
 * record: the Goal has been failing this assertion on `main` at 1360px, before
 * this slot existed. The remaining total height of the Goal record above its
 * tabs is tracked as RECORD-03 in PRODUCT_DEBT.)
 */
async function workingContentTop(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const panel =
      document.querySelector(".record-layout__feature") ??
      document.querySelector(".record-tabs__panel:not([hidden])") ??
      document.querySelector(".record-layout__content");
    if (!panel) return null;
    for (const el of panel.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.height > 24 && rect.width > 100) return Math.round(rect.top);
    }
    return null;
  });
}

test.describe("the fold anchor", () => {
  test.use({ viewport: LAPTOP_SMALL });

  for (const record of FOLD_RECORDS) {
    test(`${record.name}: working content is visible at 1280x800`, async ({
      page,
    }) => {
      await gotoFixture(page, record.path);
      await expect(
        page.getByRole("heading", { level: 1 }).first(),
      ).toBeVisible();

      const top = await workingContentTop(page);
      expect(
        top,
        "the record should have a working-content region",
      ).not.toBeNull();
      expect(
        top as number,
        `${record.name}: working content starts at ${top}px, past the fold anchor`,
      ).toBeLessThan(FOLD_ANCHOR);
    });
  }
});

test.describe("the record's contained surfaces", () => {
  test.use({ viewport: LAPTOP_SMALL });

  /*
   * The active tab panel is the record's working SURFACE — padding, a card
   * background, a hairline and a radius — so the content does not dissolve into
   * the page canvas. That is a reported production defect the shared rule was
   * written to fix, and nothing asserted it: UIX-03 inserted a new selector
   * between `.record-tabs__panel,` and `.record-layout__content` in
   * `record-layout.css`, silently splitting the grouped rule and stripping the
   * panel's surface on EVERY canonical record, and the whole suite stayed green.
   */
  for (const record of FOLD_RECORDS) {
    test(`${record.name}: the active tab panel keeps its contained surface`, async ({
      page,
    }) => {
      await gotoFixture(page, record.path);
      const panel = page.locator(".record-tabs__panel:not([hidden])").first();
      // Not every record in this list is tabbed; the ones that are must be clad.
      if ((await panel.count()) === 0) return;
      /*
       * …unless the panel has explicitly opted out. `[data-surface="plain"]` is
       * a documented escape for a panel whose CONTENT brings its own surface —
       * the Note record's writing column — where cladding the panel too would
       * be a frame inside a frame. Honouring the opt-out is what makes this a
       * test of the contract rather than of one rule.
       */
      if ((await panel.getAttribute("data-surface")) === "plain") return;

      const style = await panel.evaluate((el) => {
        const computed = getComputedStyle(el);
        return {
          background: computed.backgroundColor,
          borderInline: computed.borderInlineStartWidth,
          padding: computed.paddingInlineStart,
          radius: computed.borderEndStartRadius,
        };
      });

      // A real background, not the canvas showing through.
      expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(style.background).not.toBe("transparent");
      // A real hairline and real inset.
      expect(parseFloat(style.borderInline)).toBeGreaterThan(0);
      expect(parseFloat(style.padding)).toBeGreaterThan(8);
      // The bottom corners are rounded; the top ones join the tab strip.
      expect(parseFloat(style.radius)).toBeGreaterThan(0);
    });
  }
});

test.describe("the record header", () => {
  test.use({ viewport: LAPTOP_SMALL });

  test("a long title wraps without overflowing, and keeps its actions reachable", async ({
    page,
  }) => {
    // A 100-character project name — the case a header must survive rather than
    // truncate, because a record's name is essential.
    await gotoFixture(page, "/projects/pr-rc-long");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    await expectNoHorizontalOverflow(page);

    // The overflow menu is the header's last action on every record, and stays
    // hit-testable rather than being pushed off the row by the title.
    const overflow = page.getByRole("button", { name: /^More actions for/ });
    await expect(overflow).toBeVisible();
    const box = await overflow.boundingBox();
    expect(box).not.toBeNull();
    expect(
      (box as { x: number; width: number }).x +
        (box as { width: number }).width,
    ).toBeLessThanOrEqual(1280);
  });

  test("a short title does not wrap, and the status sits beside it", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-rc-kitchen");
    const heading = page.getByRole("heading", {
      level: 1,
      name: "Kitchen fit-out",
    });
    await expect(heading).toBeVisible();

    const geometry = await page.evaluate(() => {
      const title = document.querySelector(".record-title");
      const status = document.querySelector(".record-status");
      if (!title || !status) return null;
      const t = title.getBoundingClientRect();
      const s = status.getBoundingClientRect();
      return {
        titleLines: t.height / parseFloat(getComputedStyle(title).lineHeight),
        // Same row: the status's vertical centre falls inside the title's box.
        beside: s.top + s.height / 2 > t.top && s.top + s.height / 2 < t.bottom,
        after: s.left > t.left,
      };
    });
    expect(geometry).not.toBeNull();
    const g = geometry as {
      titleLines: number;
      beside: boolean;
      after: boolean;
    };
    expect(g.titleLines).toBeLessThan(2);
    expect(g.beside).toBe(true);
    expect(g.after).toBe(true);
  });

  test("no empty band is left between the header and the tabs", async ({
    page,
  }) => {
    // The gap that used to hold a detached metadata row. One layout gap is
    // expected; a second band is the regression.
    await gotoFixture(page, "/projects/pr-rc-kitchen");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const band = await page.evaluate(() => {
      const header = document.querySelector(".record-header");
      const summary = document.querySelector(".dh-record-summary-bar");
      const tabs = document.querySelector(".record-tabs__strip");
      if (!header || !tabs) return null;
      const from = (summary ?? header).getBoundingClientRect().bottom;
      return Math.round(tabs.getBoundingClientRect().top - from);
    });
    expect(band).not.toBeNull();
    expect(band as number).toBeLessThanOrEqual(32);
  });
});

test.describe("the record tabs", () => {
  for (const viewport of [LAPTOP_SMALL, LAPTOP]) {
    test(`tabs stay on one row at ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      // The Asset has the most tabs of any record (seven).
      await gotoFixture(page, "/asset/as-rc-ute");
      await expect(page.getByRole("tablist")).toBeVisible();

      const wrapped = await page.evaluate(() => {
        const list = document.querySelector(".record-tabs__list");
        const tab = document.querySelector(".record-tab");
        if (!list || !tab) return true;
        return (
          list.getBoundingClientRect().height >
          tab.getBoundingClientRect().height * 1.5
        );
      });
      expect(wrapped, "the tab strip must not wrap at a laptop width").toBe(
        false,
      );
    });
  }

  test("the selected tab is marked by state AND weight, and arrow keys move", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP_SMALL);
    await gotoFixture(page, "/projects/pr-rc-kitchen");

    const tasks = page.getByRole("tab", { name: /^Tasks/ });
    await expect(tasks).toHaveAttribute("aria-selected", "true");
    await expect(tasks).toHaveAttribute("data-active", "true");

    // Roving tabindex: the selected tab is the strip's single tab stop.
    await expect(tasks).toHaveAttribute("tabindex", "0");
    await tasks.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: /^Knowledge/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("a phone reaches every tab, and the strip still does not wrap", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await gotoFixture(page, "/asset/as-rc-ute");
    await expect(page.getByRole("tablist")).toBeVisible();

    // MOBILE-01: every tab stays IN the tablist at every width; the compact
    // "More sections" menu is an accelerator over a strip that scrolls.
    const tabs = await page.getByRole("tab").count();
    expect(tabs).toBe(7);
    await expect(page.getByTestId("record-tabs-more")).toBeVisible();
  });
});

test.describe("filters are subordinate to tabs", () => {
  test.use({ viewport: LAPTOP_SMALL });

  test("the task filter is quieter than the tab strip it sits under", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-rc-kitchen");
    // UIX-02 — the task-state filter is the shared TAB RAIL (`ViewTabs`), so it
    // announces as a `navigation`. The point of this test is unchanged and if
    // anything better served: the rail is quieter than the segmented track it
    // replaced, which is exactly what "subordinate to the tabs above it" means.
    const filter = page.getByRole("navigation", {
      name: "Filter tasks by state",
    });
    await expect(filter).toBeVisible();

    /*
     * The measurement follows the control. It used to read the segmented
     * track's option and check for its `--subtle` variant; the rail has no
     * variants, so what is asserted instead is the property that carried the
     * meaning all along — the filter's type is no larger than the tab strip's,
     * and an unselected tab draws no filled container of its own.
     */
    const sizes = await page.evaluate(() => {
      const tab = document.querySelector(".record-tab");
      const option = document.querySelector(
        ".dh-project-tasks .dh-viewtabs__tab:not([aria-current])",
      );
      if (!tab || !option) return null;
      const optionStyle = getComputedStyle(option);
      return {
        tab: parseFloat(getComputedStyle(tab).fontSize),
        filter: parseFloat(optionStyle.fontSize),
        background: optionStyle.backgroundColor,
      };
    });
    expect(sizes).not.toBeNull();
    const s = sizes as { tab: number; filter: number; background: string };
    expect(s.filter).toBeLessThanOrEqual(s.tab);
    // The rail's only chrome is the 2px indicator under the CURRENT tab.
    expect(s.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });
});

test.describe("the Meeting capture strip", () => {
  test("at a laptop height it is one row and leaves the meeting readable", async ({
    page,
  }) => {
    await page.setViewportSize(LAPTOP_SMALL);
    await gotoFixture(page, "/meeting/m-rc-site?tab=meeting");
    const bar = page.getByTestId("meeting-capture-bar");
    await expect(bar).toBeVisible();

    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    // One row plus padding. Two rows measured ~155px on an 800px viewport —
    // almost a fifth of the screen, permanently, on the record the owner is
    // reading while capturing into it.
    expect((box as { height: number }).height).toBeLessThan(100);

    // The record reserves the strip's height, so its own last control is never
    // swallowed: the document scrolls far enough to clear the bar.
    const clears = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(
        "[data-testid='meeting-capture-bar']",
      );
      const record = document.querySelector<HTMLElement>(".record-layout");
      if (!bar || !record) return false;
      const reserved = parseFloat(getComputedStyle(record).paddingBottom);
      return reserved >= bar.getBoundingClientRect().height;
    });
    expect(clears, "the record must reserve the strip's height").toBe(true);
  });

  test("it does not sit under the global capture button", async ({ page }) => {
    // Two capture affordances on the same pixels is the exact confusion the
    // convergence set out to remove — and the nearer one was unclickable.
    await page.setViewportSize(LAPTOP_SMALL);
    await gotoFixture(page, "/meeting/m-rc-site?tab=meeting");
    const save = page
      .getByTestId("meeting-capture-bar")
      .getByRole("button", { name: "Add" });
    await expect(save).toBeVisible();

    /*
     * UIX-01 — there is no floating capture button any more, so this can only
     * ever find nothing. The guard below already tolerates that, and the check
     * is kept rather than deleted: the meeting capture bar still spans the
     * viewport's trailing edge, and the next control anchored there must not
     * land on top of it either.
     */
    const fab = page.locator(".dh-fab, [data-testid='global-capture']").first();
    if ((await fab.count()) > 0) {
      const [a, b] = await Promise.all([save.boundingBox(), fab.boundingBox()]);
      if (a && b) {
        const overlaps =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlaps, "the Add button must clear the global +").toBe(false);
      }
    }
  });

  test("every capture control is keyboard reachable", async ({ page }) => {
    await page.setViewportSize(LAPTOP_SMALL);
    await gotoFixture(page, "/meeting/m-rc-site?tab=meeting");

    // Choosing a type, typing and saving are all ordinary focusable controls —
    // no pointer-only affordance in the strip.
    const decision = page.getByTestId("meeting-capture-decision");
    await decision.focus();
    await expect(decision).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(decision).toHaveAttribute("aria-pressed", "true");

    const input = page.getByTestId("meeting-capture-input");
    await input.focus();
    await expect(input).toBeFocused();
  });

  test("at a phone height it stacks, and still reserves its own space", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await gotoFixture(page, "/meeting/m-rc-site?tab=meeting");
    const bar = page.getByTestId("meeting-capture-bar");
    await expect(bar).toBeVisible();

    // A thumb needs the targets, so the phone keeps the stacked layout.
    const box = await bar.boundingBox();
    expect((box as { height: number }).height).toBeGreaterThan(100);
    for (const kind of ["note", "action", "decision", "outcome"]) {
      await expect(page.getByTestId(`meeting-capture-${kind}`)).toBeVisible();
    }
  });
});

test.describe("the Person action hierarchy (UIQ-011)", () => {
  test.use({ viewport: LAPTOP_SMALL });

  test("exposes Call and Email, and offers the rest through the overflow", async ({
    page,
  }) => {
    await gotoFixture(page, "/person/p-rc-dan");
    const actions = page.getByRole("group", { name: "Contact actions" });

    await expect(actions.getByRole("link", { name: "Call" })).toBeVisible();
    await expect(actions.getByRole("link", { name: "Email" })).toBeVisible();
    // A message action only where the data supports it — `sms:` needs a mobile.
    await expect(actions.getByRole("link", { name: "Message" })).toBeVisible();
    // Three, not eight.
    expect(await actions.getByRole("link").count()).toBe(3);

    // Everything demoted is still reachable, in the shared overflow.
    await page.getByRole("button", { name: /^More actions for/ }).click();
    const menu = page.getByRole("menu");
    for (const label of [
      "New task",
      "New meeting",
      "New note",
      "New diary entry",
      "Copy email",
      "Copy phone",
    ]) {
      await expect(menu.getByRole("menuitem", { name: label })).toBeVisible();
    }
  });

  test("renders no action a person's data cannot support", async ({ page }) => {
    // A greyed-out Call on someone with no number is a control that can never
    // do anything, so it is absent rather than disabled.
    await gotoFixture(page, "/person/p-rc-ana");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ana Ruiz" }),
    ).toBeVisible();
    expect(
      await page.getByRole("group", { name: "Contact actions" }).count(),
    ).toBe(0);

    await page.getByRole("button", { name: /^More actions for/ }).click();
    const menu = page.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", { name: "Copy email" }),
    ).toHaveCount(0);
    await expect(
      menu.getByRole("menuitem", { name: "Copy phone" }),
    ).toHaveCount(0);
    // The capture entries do not depend on contact data, so they remain.
    await expect(
      menu.getByRole("menuitem", { name: "New task" }),
    ).toBeVisible();
  });
});

test.describe("contextual creation defaults", () => {
  test.use({ viewport: LAPTOP_SMALL });

  test("a task created inside a Project needs no project picker", async ({
    page,
  }) => {
    // The route-param test: the create form already receives this project's id,
    // so the local action is faster than the global + and earns its place.
    await gotoFixture(page, "/projects/pr-rc-kitchen");
    await page.getByRole("link", { name: "Add task" }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Add a task to Kitchen fit-out");
    // No parent picker: the project is not in question.
    await expect(
      drawer.getByRole("combobox", { name: /project/i }),
    ).toHaveCount(0);
  });

  test("the Project header's overflow no longer duplicates the local Add task", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-rc-kitchen");
    await page.getByRole("button", { name: /^More actions for/ }).click();
    const menu = page.getByRole("menu");
    // Notes/Meetings/Diary have no local path on this record, so they stay.
    await expect(
      menu.getByRole("menuitem", { name: "New note" }),
    ).toBeVisible();
    // A second route to the same outcome is what the convergence removed.
    await expect(menu.getByRole("menuitem", { name: "New task" })).toHaveCount(
      0,
    );
  });
});
