import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * DIARY-01B — the Diary day-timeline workspace over the seeded Worker/D1 app.
 *
 * The redesigned journey: the workspace opens in Day mode anchored on today with a
 * coherent toolbar (mode tabs, a date navigator, a type filter, one New-entry
 * action) and NO always-open capture card; a sub-ten-second capture (launched on
 * demand) files an entry under the correct local day; a backdated capture is
 * surfaced honestly on the day it belongs to; the type filter is URL-backed and
 * clearable; an entry opens in the docked details panel with Back/Forward and focus
 * restoration; Timeline mode retains multi-day pagination; and the surface is
 * keyboard-operable, axe-clean and free of horizontal overflow at phone and desktop
 * widths with adequate touch targets.
 */

const WS = "local-dev-workspace";
const PREFIX = "Diary e2e ";

const ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = '${WS}'
    AND type = 'diary'
    AND title LIKE '${PREFIX}%'
`;
const CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = '${WS}' AND entity_id IN (${ENTITY_QUERY});`,
  `DELETE FROM activities WHERE workspace_id = '${WS}' AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
  `DELETE FROM diary_entry_details WHERE workspace_id = '${WS}' AND entity_id IN (${ENTITY_QUERY});`,
  `DELETE FROM entities WHERE workspace_id = '${WS}' AND id IN (${ENTITY_QUERY});`,
] as const;

function d1Execute(command: string): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "pipe",
    },
  );
}

function cleanup(): void {
  for (const command of CLEANUP_SQL) d1Execute(command);
}

/** Seed `count` diary entries on distinct, descending local days via D1. */
function seedEntries(count: number): void {
  const statements: string[] = [];
  const base = Date.UTC(2026, 5, 1); // 2026-06-01
  for (let index = 0; index < count; index += 1) {
    const occurred = new Date(base - index * 86_400_000).toISOString();
    const label = String(index).padStart(2, "0");
    const id = `diary-e2e-seed-${label}`;
    const title = `${PREFIX}seed ${label}`;
    statements.push(
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES ('${id}', '${WS}', 'diary', '${title}', '${occurred}', '${occurred}', NULL);`,
      `INSERT INTO diary_entry_details (workspace_id, entity_id, entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at) VALUES ('${WS}', '${id}', 'note', NULL, '${occurred}', 'Australia/Sydney', 'manual', NULL, '${occurred}');`,
    );
  }
  d1Execute(statements.join("\n"));
}

