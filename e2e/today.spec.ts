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

  test("quick capture opens the shared capture sheet — it persists now (TODAY-07)", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.locator('.dh-today[data-hydrated="true"]').waitFor();

    // The honest fixture is retired: there is no textarea that discards what you
    // type, and no notice apologising that nothing was saved. Asserting their
    // ABSENCE keeps this test meaningful — it would fail again if the fixture
    // ever came back.
    await expect(page.locator(".dh-today__capture-notice")).toHaveCount(0);
    await expect(
      page.getByPlaceholder("What needs your attention?"),
    ).toHaveCount(0);

    // Capture is now the ONE shared sheet over each module's canonical create
    // route, entered by type. Its create paths are proven end to end in
    // `mobile-capture-journeys.spec.ts`; here we prove Today reaches it.
    await page.getByTestId("today-capture-task").click();
    await expect(page.getByTestId("capture-sheet")).toBeVisible();
    await expect(page.getByLabel("Title")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("capture-sheet")).toBeHidden();
  });

  test("a widget can be collapsed and hidden, and the layout is remembered", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.locator('.dh-today[data-hydrated="true"]').waitFor();

    // Take the widget under test from the RENDERED catalogue rather than naming
    // one. This test is about the personalisation behaviour, not about any
    // particular widget existing: it previously hard-coded the "focus" panel,
    // which UX-01 removed along with the rest of the "coming soon" surfaces, and
    // the assertion then failed on `main` for a widget the product had
    // deliberately deleted. Reading the id and title from the DOM keeps the
    // behaviour covered while the catalogue is free to change.
    const widget = page.locator("[data-widget]").first();
    await expect(widget).toBeVisible();
    const widgetId = await widget.getAttribute("data-widget");
    expect(widgetId).toBeTruthy();
    const title = (
      await widget.locator(".dh-today-widget__title").innerText()
    ).trim();
    const selector = `[data-widget="${widgetId}"]`;

    // Collapse it: its body hides, the heading toggle flips.
    const toggle = widget.locator(".dh-today-widget__toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    // Enter Customise, hide it, and confirm it leaves the surface.
    await page.getByRole("button", { name: "Customise" }).click();
    await widget.getByRole("button", { name: `Hide ${title}` }).click();
    await expect(page.locator(selector)).toHaveCount(0);

    // The arrangement survives a reload (per-device persistence).
    await page.reload();
    await page.locator('.dh-today[data-hydrated="true"]').waitFor();
    await expect(page.locator(selector)).toHaveCount(0);

    // Restore it so the shared dev database's UI state is left clean.
    await page.getByRole("button", { name: "Customise" }).click();
    await page.getByRole("button", { name: `Show ${title}` }).click();
    await expect(page.locator(selector)).toBeVisible();
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

  test("swipe-wrapped task rows hide their action tray at rest", async ({
    page,
  }) => {
    /*
     * TODAY-06's regression, restated for DS-14 — same defect, different
     * mechanism, and the supersession is recorded in
     * THEME_ACCEPTANCE_MATRIX.md §9.3 rather than quietly dropped.
     *
     * The original assertion was that the swipe WRAPPER carries a box-shadow,
     * because the wrapper clips its surface with `overflow: hidden` and an
     * element never clips its own shadow — so elevation had to live on the
     * wrapper or every Today card would silently lose it.
     *
     * DS-14 constraint 8 reserves shadow for genuinely floating layers, and a
     * task row in a collection is not one: the COLLECTION is the card and the
     * row is a hairline-separated row inside it. So "the wrapper has a shadow"
     * is now asserting the pre-DS-14 design, and asserting it would hold the
     * restyle hostage to a treatment the direction removed on purpose.
     *
     * What the original test was really protecting is the thing that CAN still
     * break, and it broke once during DS-14: the tray is a real element parked
     * behind the card surface, so a row that stops painting an opaque
     * background reveals the tray at rest, on every row, at every width. That
     * is asserted here instead — it is the same class of silent visual defect,
     * and it is the one that is still possible.
     */
    await page.goto("/today");
    const wrapper = page.locator(".dh-card-swipe").first();
    await expect(wrapper).toBeVisible();

    const surface = wrapper.locator(".dh-card").first();
    const background = await surface.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // Opaque: neither `transparent` nor any zero-alpha colour.
    expect(background).not.toBe("transparent");
    expect(background).not.toMatch(/rgba\([^)]*,\s*0\s*\)$/);

    // At rest the surface is not translated, so the tray behind it is covered.
    const reveal = await surface.evaluate(
      (el) => getComputedStyle(el).transform,
    );
    expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(reveal);
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
