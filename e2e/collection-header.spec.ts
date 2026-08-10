/**
 * UIQ-013 / UIQ-014 / UIQ-021 — the collection-level contracts, measured in a
 * real browser.
 *
 * These are the assertions that cannot be made anywhere else, because they are
 * about GEOMETRY: whether a header wraps while width sits unused, whether a
 * menu opened low on the screen stays inside the viewport, whether a clamped
 * menu's last item can still be reached from the keyboard. The decision logic
 * behind the menu is unit-tested as plain numbers in
 * `test/unit/overflow-menu/menu-placement.test.ts`; this file proves the
 * measuring is wired to it correctly.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoFixture, hasNoHorizontalOverflow } from "./helpers";

/** The two laptop widths PR #129 established as first-class layouts. */
const LAPTOP_1280 = { width: 1280, height: 800 };
const LAPTOP_1440 = { width: 1440, height: 900 };
const PHONE_390 = { width: 390, height: 844 };
/** The margin the shared menu keeps from every viewport edge (UIQ-021). */
const EDGE_MARGIN = 8;

/** Every collection that renders the shared header with a view switcher. */
const SWITCHER_SURFACES = [
  { name: "Tasks", path: "/tasks", group: "Task layout" },
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
  { name: "Goals", path: "/goals", group: "Goal views" },
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

  test("the switcher holds the 44px target and does not move when the view changes", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const group = page.getByRole("group", { name: "Task layout" });
    const before = await group.boundingBox();
    expect(before).not.toBeNull();
    expect(before!.height).toBeGreaterThanOrEqual(44);

    const optionsBefore = await group.getByRole("link").all();
    const widthsBefore = await Promise.all(
      optionsBefore.map(async (option) => (await option.boundingBox())!.width),
    );

    await group.getByRole("link", { name: "Board" }).click();
    await expect(group.getByRole("link", { name: "Board" })).toHaveAttribute(
      "aria-current",
      "true",
    );

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
      primary.getByRole("link", { name: "New Review" }),
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
      for (const path of ["/tasks", "/reviews", "/assets", "/people"]) {
        await gotoFixture(page, path);
        const lead = await page.locator(".dh-pane-header__lead").boundingBox();
        const views = await page
          .locator(".dh-pane-header__views")
          .boundingBox();
        expect(lead, path).not.toBeNull();
        if (!views || !lead) continue;

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
  test.use({ viewport: PHONE_390 });

  test("the title keeps its row and the switcher takes its own beneath", async ({
    page,
  }) => {
    await gotoFixture(page, "/reviews");
    const lead = await page.locator(".dh-pane-header__lead").boundingBox();
    const action = await page.locator(".dh-pane-header__primary").boundingBox();
    const views = await page.locator(".dh-pane-header__views").boundingBox();

    // Row one: the title and the create action, side by side. The action stays
    // immediately discoverable rather than being hidden to make room.
    expect(action!.y).toBeLessThan(lead!.y + lead!.height);
    expect(action!.x).toBeGreaterThan(lead!.x);
    // Row two: the switcher, entirely below both.
    expect(views!.y).toBeGreaterThanOrEqual(lead!.y + lead!.height - 4);
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
    for (const path of ["/reviews", "/assets", "/people"]) {
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
    expect(action!.height).toBeGreaterThanOrEqual(40);
  });
});

/* -------------------------------------------------------------------------- */
/* UIQ-021 — the overflow menu within the viewport                             */
/* -------------------------------------------------------------------------- */

/** Open the ⋯ on the task row nearest `targetY`, and return its panel. */
async function openRowMenuNear(page: Page, targetY: number): Promise<Locator> {
  const rows = page.locator("article.dh-card");
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
    await gotoFixture(page, "/projects");
    // UIX-02 — a Project gallery card is `.dh-pcard`; the generic `.dh-ecard`
    // it used to share with Areas is now Goals' and Assets'.
    const card = page.locator("article.dh-pcard, li .dh-pcard").first();
    await card.hover();
    await card.getByRole("button", { name: /More actions for/ }).click();
    const panel = page.getByRole("menu");
    await expect(panel).toBeVisible();
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
    // A deliberately short viewport, so a full task-row menu cannot fit above
    // OR below and the clamp is the only remaining answer.
    await page.setViewportSize({ width: 1280, height: 420 });
    await gotoFixture(page, "/tasks");
    const panel = await openRowMenuNear(page, 240);

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
    await page.setViewportSize({ width: 1280, height: 420 });
    await gotoFixture(page, "/tasks");
    const panel = await openRowMenuNear(page, 240);

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
