/**
 * UIQ-013 / UIQ-014 / UIQ-021 — the collection-level contracts, measured in a
 * real browser.
 *
 * These are the assertions that cannot be made anywhere else, because they are
 * about GEOMETRY: whether a header wraps while width sits unused, whether a
 * menu opened low on the screen stays inside the viewport, whether a clamped
 * menu's last item can still be reached from the keyboard. The decision logic
 * behind the menu is unit-tested as plain numbers in
 * `test/unit/anchored/anchored-placement.test.ts` (DHDS-09 retired the menu's
 * private solver in favour of it); this file proves the
 * measuring is wired to it correctly.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoFixture, hasNoHorizontalOverflow, taskRows } from "./helpers";

/** The two laptop widths PR #129 established as first-class layouts. */
const LAPTOP_1280 = { width: 1280, height: 800 };
const LAPTOP_1440 = { width: 1440, height: 900 };
const PHONE_390 = { width: 390, height: 844 };
/** The margin the shared menu keeps from every viewport edge (UIQ-021). */
const EDGE_MARGIN = 8;

/** Every collection that renders the shared header with a view switcher. */
const SWITCHER_SURFACES = [
  /*
   * UIX-06 — Tasks is no longer in this list either, for the same kind of
   * reason Projects is not.
   *
   * UIX-01 moved the List / Board / Sectors switcher OFF the header and into
   * the collection's overflow menu, and said why in `TasksWorkspace.tsx`: "a
   * three-segment control permanently parked beside the title spends the
   * header's best space on a decision made once a week". It writes the same
   * `?view=` parameter through the same shared control model, so the UIQ-013
   * contract this file asserts is intact — the control simply is not in the
   * header slot any more.
   *
   * The list was never updated, so this test has asserted a control the
   * product deliberately removed ever since: it fails identically on the UIX-05
   * commit this pass branched from. `tasks.spec.ts` asserts the switcher's own
   * behaviour where it now lives.
   */
  /*
   * UIX-02 — Projects is no longer in this list.
   *
   * Its lifecycle mode moved from the header's `ViewSwitcher` slot to the
   * shared TAB RAIL under the title (`ViewTabs` / `.dh-viewtabs`), which is a
   * `navigation` of links rather than a `group` of segments. That is a
   * deliberate split, not a regression: the segmented control remains the
   * right instrument for a bounded toggle inside a toolbar, and the rail is
   * the right one directly beneath a page title. `projects.spec.ts` and
   * `projects-mobile.spec.ts` assert the rail's own contract.
   */
  /*
   * CONVERGE-01 §9 — Goals is no longer in this list either, for exactly the
   * reason Projects is not (see the note above it).
   *
   * Goals used to draw TWO control rails: `Active | Deleted` as a segmented
   * switcher in this header slot, and the four status views as a tab rail
   * beneath it. The audit's finding was the doubling, not either control, so the
   * two collapsed into ONE `ViewTabs` rail carrying `All · On track · Needs
   * attention · Completed · Deleted` — the same shape Projects already uses for
   * its own four lifecycle scopes.
   *
   * The switcher's contract is untouched and is still asserted below on Assets;
   * Goals simply has none in this slot any more. `goals.spec.ts` asserts the
   * rail's own contract, including that Deleted is reachable and returnable.
   */
  { name: "Notes", path: "/notes", group: "Note views" },
  { name: "People", path: "/people", group: "People circles" },
  { name: "Meetings", path: "/meetings/upcoming", group: "Meeting views" },
  { name: "Assets", path: "/assets", group: "Asset views" },
  { name: "Reviews", path: "/reviews", group: "Review views" },
] as const;

