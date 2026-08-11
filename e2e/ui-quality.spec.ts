import { expect, test, type Locator, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

/**
 * UIQ (August 2026 UI quality audit) — geometry and interaction contracts for
 * the defect class that survives implementation review but is immediately
 * visible in use. Each test measures rectangles and computed styles in a real
 * browser and was confirmed to FAIL against the pre-fix CSS.
 *
 * The contracts, by finding:
 *
 *   UIQ-001  the touch swipe tray never paints on a hover-capable fine
 *            pointer, and a hovered row's surface stays OPAQUE — the tray sits
 *            behind the surface relying on it being opaque, so a translucent
 *            hover uncovered full-height `primary-container` slabs on every
 *            desktop row.
 *   UIQ-002  concealed quick actions are genuinely absent at rest: no reserved
 *            inline space squeezing the row's own content, no invisible-but-
 *            clickable controls. Revealed, they overlay INSIDE the row's own
 *            bounds and change no row geometry.
 *   UIQ-003  entering the record title's inline rename keeps the editor at the
 *            width the heading had — never the browser's ~20ch input default
 *            clipping the very name being edited.
 *   UIQ-004  a grid card whose title wraps keeps its anatomy: glyph beside the
 *            title's first line, status chip pinned to the heading row — never
 *            an orphaned icon line and a chip dangling under the last line.
 */

/** Parse the alpha channel out of a computed background-color. */
function alphaOf(color: string): number {
  // `rgba(r, g, b, a)` / `color(srgb r g b / a)` carry an explicit alpha;
  // `rgb(...)` and `color(srgb r g b)` are opaque.
  const slash = /\/\s*([\d.]+)\s*\)/.exec(color);
  if (slash) return Number(slash[1]);
  const rgba = /^rgba\([^)]+,\s*([\d.]+)\)$/.exec(color);
  if (rgba) return Number(rgba[1]);
  return 1;
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error(`no box for ${String(locator)}`);
  return b;
}

/**
 * The first task row in the Tasks collection.
 *
 * This contract used to be measured on Today, whose task list was a DS-04 Card
 * collection. The Today redesign replaced that list with plain rows — there is
 * no hover-revealed action rail on the day any more — so the rule is measured
 * where the Card collection actually lives. The rule is unchanged and is a
 * SHARED Card contract, not a Today one.
 */
function firstRow(page: Page) {
  return page.locator(".dh-card-collection--list .dh-card--list").first();
}

const ROW_SURFACE = "/tasks?system=all";

test.describe("UIQ — task-row hover contract (Tasks)", () => {
  test("at rest the row owns its width and concealed actions are truly absent", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, ROW_SURFACE);

    const row = firstRow(page);
    await expect(row).toBeVisible();

    // UIQ-001 — the touch tray does not paint on a fine-pointer device.
    const tray = row.locator(".dh-card__swipe-tray");
    if ((await tray.count()) > 0) {
      await expect(tray).toHaveCSS("display", "none");
    }

    // UIQ-002 — concealed means out of the layout and out of hit-testing,
    // while STAYING keyboard/AT-reachable (so not `visibility: hidden`).
    const actions = row.locator(".dh-card__actions");
    await expect(actions).toHaveCSS("pointer-events", "none");
    await expect(actions).toHaveCSS("position", "absolute");

    // The row body (title + metadata) owns the row instead of ceding a third
    // of it to an invisible rail. Pre-fix this ratio measured 0.50 on Today.
    const rowBox = await box(row);
    const bodyBox = await box(row.locator(".dh-card__body"));
    expect(
      bodyBox.width / rowBox.width,
      "row body should own the row at rest (no reserved action rail)",
    ).toBeGreaterThan(0.8);

    // Nothing interactive hides in the trailing zone at rest: the topmost
    // element under the old rail position is not a button.
    const hit = await page.evaluate(() => {
      const card = document.querySelector(
        ".dh-card-collection--list .dh-card--list",
      );
      if (!card) return "no-card";
      const r = card.getBoundingClientRect();
      const el = document.elementFromPoint(r.right - 40, r.top + r.height / 2);
      return el ? el.closest("button")?.className || "none" : "none";
    });
    expect(hit, "no invisible clickable action at rest").toBe("none");
  });

  test("hover reveals actions inside the row without moving anything, over an opaque surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, ROW_SURFACE);

    const row = firstRow(page);
    await expect(row).toBeVisible();
    const before = await box(row);
    const bodyBefore = await box(row.locator(".dh-card__body"));

    await row.hover();
    const actions = row.locator(".dh-card__actions");
    await expect(actions).toBeVisible();

    // Stable geometry: the row and its content do not move or resize.
    const after = await box(row);
    const bodyAfter = await box(row.locator(".dh-card__body"));
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(bodyAfter.width).toBe(bodyBefore.width);

    // Revealed actions sit INSIDE the row's own bounds (the audit found them
    // half-clipped at the card edge with tray labels interleaving).
    const actionsBox = await box(actions);
    expect(actionsBox.x).toBeGreaterThanOrEqual(after.x);
    expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(
      after.x + after.width + 1,
    );

    // UIQ-001 — the hovered surface is opaque, so nothing behind it can show
    // through (the tray leak was exactly a translucent hover background).
    const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(bg), `hover background must be opaque, got ${bg}`).toBe(1);
  });

  test("keyboard focus reveals the same actions the pointer gets", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, ROW_SURFACE);

    const row = firstRow(page);
    await row.locator(".dh-card__open").first().focus();
    const actions = row.locator(".dh-card__actions");
    await expect(actions).toHaveCSS("opacity", "1");

    /*
     * The concealed buttons themselves stay focusable (they are opacity-0 with
     * pointer-events off, never `visibility: hidden`): on a surface without a
     * roving model, Tab must still reach the rail's controls directly — losing
     * that would break the DS-04 "keyboard/AT reachable" contract for keyboard
     * users. Focusing one reveals the rail via `:focus-within`.
     *
     * HARDEN-02 — this asked for `.dh-card__action`, the class a QUICK ACTION
     * button carries, and UIX-01 took every permanent action button off the task
     * row ("Complete" became the leading circle, "Today" moved into the overflow
     * and the swipe tray). The rail on this surface now holds exactly one
     * control, the overflow trigger, so the locator matched nothing and the test
     * spent its whole timeout waiting for it. Asking the RAIL for its buttons
     * keeps asserting the contract — whatever the rail holds is reachable — and
     * survives quick actions coming back.
     */
    const firstAction = row.locator(".dh-card__actions button").first();
    await firstAction.focus();
    await expect(firstAction).toBeFocused();
    await expect(actions).toHaveCSS("opacity", "1");
  });
});

