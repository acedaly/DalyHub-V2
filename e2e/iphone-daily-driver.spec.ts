import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * MOBILE-01 (iPhone daily driver) — the regressions this pass fixed, pinned.
 *
 * The first MOBILE-01 pass built the phone PLATFORM (the bottom bar, the shared
 * Sheet, the keyboard inset, the full-screen Drawer) and `mobile-shell.spec.ts`
 * and `mobile-modules.spec.ts` cover it. This spec is narrower and complements
 * them: every test here corresponds to a defect the 2026-08 iPhone audit
 * MEASURED at 320/375/390/430 and this pass fixed, so a regression fails the
 * test rather than being rediscovered by the next audit.
 *
 * It asserts behaviour and geometry, never pixels of paint, and it mutates
 * nothing — every journey is read-only, so it can run beside the mutating Task
 * and Diary journeys without ordering constraints.
 *
 * Evidence and measurements: `docs/design/MOBILE_01_IPHONE_DAILY_DRIVER_2026_08.md`.
 */

/** The four iPhone widths this pass accepts against. */
const IPHONE_WIDTHS = [320, 375, 390, 430] as const;

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

/** The computed font size of a control, in px. */
async function fontSizePx(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? Number.parseFloat(getComputedStyle(el).fontSize) : 0;
  }, selector);
}

/* -------------------------------------------------------------------------- */
/* Horizontal overflow — the acceptance standard's first clause                */
/* -------------------------------------------------------------------------- */

test.describe("MOBILE-01 no avoidable horizontal overflow", () => {
  /*
   * The Project record is here specifically. The audit measured the DOCUMENT 79px
   * wider than the viewport at 320 and 9px at 390 on `/projects/pr-rc-kitchen`:
   * a phone-narrow task row is `flex: none` on its metadata run, and a Task
   * carrying a long "Waiting for" subject could not compress, so the page
   * scrolled sideways and the fixed bottom navigation stretched with it.
   */
  for (const width of IPHONE_WIDTHS) {
    test(`a Project record with a long waiting subject fits ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await gotoFixture(page, "/projects/pr-rc-kitchen");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("and the phone task row drops the waiting subject rather than growing", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-rc-kitchen");
    // The fact is not on the row at phone width…
    await expect(
      page
        .locator('.dh-tasklist .dh-card__meta[data-field="waiting-for"]')
        .first(),
    ).toBeHidden();
    // …and the Task it belongs to is still listed, with its title readable.
    await expect(
      page.getByRole("link", {
        name: "Open Await council sign-off on the window change",
      }),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* §5 — software keyboard and the 16px anti-zoom floor                         */
/* -------------------------------------------------------------------------- */

test.describe("MOBILE-01 mobile forms", () => {
  /*
   * iOS Safari zooms the page whenever a focused field computes below 16px and
   * does not zoom back out. The floor used to be an enumerated list of three
   * shared classes in `forms.css`; every module control written afterwards fell
   * outside it, and the audit measured 14px on all eight of these.
   */
  const FIELDS: readonly (readonly [string, string])[] = [
    ["/notes", ".dh-notes-filters__control"],
    ["/people", ".dh-people-filters__input"],
    ["/reviews", ".dh-select"],
    ["/tasks", ".dh-tasks-quickadd__input"],
  ];

  for (const [route, selector] of FIELDS) {
    test(`${route} — ${selector} never triggers iOS zoom`, async ({ page }) => {
      await gotoFixture(page, route);
      await expect(page.locator(selector).first()).toBeVisible();
      expect(await fontSizePx(page, selector)).toBeGreaterThanOrEqual(16);
    });
  }

  /*
   * Save must be reachable without dismissing the keyboard and scrolling to the
   * end of the form. Before this pass three of twenty-nine `FormActions` were
   * sticky; the New Person form's "Create person" sat 1,160px down a 844px
   * viewport.
   */
  test("a creation form keeps its commitment row on screen", async ({
    page,
  }) => {
    await gotoFixture(page, "/new/person");

    const actions = page.locator(".dh-form-actions").first();
    await expect(actions).toBeVisible();
    await expect(actions).toHaveClass(/dh-form-actions--sticky-phone/);

    const create = page.getByRole("button", { name: "Create person" });
    // Visible in the FIRST viewport, with no scrolling at all.
    const box = await create.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height + 1);
    await expectMinTouchTarget(create);
    await expectNoHorizontalOverflow(page);
  });

  test("and the desktop form is unchanged", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, "/new/person");
    // The class is present at every width; only the phone media query acts on
    // it, so a desktop form is still a plain row at the end of the fields.
    const position = await page.evaluate(() => {
      const el = document.querySelector(".dh-form-actions");
      return el ? getComputedStyle(el).position : null;
    });
    expect(position).toBe("static");
  });
});

/* -------------------------------------------------------------------------- */
/* §3 — one overlay architecture: the overflow menu is a sheet on a phone      */
/* -------------------------------------------------------------------------- */

test.describe("MOBILE-01 the shared overflow menu", () => {
  test("opens as a full-width sheet with comfortable rows", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    const trigger = page
      .locator(".dh-card__actions .dh-overflow-menu__trigger")
      .first();
    await expectMinTouchTarget(trigger);
    await trigger.click();

    // A modal sheet, not an anchored popover floating in the list.
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();

    const panel = page.locator(
      '.dh-overflow-menu__panel[data-presentation="sheet"]',
    );
    await expect(panel).toBeVisible();

    // Every action is a full-width row that clears the target floor, and the
    // LAST one is on screen — the anchored panel measured 208px wide with items
    // wrapping onto three lines.
    const items = page.getByRole("menuitem");
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await items.nth(index).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(43.5);
      expect(box!.width).toBeGreaterThan(PHONE.width * 0.75);
      expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height + 1);
    }

    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page, { include: "[role='dialog']" });
  });

  test("dismisses on Escape and returns focus to the trigger", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const trigger = page
      .locator(".dh-card__actions .dh-overflow-menu__trigger")
      .first();
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("but stays an anchored menu on a pointer device", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, "/tasks");
    await page
      .locator(".dh-card__actions .dh-overflow-menu__trigger")
      .first()
      .click();

    await expect(
      page.locator('.dh-overflow-menu__panel[data-presentation="anchored"]'),
    ).toBeVisible();
    // No modal dialog is introduced on the desktop path.
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* §4 — touch targets on the controls a daily driver actually uses             */
/* -------------------------------------------------------------------------- */

test.describe("MOBILE-01 touch targets", () => {
  test("Today's completion circle has a 44px hit area", async ({ page }) => {
    await gotoFixture(page, "/");

    // The circle stays 20px; the shared label around it is the target.
    const target = page.locator(".dh-taskrow .dh-check-circle-target").first();
    await expectMinTouchTarget(target);

    const circle = target.locator(".dh-check-circle");
    const box = await circle.boundingBox();
    expect(box).not.toBeNull();
    // Visually small, deliberately: the fix is the hit area, not the paint.
    expect(box!.height).toBeLessThan(30);
  });

  test("a task row's open link is comfortably tall", async ({ page }) => {
    await gotoFixture(page, "/tasks");
    const link = page
      .locator(
        ".dh-collection--tasks .dh-card__open, .dh-tasklist .dh-card__open",
      )
      .first();
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
  });

  for (const width of IPHONE_WIDTHS) {
    test(`the Diary week shows all seven days at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await gotoFixture(page, "/diary");

      const days = page.locator(".dh-diary-week__day");
      await expect(days).toHaveCount(7);

      const boxes = await days.evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
      for (const box of boxes) {
        // Nothing scrolled out of the strip, which is what the audit found:
        // five of seven days on screen at 390 and six of seven at 320.
        expect(box.left).toBeGreaterThanOrEqual(-0.5);
        expect(box.right).toBeLessThanOrEqual(width + 0.5);
        expect(box.height).toBeGreaterThanOrEqual(43.5);
      }
      // Equal widths — the strip reads as a week, not as seven boxes sized by
      // their own digits.
      const widths = boxes.map((box) => Math.round(box.width));
      expect(new Set(widths).size).toBe(1);
      // 41px at 320 is the honest ceiling for seven equal targets in a 288px
      // content box; anything below that is a regression.
      expect(widths[0]).toBeGreaterThanOrEqual(38);

      await expectNoHorizontalOverflow(page);
    });
  }

  test("a two-character record tab still clears the target floor", async ({
    page,
  }) => {
    await gotoFixture(page, "/notes/n-rc-brief");
    const tab = page.getByRole("tab", { name: "AI" });
    await expectMinTouchTarget(tab);
  });
});

