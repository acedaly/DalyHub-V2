/**
 * PLAN-01 — the responsive, accessibility and touch-target matrix for Weekly
 * Planning.
 *
 * Every width the product supports, both appearances, 200% reflow, axe WCAG 2.2 AA
 * in light and dark, the DalyHub 44px target floor, and the keyboard path through
 * the phone composition. These are assertions, not screenshots — the capture pass
 * (`plan-smart-01-screenshots.spec.ts`) photographs and measures the same surface.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  TOUCH_TARGET_MIN,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import {
  clearPlanFixture,
  planFixture,
  seedPlanFixture,
  type PlanFixture,
} from "./plan-fixtures";

/** Every width in the matrix, from the widest desktop to the narrowest phone. */
const WIDTHS = [
  { name: "1440", width: 1440, height: 1000 },
  { name: "1280", width: 1280, height: 900 },
  { name: "820", width: 820, height: 1000 },
  { name: "430", width: 430, height: 932 },
  { name: "393", width: 393, height: 852 },
  { name: "375", width: 375, height: 812 },
  { name: "320", width: 320, height: 720 },
] as const;

let fixture: PlanFixture;

test.beforeAll(() => {
  fixture = planFixture();
  seedPlanFixture(fixture);
});

test.afterAll(() => {
  clearPlanFixture(fixture);
});

/**
 * PLAN-01's OWN visible controls, with their rendered boxes.
 *
 * Scoped to the controls this item introduces. The shared task row's controls
 * belong to DS-04 and are asserted where they are defined — measuring them here
 * would make this file fail for a change it does not own, which is the fastest
 * way to a test nobody trusts.
 */
async function visibleControlBoxes(
  page: Page,
): Promise<{ label: string; width: number; height: number }[]> {
  return page.evaluate(() => {
    const selectors = [
      '[data-testid="plan-rail-day"]',
      '[data-testid="plan-place-day"]',
      '[data-testid="plan-queue-source"]',
      ".dh-plan__weeknav-link",
    ];
    return (
      [...document.querySelectorAll<HTMLElement>(selectors.join(", "))]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label:
              node.getAttribute("aria-label") ??
              node.textContent?.trim().slice(0, 40) ??
              node.tagName,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        // A control that is not RENDERED has no target to measure: the day rail
        // does not exist above the phone tier, and a `display: none` day section
        // contributes nothing.
        .filter((box) => box.width > 0 && box.height > 0)
    );
  });
}

