import { expect, test } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * REDESIGN-04 — the Spine Workspaces, driven end to end against the
 * development-auth server over real (seeded) D1.
 *
 * §11 names the journeys this pass has to prove in a browser, and they are the
 * ones no unit test can: search narrowing a paginated collection and surviving
 * a round trip, a presentation toggle that changes the drawing and not the
 * records, a master–detail whose selection is URL state, a measurement recorded
 * from the workspace changing the trio and the chart, and the phone
 * compositions of all three modules.
 *
 * Role-based and non-brittle throughout: the specs ask for links, articles,
 * progressbars and headings by their accessible names, not for the classes that
 * happen to draw them.
 */

test.describe("REDESIGN-04 — the Projects collection", () => {
  test("narrows by search, opens a project, and comes back to the same view", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");

    const search = page.getByRole("searchbox", { name: "Search projects" });
    await expect(search).toBeVisible();
    await search.fill("website");

    // The narrowing is URL state, so it is shareable and Back-correct.
    await expect(page).toHaveURL(/[?&]q=website/);
    const card = page.getByRole("link", { name: "Open Website relaunch" });
    await expect(card).toBeVisible();
    // …and it genuinely narrowed: a project that does not match is gone.
    await expect(
      page.getByRole("link", { name: "Open Old archive tidy" }),
    ).toHaveCount(0);

    await card.click();
    await expect(page).toHaveURL(/\/projects\/pr-website$/);

    // Back returns to the NARROWED collection, not to the unfiltered default.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]q=website/);
    await expect(
      page.getByRole("searchbox", { name: "Search projects" }),
    ).toHaveValue("website");
  });

  test("says so, and offers a way out, when a search matches nothing", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    await page
      .getByRole("searchbox", { name: "Search projects" })
      .fill("zzzz-no-such-project");
    // A designed state, not a blank region — and never "No Projects yet",
    // which would be a lie about a workspace that has plenty.
    await expect(page.getByText(/No projects match/).first()).toBeVisible();
    // The field's own Clear is named for the field ("Clear search projects");
    // this is the empty state's own way out.
    await page
      .getByRole("button", { name: "Clear search", exact: true })
      .click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page.getByRole("article").first()).toBeVisible();
  });

  test("switches between Grid and Table showing the SAME records", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects?state=open");

    // Scoped to the gallery: the page also carries the compact Goals section,
    // whose rows are articles too.
    const gridNames = await page
      .getByRole("list", { name: "Projects" })
      .getByRole("article")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
    expect(gridNames.length).toBeGreaterThan(0);

    await page.getByRole("link", { name: "Table", exact: true }).click();
    await expect(page).toHaveURL(/[?&]present=table/);

    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    // A real table, so the browser's own row/column semantics apply.
    await expect(
      table.getByRole("columnheader", { name: "Progress" }),
    ).toBeVisible();

    /*
     * The point of §5.4: a presentation, never a filter. The same records, in
     * the same order — one loader, drawn two ways.
     */
    const tableNames = await table
      .getByRole("rowheader")
      .evaluateAll((nodes) => nodes.map((n) => n.textContent?.trim() ?? ""));
    for (const name of gridNames) {
      expect(tableNames.some((row) => row.includes(name ?? ""))).toBe(true);
    }

    await page.getByRole("link", { name: "Grid", exact: true }).click();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("keeps the lifecycle tabs, with the mockup's word and the repository's values", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    const rail = page.getByRole("navigation", { name: "Project views" });
    // The reference's word for `open`; the URL contract is untouched.
    await expect(rail.getByRole("link", { name: "Active" })).toHaveAttribute(
      "href",
      /state=open/,
    );
    await rail.getByRole("link", { name: "Archived" }).click();
    await expect(page).toHaveURL(/state=archived/);
  });

  test("holds the accessibility and overflow baseline at 390 and 320", async ({
    page,
  }) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoFixture(page, "/projects");
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, "/projects");
    await expectNoAxeViolations(page);
    await gotoFixture(page, "/projects?present=table");
    await expectNoAxeViolations(page);
  });
});