/* -------------------------------------------------------------------------- */
/* §6 — Today reads as prose, not as three flex columns                        */
/* -------------------------------------------------------------------------- */

test("MOBILE-01 Today's empty prose keeps its reading order", async ({
  page,
}) => {
  await gotoFixture(page, "/");
  const prose = page.locator(".dh-today__quiet--prose").first();
  if ((await prose.count()) === 0) {
    test.skip(true, "no empty prose line in this dataset");
    return;
  }
  const display = await prose.evaluate((el) => getComputedStyle(el).display);
  // A sentence with an inline link inside a flex container is three flex items,
  // and rendered as three side-by-side columns at 390px.
  expect(display).toBe("block");
  await expectNoHorizontalOverflow(page);
});

/* -------------------------------------------------------------------------- */
/* §7 — the phone quick-add says where the task lands, in whole words          */
/* -------------------------------------------------------------------------- */

test("MOBILE-01 the Tasks quick-add placeholder is not cut mid-word", async ({
  page,
}) => {
  await gotoFixture(page, "/tasks");
  const input = page.getByTestId("tasks-quickadd-input");
  await expect(input).toHaveAttribute("placeholder", /^Add a task to /);
  await expect(input).not.toHaveAttribute("placeholder", /press Enter/);

  // The whole placeholder fits the field, so the destination is readable.
  const fits = await input.evaluate((el) => {
    const field = el as HTMLInputElement;
    const probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    probe.style.font = getComputedStyle(field).font;
    probe.textContent = field.placeholder;
    document.body.append(probe);
    const textWidth = probe.getBoundingClientRect().width;
    probe.remove();
    const style = getComputedStyle(field);
    const inner =
      field.getBoundingClientRect().width -
      Number.parseFloat(style.paddingInlineStart) -
      Number.parseFloat(style.paddingInlineEnd);
    return textWidth <= inner + 0.5;
  });
  expect(fits).toBe(true);
});
