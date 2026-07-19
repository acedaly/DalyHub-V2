import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * DS-08 Shared Search — driven end to end against the development-auth server.
 *
 * Exercises the real Product Frame Search affordance (the sidebar `/` entry) wired
 * to the live `/search` endpoint and the registry-discovered Today provider, plus
 * the failure states via the `/design/search` fixture. Role-based and non-brittle.
 */

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

function searchTrigger(page: Page) {
  return page.getByRole("button", { name: "Search", exact: true }).first();
}

async function openSearch(page: Page) {
  // Wait for hydration so the trigger's handler is wired before we click it
  // (the shell is server-rendered; the click is inert until React attaches).
  await page.waitForLoadState("networkidle");
  await searchTrigger(page).click();
  const input = page.getByRole("combobox", { name: "Search everything" });
  await expect(input).toBeVisible();
  return input;
}

test.describe("DS-08 Shared Search — desktop", () => {
  test("opens from the sidebar, groups results and opens a record in the Drawer", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await expect(input).toBeFocused();

    await input.fill("Finish");
    const listbox = page.getByRole("listbox", { name: "Search results" });
    await expect(listbox).toBeVisible();
    // Grouped by entity type.
    await expect(listbox.getByText("Tasks")).toBeVisible();
    const options = listbox.getByRole("option");
    await expect(options.first()).toBeVisible();

    // Keyboard navigation selects the active option.
    await input.press("ArrowDown");
    await expect(
      listbox.locator('[role="option"][aria-selected="true"]'),
    ).toHaveCount(1);

    // Enter opens the active result in the real DS-03 Drawer over /today.
    await input.press("Enter");
    await expect(page).toHaveURL(/\/today\?.*drawer=/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Finish PX-02" }),
    ).toBeVisible();

    // Closing the Drawer preserves the underlying Today context.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();

    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("closes on Escape and restores focus to the Search trigger", async ({
    page,
  }) => {
    await page.goto("/today");
    await openSearch(page);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("combobox", { name: "Search everything" }),
    ).toHaveCount(0);
    await expect(searchTrigger(page)).toBeFocused();
  });

  test("shows a no-results state for a non-matching query", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await input.fill("zzzznope");
    await expect(
      page.getByRole("heading", { name: "No results" }),
    ).toBeVisible();
  });
});

test.describe("DS-08 Shared Search — mobile 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("opens from the mobile navigation without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await searchTrigger(page).click();
    const input = page.getByRole("combobox", { name: "Search everything" });
    await expect(input).toBeVisible();
    await input.fill("Finish");
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-08 Shared Search — dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("renders the surface in dark theme", async ({ page }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await input.fill("Finish");
    await expect(page.getByRole("listbox")).toBeVisible();
  });
});

test.describe("DS-08 Shared Search — reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("opens and closes without depending on animation", async ({ page }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await input.fill("Finish");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("combobox", { name: "Search everything" }),
    ).toHaveCount(0);
  });
});

