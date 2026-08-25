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
 * ── Why this is no longer a `.dh-card` ──────────────────────────────────────
 * This contract was written against the generic Card in list presentation, which
 * is what `/tasks` rendered at the time. DS-04 replaced it with the product-level
 * `TaskRow`: a grid row with no surface of its own, whose columns are the LIST's
 * columns. So the old locator (`.dh-card-collection--list .dh-card--list`) now
 * matches nothing on this route and the three tests below spent their whole
 * timeout waiting for a component generation the product deliberately retired.
 *
 * The RULE is unchanged and is exactly the CONTROL-01 §6 contract: a control the
 * row holds back until it is engaged with must already own its space, so
 * revealing it moves nothing. Only the anatomy it is measured on has moved —
 * from an absolutely-positioned action rail over a card to a reserved grid
 * column and reserved inline carets. Tasks are NOT going back to cards.
 */
function firstRow(page: Page) {
  return page.getByTestId("task-row").first();
}

const ROW_SURFACE = "/tasks?system=all";

/** The x-origin of each of the row's four metadata cells, left to right. */
async function columnOrigins(row: Locator): Promise<readonly number[]> {
  return row.evaluate((el) =>
    [...el.querySelectorAll(".dh-taskrow__cell")].map(
      (cell) => Math.round(cell.getBoundingClientRect().x * 100) / 100,
    ),
  );
}

test.describe("UIQ — task-row hover contract (Tasks)", () => {
  test("at rest the row owns its width and concealed actions are truly absent", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, ROW_SURFACE);

    const row = firstRow(page);
    await expect(row).toBeVisible();

    // UIQ-001 — the touch swipe affordance does not paint on a fine pointer.
    const tray = row.locator(".dh-taskrow__swipe-tray");
    if ((await tray.count()) > 0) {
      await expect(tray).toHaveCSS("display", "none");
    }

    // UIQ-002 — concealed means INVISIBLE, never removed: the overflow trigger
    // and every inline caret are opacity-0 at rest and still in the
    // accessibility tree, so a screen reader and the keyboard reach a row that
    // was never hovered.
    const overflow = row.locator(".dh-taskrow__overflow");
    await expect(overflow).toHaveCSS("opacity", "0");
    await expect(overflow).toHaveCSS("pointer-events", "none");
    await expect(overflow).toHaveAttribute("aria-haspopup", /menu|true/);

    const carets = row.locator(".dh-inline-select__caret");
    expect(
      await carets.count(),
      "the row's inline editors draw their carets",
    ).toBeGreaterThan(0);
    await expect(carets.first()).toHaveCSS("opacity", "0");

    // The TITLE owns the row rather than ceding a third of it to a rail: the
    // title cell is the list grid's only `1fr`. Pre-DS-04 this measured 0.50.
    const rowBox = await box(row);
    const mainBox = await box(row.locator(".dh-taskrow__main"));
    expect(
      mainBox.width / rowBox.width,
      "the title should own the row's flexible width",
    ).toBeGreaterThan(0.3);

    // DHDS-02 — DOM and visual scan order agree: when, where, importance,
    // exceptional state. A CSS-only reorder would make these origins descend
    // or cross even though the row still looked superficially aligned.
    const origins = await columnOrigins(row);
    expect(origins).toEqual([...origins].sort((a, b) => a - b));
  });

  test("hover reveals actions inside the row without moving anything, over an opaque surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, ROW_SURFACE);

    const row = firstRow(page);
    await expect(row).toBeVisible();
    const before = await box(row);
    const mainBefore = await box(row.locator(".dh-taskrow__main"));
    const columnsBefore = await columnOrigins(row);

    await row.hover();
    const overflow = row.locator(".dh-taskrow__overflow");
    await expect(overflow).toBeVisible();
    await expect(overflow).toHaveCSS("opacity", "1");
    await expect(overflow).toHaveCSS("pointer-events", "auto");

    // CONTROL-01 §6 — the reveal is opacity ONLY. The row does not resize, the
    // title does not narrow, and no metadata column is shoved sideways, because
    // both the overflow column and each caret already occupied their space.
    const after = await box(row);
    const mainAfter = await box(row.locator(".dh-taskrow__main"));
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(mainAfter.width).toBe(mainBefore.width);
    expect(
      await columnOrigins(row),
      "revealing the row's controls must not move a metadata column",
    ).toEqual(columnsBefore);

    // Revealed controls sit INSIDE the row's own bounds.
    const overflowBox = await box(overflow);
    expect(overflowBox.x).toBeGreaterThanOrEqual(after.x);
    expect(overflowBox.x + overflowBox.width).toBeLessThanOrEqual(
      after.x + after.width + 1,
    );

    // UIQ-001 — the hovered row's wash is opaque, so nothing behind it shows
    // through (the original defect was a translucent hover uncovering slabs).
    const bg = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alphaOf(bg), `hover background must be opaque, got ${bg}`).toBe(1);
  });

  test("keyboard focus reveals the same actions the pointer gets", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, ROW_SURFACE);

    const row = firstRow(page);
    const columnsBefore = await columnOrigins(row);

    // Focus anywhere in the row — the title link is the first stop — and the
    // row's held-back controls appear, exactly as they do on hover.
    await row.getByTestId("task-row-open").focus();
    const overflow = row.locator(".dh-taskrow__overflow");
    await expect(overflow).toHaveCSS("opacity", "1");
    await expect(row.locator(".dh-inline-select__caret").first()).not.toHaveCSS(
      "opacity",
      "0",
    );

    /*
     * The concealed control itself stays focusable — it is opacity-0, never
     * `display: none` or `visibility: hidden` — so Tab reaches the row's long
     * tail directly on a row the pointer never touched. Losing that would break
     * the DS-04 "keyboard/AT reachable" contract for keyboard users.
     */
    await overflow.focus();
    await expect(overflow).toBeFocused();
    await expect(overflow).toHaveCSS("opacity", "1");
    expect(
      await columnOrigins(row),
      "focus must not move a metadata column either",
    ).toEqual(columnsBefore);
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