test.describe("DIARY-01B — Diary day-timeline workspace", () => {
  test.beforeAll(() => cleanup());
  test.afterEach(() => cleanup());

  test("day-mode capture, select, edit, review", async ({ page }) => {
    const stamp = Date.now();
    const first = `${PREFIX}${stamp} standup`;
    const second = `${PREFIX}${stamp} decision`;

    // 1. Open the Diary — Day mode, coherent toolbar, no always-open capture.
    await gotoFixture(page, "/diary");
    await expect(
      page.getByRole("heading", { level: 1, name: "Diary" }),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Diary view" })).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Selected day" }),
    ).toBeVisible();
    await expect(page.getByRole("form", { name: "Quick capture" })).toHaveCount(
      0,
    );
    await expect(page.getByText("Nothing recorded on this day")).toBeVisible();
    await expectNoAxeViolations(page);

    // 2. Launch capture from the New entry button and file the fast path.
    await page.getByRole("button", { name: "New entry" }).first().click();
    const capture = page.getByRole("form", { name: "Quick capture" });
    await expect(capture).toBeVisible();
    await capture.getByRole("button", { name: "Capture" }).click();
    await expect(
      capture.getByText("A title is required").first(),
    ).toBeVisible();
    await capture.getByRole("textbox", { name: /Title/ }).fill(first);
    await capture.getByRole("button", { name: "Capture" }).click();

    // 3. The entry appears under today's timeline; the panel closes.
    await expect(
      page.getByRole("heading", { level: 3, name: first }),
    ).toBeVisible();
    await expect(page.getByRole("form", { name: "Quick capture" })).toHaveCount(
      0,
    );

    // 4. A second capture with optional Markdown via the details disclosure.
    await page.getByRole("button", { name: "New entry" }).first().click();
    const capture2 = page.getByRole("form", { name: "Quick capture" });
    await capture2.getByRole("textbox", { name: /Title/ }).fill(second);
    await capture2.getByRole("button", { name: "Add details" }).click();
    await capture2
      .getByRole("textbox", { name: "Details" })
      .fill("A **bold** reason.");
    await capture2.getByRole("button", { name: "Capture" }).click();
    await expect(
      page.getByRole("heading", { level: 3, name: second }),
    ).toBeVisible();

    // 5. Select an entry — the docked details panel opens beside the timeline.
    const row = page.getByRole("button", { name: first, exact: true });
    await row.click();
    await expect(page).toHaveURL(/inspector=view/);
    await expect(
      page.getByRole("button", { name: "Edit entry" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // 6. Back closes the panel; Forward reopens it (route-backed).
    await page.goBack();
    await expect(page.getByRole("button", { name: "Edit entry" })).toHaveCount(
      0,
    );
    await page.goForward();
    await expect(
      page.getByRole("button", { name: "Edit entry" }),
    ).toBeVisible();

    // 7. Escape closes the panel and restores focus to the row that opened it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Edit entry" })).toHaveCount(
      0,
    );
    await expect(row).toBeFocused();

    // 8. Reopen, edit and save. Edit mode is URL-synced (the key is `edit:`), so a
    // refresh restores it and Back/Forward is honest; saving returns to `view:`.
    await row.click();
    await page.getByRole("button", { name: "Edit entry" }).click();
    await expect(page).toHaveURL(/inspector=edit/);

    // Back returns edit → read (not straight out of the Inspector); Forward reopens
    // edit. read→edit pushes a history entry, so the read step is not skipped.
    await page.goBack();
    await expect(page).toHaveURL(/inspector=view/);
    await expect(
      page.getByRole("button", { name: "Edit entry" }),
    ).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/inspector=edit/);

    const editor = page.getByRole("form", { name: "Edit entry" });
    const renamed = `${first} (edited)`;
    await editor.getByRole("textbox", { name: /Title/ }).fill(renamed);
    await editor.getByRole("textbox", { name: "Details" }).fill("Edited body.");
    await editor.getByRole("button", { name: "Save changes" }).click();
    // The rename is reflected in the timeline row (and the panel's read view).
    await expect(
      page
        .getByRole("list", { name: "Diary timeline" })
        .getByRole("heading", { level: 3, name: renamed }),
    ).toBeVisible();
    await expect(page).toHaveURL(/inspector=view/);

    // 9. Touch targets + no horizontal overflow across the matrix.
    await page.getByRole("button", { name: "New entry" }).first().click();
    await expectMinTouchTarget(
      page.getByRole("form", { name: "Quick capture" }).getByRole("button", {
        name: "Capture",
      }),
    );
    await page.keyboard.press("Escape");
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }

    // 10. Axe in dark mode too.
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/diary");
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("keyboard capture with the `c` shortcut and Ctrl/Cmd+Enter", async ({
    page,
  }) => {
    const stamp = Date.now();
    const title = `${PREFIX}${stamp} keyboard`;

    await gotoFixture(page, "/diary");
    await page.keyboard.press("c");
    const capture = page.getByRole("form", { name: "Quick capture" });
    await expect(capture).toBeVisible();
    const titleField = capture.getByRole("textbox", { name: /Title/ });
    await expect(titleField).toBeFocused();
    await page.keyboard.type(title);
    await page.keyboard.press("Control+Enter");

    await expect(
      page.getByRole("heading", { level: 3, name: title }),
    ).toBeVisible();
  });

  test("a backdated capture is surfaced on the day it belongs to", async ({
    page,
  }) => {
    const stamp = Date.now();
    const backdated = `${PREFIX}${stamp} memory`;

    await gotoFixture(page, "/diary");
    await page.getByRole("button", { name: "New entry" }).first().click();
    const capture = page.getByRole("form", { name: "Quick capture" });
    await capture.getByRole("textbox", { name: /Title/ }).fill(backdated);
    await capture.getByRole("button", { name: "Add details" }).click();
    await capture.getByLabel("When").fill("2020-01-15T09:00");
    await capture.getByRole("button", { name: "Capture" }).click();

    // It does NOT appear on today; an honest notice offers to view that day.
    await expect(
      page.getByRole("heading", { level: 3, name: backdated }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "View that day" }).click();

    await expect(page).toHaveURL(/date=2020-01-15/);
    // Regression: viewing the day must NOT reopen capture (stale inspector=new).
    await expect(page).not.toHaveURL(/inspector=/);
    await expect(page.getByRole("form", { name: "Quick capture" })).toHaveCount(
      0,
    );
    const row = page.getByRole("button", { name: backdated, exact: true });
    await expect(row).toBeVisible();
    // The destination timeline is interactive — the row opens its details.
    await row.click();
    await expect(page).toHaveURL(/inspector=view/);
    await expect(
      page.getByRole("button", { name: "Edit entry" }),
    ).toBeVisible();
  });

  test("the type filter is URL-backed and clearable", async ({ page }) => {
    await gotoFixture(page, "/diary?type=idea");
    await expect(page.getByText("No entries match this filter")).toBeVisible();
    const filter = page.getByRole("group", { name: "Filter by type" });
    await expect(filter.getByRole("link", { name: /Idea/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await page.getByRole("link", { name: "Clear filter" }).click();
    await expect(page).not.toHaveURL(/type=/);
  });

  test("Timeline mode retains multi-day pagination via Load more", async ({
    page,
  }) => {
    seedEntries(26);

    await gotoFixture(page, "/diary?mode=timeline");
    await expect(page.getByRole("link", { name: "Timeline" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // The oldest seeded entry is on the second page, hidden until Load more.
    await expect(
      page.getByRole("heading", { level: 3, name: `${PREFIX}seed 25` }),
    ).toHaveCount(0);

    const loadMore = page.getByRole("button", { name: "Load more entries" });
    await expect(loadMore).toBeVisible();
    await loadMore.click();

    await expect(
      page.getByRole("heading", { level: 3, name: `${PREFIX}seed 25` }),
    ).toBeVisible();
  });

  test("the day navigator moves between days", async ({ page }) => {
    seedEntries(3); // seed 00 lands on the Sydney-local day 2026-06-01

    await gotoFixture(page, "/diary?date=2026-06-01");
    await expect(
      page.getByRole("heading", { level: 3, name: `${PREFIX}seed 00` }),
    ).toBeVisible();

    // Previous day has no seeded entry.
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page).toHaveURL(/date=2026-05-31/);
    await expect(
      page.getByRole("heading", { level: 3, name: `${PREFIX}seed 00` }),
    ).toHaveCount(0);

    // Next day returns to the seeded day.
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/date=2026-06-01/);
    await expect(
      page.getByRole("heading", { level: 3, name: `${PREFIX}seed 00` }),
    ).toBeVisible();

    // Day changes push history: Back returns through each previously viewed day
    // (2026-06-01 → 2026-05-31 → 2026-06-01) rather than skipping out of Diary,
    // and Forward replays them.
    await page.goBack();
    await expect(page).toHaveURL(/date=2026-05-31/);
    await page.goBack();
    await expect(page).toHaveURL(/date=2026-06-01/);
    await expect(page).toHaveURL(/\/diary/);
    await page.goForward();
    await expect(page).toHaveURL(/date=2026-05-31/);
  });
});
