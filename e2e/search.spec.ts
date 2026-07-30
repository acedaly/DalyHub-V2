import { expect, test } from "@playwright/test";

import { expectNoAxeViolations, mobileNavigationOpener } from "./helpers";
import type { Locator, Page } from "@playwright/test";

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

function searchPanel(page: Page) {
  return page.locator(".dh-search__panel");
}

function optionFor(page: Page, title: string) {
  return page
    .getByRole("listbox")
    .getByRole("option")
    .filter({ hasText: title })
    .first();
}

async function expectSearchResult(
  page: Page,
  input: Locator,
  query: string,
  title: string,
) {
  await input.fill(query);
  await expect(optionFor(page, title)).toBeVisible();
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

    // Enter opens the active result in the real DS-03 Drawer. TASKS-01: the task is
    // now resolved by the real Tasks provider and opens on the canonical /tasks
    // surface (its canonicalPath), not /today.
    await input.press("Enter");
    await expect(page).toHaveURL(/\/tasks\?.*drawer=/);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { level: 3, name: "Finish PX-02" }),
    ).toBeVisible();

    // Closing the Drawer preserves the underlying Tasks context.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/tasks(\?.*)?$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
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

  test("finds real records across shipped modules with safe previews, task signals and Recent", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.evaluate(() => window.localStorage.clear());
    const input = await openSearch(page);

    const providerIds = await page.evaluate(async () => {
      const response = await fetch("/search?q=Global%20Search%20E2E");
      const payload = (await response.json()) as {
        providers: { providerId: string }[];
      };
      return payload.providers.map((provider) => provider.providerId);
    });
    expect(providerIds).toEqual([
      "areas.search",
      "goals.search",
      "projects.search",
      "tasks.search",
      "notes.search",
      "diary.search",
      "meetings.search",
      "people.search",
      "assets.search",
      "reviews.search",
    ]);
    expect(providerIds).not.toContain("today.search");

    await expectSearchResult(page, input, "DalyHub V2", "DalyHub V2");
    await expectSearchResult(page, input, "Launch the site", "Launch the site");
    await expectSearchResult(
      page,
      input,
      "Website relaunch",
      "Website relaunch",
    );
    await expectSearchResult(
      page,
      input,
      "Global Search E2E Task",
      "Global Search E2E Task",
    );
    const taskOption = optionFor(page, "Global Search E2E Task");
    await expect(taskOption).toContainText("P1");
    await expect(taskOption).toContainText(/Overdue|Due today/);

    await expectSearchResult(
      page,
      input,
      "Search Body Heading E2E",
      "Global Search E2E Note",
    );
    await expectSearchResult(
      page,
      input,
      "Global Search E2E Diary",
      "Global Search E2E Diary",
    );
    await expect(searchPanel(page)).not.toContainText(
      "PRIVATE-DIARY-BODY-SEARCH-E2E",
    );
    await expectSearchResult(
      page,
      input,
      "Global Search E2E Person",
      "Global Search E2E Person",
    );
    await expect(searchPanel(page)).not.toContainText(
      "private-search-person@example.test",
    );
    await expect(searchPanel(page)).not.toContainText("+61 400 111 222");
    await expect(searchPanel(page)).not.toContainText(
      "PRIVATE-PERSON-NOTES-SEARCH-E2E",
    );
    await expectSearchResult(
      page,
      input,
      "Global Search E2E Meeting",
      "Global Search E2E Meeting",
    );
    await expect(searchPanel(page)).not.toContainText(
      "PRIVATE-MEETING-AGENDA-SEARCH-E2E",
    );
    await expect(searchPanel(page)).not.toContainText(
      "PRIVATE-MEETING-NOTES-SEARCH-E2E",
    );
    await expectSearchResult(
      page,
      input,
      "Global Search E2E Asset",
      "Global Search E2E Asset",
    );
    await expect(searchPanel(page)).not.toContainText(
      "PRIVATE-ASSET-SERIAL-SEARCH-E2E",
    );
    await expect(searchPanel(page)).not.toContainText(
      "PRIVATE-ASSET-POLICY-SEARCH-E2E",
    );
    await expectSearchResult(
      page,
      input,
      "Global Search E2E Review",
      "Global Search E2E Review",
    );
    await expect(searchPanel(page)).not.toContainText(
      "PRIVATE-REVIEW-REFLECTION-SEARCH-E2E",
    );

    await expectNoAxeViolations(page, { include: ".dh-search__panel" });

    await input.fill("Website relaunch");
    await optionFor(page, "Website relaunch").getByRole("link").click();
    await expect(page).toHaveURL(/\/projects\/pr-website$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/today$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/projects\/pr-website$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/today$/);

    const secondInput = await openSearch(page);
    await secondInput.fill("Global Search E2E Task");
    await optionFor(page, "Global Search E2E Task").getByRole("link").click();
    await expect(page).toHaveURL(/\/tasks\?.*drawer=/);
    await expect(
      page.getByRole("dialog").getByRole("heading", {
        level: 3,
        name: "Global Search E2E Task",
      }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/tasks(\?.*)?$/);
    await openSearch(page);
    await expect(
      page.getByRole("listbox", { name: "Recent search results" }),
    ).toBeVisible();
    await expect(optionFor(page, "Global Search E2E Task")).toBeVisible();
    await expect(searchPanel(page)).not.toContainText("PRIVATE-DIARY-BODY");
    await page.getByRole("button", { name: "Clear" }).click();
    await expect(
      page.getByText("Search across everything in your workspace."),
    ).toBeVisible();
  });
});

test.describe("DS-08 Shared Search — real open surface axe (dark)", () => {
  test.use({ colorScheme: "dark" });

  test("has no violations with real Search results in dark theme", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await input.fill("Global Search E2E Task");
    await expect(optionFor(page, "Global Search E2E Task")).toBeVisible();
    await expectNoAxeViolations(page, { include: ".dh-search__panel" });
  });
});

test.describe("DS-08 Shared Search — mobile 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("opens from the mobile navigation without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    // MOBILE-01 moved the sheet's opener to the bottom bar's More, and put a
    // Search control in the phone top bar as well. Both are now in the DOM, so
    // the trigger is scoped to the SHEET — this test is about reaching Search
    // from the navigation, and the top bar's copy sits inert behind the modal.
    await mobileNavigationOpener(page).click();
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await sheet.getByRole("button", { name: "Search", exact: true }).click();
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
    // TASKS-01: the task result deep-links to the canonical /tasks surface.
    expect(href).toMatch(/\/tasks\?.*drawer=/);

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