test.describe("UIQ-013 — one view switcher, at laptop width", () => {
  test.use({ viewport: LAPTOP_1440 });

  test("every migrated collection renders the ONE shared switcher", async ({
    page,
  }) => {
    test.slow();
    for (const surface of SWITCHER_SURFACES) {
      await gotoFixture(page, surface.path);
      const group = page.getByRole("group", { name: surface.group });
      await expect(group, `${surface.name} switcher`).toBeVisible();
      // One implementation means one class, on every collection.
      await expect(group).toHaveClass(/dh-segmented/);
    }
  });

  /*
   * UIX-06 — measured on ASSETS rather than on Tasks.
   *
   * The contract under test is the shared switcher's, not any one module's:
   * a 44px target, and geometry that does not move when the selected view
   * changes because every segment reserves its check's box. Tasks stopped
   * being able to demonstrate it when UIX-01 moved its switcher into the
   * overflow menu (see the note on SWITCHER_SURFACES), so the test moved to a
   * collection that still renders one in the header slot. Assets' five scopes
   * are the widest switcher in the product, which is the hardest case for the
   * "geometry does not move" half.
   */
  test("the switcher holds its target and does not move when the view changes", async ({
    page,
  }) => {
    await gotoFixture(page, "/assets");
    const group = page.getByRole("group", { name: "Asset views" });
    const before = await group.boundingBox();
    expect(before).not.toBeNull();
    /*
     * FINAL-UI — 24, not 44, and only because this runs on a FINE pointer.
     *
     * UIQ-013 gave the segment a hard `--app-touch-target-min` (45px) when it
     * still sat inside a sunken tray and had to fill it. ADR-096 decision 4
     * removed the tray, and a scope filter that is taller than the "+ New asset"
     * button beside it — 36px, like every other control in the header — is the
     * oversized control this pass exists to stop preserving.
     *
     * The height is now `--dh-control-height`, which IS `--app-touch-target-min`
     * under `(pointer: coarse)`: the density model floors it back
     * unconditionally in `tokens.css`, so nothing a thumb touches got smaller.
     * Playwright's desktop Chrome reports a fine pointer, so what this run can
     * honestly assert is WCAG 2.2 SC 2.5.8's AA floor of 24px — which 36 clears
     * with a third to spare. The coarse-pointer floor is asserted where a coarse
     * pointer actually exists: `iphone-daily-driver.spec.ts`.
     */
    expect(before!.height).toBeGreaterThanOrEqual(24);

    const optionsBefore = await group.getByRole("link").all();
    const widthsBefore = await Promise.all(
      optionsBefore.map(async (option) => (await option.boundingBox())!.width),
    );

    await group.getByRole("link", { name: "Service due" }).click();
    await expect(
      group.getByRole("link", { name: "Service due" }),
    ).toHaveAttribute("aria-current", "true");

    // UIQ-013's "no layout movement when state changes": the check's box is
    // reserved in every segment, so selecting a different view leaves every
    // segment — and the control — exactly where it was.
    const after = await group.boundingBox();
    expect(after!.width).toBeCloseTo(before!.width, 0);
    expect(after!.x).toBeCloseTo(before!.x, 0);
    const optionsAfter = await group.getByRole("link").all();
    const widthsAfter = await Promise.all(
      optionsAfter.map(async (option) => (await option.boundingBox())!.width),
    );
    for (const [index, width] of widthsAfter.entries()) {
      expect(width).toBeCloseTo(widthsBefore[index], 0);
    }
  });

  /*
   * CONVERGE-01 §2 — the selected scope chip no longer outweighs the page title.
   *
   * The audit's finding is about RANK: on a collection header the selected scope
   * was a near-black filled chip at `label-large` with a check glyph, and the
   * page's own `h1` sat beside it in ordinary text — the loudest object on the
   * band answered "which subset?" above "what page is this?".
   *
   * What must NOT change is the colour (a recorded FINAL-UI decision) or the hit
   * area, so all three are asserted together on every collection that still
   * renders the control: quieter type than the title, the same near-black fill,
   * and a target that still clears the AA floor.
   */
  for (const surface of SWITCHER_SURFACES) {
    test(`${surface.name}'s selected scope chip is quieter than its title`, async ({
      page,
    }) => {
      await gotoFixture(page, surface.path);
      const group = page.getByRole("group", { name: surface.group });
      await expect(group).toBeVisible();

      const measured = await group.evaluate((node) => {
        const selected = node.querySelector(
          '[aria-current="true"], [aria-pressed="true"]',
        ) as HTMLElement | null;
        const title = document.querySelector(
          ".dh-pane-header__title",
        ) as HTMLElement | null;
        if (!selected || !title) return null;
        const chipStyle = getComputedStyle(selected);
        return {
          chipSize: parseFloat(chipStyle.fontSize),
          chipBackground: chipStyle.backgroundColor,
          chipHeight: selected.getBoundingClientRect().height,
          titleSize: parseFloat(getComputedStyle(title).fontSize),
          // The check's reserved box is gone from the labelled variant; its
          // absence is what most of the width reduction came from.
          check: getComputedStyle(selected, "::before").content,
        };
      });
      expect(measured).not.toBeNull();

      // Quieter than the page's own title, which is the whole point.
      expect(measured!.chipSize).toBeLessThan(measured!.titleSize);
      // The near-black fill STANDS — this changed weight, never colour.
      expect(measured!.chipBackground).not.toBe("rgba(0, 0, 0, 0)");
      // …and the target is untouched (WCAG 2.2 SC 2.5.8's AA floor on a fine
      // pointer; the coarse floor is asserted in `iphone-daily-driver.spec.ts`).
      expect(measured!.chipHeight).toBeGreaterThanOrEqual(24);
      expect(measured!.check).toBe("none");
    });
  }
});

