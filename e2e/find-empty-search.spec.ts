/**
 * FIND-01 — Search answers an empty query with recent records.
 *
 * Driven end to end against the development-auth server and the real `/search`
 * endpoint, so the whole path is exercised: the authenticated workspace scope,
 * the one bounded recency statement over the append-only Activity stream, the
 * outcome the browser decodes, and the row the surface draws.
 *
 * What this file proves that a unit test cannot:
 *
 *   - the empty query is openable — one keystroke and one Enter, per
 *     acceptance criterion 1;
 *   - the rows are the SAME component the query results render, asserted
 *     structurally by comparing the rendered class list of a recent row with a
 *     searched row rather than by two screenshots resembling each other
 *     (criterion 2);
 *   - a record excluded by the recorded privacy decision is absent from a
 *     workspace that CONTAINS one (criterion 4);
 *   - light and dark, 1440 / 393 / 320, keyboard reach, accessible name and a
 *     clean `axe` pass with no rule disabled (criterion 6).
 *
 * The calm empty state (criterion 3) is proven where it can be proven honestly —
 * `test/unit/search/recent-records.test.ts` builds the zero-record outcome and
 * `test/unit/search/SearchSurface.test.tsx` renders it — because the shared
 * seeded workspace this suite runs against always has history, and emptying it
 * would break every other spec in the gate.
 */

import { expect, test } from "@playwright/test";

import { d1Execute } from "./d1";
import { expectNoAxeViolations, mobileNavigationOpener } from "./helpers";

import type { Page } from "@playwright/test";

const WS = "local-dev-workspace";

function searchPanel(page: Page) {
  return page.locator(".dh-search__panel");
}

async function openSearch(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .locator(".dh-topbar")
    .getByRole("button", { name: /^Search DalyHub/ })
    .first()
    .click();
  const input = page.getByRole("combobox", { name: "Search everything" });
  await expect(input).toBeVisible();
  return input;
}

/** The recency listbox, named by the rule rather than by a vague "Recent". */
function recentListbox(page: Page) {
  return page.getByRole("listbox", { name: "Recently worked on" });
}

