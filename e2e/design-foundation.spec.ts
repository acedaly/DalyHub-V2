import { expect, test } from "@playwright/test";

/**
 * DS-01 / DS-02 — the combined design foundation, driven end to end against the
 * development-auth server (where the dev-only Record Layout fixture is mounted).
 *
 * Deliberately non-brittle: it asserts roles, the deep-link contract, the
 * token-driven theme, and the no-horizontal-overflow invariant — never pixel
 * snapshots. Covered at a desktop and a 320px mobile viewport.
 */

const DEMO_PATH = "/design/record-layout";

/** True when the document does not overflow horizontally. */
async function hasNoHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    // Allow a 1px rounding tolerance.
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

test.describe("DS foundation — desktop", () => {
  test("renders the Record Layout fixtures and applies design tokens", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);

    // The fixture page and several record headings render.
    await expect(
      page.getByRole("heading", { level: 1, name: "Record Layout" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Website relaunch" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Run a half-marathon" }),
    ).toBeVisible();

    // DS-01 tokens are applied: the body background resolves to a real colour.
    const bg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bg).not.toBe("");
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");

    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("tabs are keyboard operable and deep-link to the URL", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);

    const tablist = page
      .getByRole("tablist", { name: /Website relaunch/ })
      .first();
    await expect(tablist).toBeVisible();

    // Selecting a tab reflects into the URL (deep-link contract). Retry the
    // click until it lands so the test is robust against client hydration
    // timing (clicking a still-hydrating button is idempotent here).
    const tasksTab = tablist.getByRole("tab", { name: /Tasks/ });
    await expect(async () => {
      await tasksTab.click();
      await expect(page).toHaveURL(/[?&]tab=tasks/, { timeout: 1000 });
    }).toPass();
    await expect(page.getByRole("tab", { name: /Tasks/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // The deep link survives a reload (SSR reads the query param).
    await page.reload();
    await expect(page.getByRole("tab", { name: /Tasks/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    /*
     * Keyboard: arrow keys move the active tab.
     *
     * Retried, for the reason this test already states twice above: the strip
     * is server-rendered and a keypress that arrives before React Aria has
     * attached its roving-tabindex handler is simply lost — the focus never
     * moves and the assertion fails on a control that works. Re-focusing
     * Overview at the top of each attempt means ArrowRight is always the same
     * single step, so a passing attempt is the first one that lands rather than
     * the one that has walked far enough along the strip.
     */
    const overview = page.getByRole("tab", { name: /Overview/ });
    await expect(async () => {
      await overview.focus();
      await page.keyboard.press("ArrowRight");
      await expect(page.getByRole("tab", { name: /Tasks/ })).toBeFocused({
        timeout: 1_000,
      });
    }).toPass();
  });

  test("content region exposes loading, empty and error states", async ({
    page,
  }) => {
    await page.goto(`${DEMO_PATH}?tab=overview`);

    const controls = page.getByRole("group", { name: "Content state" });
    // Retry the first interaction to absorb client-hydration timing.
    await expect(async () => {
      await controls.getByRole("button", { name: "error" }).click();
      await expect(page.getByRole("alert")).toContainText("offline", {
        timeout: 1000,
      });
    }).toPass();

    await controls.getByRole("button", { name: "empty" }).click();
    await expect(page.getByText("Nothing here yet.").first()).toBeVisible();
  });
});

test.describe("DS foundation — mobile (320px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("does not introduce horizontal overflow and keeps actions reachable", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);

    await expect(
      page.getByRole("heading", { level: 1, name: "Website relaunch" }),
    ).toBeVisible();

    // Actions adapt (wrap) rather than disappear.
    await expect(
      page.getByRole("button", { name: "Mark complete" }),
    ).toBeVisible();

    // The long-title record must not force the page wider than the viewport.
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    // The tab strip is still operable on a narrow screen.
    const tasksTab = page
      .getByRole("tablist", { name: /Website relaunch/ })
      .first()
      .getByRole("tab", { name: /Tasks/ });
    await expect(async () => {
      await tasksTab.click();
      await expect(page).toHaveURL(/[?&]tab=tasks/, { timeout: 1000 });
    }).toPass();
  });
});