test.describe("UIQ-014 — the primary action, in one place", () => {
  test.use({ viewport: LAPTOP_1440 });

  test("Reviews puts New Review in the shared primary slot, after the switcher", async ({
    page,
  }) => {
    await gotoFixture(page, "/reviews");
    const primary = page.locator(".dh-pane-header__primary");
    await expect(primary).toBeVisible();
    await expect(
      primary.getByRole("link", { name: "New review" }),
    ).toBeVisible();

    // The arrangement UIQ-014 named: the create action is no longer a fifth
    // pill in the view row, it is the trailing end of the header.
    const switcher = await page
      .getByRole("group", { name: "Review views" })
      .boundingBox();
    const action = await primary.boundingBox();
    expect(action!.x).toBeGreaterThan(switcher!.x + switcher!.width);
  });

  test("Reviews and Areas place their create action identically", async ({
    page,
  }) => {
    const positions: number[] = [];
    for (const path of ["/reviews", "/areas"]) {
      await gotoFixture(page, path);
      const header = await page.locator(".dh-pane-header").boundingBox();
      const action = await page
        .locator(".dh-pane-header__primary")
        .boundingBox();
      // Distance from the header's trailing edge — the "same conceptual
      // location" the brief asks for, measured rather than eyeballed.
      positions.push(header!.x + header!.width - (action!.x + action!.width));
    }
    expect(positions[0]).toBeCloseTo(positions[1], 0);
  });
});

test.describe("UIQ-013 — the header uses the laptop's width", () => {
  for (const viewport of [LAPTOP_1280, LAPTOP_1440]) {
    test(`title, switcher and action share one row at ${viewport.width}`, async ({
      page,
    }) => {
      test.slow();
      await page.setViewportSize(viewport);
      /*
       * UIX-06 — `/tasks` is gone from this list, and the guard below now asks
       * whether the element EXISTS before measuring it.
       *
       * Tasks has had no header switcher since UIX-01 moved it into the
       * overflow menu. The `if (!views) continue` was written expecting
       * `boundingBox()` to return null for a missing element; it does not — it
       * WAITS for one. So this test did not skip Tasks, it hung on it for the
       * full 90-second slow timeout, at both widths, on every run since. It
       * fails the same way on the UIX-05 commit this pass branched from.
       */
      for (const path of ["/reviews", "/assets", "/people"]) {
        await gotoFixture(page, path);
        const lead = await page.locator(".dh-pane-header__lead").boundingBox();
        expect(lead, path).not.toBeNull();
        const viewsLocator = page.locator(".dh-pane-header__views");
        if ((await viewsLocator.count()) === 0 || !lead) continue;
        const views = await viewsLocator.boundingBox();
        if (!views) continue;

        // One row: the switcher's vertical centre is within the title block's
        // band. A wrapped switcher sits entirely beneath it, which is the
        // "controls wrap while width sits unused" defect at laptop widths.
        const viewsCentre = views.y + views.height / 2;
        expect(
          viewsCentre,
          `${path} switcher wrapped at ${viewport.width}`,
        ).toBeGreaterThan(lead.y - 4);
        expect(viewsCentre).toBeLessThan(lead.y + lead.height + 4);
      }
    });
  }
});

