/**
 * DHDS-08 — the motion grammar, in a real browser.
 *
 * The unit tests assert the CONTRACTS in the stylesheets: one vocabulary, one
 * keyframe per behaviour, no literal durations, no overshoot. What only a real
 * engine can answer is whether the grammar actually reaches the product — a
 * computed style resolves a custom property, `prefers-reduced-motion` is a live
 * media state, and a hover reveal that shifts a row by a pixel is only visible
 * once something has been laid out.
 *
 * Every assertion here is state- or event-driven. There are no sleeps and no
 * timing races: nothing waits for an animation, because §19 requires that
 * nothing in DalyHub is gated on one.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  completeTaskRow,
  expectNoHorizontalOverflow,
  gotoFixture,
  openCollectionControls,
  taskRow,
  taskRows,
  waitForInteractive,
} from "./helpers";

/** Resolve a `--dh-*` custom property from the document root. */
async function token(page: Page, name: string): Promise<string> {
  return (
    await page.evaluate(
      (property) =>
        getComputedStyle(document.documentElement).getPropertyValue(property),
      name,
    )
  ).trim();
}

/** A duration token as a number of milliseconds. */
async function tokenMs(page: Page, name: string): Promise<number> {
  return Number.parseFloat(await token(page, name));
}

test.describe("DHDS-08 — the motion vocabulary reaches the browser", () => {
  test("resolves every rung and curve, and no two rungs are the same", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    const rungs = [
      "--dh-motion-instant",
      "--dh-motion-fast",
      "--dh-motion-base",
      "--dh-motion-deliberate",
      "--dh-motion-exit",
    ];
    const durations: number[] = [];
    for (const rung of rungs) {
      const ms = await tokenMs(page, rung);
      expect(ms, rung).toBeGreaterThan(0);
      // §3 — nothing in the transition ramp is slower than ~320ms.
      expect(ms, rung).toBeLessThanOrEqual(320);
      durations.push(ms);
    }
    expect(new Set(durations).size, "rungs must not be synonyms").toBe(
      rungs.length,
    );

    // Leaving is faster than arriving.
    expect(await tokenMs(page, "--dh-motion-exit")).toBeLessThan(
      await tokenMs(page, "--dh-motion-base"),
    );

    const curves = await Promise.all(
      [
        "--dh-ease-standard",
        "--dh-ease-enter",
        "--dh-ease-exit",
        "--dh-ease-emphasized",
      ].map((name) => token(page, name)),
    );
    for (const curve of curves) expect(curve).toMatch(/^cubic-bezier\(/);
    expect(new Set(curves).size, "curves must genuinely differ").toBe(4);
  });

  test("a control's own feedback is the state rung, not a scale transform", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    const instant = await tokenMs(page, "--dh-motion-instant");
    const button = page.getByRole("button").first();
    await expect(button).toBeVisible();

    const style = await button.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        duration: computed.transitionDuration,
        properties: computed.transitionProperty,
        transform: computed.transform,
      };
    });

    // §5 — value change, at the state rung. The generic `scale(0.95)` the brief
    // rules out would show here as a non-identity resting transform.
    expect(style.duration).toContain(`${instant / 1000}s`);
    expect(style.properties).toContain("color");
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(style.transform);
  });
});

test.describe("DHDS-08 — the row reveal never moves the row", () => {
  test("the title holds its position when the overflow control appears", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const row = taskRows(page).first();
    await expect(row).toBeVisible();

    const title = row.locator(".dh-taskrow__title").first();
    const before = await title.boundingBox();
    expect(before).not.toBeNull();

    await row.hover();
    // Event-driven rather than timed: the affordance becoming opaque IS the
    // reveal finishing, and Playwright polls the computed value.
    const reveal = row.locator(".dh-action-reveal").first();
    await expect(reveal).toHaveCSS("opacity", "1");

    const after = await title.boundingBox();
    expect(after).not.toBeNull();
    // §26 — nothing wiggles. The affordance occupies its geometry at rest, so
    // revealing it cannot shift the title on either axis.
    expect(after!.x).toBeCloseTo(before!.x, 1);
    expect(after!.y).toBeCloseTo(before!.y, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);
  });

  test("the affordance is reachable by keyboard, not only by pointer", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const row = taskRows(page).first();
    /*
     * The row's OVERFLOW TRIGGER, named — V2.4-GATE-01.
     *
     * This asked for `.dh-action-reveal.first()`, which meant the trigger when
     * it was written and does not now: DHDS-10 gave every empty inline cell a
     * revealed caret, so the first bearer in a row is an `<svg>`. MEASURED in
     * the browser — the three bearers are `svg`, `svg`, then
     * `BUTTON.dh-overflow-menu__trigger` — and an `<svg>` cannot take focus, so
     * `.focus()` did nothing and the opacity stayed 0. The contract was intact
     * and the locator had drifted.
     *
     * The claim in the title is about the AFFORDANCE, so it names the affordance.
     */
    const trigger = row.locator(".dh-overflow-menu__trigger").first();
    await expect(trigger).toBeAttached();

    // It is never removed from the tree — `opacity`, never `display: none`.
    await expect(trigger).toHaveCSS("display", /^(?!none$)/);
    await trigger.focus();
    await expect(trigger).toHaveCSS("opacity", "1");
    // …and revealing it by KEYBOARD makes it genuinely hittable, not merely
    // visible: `pointer-events` follows the opacity, which is rule 4 of the
    // contract and the half DEBT-180 found false on the wrapper.
    await expect(trigger).toHaveCSS("pointer-events", "auto");
  });
});