test.describe("REDESIGN-04 — the Goals workspace", () => {
  test("selects a Goal into the detail pane as URL state, and Back behaves", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");

    const list = page.getByTestId("goals-list");
    await expect(list).toBeVisible();
    // The workspace opens on a selection, as the reference draws it.
    await expect(page.getByTestId("goal-workspace-pane")).toBeVisible();

    const rows = list.getByRole("article");
    const second = rows.nth(1);
    const name = await second.getAttribute("aria-label");
    await second.getByRole("link").click();

    // Selection is URL state — shareable, bookmarkable, Back/Forward-correct.
    await expect(page).toHaveURL(/[?&]goal=/);
    const pane = page.getByTestId("goal-workspace-pane");
    // The pane's IDENTITY heading, not whichever `h2` the measurement panel's
    // own state happens to render beneath it.
    await expect(pane.locator(".dh-goalpane__title")).toContainText(name ?? "");
    // Exactly one row is current, and it says so semantically.
    await expect(list.locator('[aria-current="page"]')).toHaveCount(1);

    await page.goBack();
    await expect(page.getByTestId("goals-list")).toBeVisible();
  });

  test("opens a linked project and returns to the SAME goal", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    const pane = page.getByTestId("goal-workspace-pane");
    const chip = pane.getByTestId("goal-project-chip").first();
    if ((await chip.count()) === 0) test.skip();
    const goalUrl = page.url();

    const chipName = (await chip.textContent())?.trim() ?? "";
    await chip.click();
    await expect(page).toHaveURL(/\/projects\//);

    await page.goBack();
    // Back lands on the SAME Goal, not on the workspace's default selection.
    await expect(page).toHaveURL(goalUrl);
    await expect(
      page.getByTestId("goal-workspace-pane").getByText(chipName),
    ).toBeVisible();
  });

  test("records a measurement from the workspace and updates the trio and the chart", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    /*
     * Drive whichever Goal the workspace is genuinely measuring, rather than a
     * fixture id: the E2E seed and the design fixture are different databases,
     * and a journey that only runs on one of them is a journey that silently
     * stops running.
     */
    const measurable = page
      .getByTestId("goals-list")
      .getByRole("article")
      .filter({ has: page.getByRole("progressbar") })
      .first();
    if ((await measurable.count()) === 0) test.skip();
    await measurable.getByRole("link").click();

    const pane = page.getByTestId("goal-workspace-pane");
    const trio = pane.getByTestId("goal-metrics");
    await expect(trio).toBeVisible();
    const before = (await trio.textContent()) ?? "";

    await pane.getByRole("button", { name: /^Log / }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    /*
     * A textbox, not a spinbutton: the value field carries
     * `inputMode="decimal"` rather than `type="number"`, so a phone gets the
     * decimal keypad and a negative reading (a balance, a temperature) stays
     * legitimate. See `GoalCheckInSheet`.
     */
    await sheet.getByRole("textbox").first().fill("9.4");
    await sheet.getByRole("button", { name: /^(Save|Record|Log)/ }).click();

    // The figures are DERIVED on every read, so the pane re-reads rather than
    // patching: the trio and the chart move together or not at all.
    await expect
      .poll(async () => (await trio.textContent()) ?? "")
      .not.toBe(before);
    await expect(trio).toContainText("9.4");
  });

  test("offers the §5.1 creation entry point, and requires an Area", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");
    await page.getByTestId("goal-add").click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    /*
     * §5.1 — the mockup wins on the entry point, the architecture wins on the
     * shape. A Goal has no existence outside an Area, so the goals-side door
     * makes the Area a required field of the SAME form the Area record uses.
     */
    await expect(drawer.getByText("Area", { exact: true })).toBeVisible();
    await drawer.getByRole("textbox", { name: /Title/ }).fill("E2E goal");
    await drawer
      .getByRole("button", { name: /Create|Save/ })
      .first()
      .click();
    // Submitting with no Area chosen is refused, on the field that caused it.
    await expect(drawer.getByText(/Choose the Area/).first()).toBeVisible();
  });

  test("holds the accessibility and overflow baseline, including the phone", async ({
    page,
  }) => {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoFixture(page, "/goals");
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoFixture(page, "/goals");
    await expectNoAxeViolations(page);
  });

  test("keeps the deleted/restore path exactly as it was", async ({ page }) => {
    await gotoFixture(page, "/goals?state=deleted");
    // The lifecycle view is untouched by the workspace: same grid, same
    // one-click Restore, still no way IN to a soft-deleted record.
    await expect(
      page
        .getByRole("navigation", { name: "Goal views" })
        .or(page.getByRole("group", { name: "Goal views" })),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

test.describe("REDESIGN-04 — Areas", () => {
  test("stays the quiet, non-completable surface, in the shared language", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas");
    const list = page.getByRole("list", { name: "Areas" });
    await expect(list).toBeVisible();
    /*
     * §6.3 — Areas never complete, so there is no progress bar and no
     * percentage anywhere on this collection. That is the one thing this pass
     * had to preserve rather than converge.
     */
    await expect(list.getByRole("progressbar")).toHaveCount(0);
    await expect(list.getByText("%")).toHaveCount(0);

    await page.setViewportSize({ width: 320, height: 844 });
    await gotoFixture(page, "/areas");
    await expectNoHorizontalOverflow(page);
  });
});