/*
 * UIQ-004 — "grid card heading survives a wrapping title" — was DELETED here
 * on 2026-08-25, and this note is what replaces it.
 *
 * Its subject was the GRID card: it drove a `grid` radio on
 * `/design/cards-filters` and measured `.dh-card--grid`. DEBT-113 removed the
 * grid and board presentations — nothing in the product ever constructed them,
 * and the documented rule for a grid card contradicted `card-family.css` — so
 * the radio, the class and the treatment are all gone. A test asserting a
 * component that does not exist is the case HARDEN-01 already ruled on
 * (DEBT-125: twenty-two such failures, deleted rather than adapted).
 *
 * ── Why it was not simply re-pointed at the list card, which was tried ──────
 * Both of its claims were measured against the surviving presentation, and
 * NEITHER transfers:
 *
 *   - *"the glyph sits in its own column beside the title"* describes a
 *     two-dimensional grid heading. On the list card the icon's right edge is
 *     ~14px PAST the title box's left edge at 1200, 900, 700 AND 480px,
 *     because the title is a full-width block in a row rather than a column
 *     neighbour.
 *   - *"the status chip stays in the heading row"* fails at 480px, where the
 *     compact phone treatment deliberately recomposes the card.
 *
 * Asserting either would invent a requirement UIQ-004 never made and call the
 * product broken for not meeting it. If the LIST card's heading anatomy
 * deserves a guard, that is a new claim needing its own evidence and its own
 * measurement — not this one rehomed until it happens to pass.
 *
 * What the removal itself is guarded by: `CardPresentation` is the literal
 * type `"list"`, so a second presentation cannot reappear without a
 * type-level change, and `test/unit/card/Card.test.tsx` asserts the rendered
 * `data-presentation`.
 */