test.describe("UIQ-013 — the narrow composition is intentional", () => {
  /*
   * DS-02 — a phone is emulated as a phone, not merely as a narrow window.
   *
   * `hasTouch` is what makes the browser report `(pointer: coarse)`, and that
   * is the condition DalyHub's touch guarantees are actually written against:
   * the DS-01 density floor that gives `compact` its 45px hit areas back, and
   * D8's "below `md`, a mouse gets the touch layout". Without it this block was
   * asserting a touch floor in a context that reports a FINE pointer — so it
   * passed for the wrong reason before DS-02 (every control was 45px at every
   * density) and would have failed for the wrong reason after it.
   *
   * With touch emulated, the height assertion below is now the real contract
   * rather than a proxy for it, which is why it moved from 40 to the product's
   * own floor.
   */
  test.use({ viewport: PHONE_390, hasTouch: true, isMobile: true });

  /*
   * POLISH-01 changed this composition, deliberately, and this test now states
   * the shipped one.
   *
   * It used to assert "title and create action share row one, switcher takes
   * row two". That was the shape while the phone header drew its own title.
   * POLISH-01 PUBLISHES a collection's title to the phone top bar
   * (`.dh-pane-header__title[data-published="true"]`) and gives the freed first
   * row to the state breakdown, because 170px beside a button broke "20 active
   * · 62 completed · 1 archived" over three lines (`shell.css`, and the rule
   * says so in those words). So the phone composition is three rows:
   *
   *     Title / count                                   (full width)
   *                                        [ New review ]
   *     [ View | Switcher ]                             (full width)
   *
   * What is asserted here is the RELATIONSHIP that survives that change and is
   * what UIQ-013/UIQ-014 were ever about — the action stays visible at the
   * trailing edge, the reading order runs down the page rather than around a
   * button, and the switcher is last — rather than the row indices the old
   * assertion had fossilised.
   */
  test("the count leads, the action keeps the trailing edge, the switcher is last", async ({
    page,
  }) => {
    await gotoFixture(page, "/reviews");
    const header = page.locator(".dh-pane-header");
    const lead = await header.locator(".dh-pane-header__lead").boundingBox();
    const action = await header
      .locator(".dh-pane-header__primary")
      .boundingBox();
    const views = await header.locator(".dh-pane-header__views").boundingBox();

    // Reading order down the page: lead, then the action, then the switcher.
    // Each begins at or below the end of the one before it, so nothing has to
    // be read around anything else.
    expect(action!.y).toBeGreaterThanOrEqual(lead!.y + lead!.height - 4);
    expect(views!.y).toBeGreaterThanOrEqual(action!.y + action!.height - 4);

    // The action is still IMMEDIATELY discoverable (UIQ-014): on screen, at the
    // trailing edge, and never squeezed against the leading one.
    const headerBox = (await header.boundingBox())!;
    expect(action!.x).toBeGreaterThan(lead!.x);
    expect(action!.x + action!.width).toBeLessThanOrEqual(
      headerBox.x + headerBox.width + 1,
    );
    expect(action!.width).toBeGreaterThan(0);

    // And the switcher takes the whole width, which is what it was given the
    // row for — a four-view rail scrolling inside a sliver is the failure this
    // composition exists to avoid.
    expect(views!.x).toBeCloseTo(lead!.x, 0);
  });

  test("the switcher scrolls rather than wrapping into a broken drawing", async ({
    page,
  }) => {
    test.slow();
    // A wrapped segmented control puts the container's rounded ends mid-row and
    // stops the dividers lining up. Too little width must scroll INSIDE the
    // control instead — proven by the control staying one row tall while its
    // scrollable content is wider than its box.
    // Tasks is deliberately absent: it opts into the MOBILE-01 persistent
    // control sheet, which REPLACES the header switcher at phone widths, so
    // there is no switcher there to wrap.
    //
    // UIX-06 — and so are Assets and People, for exactly the same reason. The
    // rule is `.dh-collection--has-mobile-controls .dh-pane-header__views {
    // display: none }` in `collection-layout.css`: ANY collection that supplies
    // a mobile control row hides its header switcher on a phone. Assets has had
    // one since UIX-05 and People gained one in the same pass, so this list has
    // been asserting a hidden element ever since — it fails identically on the
    // UIX-05 commit this pass branched from. Reviews is the collection that
    // still renders a header switcher at 390, which is what this test is for.
    for (const path of ["/reviews"]) {
      await gotoFixture(page, path);
      const switcher = page.locator(".dh-pane-header__views .dh-segmented");
      await expect(switcher.first()).toBeVisible();
      const shape = await switcher.first().evaluate((node) => {
        const option = node.querySelector(".dh-segmented__option")!;
        return {
          height: node.getBoundingClientRect().height,
          optionHeight: option.getBoundingClientRect().height,
        };
      });
      // One row: the control is no taller than a single option plus its border.
      expect(shape.height, `${path} switcher wrapped at 390px`).toBeLessThan(
        shape.optionHeight * 1.6,
      );
    }
  });

  test("no collection header produces horizontal document overflow", async ({
    page,
  }) => {
    test.slow();
    for (const surface of SWITCHER_SURFACES) {
      await gotoFixture(page, surface.path);
      expect(
        await hasNoHorizontalOverflow(page),
        `${surface.name} overflows at 390px`,
      ).toBe(true);
    }
  });

  test("a long collection title does not push the action off the header", async ({
    page,
  }) => {
    // "Recent people" plus its count is the longest title/subtitle pair a
    // collection carries at 390px, and the view it belongs to still offers a
    // create action — so it is the real test of a squeezed narrow header.
    await gotoFixture(page, "/people/recent");
    const primary = page.locator(".dh-pane-header__primary");
    await expect(primary).toBeVisible();
    const header = await page.locator(".dh-pane-header").boundingBox();
    const action = await primary.boundingBox();
    expect(action!.x + action!.width).toBeLessThanOrEqual(
      header!.x + header!.width + 1,
    );
    // And it is still a real, tappable target rather than a squeezed sliver.
    // The product's own floor (AGENTS.md §15), which is stricter than WCAG
    // 2.2's 24px: on a coarse pointer `compact` gives every hit area back,
    // unconditionally, so a compact application is never a cramped phone.
    expect(action!.height).toBeGreaterThanOrEqual(44);
  });
});

