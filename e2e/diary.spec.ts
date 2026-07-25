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
 * DIARY-01 — the Diary Timeline & quick capture over the seeded Worker/D1 app.
 *
 * A real journey (mirrors `notes.spec.ts`): the placeholder is replaced by a
 * Timeline-first screen; a sub-ten-second capture files an entry under the
 * correct local day; a second capture carries optional Markdown; a backdated
 * capture lands under an earlier day with a "Backdated" marker; the type filter
 * is URL-backed and clearable; a bounded page reveals "Load more"; an entry is
 * edited through the route-backed Drawer with Back/Forward and focus
 * restoration; and the surface is keyboard-operable, axe-clean and free of
 * horizontal overflow at phone and desktop widths with adequate touch targets.
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

test.describe("DIARY-01 — Diary Timeline & capture", () => {
  test.beforeAll(() => cleanup());
  test.afterEach(() => cleanup());

  test("capture, group, backdate, filter, edit and review", async ({
    page,
  }) => {
    const stamp = Date.now();
    const first = `${PREFIX}${stamp} standup`;
    const second = `${PREFIX}${stamp} decision`;
    const backdated = `${PREFIX}${stamp} memory`;

    // 1. Open the Diary — the placeholder is gone, the Timeline heading is here.
    await gotoFixture(page, "/diary");
    await expect(
      page.getByRole("heading", { level: 1, name: "Diary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Coming Soon" }),
    ).not.toBeVisible();
    await expect(page.getByText("Your diary is empty")).toBeVisible();
    await expectNoAxeViolations(page);

    const capture = page.getByRole("form", { name: "Quick capture" });
    const titleField = capture.getByLabel("Title");

    // 2. Capture through the fast path (validation first).
    await capture.getByRole("button", { name: "Capture" }).click();
    await expect(
      capture.getByText("A title is required").first(),
    ).toBeVisible();

    await titleField.fill(first);
    await capture.getByRole("button", { name: "Capture" }).click();

    // 3. It appears under Today, in the correct local day group.
    const todayGroup = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { level: 2, name: "Today" }) });
    await expect(
      todayGroup.getByRole("heading", { level: 3, name: first }),
    ).toBeVisible();
    // The title field is cleared and refocused for the next capture.
    await expect(titleField).toHaveValue("");
    await expect(titleField).toBeFocused();

    // 4. Capture a second entry with optional Markdown via the details disclosure.
    await titleField.fill(second);
    await capture.getByRole("button", { name: "Add details" }).click();
    await capture
      .getByRole("textbox", { name: "Details" })
      .fill("A **bold** reason.");
    await capture.getByRole("button", { name: "Capture" }).click();
    await expect(
      todayGroup.getByRole("heading", { level: 3, name: second }),
    ).toBeVisible();
    // Let the post-capture remount settle before the next interaction.
    await expect(titleField).toHaveValue("");

    // 5. Backdate an entry and verify it lands under an earlier day, marked.
    await titleField.fill(backdated);
    await capture.getByRole("button", { name: "Add details" }).click();
    await capture.getByLabel("When").fill("2020-01-15T09:00");
    await capture.getByRole("button", { name: "Capture" }).click();

    const oldGroup = page.getByRole("listitem").filter({
      has: page.getByRole("heading", {
        level: 2,
        name: /15 January 2020$/,
      }),
    });
    await expect(
      oldGroup.getByRole("heading", { level: 3, name: backdated }),
    ).toBeVisible();
    await expect(oldGroup.getByText("Backdated")).toBeVisible();
    // Chronology: Today's group precedes the 2020 group.
    const headings = await page
      .getByRole("heading", { level: 2 })
      .allInnerTexts();
    expect(headings.indexOf("Today")).toBeLessThan(
      headings.findIndex((text) => text.includes("15 January 2020")),
    );

    // 6. Filtering is URL-backed and clearable. Enter a non-matching type
    // filter by URL (deterministic) — it shows the distinct filtered-empty
    // state — then clear it via the "All" chip (a URL-backed navigation).
    await expect(titleField).toHaveValue("");
    await gotoFixture(page, "/diary?type=idea");
    await expect(page.getByText("No entries match this filter")).toBeVisible();
    const filter = page.getByRole("group", { name: "Filter by type" });
    await expect(filter.getByRole("link", { name: "Idea" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await filter.getByRole("link", { name: "All" }).click();
    await page.waitForURL(/\/diary(\?|$)/);
    await expect(page).not.toHaveURL(/type=/);
    await expect(
      page.getByRole("heading", { level: 3, name: first }),
    ).toBeVisible();

    // 8-9. Edit an entry through the route-backed Drawer.
    const editButton = page.getByRole("button", { name: `Edit ${first}` });
    await editButton.click();
    const editor = page.getByRole("dialog", { name: "Edit entry" });
    await expect(editor).toBeVisible();
    await expect(page).toHaveURL(/drawer=edit/);
    const editTitle = editor.getByLabel("Title");
    await expect(editTitle).toHaveValue(first);
    await expectNoAxeViolations(page);

    // 10a. Back closes the Drawer; Forward reopens it (route-backed).
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(
      page.getByRole("dialog", { name: "Edit entry" }),
    ).toBeVisible();

    // 12. Escape closes and restores focus to the entry that opened it.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(editButton).toBeFocused();

    // Reopen and save an edit.
    await editButton.click();
    const renamed = `${first} (edited)`;
    await editor.getByLabel("Title").fill(renamed);
    await editor.getByRole("textbox", { name: "Details" }).fill("Edited body.");
    await editor.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 3, name: renamed }),
    ).toBeVisible();

    // 13. Touch targets + 14. no horizontal overflow across the matrix.
    await expectMinTouchTarget(
      capture.getByRole("button", { name: "Capture" }),
    );
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }

    // Axe in dark mode too.
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/diary");
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("keyboard-only capture with Ctrl/Cmd+Enter", async ({ page }) => {
    const stamp = Date.now();
    const title = `${PREFIX}${stamp} keyboard`;

    await gotoFixture(page, "/diary");
    const titleField = page
      .getByRole("form", { name: "Quick capture" })
      .getByLabel("Title");
    await titleField.focus();
    await expect(titleField).toBeFocused();
    await page.keyboard.type(title);
    await page.keyboard.press("Control+Enter");

    await expect(
      page.getByRole("heading", { level: 3, name: title }),
    ).toBeVisible();
  });

  test("bounded pagination reveals more entries via Load more", async ({
    page,
  }) => {
    seedEntries(26);

    await gotoFixture(page, "/diary");
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
});