test.describe("UIQ-003 — record title inline rename keeps the heading's width", () => {
  test("entering rename does not collapse the editor to the input default", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, "/design/record-layout");

    const region = page.getByRole("region", {
      name: "Short title record with inline editing",
    });
    await region
      .locator(".record-title .dh-inline-edit__trigger")
      .first()
      .click();

    const input = region.locator(".dh-inline-edit__input");
    await expect(input).toBeVisible();

    const inputBox = await box(input);
    const rowBox = await box(region.locator(".record-header__titlerow"));
    // Pre-fix this measured ~301px of an ~805px row (0.37). The editor must
    // take the row's free width, not the browser's ~20ch input default.
    expect(
      inputBox.width / rowBox.width,
      "title editor should take the heading's width while editing",
    ).toBeGreaterThan(0.55);
  });
});

test.describe("UIQ-004 — grid card heading survives a wrapping title", () => {
  test("icon stays beside the first title line and the status chip stays in the heading row", async ({
    page,
  }) => {
    // Narrow enough that several fixture titles wrap inside grid columns.
    await page.setViewportSize({ width: 900, height: 900 });
    await gotoFixture(page, "/design/cards-filters");
    await page.getByRole("radio", { name: "grid" }).check();

    const measured = await page.evaluate(() => {
      const out: {
        title: string;
        lines: number;
        iconTop: number;
        iconRight: number;
        titleTop: number;
        titleLeft: number;
        lineHeight: number;
        statusTop: number | null;
      }[] = [];
      for (const card of document.querySelectorAll(".dh-card--grid")) {
        const icon = card.querySelector(".dh-card__icon");
        const title = card.querySelector(".dh-card__title");
        if (!icon || !title) continue;
        const status = card.querySelector(".dh-card__status");
        const t = title.getBoundingClientRect();
        const style = getComputedStyle(title);
        const lineHeight =
          Number.parseFloat(style.lineHeight) ||
          Number.parseFloat(style.fontSize) * 1.35;
        out.push({
          title: (title.textContent ?? "").slice(0, 40),
          lines: Math.round(t.height / lineHeight),
          iconTop: icon.getBoundingClientRect().top,
          iconRight: icon.getBoundingClientRect().right,
          titleTop: t.top,
          titleLeft: t.left,
          lineHeight,
          statusTop: status ? status.getBoundingClientRect().top : null,
        });
      }
      return out;
    });

    const wrapping = measured.filter((m) => m.lines >= 2);
    expect(
      wrapping.length,
      "expected at least one wrapping grid-card title at this width — widen the fixture data or narrow the viewport",
    ).toBeGreaterThan(0);

    for (const m of wrapping) {
      // The glyph sits in its own column beside the title's FIRST line — not
      // orphaned on a line of its own above the title.
      expect(
        m.iconRight,
        `icon should sit beside the title ("${m.title}")`,
      ).toBeLessThanOrEqual(m.titleLeft + 1);
      expect(
        Math.abs(m.iconTop - m.titleTop),
        `icon should align with the first title line ("${m.title}")`,
      ).toBeLessThanOrEqual(m.lineHeight);
      // The status chip is pinned to the heading row, not dangling at the end
      // of the title's last line.
      if (m.statusTop !== null) {
        expect(
          m.statusTop - m.titleTop,
          `status chip should stay in the heading row ("${m.title}")`,
        ).toBeLessThanOrEqual(m.lineHeight);
      }
    }
  });
});
