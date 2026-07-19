import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * DS-05 — Shared Timeline & Activity Feed, driven end to end against the
 * development-auth server where the dev-only fixture (`/design/activity-feed`) is
 * mounted.
 *
 * Non-brittle: asserts roles, the DS-07 URL contract, DS-03 drawer integration,
 * virtualised-window behaviour, load-more scroll preservation and layout invariants
 * — never pixel snapshots. Covered at desktop and a 320px mobile viewport, and in
 * both colour schemes.
 */

const FIXTURE = "/design/activity-feed";

function feedViewport(page: Page): Locator {
  return page.getByTestId("af-feed").locator(".dh-activity__viewport");
}

async function gotoFixture(page: Page) {
  await page.goto(FIXTURE);
  await expect(
    page.getByRole("heading", { name: "Timeline & Activity Feed", level: 1 }),
  ).toBeVisible();
  // Both configurations of the one renderer are present.
  await expect(page.getByTestId("af-feed").getByRole("feed")).toBeVisible();
  await expect(page.getByTestId("af-timeline").getByRole("feed")).toBeVisible();
}

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

async function addEventTypeFilter(page: Page, valueLabel: string) {
  await page
    .getByRole("button", { name: /Add filter/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Add filter" });
  await dialog
    .getByRole("combobox", { name: "Field" })
    .selectOption({ label: "Event type" });
  await dialog
    .getByRole("combobox", { name: "Value" })
    .selectOption({ label: valueLabel });
  await dialog.getByRole("button", { name: "Add filter" }).click();
}

test.describe("DS-05 — desktop", () => {
  test("Timeline shows a record's history grouped by day", async ({ page }) => {
    await gotoFixture(page);
    const timeline = page.getByTestId("af-timeline").getByRole("feed");
    await expect(timeline.getByRole("article").first()).toBeVisible();
    // Day separators group the events.
    await expect(timeline.getByRole("separator").first()).toBeVisible();
    // Semantic timestamps.
    await expect(timeline.locator("time[datetime]").first()).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Activity Feed filters by event type via DS-07 (URL-backed)", async ({
    page,
  }) => {
    await gotoFixture(page);
    await addEventTypeFilter(page, "Task completed");

    // The filter lives in the URL (DS-07 contract).
    await expect.poll(() => page.url()).toContain("activityType");

    // The feed now only shows task-completed events (their subject links).
    const feed = page.getByTestId("af-feed").getByRole("feed");
    await expect(feed.getByRole("article").first()).toBeVisible();
    await expect(feed.getByText("completed").first()).toBeVisible();
  });

  test("a referenced entity opens in the DS-03 Drawer without losing filters", async ({
    page,
  }) => {
    await gotoFixture(page);
    await addEventTypeFilter(page, "Task completed");
    await expect.poll(() => page.url()).toContain("activityType");

    const feed = page.getByTestId("af-feed").getByRole("feed");
    await feed.getByRole("link").first().click();

    // The drawer opens over the current context…
    await expect(page.getByRole("dialog")).toBeVisible();
    // …and the filter parameter is preserved alongside the drawer parameter.
    await expect.poll(() => page.url()).toContain("drawer=");
    expect(page.url()).toContain("activityType");
  });

  test("virtualised feed renders a bounded window and stays usable", async ({
    page,
  }) => {
    await gotoFixture(page);
    const feed = page.getByTestId("af-feed").getByRole("feed");

    // Load a few pages so many events are loaded.
    for (let i = 0; i < 3; i += 1) {
      const loadMore = page
        .getByTestId("af-feed")
        .getByRole("button", { name: /load more/i });
      // Click without scrolling the container (footer is always in the DOM).
      await loadMore.evaluate((el) => (el as HTMLElement).click());
      await page.waitForTimeout(150);
    }

    const setSize = Number(
      await feed.getByRole("article").first().getAttribute("aria-setsize"),
    );
    const rendered = await feed.getByRole("article").count();
    // Windowing: far fewer articles are in the DOM than are loaded.
    expect(setSize).toBeGreaterThan(80);
    expect(rendered).toBeLessThan(setSize);
    expect(rendered).toBeGreaterThan(0);
  });

  test("load-more preserves the scroll position", async ({ page }) => {
    await gotoFixture(page);
    const viewport = feedViewport(page);
    await viewport.evaluate((el) => el.scrollTo(0, 500));
    const before = await viewport.evaluate((el) => el.scrollTop);

    await page
      .getByTestId("af-feed")
      .getByRole("button", { name: /load more/i })
      .evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(200);

    const after = await viewport.evaluate((el) => el.scrollTop);
    expect(Math.abs(after - before)).toBeLessThan(8);
  });

  test("keyboard: an entity link is reachable and opens the drawer", async ({
    page,
  }) => {
    await gotoFixture(page);
    const link = page
      .getByTestId("af-feed")
      .getByRole("feed")
      .getByRole("link")
      .first();
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("empty and error+retry states", async ({ page }) => {
    await gotoFixture(page);
    const controls = page.getByTestId("af-controls");

    await controls.getByRole("radio", { name: "empty" }).check();
    await expect(page.getByText("No activity yet").first()).toBeVisible();

    await controls.getByRole("radio", { name: "error" }).check();
    const retry = page
      .getByTestId("af-feed")
      .getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    await retry.click();
    // Retry succeeds → events render.
    await expect(
      page.getByTestId("af-feed").getByRole("article").first(),
    ).toBeVisible();
  });
});

test.describe("DS-05 — mobile 320px", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("no horizontal overflow at 320px", async ({ page }) => {
    await gotoFixture(page);
    await expect(
      page.getByTestId("af-feed").getByRole("article").first(),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-05 — dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("renders the feed in dark mode", async ({ page }) => {
    await gotoFixture(page);
    await expect(
      page.getByTestId("af-feed").getByRole("article").first(),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});