test.describe("FIND-01 — the empty query", () => {
  test("lists recent records, and one is openable with one keystroke and Enter", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await expect(input).toBeFocused();

    // Criterion 1 — something to open, before a single character is typed.
    const listbox = recentListbox(page);
    await expect(listbox).toBeVisible();
    const options = listbox.getByRole("option");
    await expect(options.first()).toBeVisible();
    const count = await options.count();
    expect(count).toBeGreaterThan(0);
    // Criterion 5's product bound, observed on the real surface.
    expect(count).toBeLessThanOrEqual(8);

    // The standing privacy line, in the owner's own words (ADR-112 §5).
    await expect(
      searchPanel(page).getByText(/Diary entries are never listed here/i),
    ).toBeVisible();

    // ONE keystroke selects, Enter opens. No mouse anywhere in this journey.
    await input.press("ArrowDown");
    await expect(
      listbox.locator('[role="option"][aria-selected="true"]'),
    ).toHaveCount(1);
    await input.press("Enter");

    // It went somewhere real: the surface closed and the location changed.
    await expect(searchPanel(page)).toBeHidden();
    await expect(page).not.toHaveURL(/\/today$/);
  });

  test("renders recent rows with the SAME component the query results use", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);

    await expect(recentListbox(page).getByRole("option").first()).toBeVisible();
    const recentRowClass = await page
      .getByRole("option")
      .first()
      .getAttribute("class");

    // Now a real query, through the providers.
    await input.fill("Finish");
    await expect(
      page.getByRole("listbox", { name: "Search results" }),
    ).toBeVisible();
    const searchedRowClass = await page
      .getByRole("option")
      .first()
      .getAttribute("class");

    /*
     * Criterion 2, structurally. Both rows are `SearchOption`; if a future
     * change gave the recency list a row of its own — a card, a compact
     * variant, a fourth Task anatomy — this class list would diverge.
     */
    expect(recentRowClass).toBe(searchedRowClass);
    expect(recentRowClass).toContain("dh-search__option");
  });

  test("does not list a Diary entry, in a workspace that has one", async ({
    page,
  }) => {
    const stamp = Date.now();
    const entryId = `find01-diary-${stamp}`;
    const title = `FIND01 PRIVATE DIARY TITLE ${stamp}`;
    const now = new Date().toISOString();
    const activityId = `find01-activity-${stamp}`;

    /*
     * Seeded as the NEWEST activity in the workspace, deliberately: if Diary
     * were listable this entry would be the first row, so the assertion below
     * cannot pass by the entry simply falling off the end of the list.
     */
    d1Execute(
      [
        `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES ('${entryId}', '${WS}', 'diary', '${title}', '${now}', '${now}', NULL);`,
        // The detail row too, so the Diary PROVIDER can find it when asked —
        // the second half of this test is that nothing is hidden.
        `INSERT OR IGNORE INTO diary_entry_details (workspace_id, entity_id, entity_type, entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at) VALUES ('${WS}', '${entryId}', 'diary', 'reflection', NULL, '${now}', 'Australia/Sydney', 'manual', NULL, '${now}');`,
        `INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json) VALUES ('${activityId}', '${WS}', 'entity.created', 'user', 'find01', '${now}', '{}');`,
        `INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role) VALUES ('${WS}', '${activityId}', '${entryId}', 'primary');`,
      ].join("\n"),
    );

    try {
      await page.goto("/today");
      const input = await openSearch(page);
      await expect(recentListbox(page)).toBeVisible();

      // Criterion 4 — absent from the unbidden list...
      await expect(searchPanel(page)).not.toContainText(title);

      // ...but still findable the moment the owner asks for it. Nothing is
      // hidden; one surface simply declines to volunteer it.
      await input.fill(title);
      await expect(
        page.getByRole("option").filter({ hasText: title }).first(),
      ).toBeVisible();
    } finally {
      d1Execute(
        [
          `DELETE FROM activity_subjects WHERE workspace_id = '${WS}' AND activity_id = '${activityId}';`,
          `DELETE FROM diary_entry_details WHERE workspace_id = '${WS}' AND entity_id = '${entryId}';`,
          `DELETE FROM activities WHERE workspace_id = '${WS}' AND id = '${activityId}';`,
          `DELETE FROM entities WHERE workspace_id = '${WS}' AND id = '${entryId}';`,
        ].join("\n"),
      );
    }
  });

  test("clearing a query returns to the recency list rather than a dead end", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await expect(recentListbox(page)).toBeVisible();

    await input.fill("Finish");
    await expect(
      page.getByRole("listbox", { name: "Search results" }),
    ).toBeVisible();

    await input.fill("");
    await expect(recentListbox(page)).toBeVisible();
    await expect(page.getByRole("option").first()).toBeVisible();
  });

  test("passes axe and fits every phone width, with no rule disabled", async ({
    page,
  }) => {
    await page.goto("/today");
    await openSearch(page);
    await expect(recentListbox(page).getByRole("option").first()).toBeVisible();

    await expectNoAxeViolations(page, { include: ".dh-search__panel" });

    for (const width of [1440, 393, 320]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(recentListbox(page)).toBeVisible();
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth <= doc.clientWidth + 1;
      });
      expect(overflow, `no horizontal overflow at ${width}px`).toBe(true);
    }
  });
});

test.describe("FIND-01 — the empty query in dark appearance", () => {
  test.use({ colorScheme: "dark" });

  test("lists recent records and passes axe in dark", async ({ page }) => {
    await page.goto("/today");
    await openSearch(page);
    await expect(recentListbox(page).getByRole("option").first()).toBeVisible();
    await expectNoAxeViolations(page, { include: ".dh-search__panel" });
  });
});

test.describe("FIND-01 — the empty query on a phone", () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test("opens from the phone navigation and lists recent records", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");

    // The phone entry point is its own control on its own surface: the bottom
    // bar's "More" opens the navigation sheet, which carries Search.
    await mobileNavigationOpener(page).click();
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await sheet.getByRole("button", { name: "Search", exact: true }).click();

    await expect(recentListbox(page)).toBeVisible();
    const first = recentListbox(page).getByRole("option").first();
    await expect(first).toBeVisible();

    // Reachable and operable by touch, and still axe-clean at this width.
    await expectNoAxeViolations(page, { include: ".dh-search__panel" });
  });
});
