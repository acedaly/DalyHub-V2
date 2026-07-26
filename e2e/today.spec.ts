import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * TODAY-01 / TODAY-04 — the Today dashboard, driven end to end against the
 * development-auth server. Role-based and non-brittle: it asserts the sidebar
 * entry, the pane header, the planning sections + summary, the preserved fixture
 * sections, inert quick capture, a card opening the Drawer, and the
 * no-horizontal-overflow invariant on desktop and at 320px. Planning MUTATIONS are
 * driven in `planning.spec.ts` against a dedicated task, so this structural spec
 * does not interfere with the shared dev database.
 */

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

test.describe("TODAY-01 — desktop", () => {
  test("is reachable from the sidebar and renders the pane header", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Today" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
  });

  test("renders the command-centre widgets and the planning core", async ({
    page,
  }) => {
    await page.goto("/today");
    // The planning summary (My day) is always present (operational awareness).
    await expect(
      page.getByRole("group", { name: /Today at a glance/ }),
    ).toBeVisible();
    // The personalisable command-centre widgets are labelled h2 regions (TODAY-08).
    for (const name of [
      /Morning brief/,
      /My day/,
      /Recent activity/,
      /Continue working/,
      /Insights/,
      /Capture/,
    ]) {
      // Each widget heading name is unique, so no ordinal locator is needed.
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    // The planning sub-sections nest one level below the My day widget (h3); the
    // seeded, unplanned tasks appear under Anytime.
    await expect(
      page.getByRole("heading", { level: 3, name: /Anytime/ }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("quick capture is structured but does not persist", async ({ page }) => {
    await page.goto("/today");
    await page.locator('.dh-today[data-hydrated="true"]').waitFor();
    // Scope to the capture form's submit — the widget heading is also a "Capture"
    // control, so an unscoped role query would be ambiguous (TODAY-08).
    const capture = page.locator('.dh-today__capture button[type="submit"]');
    await expect(capture).toBeDisabled();
    await page
      .getByPlaceholder("What needs your attention?")
      .fill("Call the plumber");
    await expect(capture).toBeEnabled();
    await capture.click();
    // Scope to the capture notice — the Recent Activity feed also owns a live status
    // region ("N events loaded"), so an unscoped role query would be ambiguous.
    await expect(page.locator(".dh-today__capture-notice")).toContainText(
      /has not been saved/i,
    );
    await expect(
      page.getByPlaceholder("What needs your attention?"),
    ).toHaveValue("Call the plumber");
  });

  test("a widget can be collapsed and hidden, and the layout is remembered", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.locator('.dh-today[data-hydrated="true"]').waitFor();

    // Collapse the Focus widget: its body hides, the heading toggle flips.
    const focus = page.locator('[data-widget="focus"]');
    const focusToggle = focus.getByRole("button", { name: /Focus/ });
    await expect(focusToggle).toHaveAttribute("aria-expanded", "true");
    await focusToggle.click();
    await expect(focusToggle).toHaveAttribute("aria-expanded", "false");

    // Enter Customise, hide Focus, and confirm it leaves the surface.
    await page.getByRole("button", { name: "Customise" }).click();
    await focus.getByRole("button", { name: "Hide Focus" }).click();
    await expect(page.locator('[data-widget="focus"]')).toHaveCount(0);

    // The arrangement survives a reload (per-device persistence).
    await page.reload();
    await page.locator('.dh-today[data-hydrated="true"]').waitFor();
    await expect(page.locator('[data-widget="focus"]')).toHaveCount(0);

    // Restore it so the shared dev database's UI state is left clean.
    await page.getByRole("button", { name: "Customise" }).click();
    await page.getByRole("button", { name: "Show Focus" }).click();
    await expect(page.locator('[data-widget="focus"]')).toBeVisible();
  });

  test("opens a record in the Drawer over the pane", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "Finish PX-02" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Finish PX-02" }),
    ).toBeVisible();
  });

  test("swipe-wrapped task cards keep their elevation on desktop (shadow not clipped)", async ({
    page,
  }) => {
    // TODAY-06 regression: the swipe wrapper clips its surface with overflow:hidden,
    // so the card elevation must live on the WRAPPER (an element never clips its own
    // box-shadow) — otherwise every Today task card would silently lose its shadow,
    // including on desktop where swipe is inactive.
    await page.goto("/today");
    const wrapper = page.locator(".dh-card-swipe").first();
    await expect(wrapper).toBeVisible();
    const shadow = await wrapper.evaluate(
      (el) => getComputedStyle(el).boxShadow,
    );
    expect(shadow).not.toBe("none");
    expect(shadow.trim()).not.toBe("");
  });
});

test.describe("TODAY-01 — mobile (320px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("has no horizontal overflow", async ({ page }) => {
    await page.goto("/today");
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});