for (const size of WIDTHS) {
  test(`renders without horizontal overflow at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await gotoFixture(page, "/plan");
    await expect(
      page.getByRole("heading", { name: "Weekly planning" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test("shows all seven days above the phone tier and exactly ONE below it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoFixture(page, "/plan");
  // Every day is drawn, so a desktop reader sees the shape of the week.
  await expect(page.getByTestId("plan-day")).toHaveCount(7);
  for (const day of fixture.tasks) void day;
  await expect(page.locator('[data-testid="plan-day"]:visible')).toHaveCount(7);
  // The day rail is a phone affordance and does not exist here.
  await expect(
    page.locator('[data-testid="plan-rail-day"]:visible'),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/plan");
  // One day, and a rail to move between them. The other six are `display: none`,
  // so they are out of the accessibility tree too — not readable-but-invisible.
  await expect(page.locator('[data-testid="plan-day"]:visible')).toHaveCount(1);
  await expect(
    page.locator('[data-testid="plan-rail-day"]:visible'),
  ).toHaveCount(7);
});

test("the phone day rail moves the day, by pointer and by keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await gotoFixture(page, "/plan");

  const rail = page.getByRole("tablist", { name: "Days of the week" });
  const tabs = rail.getByRole("tab");
  await expect(tabs).toHaveCount(7);

  // Selecting a day shows THAT day, and says so semantically.
  const friday = tabs.nth(4);
  await friday.click();
  await expect(friday).toHaveAttribute("aria-selected", "true");
  const shown = page.locator('[data-testid="plan-day"]:visible');
  await expect(shown).toHaveCount(1);
  await expect(shown).toHaveAttribute(
    "data-date",
    await friday
      .getAttribute("aria-controls")
      .then((id) => id!.replace("plan-day-", "")),
  );

  // …and the same by keyboard alone.
  const sunday = tabs.nth(6);
  await sunday.focus();
  await page.keyboard.press("Enter");
  await expect(sunday).toHaveAttribute("aria-selected", "true");
});

/*
 * The touch-target matrix runs in a REAL phone context.
 *
 * A width alone reports `pointer: fine`, and the target floor in `tokens.css` is
 * keyed on the INPUT MECHANISM rather than the window — deliberately, and
 * `dalyhub-tokens.test.ts` forbids tying it to width. So this block emulates a
 * phone (touch, mobile) rather than a narrow desktop, which is what the product
 * is being asked about.
 */
test.describe("the phone's touch targets", () => {
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });

  test("every placement control meets the DalyHub 44px floor", async ({
    page,
  }) => {
    await gotoFixture(page, "/plan");

    /*
     * The controls PLAN-01 adds, which are the ones this item is answerable for:
     * the day rail, the seven placement buttons, the queue's source picker and
     * the week navigation. The shared task row's own controls are DS-04's and are
     * asserted where they are defined; re-asserting them here would make this
     * file fail for a change it does not own.
     */
    const boxes = await visibleControlBoxes(page);
    expect(boxes.length).toBeGreaterThan(0);
    const undersized = boxes.filter(
      (box) => Math.min(box.width, box.height) < TOUCH_TARGET_MIN,
    );
    expect(
      undersized,
      "PLAN-01 controls below the DalyHub 44px target floor",
    ).toEqual([]);
  });
});

test("reflows at 200% zoom without a horizontal scrollbar", async ({
  page,
}) => {
  // WCAG 2.2 §1.4.10 reflow: 1280 CSS pixels at 200% is a 640px viewport.
  await page.setViewportSize({ width: 640, height: 512 });
  await gotoFixture(page, "/plan");
  await expect(
    page.getByRole("heading", { name: "Weekly planning" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  // The week is still readable and still one day at a time — reflow must not mean
  // "the surface disappears".
  await expect(page.locator('[data-testid="plan-day"]:visible')).toHaveCount(1);
  await expect(page.getByTestId("plan-queue")).toBeVisible();
});

test("passes axe WCAG 2.2 AA in LIGHT appearance", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  await gotoFixture(page, "/plan");
  await expectNoAxeViolations(page);
});

test("passes axe WCAG 2.2 AA in DARK appearance", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoFixture(page, "/plan");
  await expectNoAxeViolations(page);
});

test("passes axe WCAG 2.2 AA on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.emulateMedia({ colorScheme: "light" });
  await gotoFixture(page, "/plan");
  await expectNoAxeViolations(page);
});

test("states the week and the day in WORDS, never by colour alone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFixture(page, "/plan");

  // The week: a relative word AND an explicit range.
  const range = page.getByTestId("plan-week-range");
  await expect(range).toContainText("This week");
  await expect(range).toContainText(/\d/);

  /*
   * Today: the word, on exactly one DAY HEADING.
   *
   * Scoped to the day headings rather than to the page, because "Today" appears
   * legitimately in two other places — the shell's navigation destination, and a
   * task row whose date reads "Today". The claim being asserted is that the
   * planner names the current day in words on exactly one day of the week.
   */
  const nowBadges = page.locator(".dh-plan__day-now");
  await expect(nowBadges).toHaveCount(1);
  await expect(nowBadges).toHaveText("Today");
  await expect(
    page.locator('[data-testid="plan-day"][data-today="true"]'),
  ).toHaveCount(1);

  // Every day control names its day in words, for a screen reader.
  const placeDays = page.getByTestId("plan-place-day");
  await expect(placeDays).toHaveCount(7);
  for (let index = 0; index < 7; index += 1) {
    const label = await placeDays.nth(index).getAttribute("aria-label");
    expect(label).toMatch(/Plan \d+ selected tasks? for \w+day \d+ \w+/);
  }
});

test("keeps focus after a mutation and announces the outcome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await gotoFixture(page, "/plan");

  const unplaced = fixture.task("unplaced");
  const queue = page.getByTestId("plan-queue");
  const checkbox = queue.getByRole("checkbox", {
    name: `Select ${unplaced.title} to place on a day`,
  });
  await checkbox.check();

  const target = page.getByTestId("plan-place-day").nth(2);
  await target.focus();
  await page.keyboard.press("Enter");

  /*
   * The announcement is a live region, and it says what happened AND what did
   * not.
   *
   * Named rather than taken as the LAST `[role="status"]` on the page. The shell
   * mounts `ConnectionStatus`, a persistent live region, after the route's own
   * markup, so last-in-document is the connection state — permanently empty
   * while the connection is healthy — and this assertion timed out against `""`
   * about an announcement the Plan had made correctly.
   */
  await expect(page.getByTestId("plan-announcement")).toContainText(
    /planned for .*Deadlines are unchanged/,
  );
  /*
   * Focus is not thrown away.
   *
   * The day button DISABLES itself once the selection is placed (nothing is
   * selected any more), so it cannot keep focus — a browser drops focus to the
   * body, and the owner's place is gone. Focus therefore moves deliberately to
   * the heading of the region that changed, which is also what the announcement
   * is about.
   */
  await expect(
    page.getByRole("heading", { name: "Still to place" }),
  ).toBeFocused();
});