test.describe("DHDS-08 — completion is one grammar", () => {
  test("the strike is a colour that transitions, not a decoration that appears", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const rows = taskRows(page);
    await expect(rows.first()).toBeVisible();

    const title = rows.first().locator(".dh-complete-strike").first();
    await expect(title).toBeAttached();

    const resting = await title.evaluate((element) => {
      const computed = getComputedStyle(element);
      return {
        line: computed.textDecorationLine,
        color: computed.textDecorationColor,
        transition: computed.transitionProperty,
      };
    });

    // Present and transparent at rest, so completing interpolates a colour.
    expect(resting.line).toContain("line-through");
    expect(resting.color).toMatch(/rgba\(.*,\s*0\)/);
    expect(resting.transition).toContain("text-decoration-color");
  });

  test("completing a task recedes it without moving the row", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const rows = taskRows(page);
    await expect(rows.first()).toBeVisible();

    const title = await rows.first().locator(".dh-taskrow__title").innerText();
    const row = taskRow(page, title);
    const before = await row.boundingBox();

    await completeTaskRow(row, title);

    // The state is what carries the meaning, and it is observable immediately —
    // the mutation is optimistic and nothing waits for the animation (§7).
    await expect(row).toHaveAttribute("data-completed", "true");
    await expect(
      row.getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeVisible();

    const after = await row.boundingBox();
    // A row that keeps its place must keep its geometry: a strike-through
    // reserves no space, so completing must not resize the row.
    expect(after!.height).toBeCloseTo(before!.height, 1);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("DHDS-08 — disclosure shows its state", () => {
  test("a grouped section collapses and reopens, and says which it is", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    const disclosure = page.locator(".dh-taskgroup__disclosure").first();
    if ((await disclosure.count()) === 0) {
      test.skip(true, "this fixture renders no grouped task sections");
    }
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");

    const region = page.locator(".dh-disclosure").first();
    await expect(region).toHaveAttribute("data-dh-open", "true");

    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(region).toHaveAttribute("data-dh-open", "false");
    // The collapsed END state is still out of the accessibility tree and out of
    // layout — it simply arrives when the transition finishes.
    await expect(region.locator(".dh-disclosure__content")).toBeHidden();

    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(region).toHaveAttribute("data-dh-open", "true");
    await expect(region.locator(".dh-disclosure__content")).toBeVisible();
  });

  test("the collapsing region refuses focus from the click, not from the end of the transition", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const disclosure = page.locator(".dh-taskgroup__disclosure").first();
    if ((await disclosure.count()) === 0) {
      test.skip(true, "this fixture renders no grouped task sections");
    }
    const content = page.locator(".dh-disclosure__content").first();

    // Open: the rows are ordinary interactive content.
    await expect(content).not.toHaveAttribute("inert", /.*/);

    /*
     * Collapsing paints the rows for ~200ms so the region can transition shut.
     * That must not leave them reachable: `aria-expanded` already says the
     * section is closed, so tabbing straight after the click must not land
     * inside it, and assistive technology must not see it either. `inert` is
     * keyed on the collapse itself rather than on the end of the animation —
     * motion may never delay or obscure what a control has already reported.
     */
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    // Asserted while the region is still painted, so this genuinely covers the
    // transition window rather than the settled state.
    await expect(content).toHaveAttribute("inert", /.*/);

    const focusRefused = await content.evaluate((element) => {
      const target = element.querySelector<HTMLElement>(
        "a[href], button, input",
      );
      if (target === null) return null;
      target.focus();
      return !element.contains(document.activeElement);
    });
    if (focusRefused !== null) expect(focusRefused).toBe(true);

    // Expanding restores it immediately — the reverse is not over-restricted.
    await disclosure.click();
    await expect(content).not.toHaveAttribute("inert", /.*/);
  });
});

test.describe("DHDS-08 — floating surfaces share the grammar", () => {
  test("the command palette rises and the scrim fades, both from the layer", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.keyboard.press("ControlOrMeta+k");

    const panel = page.locator(".dh-command__panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveClass(/dh-motion-lift/);
    await expect(page.locator(".dh-command__scrim")).toHaveClass(
      /dh-motion-scrim/,
    );

    // It is operable immediately: §19 forbids gating a control on an entrance.
    const field = page.getByRole("combobox").or(page.getByRole("searchbox"));
    await expect(field.first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("an anchored surface grows from its trigger and is usable at once", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const controls = await openCollectionControls(page);
    test.skip(
      controls.compact,
      "this width gets the phone sheet, not a popover",
    );

    const surface = page.locator(".dh-anchored").first();
    await expect(surface).toBeVisible();
    /*
     * Placed, therefore revealed. The anchored layer reveals on the
     * `data-positioned` flip rather than on mount, because it is positioned by
     * MEASUREMENT — an entrance animation would otherwise have finished while
     * the surface was still at the viewport's corner with nothing to see.
     */
    await expect(surface).toHaveAttribute("data-positioned", "true");
    await expect(surface).toHaveCSS("opacity", "1");
    // §11 — pointer interaction is never delayed by the reveal.
    await expect(surface).toHaveCSS("pointer-events", "auto");
    // It grows from the edge nearest its trigger, not from the middle of itself.
    await expect(surface).toHaveCSS("transform-origin", /.+/);
    // …and the travel is the SHARED distance, not a per-surface guess.
    expect(await tokenMs(page, "--dh-motion-fast")).toBeGreaterThan(0);
    await expect(surface).toHaveCSS(
      "transition-duration",
      new RegExp(`${(await tokenMs(page, "--dh-motion-fast")) / 1000}s`),
    );

    await page.keyboard.press("Escape");
    await expect(surface).toHaveCount(0);
  });
});

test.describe("DHDS-08 — reduced motion", () => {
  /*
   * `page.emulateMedia` rather than the `reducedMotion` context option: the
   * option is applied when the browser context is created, and this suite reuses
   * one, so it does not reliably reach a page that is already open. Emulating on
   * the page is unambiguous and is what the assertions below are about.
   */
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("removes the travel and keeps every state it communicated", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    // The global floor: no transition anywhere has a duration.
    const row = taskRows(page).first();
    await expect(row).toBeVisible();
    await expect(row).toHaveCSS("transition-duration", /^0s(,\s*0s)*$/);

    // …and completion still visibly completes.
    const title = await row.locator(".dh-taskrow__title").innerText();
    const target = taskRow(page, title);
    await completeTaskRow(target, title);
    await expect(target).toHaveAttribute("data-completed", "true");
    await expect(target.locator(".dh-complete-strike").first()).not.toHaveCSS(
      "text-decoration-color",
      /rgba\(.*,\s*0\)/,
    );
  });

  test("a panel still opens, with no displacement", async ({ page }) => {
    await gotoFixture(page, "/today");
    await page.keyboard.press("ControlOrMeta+k");

    const panel = page.locator(".dh-command__panel");
    await expect(panel).toBeVisible();
    // The structural travel is REMOVED rather than accelerated: the shared
    // grammar swaps the travelling keyframe for the fade under reduced motion.
    await expect(panel).toHaveCSS("animation-name", "dh-fade-in");
    await expect(panel).toHaveCSS("animation-duration", "0s");

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("a disclosure still shows its state", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    const disclosure = page.locator(".dh-taskgroup__disclosure").first();
    if ((await disclosure.count()) === 0) {
      test.skip(true, "this fixture renders no grouped task sections");
    }
    const region = page.locator(".dh-disclosure").first();

    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(region.locator(".dh-disclosure__content")).toBeHidden();
    await disclosure.click();
    await expect(region.locator(".dh-disclosure__content")).toBeVisible();
  });
});

test.describe("DHDS-08 — navigation stays immediate", () => {
  test("moving between modules plays no page transition", async ({ page }) => {
    await gotoFixture(page, "/today");
    await page
      .getByRole("link", { name: "Tasks", exact: true })
      .first()
      .click();
    await waitForInteractive(page);

    // §15 — motion belongs to objects and state changes, never to navigation.
    // A route animation would show as an animation on the page frame itself.
    const frameAnimations = await page.evaluate(() =>
      [document.body, document.querySelector("main")]
        .filter((element): element is HTMLElement => element !== null)
        .map((element) => getComputedStyle(element).animationName),
    );
    for (const name of frameAnimations) expect(name).toBe("none");
  });
});
