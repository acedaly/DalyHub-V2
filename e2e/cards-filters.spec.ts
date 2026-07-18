import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * DS-04 + DS-07 — Shared Cards & Filters, driven end to end against the
 * development-auth server where the dev-only fixture (`/design/cards-filters`) is
 * mounted.
 *
 * Non-brittle: asserts roles, the URL contract, selection/quick-action/reorder
 * behaviour, drawer integration and layout invariants — never pixel snapshots.
 * Covered at desktop and a 320px mobile viewport.
 */

const FIXTURE = "/design/cards-filters";

async function gotoFixture(page: Page) {
  await page.goto(FIXTURE);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
}

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

/** Titles of the reorderable list, in DOM order. */
async function listTitles(page: Page) {
  const list = page.getByRole("list", { name: "Records (reorderable)" });
  return list.getByRole("heading").allInnerTexts();
}

async function addFilter(
  page: Page,
  field: string,
  value: { control: "select" | "text"; name?: string; value: string },
) {
  await page
    .getByRole("button", { name: /Add filter/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Add filter" });
  await dialog.getByRole("combobox", { name: "Field" }).selectOption(field);
  if (value.control === "select") {
    await dialog
      .getByRole("combobox", { name: value.name ?? "Value" })
      .selectOption(value.value);
  } else {
    await dialog.getByRole("textbox").fill(value.value);
  }
  await dialog.getByRole("button", { name: "Add filter" }).click();
}

test.describe("DS-04/DS-07 — desktop", () => {
  test("renders several entity types through one Card", async ({ page }) => {
    await gotoFixture(page);
    // The same Card renders Area, Goal, Project, Task and Person.
    for (const label of ["Area", "Goal", "Project", "Task", "Person"]) {
      await expect(
        page.getByRole("article").filter({ hasText: label }).first(),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("heading", { name: "Website relaunch" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("switches density, selects cards, and a quick action does not open a card", async ({
    page,
  }) => {
    await gotoFixture(page);

    // Density.
    await page.getByRole("radio", { name: "compact" }).check();
    await expect(page.getByRole("article").first()).toHaveAttribute(
      "data-density",
      "compact",
    );

    // Selection does not open a drawer.
    const runGoal = page.getByRole("checkbox", {
      name: "Select Run a half-marathon",
    });
    await runGoal.check();
    await expect(runGoal).toBeChecked();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("1 selected")).toBeVisible();

    // A quick action fires without opening the card.
    const projectCard = page.getByRole("article", { name: "Website relaunch" });
    await projectCard.getByRole("button", { name: "Complete" }).click();
    await expect(
      page.getByText(/Marked "Website relaunch" complete/),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // A disabled quick action cannot fire.
    await expect(
      projectCard.getByRole("button", { name: "Archive" }),
    ).toBeDisabled();
  });

  test("reorders by keyboard, emitting a live-region announcement", async ({
    page,
  }) => {
    await gotoFixture(page);
    const before = await listTitles(page);

    const handle = page.getByRole("button", {
      name: "Reorder Run a half-marathon",
    });
    await handle.focus();
    await page.keyboard.press("Enter");
    // The pick-up is announced in a visually-hidden live region (present in DOM).
    await expect(
      page.getByText(/Picked up Run a half-marathon/),
    ).toBeAttached();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    const after = await listTitles(page);
    expect(after).not.toEqual(before);
    // No card lost or duplicated.
    expect([...after].sort()).toEqual([...before].sort());
  });

  test("reorders by pointer drag", async ({ page }) => {
    await gotoFixture(page);
    const before = await listTitles(page);

    const source = page.getByRole("button", {
      name: "Reorder Run a half-marathon",
    });
    const target = page.getByRole("article", { name: "12-week training plan" });
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    expect(from && to).toBeTruthy();
    if (from && to) {
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width / 2, to.y + to.height, {
        steps: 8,
      });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height + 4, {
        steps: 4,
      });
      await page.mouse.up();
    }
    const after = await listTitles(page);
    expect([...after].sort()).toEqual([...before].sort());
  });

  test("adds filters, composes AND/OR, and reflects state in the URL", async ({
    page,
  }) => {
    await gotoFixture(page);

    await addFilter(page, "status", { control: "select", value: "done" });
    await expect(page).toHaveURL(/[?&]fv=1/);
    await expect(page).toHaveURL(/f=status/);
    await expect(page.getByText(/2 of 12 result/)).toBeVisible();

    await addFilter(page, "type", { control: "select", value: "task" });
    // AND: done AND task.
    await expect(page.getByText(/1 of 12 result/)).toBeVisible();

    // Switch to OR: done OR task (a larger set). The mode round-trips through the
    // URL, so click and let the result count settle rather than asserting the
    // controlled radio's transient state.
    await page.getByRole("radio", { name: "Any (OR)" }).click();
    await expect(page.getByText(/6 of 12 result/)).toBeVisible();
    await expect(page).toHaveURL(/fmode=or/);

    // Chips are readable.
    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips.getByText("Status")).toBeVisible();
    await expect(chips.getByText("Type")).toBeVisible();
  });

  test("filters survive refresh and Back/Forward", async ({ page }) => {
    await gotoFixture(page);
    await addFilter(page, "status", { control: "select", value: "done" });
    await addFilter(page, "type", { control: "select", value: "task" });
    await expect(page.getByText(/1 of 12 result/)).toBeVisible();

    // Refresh restores state.
    await page.reload();
    await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
    await expect(page.getByText(/1 of 12 result/)).toBeVisible();

    // Back removes the last filter; Forward restores it.
    await page.goBack();
    await expect(page.getByText(/2 of 12 result/)).toBeVisible();
    await page.goForward();
    await expect(page.getByText(/1 of 12 result/)).toBeVisible();
  });

  test("selects a saved view and shows the modified indicator", async ({
    page,
  }) => {
    await gotoFixture(page);
    await page.getByLabel("Saved view").selectOption("view-open-tasks");
    // The view applies its expression (tasks that are not done).
    await expect(
      page.getByRole("list", { name: "Active filters" }),
    ).toBeVisible();

    // Modifying the filters marks the view modified.
    await page
      .getByRole("button", { name: /Remove filter/ })
      .first()
      .click();
    await expect(page.getByText("Modified")).toBeVisible();
  });

  test("opens a filtered card in the DS-03 Drawer, preserving filters and scroll", async ({
    page,
  }) => {
    await gotoFixture(page);
    await addFilter(page, "type", { control: "select", value: "project" });
    await expect(page.getByText(/2 of 12 result/)).toBeVisible();

    // Scroll down so we can prove position is restored on close.
    await page.getByTestId("page-bottom").scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);

    // Open without letting Playwright auto-scroll the off-screen card into view,
    // so this measures the Drawer's own scroll handling, not the click's.
    await page
      .getByRole("article", { name: "Website relaunch" })
      .getByRole("link", { name: "Website relaunch" })
      .dispatchEvent("click");

    const dialog = page.getByRole("dialog", { name: "Website relaunch" });
    await expect(dialog).toBeVisible();
    // The drawer hosts the real DS-02 Record Layout (its own h3 record heading).
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Website relaunch" }),
    ).toBeVisible();
    // Filter params remain in the URL alongside the drawer param.
    await expect(page).toHaveURL(/f=type/);
    await expect(page).toHaveURL(/drawer=project%3Awebsite-relaunch/);

    // Close: filters remain, drawer gone, scroll restored.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/f=type/);
    await expect(page.getByText(/2 of 12 result/)).toBeVisible();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(4);
  });

  test("distinguishes filtered-empty from genuinely empty", async ({
    page,
  }) => {
    await gotoFixture(page);
    // Filtered-empty: a filter matching nothing offers a recovery.
    await addFilter(page, "title", { control: "text", value: "zzzz-nomatch" });
    await expect(page.getByText("No records match your filters")).toBeVisible();
    await page.getByRole("button", { name: "Clear all filters" }).click();
    await expect(page.getByText("No records match your filters")).toHaveCount(
      0,
    );

    // Genuinely empty is a different state (no clear-filters recovery).
    await page
      .getByRole("checkbox", { name: "Simulate empty collection" })
      .check();
    await expect(page.getByText("No records yet")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Clear all filters" }),
    ).toHaveCount(0);
  });

  test("renders in light and dark colour schemes without overflow", async ({
    page,
  }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await gotoFixture(page);
      await expect(
        page.getByRole("heading", { level: 1, name: "Cards & Filters" }),
      ).toBeVisible();
      await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    }
  });
});

test.describe("DS-04/DS-07 — mobile 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("has no horizontal overflow and keeps cards/controls reachable", async ({
    page,
  }) => {
    await gotoFixture(page);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    // Selection and quick actions remain reachable (not hover-only).
    const card = page.getByRole("article", { name: "Website relaunch" });
    await expect(card.getByRole("button", { name: "Complete" })).toBeVisible();
    await card.getByRole("checkbox").check();
    await expect(page.getByText("1 selected")).toBeVisible();

    // Add-filter and chips are reachable.
    await addFilter(page, "type", { control: "select", value: "task" });
    await expect(
      page.getByRole("list", { name: "Active filters" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    // Keyboard reorder alternative is present.
    await expect(
      page.getByRole("button", { name: "Reorder Fix navigation contrast" }),
    ).toBeAttached();
  });

  test("opens the Drawer as a sheet and keeps filters after close", async ({
    page,
  }) => {
    await gotoFixture(page);
    await addFilter(page, "type", { control: "select", value: "project" });

    await page
      .getByRole("article", { name: "Website relaunch" })
      .getByRole("link", { name: "Website relaunch" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Website relaunch" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/f=type/);
  });
});