/* -------------------------------------------------------------------------- */
/* UIQ-021 — the overflow menu within the viewport                             */
/* -------------------------------------------------------------------------- */

/** Open the ⋯ on the task row nearest `targetY`, and return its panel. */
async function openRowMenuNear(page: Page, targetY: number): Promise<Locator> {
  /*
   * DS-04 — a task row is `TaskRow` (an `<li>` in a real `<ul>`), not the
   * generic Card it used to be, so `article.dh-card` matched nothing on
   * `/tasks` and every journey below failed on its own precondition rather
   * than on the placement it exists to measure. `taskRows()` is the suite's
   * one locator for the row; what these tests measure is unchanged.
   */
  const rows = taskRows(page);
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  let best: Locator = rows.first();
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    const candidate = rows.nth(index);
    const box = await candidate.boundingBox();
    if (!box) continue;
    const distance = Math.abs(box.y - targetY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  /*
   * The nearest row is only nearest — it is not necessarily NEAR. This helper
   * used to hand back whatever row happened to be closest to `targetY` and let
   * the caller assert a placement that only holds if the trigger really does
   * sit low in the viewport, so the result depended on how many tasks the
   * fixture had and how tall UIX-06 had most recently made a row. When the
   * densest layout put every row in the top half, "the trigger near the bottom"
   * was at y≈200, the menu correctly opened BELOW, and the test failed for a
   * reason that had nothing to do with the placement logic.
   *
   * So the precondition is now MADE true rather than hoped for: scroll the
   * chosen row to `targetY`, then assert it actually got there. If the list is
   * too short to scroll, this fails saying exactly that instead of failing as
   * though the menu flipped the wrong way.
   */
  const before = await best.boundingBox();
  if (before) {
    await page.evaluate(
      (delta) => window.scrollBy(0, delta),
      before.y - targetY,
    );
  }
  const settled = await best.boundingBox();
  expect(
    settled,
    "the row chosen for a bottom-of-viewport trigger disappeared",
  ).not.toBeNull();
  expect(
    Math.abs(settled!.y - targetY),
    `could not place a task row near y=${targetY} (it sits at y=${settled!.y}); ` +
      "the fixture is too short for this test's premise",
  ).toBeLessThanOrEqual(32);

  // UIQ-002 — row actions are a hover-revealed overlay on a fine pointer.
  await best.hover();
  await best.getByRole("button", { name: /More actions for/ }).click();
  const panel = page.getByRole("menu");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("UIQ-021 — the shared menu fits the viewport", () => {
  test.use({ viewport: LAPTOP_1280 });

  test("a trigger with room below keeps the ordinary below placement", async ({
    page,
  }) => {
    // A Projects gallery card carries the SHORT lifecycle menu (a handful of
    // items), so it genuinely fits beneath its trigger on an ordinary laptop —
    // the case that proves below is still the default and flipping is a
    // fallback, not a habit. A Tasks row's ~713px menu cannot fit either side
    // of an 800px viewport and is therefore the wrong instrument for this.
    //
    // ADR-100 — the GALLERY, explicitly: a workspace this size now opens as a
    // table by default, and a table row's menu is a different trigger in a
    // different box. What this test measures is unchanged.
    await gotoFixture(page, "/projects?present=grid");
    // UIX-02 — a Project gallery card is `.dh-pcard`; the generic `.dh-ecard`
    // it used to share with Areas is now Goals' and Assets'.
    const card = page.locator("article.dh-pcard, li .dh-pcard").first();
    await card.hover();
    await card.getByRole("button", { name: /More actions for/ }).click();
    const panel = page.getByRole("menu");
    await expect(panel).toBeVisible();
    /*
     * DHDS-09 — the panel and the anchored surface are the SAME element now.
     *
     * The overflow menu no longer places itself: it is the shared `Menu`, whose
     * surface classes land ON the shared `AnchoredSurface` rather than on a box
     * inside it (a bordered box inside a scrolling wrapper has its shadow
     * clipped and its bottom border scrolled away). So the element that carries
     * `role="menu"` is the element the solver placed, and this assertion reads
     * exactly as it did before.
     */
    await expect(panel).toHaveAttribute("data-side", "below");

    // And it stays inside the viewport without needing a clamp at all.
    const box = await panel.boundingBox();
    const height = page.viewportSize()!.height;
    expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  });

  test("a trigger near the bottom flips the menu above it", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const panel = await openRowMenuNear(page, 740);
    await expect(panel).toHaveAttribute("data-side", "above");
  });

  test("no menu escapes the viewport, wherever its trigger sits", async ({
    page,
  }) => {
    test.slow();
    await gotoFixture(page, "/tasks");
    for (const targetY of [120, 400, 700, 760]) {
      const panel = await openRowMenuNear(page, targetY);
      const box = await panel.boundingBox();
      const viewport = page.viewportSize()!;
      // "Menus must never touch the viewport edge": the assertion is the
      // MARGIN, not merely zero, so a menu flush against the edge fails here.
      expect(box!.y, `top at ${targetY}`).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(box!.y + box!.height, `bottom at ${targetY}`).toBeLessThanOrEqual(
        viewport.height - EDGE_MARGIN,
      );
      expect(box!.x, `left at ${targetY}`).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(box!.x + box!.width, `right at ${targetY}`).toBeLessThanOrEqual(
        viewport.width - EDGE_MARGIN,
      );
      await page.keyboard.press("Escape");
    }
  });

  test("a menu too tall for either side clamps and scrolls internally", async ({
    page,
  }) => {
    /*
     * A deliberately short viewport, so a full task-row menu cannot fit above
     * OR below and the clamp is the only remaining answer.
     *
     * The trigger sits at y=200 rather than y=240, and the number is load
     * bearing: DHDS-09's shared surface is 22rem where the private overflow
     * panel was 20rem, so the same five actions now wrap less and the menu is
     * 217px tall instead of taller than 232. At y=240 there was 232px above the
     * trigger and the menu simply FIT — the test would have passed on a menu
     * that never clamped. At y=200 there is 191px above and 176px below, so
     * neither side can take it and the clamp is what is being measured again.
     */
    await page.setViewportSize({ width: 1280, height: 420 });
    await gotoFixture(page, "/tasks");
    const panel = await openRowMenuNear(page, 200);

    const clamped = await panel.evaluate((node) => ({
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      overflowY: getComputedStyle(node).overflowY,
    }));
    expect(clamped.scrollHeight).toBeGreaterThan(clamped.clientHeight);
    expect(["auto", "scroll"]).toContain(clamped.overflowY);

    const box = await panel.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(420);
  });

  test("the last item of a clamped menu is reachable from the keyboard", async ({
    page,
  }) => {
    // The same geometry as the test above, for the same reason: at y=240 this
    // menu no longer clamps, so the keyboard would have been walking an
    // unclamped list.
    await page.setViewportSize({ width: 1280, height: 420 });
    await gotoFixture(page, "/tasks");
    const panel = await openRowMenuNear(page, 200);

    // End jumps to the last item; the panel scrolls it into view rather than
    // the page having to. Flipping and clamping change no keyboard semantics.
    await page.keyboard.press("End");
    const items = panel.getByRole("menuitem");
    const last = items.last();
    await expect(last).toBeFocused();

    const inView = await last.evaluate((node) => {
      const item = node.getBoundingClientRect();
      const menu = node.closest('[role="menu"]')!.getBoundingClientRect();
      return item.bottom <= menu.bottom + 1 && item.top >= menu.top - 1;
    });
    expect(inView).toBe(true);

    // Escape still closes only the menu and returns focus to its trigger.
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.locator(".dh-overflow-menu__trigger:focus")).toHaveCount(
      1,
    );
  });
});