test.describe("DS-08 Shared Search — failure states (design fixture)", () => {
  test("shows a calm partial-results note when a provider fails", async ({
    page,
  }) => {
    await page.goto("/design/search");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /partial failure/i }).click();
    const input = page.getByRole("combobox", { name: "Search everything" });
    await input.fill("Finish");
    await expect(page.getByText(/didn.t respond/i)).toBeVisible();
    await expect(page.getByRole("option").first()).toBeVisible();
  });

  test("shows a retryable error when every provider fails", async ({
    page,
  }) => {
    await page.goto("/design/search");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /complete failure/i }).click();
    const input = page.getByRole("combobox", { name: "Search everything" });
    await input.fill("Finish");
    await expect(
      page.getByRole("heading", { name: "Search is unavailable" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /try again/i }),
    ).toBeVisible();
  });

  test("opens a demo result in the real Drawer from the fixture", async ({
    page,
  }) => {
    await page.goto("/design/search");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /multi-provider/i }).click();
    const input = page.getByRole("combobox", { name: "Search everything" });
    await input.fill("Acme relaunch");
    await expect(page.getByRole("listbox")).toBeVisible();
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("DS-08 Shared Search — modal, scrim and deep links", () => {
  test("makes the background inert and closes when the scrim is clicked", async ({
    page,
  }) => {
    await page.goto("/today");
    await openSearch(page);
    // The modal root is the exclusion boundary: the content column (a sibling of
    // the Search modal) is inert while Search is open.
    await expect(page.locator(".dh-main-col")).toHaveAttribute("inert", "");
    // The scrim itself stays interactive and closes Search.
    await page.locator(".dh-search__scrim").click();
    await expect(
      page.getByRole("combobox", { name: "Search everything" }),
    ).toHaveCount(0);
    await expect(page.locator(".dh-main-col")).not.toHaveAttribute("inert", "");
  });

  test("keeps Tab focus contained within the Search dialog", async ({
    page,
  }) => {
    await page.goto("/today");
    await openSearch(page);
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      const contained = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]');
        return dialog?.contains(document.activeElement) ?? false;
      });
      expect(contained).toBe(true);
    }
  });

  test("a result is a real deep link that opens the Drawer on direct navigation", async ({
    page,
    context,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await input.fill("Finish");
    await expect(page.getByRole("listbox")).toBeVisible();
    const link = page.getByRole("option").first().getByRole("link");
    const href = await link.getAttribute("href");
    expect(href).toMatch(/\/today\?.*drawer=/);

    // The deep link works standalone — no dependence on Search modal state.
    const direct = await context.newPage();
    await direct.goto(href!);
    await expect(direct.getByRole("dialog")).toBeVisible();
    await direct.close();
  });

  test("modified-click opens the result in a new tab", async ({
    page,
    context,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await input.fill("Finish");
    await expect(page.getByRole("listbox")).toBeVisible();
    const link = page.getByRole("option").first().getByRole("link");
    const [newPage] = await Promise.all([
      context.waitForEvent("page"),
      link.click({ modifiers: ["ControlOrMeta"] }),
    ]);
    await newPage.waitForLoadState();
    await expect(newPage.getByRole("dialog")).toBeVisible();
    await newPage.close();
  });
});

test.describe("DS-08 Shared Search — coexists with an open Drawer", () => {
  test("opens over an already-open Drawer and restores it on close", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    // Open a record in the DS-03 Drawer first.
    await page.getByRole("link", { name: "Finish PX-02" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Open Search over the Drawer via `/` (focus is on a Drawer control, not a
    // text field). Search renders on top and is focused.
    await page.keyboard.press("/");
    const input = page.getByRole("combobox", { name: "Search everything" });
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    // Escape closes only Search; the Drawer remains open underneath.
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("DS-08 Shared Search — stale selection is not activatable", () => {
  test("Enter during a loading query does not open a stale result", async ({
    page,
  }) => {
    await page.goto("/design/search");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /stale-selection demo/i }).click();
    const input = page.getByRole("combobox", { name: "Search everything" });
    await input.fill("relaunch");
    await expect(page.getByRole("listbox")).toBeVisible();

    // Select a result with the keyboard.
    await input.press("ArrowDown");
    await expect(
      page.locator('[role="option"][aria-selected="true"]'),
    ).toHaveCount(1);

    // Type a query that never resolves (controlled delay) — the surface stays
    // loading with the prior results visible but inert.
    await input.fill("hold");
    await expect(input).not.toHaveAttribute("aria-activedescendant", /.+/);
    // No active option and no links while stale.
    await expect(
      page.locator('[role="option"][aria-selected="true"]'),
    ).toHaveCount(0);

    // Enter must NOT navigate or open a Drawer: Search stays open (its combobox
    // is still present) and no `drawer=` param appears. (Activating a result would
    // instead close Search and add the drawer key to the URL.)
    await input.press("Enter");
    await expect(page).toHaveURL(/\/design\/search$/);
    await expect(input).toBeVisible();
    expect(page.url()).not.toContain("drawer=");
  });
});
