import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * DS-03 — the Shared Drawer, driven end to end against the development-auth server
 * where the dev-only Drawer fixture (`/design/drawer`) is mounted.
 *
 * Deliberately non-brittle: it asserts roles, the URL/history contract, focus
 * behaviour, background isolation, state/scroll preservation and layout invariants
 * — never pixel snapshots. Covered at a desktop and a 320px mobile viewport, plus
 * a reduced-motion run.
 */

const FIXTURE = "/design/drawer";

/** Load the fixture and wait for client hydration (so SPA behaviour is reliable). */
async function gotoFixture(page: Page) {
  await page.goto(FIXTURE);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
}

/** True when the document does not overflow horizontally (1px tolerance). */
async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

/** Open the Project record from the background list (after hydration). */
async function openProject(page: Page) {
  const card = page.getByRole("link", { name: /Project Website relaunch/ });
  await card.click();
  await expect(
    page.getByRole("dialog", { name: "Website relaunch" }),
  ).toBeVisible();
  return card;
}

test.describe("DS-03 Drawer — desktop", () => {
  test("opens a record over the page, deep-links tabs, and scrolls independently", async ({
    page,
  }) => {
    await gotoFixture(page);
    await expect(
      page.getByRole("heading", { level: 1, name: "Drawer" }),
    ).toBeVisible();

    await openProject(page);
    // Opening is a real URL transition.
    await expect(page).toHaveURL(/[?&]drawer=project%3Awebsite-relaunch/);

    const dialog = page.getByRole("dialog", { name: "Website relaunch" });
    // The drawer hosts the real DS-02 Record Layout (its own heading + tablist).
    await expect(
      dialog.getByRole("tablist", { name: /Website relaunch/ }),
    ).toBeVisible();

    // Tabs inside the Record Layout remain deep-linkable.
    await dialog.getByRole("tab", { name: /Tasks/ }).click();
    await expect(page).toHaveURL(/[?&]tab=tasks/);
    // Both parameters coexist (stack + tab).
    await expect(page).toHaveURL(/drawer=project%3Awebsite-relaunch/);

    // The long task list scrolls inside the drawer body.
    const lastTask = dialog.getByText("Task 40 —", { exact: false });
    await lastTask.scrollIntoViewIfNeeded();
    await expect(lastTask).toBeVisible();

    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("stacks a second drawer; only the top is interactive; Escape closes top only", async ({
    page,
  }) => {
    await gotoFixture(page);
    await openProject(page);

    const project = page.getByRole("dialog", { name: "Website relaunch" });
    await project.getByRole("link", { name: /Open goal/ }).click();

    const goal = page.getByRole("dialog", { name: "Grow the studio" });
    await expect(goal).toBeVisible();

    // The background page is inert while a drawer is open (still visible behind
    // the side sheet, but removed from interaction and the a11y tree).
    const counterInert = await page
      .getByTestId("counter")
      .evaluate((element) => element.closest("[inert]") !== null);
    expect(counterInert).toBe(true);

    // Escape closes only the top (Goal); the Project remains.
    await page.keyboard.press("Escape");
    await expect(goal).toBeHidden();
    await expect(project).toBeVisible();

    // Escape again closes the Project, revealing the background page.
    await page.keyboard.press("Escape");
    await expect(project).toBeHidden();
    const counterInteractiveAgain = await page
      .getByTestId("counter")
      .evaluate((element) => element.closest("[inert]") === null);
    expect(counterInteractiveAgain).toBe(true);
  });

  test("Back/Forward walk the stack; focus restores to the opener", async ({
    page,
  }) => {
    await gotoFixture(page);
    const card = await openProject(page);

    const project = page.getByRole("dialog", { name: "Website relaunch" });
    await project.getByRole("link", { name: /Open goal/ }).click();
    const goal = page.getByRole("dialog", { name: "Grow the studio" });
    await expect(goal).toBeVisible();

    // Back closes the nested Goal, then the Project.
    await page.goBack();
    await expect(goal).toBeHidden();
    await expect(project).toBeVisible();
    await page.goBack();
    await expect(project).toBeHidden();

    // Focus returned to the card that opened the Project.
    await expect(card).toBeFocused();

    // Forward restores both levels in order.
    await page.goForward();
    await expect(project).toBeVisible();
    await page.goForward();
    await expect(goal).toBeVisible();
  });

  test("preserves background state and scroll position across open/close", async ({
    page,
  }) => {
    await gotoFixture(page);

    // Establish background state (the fixture is hydrated via gotoFixture).
    const counter = page.getByTestId("counter");
    await counter.click();
    await counter.click();
    await expect(counter).toHaveText("Count is 2");
    await page.getByTestId("note").fill("remember me");
    await page.getByTestId("page-bottom").scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // Open without letting Playwright auto-scroll the off-screen card into view,
    // so this measures the Drawer's own scroll handling, not the click's.
    await page
      .getByRole("link", { name: /Project Website relaunch/ })
      .dispatchEvent("click");
    await expect(
      page.getByRole("dialog", { name: "Website relaunch" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Website relaunch" }),
    ).toBeHidden();

    // State and scroll survived inspecting the record.
    await expect(page.getByTestId("counter")).toHaveText("Count is 2");
    await expect(page.getByTestId("note")).toHaveValue("remember me");
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(4);
  });

  test("direct deep links render coherently, including an unknown record", async ({
    page,
  }) => {
    await page.goto(`${FIXTURE}?drawer=project:website-relaunch`);
    await expect(
      page.getByRole("dialog", { name: "Website relaunch" }),
    ).toBeVisible();

    await page.goto(`${FIXTURE}?drawer=project:missing`);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/couldn’t find that record/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
  });

  test("closing a deep-linked drawer reached with prior history stays on the route", async ({
    page,
  }) => {
    // Establish real browser history on a DIFFERENT fixture route first.
    await page.goto("/design/record-layout");
    await expect(
      page.getByRole("heading", { level: 1, name: "Record Layout" }),
    ).toBeVisible();

    // Arrive at the drawer fixture through a drawer deep link (copied-link style),
    // so the drawer level was NOT opened by DalyHub's own openDrawer().
    await page.goto(`${FIXTURE}?drawer=project:website-relaunch`);
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
    const drawer = page.getByRole("dialog", { name: "Website relaunch" });
    await expect(drawer).toBeVisible();

    // Closing must remove ONLY the top drawer parameter and keep the current route
    // — it must never navigate back to /design/record-layout.
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(page).toHaveURL(/\/design\/drawer$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(page.url()).not.toContain("record-layout");
  });

  test("works in dark theme", async ({ page }) => {
    await gotoFixture(page);
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await openProject(page);
    const dialog = page.getByRole("dialog", { name: "Website relaunch" });
    await expect(dialog).toBeVisible();
    // The panel resolves a real, non-transparent surface colour in dark theme.
    const bg = await dialog.evaluate(
      (node) => getComputedStyle(node).backgroundColor,
    );
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("DS-03 Drawer — reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("opens and closes without depending on animation", async ({ page }) => {
    await gotoFixture(page);
    await openProject(page);
    await expect(
      page.getByRole("dialog", { name: "Website relaunch" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Website relaunch" }),
    ).toBeHidden();
  });
});

test.describe("DS-03 Drawer — mobile (320px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("adapts to a full-height sheet, stays reachable, and Back closes", async ({
    page,
  }) => {
    await gotoFixture(page);
    await openProject(page);

    const dialog = page.getByRole("dialog", { name: "Website relaunch" });
    // The sheet fills (nearly) the full viewport width.
    const box = await dialog.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);

    // The close control and a Record Layout action remain reachable.
    await expect(dialog.getByRole("button", { name: "Close" })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Mark complete" }),
    ).toBeVisible();

    // The tab strip is still operable on a narrow sheet.
    await dialog.getByRole("tab", { name: /Tasks/ }).click();
    await expect(page).toHaveURL(/[?&]tab=tasks/);

    // No horizontal document overflow at 320px.
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    // Browser Back closes the sheet.
    await page.goBack();
    await expect(dialog).toBeHidden();
  });
});
