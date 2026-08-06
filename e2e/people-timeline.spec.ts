import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import {
  cleanupAllNoteFixtures,
  cleanupNoteByTitle,
  uniqueNoteTitle,
} from "./notes-fixtures";

/**
 * PEOPLE-02 — the unified People relationship timeline.
 *
 * A real journey over the seeded Worker/D1 app: create a Person and a Note, link
 * the Note to the Person from the shared Linked tab, then confirm the Person's ONE
 * Timeline tab shows the LINKED RECORD's own history alongside the Person's —
 * filter it by relationship category, unlink and watch that history leave again.
 * Plus the cross-cutting guarantees: axe in light AND dark, keyboard operation,
 * 44px touch targets and no horizontal overflow from 320px up.
 */

const TITLE_PREFIX = "People timeline e2e ";
const WS = "local-dev-workspace";

const ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = '${WS}' AND type = 'person' AND title LIKE '${TITLE_PREFIX}%'
`;
const CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = '${WS}' AND entity_id IN (${ENTITY_QUERY});`,
  `DELETE FROM activities WHERE workspace_id = '${WS}' AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
  `DELETE FROM entity_links WHERE workspace_id = '${WS}' AND (source_entity_id IN (${ENTITY_QUERY}) OR target_entity_id IN (${ENTITY_QUERY}));`,
  `DELETE FROM person_details WHERE workspace_id = '${WS}' AND entity_id IN (${ENTITY_QUERY});`,
  `DELETE FROM entities WHERE workspace_id = '${WS}' AND id IN (${ENTITY_QUERY});`,
] as const;

async function runD1Command(command: string): Promise<void> {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
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
      return;
    } catch (error) {
      const err = error as {
        message?: string;
        stdout?: unknown;
        stderr?: unknown;
      };
      const output = [err.message, err.stdout, err.stderr]
        .map((part) => String(part ?? ""))
        .join("\n");
      if (
        attempt === attempts ||
        !(
          output.includes("SQLITE_BUSY") ||
          output.includes("FOREIGN KEY constraint failed")
        )
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

async function cleanupPeople(): Promise<void> {
  for (const command of CLEANUP_SQL) {
    await runD1Command(command);
  }
}

const ownedNoteTitles = new Set<string>();

async function createNote(page: Page, title: string): Promise<void> {
  ownedNoteTitles.add(title);
  // Fixture setup, not a UI assertion: the Notes header's duplicate "New Note"
  // button was removed by the shell cleanup, so this opens the SAME (untouched,
  // URL-backed) create drawer by its canonical URL.
  await gotoFixture(page, "/notes?drawer=new-note");
  const dialog = page.getByRole("dialog", { name: "New Note" });
  await expect(dialog).toBeVisible();
  await page.waitForLoadState("networkidle");
  await dialog.getByLabel(/Title/).fill(title);
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
}

async function createPerson(page: Page, name: string): Promise<string> {
  await gotoFixture(page, "/people");
  await page.getByRole("link", { name: "New Person" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Person" });
  await dialog.getByRole("textbox", { name: /^Name/ }).fill(name);
  await dialog.getByRole("button", { name: "Create person" }).click();
  await expect(page).toHaveURL(/\/person\/[^/?#]+$/);
  return page.url();
}

async function openTimeline(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Activity" }).click();
  await page.waitForLoadState("networkidle");
}

async function linkNote(page: Page, noteTitle: string): Promise<void> {
  await page.getByRole("tab", { name: "Linked" }).click();
  await page.waitForLoadState("networkidle");
  const search = page.getByPlaceholder("Search to link…");
  await expect(search).toBeVisible();
  await search.fill(noteTitle);
  const option = page.getByRole("option", { name: new RegExp(noteTitle) });
  await expect(option).toBeVisible();
  await option.click();
  await expect(
    page.getByRole("link", { name: new RegExp(noteTitle) }),
  ).toBeVisible();
}

test.describe("PEOPLE-02 — the unified relationship timeline", () => {
  test.beforeAll(async () => {
    await cleanupPeople();
    await cleanupAllNoteFixtures();
  });
  test.afterEach(async () => {
    await cleanupPeople();
    for (const title of ownedNoteTitles) {
      await cleanupNoteByTitle(title);
    }
    ownedNoteTitles.clear();
  });

  test("a linked record’s history joins the Person’s, is filterable, and leaves when unlinked", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    const noteTitle = uniqueNoteTitle("person-timeline");

    await createNote(page, noteTitle);
    const personUrl = await createPerson(page, name);

    // 1. Before linking, the Timeline carries only the Person's own record events.
    await openTimeline(page);
    const feed = page.getByRole("feed", { name: "Person timeline" });
    await expect(feed).toBeVisible();
    await expect(feed.getByText(new RegExp(noteTitle))).toHaveCount(0);

    // 2. Link the Note through the shared Universal Relationship System surface.
    await linkNote(page, noteTitle);

    // 3. The Note's OWN history is now part of the Person's relationship history,
    //    referenced by the canonical record (a navigable title, not a copy).
    await openTimeline(page);
    await expect(feed.getByText(new RegExp(noteTitle)).first()).toBeVisible();
    await expect(page.getByText(/linked/i).first()).toBeVisible();

    // 4. Filter to Connections: the note's own creation event drops out and the
    //    relationship event remains.
    await page
      .getByRole("button", { name: /Add filter/ })
      .first()
      .click();
    const editor = page.getByRole("dialog", { name: "Add filter" });
    await editor
      .getByRole("combobox", { name: "Field" })
      .selectOption("personTimelineCategory");
    await editor
      .getByRole("combobox", { name: "Value" })
      .selectOption("relationship");
    await editor.getByRole("button", { name: "Add filter" }).click();
    await expect(page).toHaveURL(/personTimelineCategory/);

    // The filter is URL-backed, so a reload restores it (DS-07 contract).
    await page.reload();
    await expect(page).toHaveURL(/personTimelineCategory/);

    // Clearing filters restores the whole history.
    await page
      .getByRole("button", { name: /clear all/i })
      .first()
      .click();
    await expect(page).not.toHaveURL(/personTimelineCategory/);

    // 5. Removing the relationship removes that record's history again.
    await page.getByRole("tab", { name: "Linked" }).click();
    await page
      .getByRole("button", { name: new RegExp(`Remove link to ${noteTitle}`) })
      .click();
    await expect(
      page.getByRole("link", { name: new RegExp(noteTitle) }),
    ).toHaveCount(0);

    await page.goto(personUrl);
    await openTimeline(page);
    await expect(
      feed.getByText(new RegExp(`${noteTitle}.*created`, "i")),
    ).toHaveCount(0);
  });

  test("is keyboard-operable and announces its state", async ({ page }) => {
    test.setTimeout(120_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    await createPerson(page, name);

    // The record tabs are reachable and operable from the keyboard alone.
    // Summary → Contact → Linked → Notes → Activity (PX-06 tab vocabulary:
    // Activity and Settings sit last, in that order, on every record).
    await page.getByRole("tab", { name: "Summary" }).focus();
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(page.getByRole("tab", { name: "Activity" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("feed", { name: "Person timeline" }),
    ).toBeVisible();

    // The filter bar's entry point is a real, focusable control, and opens and
    // closes from the keyboard alone (Escape dismisses only the editor).
    const addFilter = page.getByRole("button", { name: /Add filter/ }).first();
    await addFilter.focus();
    await expect(addFilter).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("dialog", { name: "Add filter" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Add filter" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("feed", { name: "Person timeline" }),
    ).toBeVisible();

    // The tab that reaches the timeline meets the shared 44px target floor.
    await expectMinTouchTarget(page.getByRole("tab", { name: "Activity" }));

    // The stream announces loaded events politely — exactly one live region,
    // scoped to the stream itself. Page-wide, this count is no longer 1: PWA-03
    // added a persistent shell-level `role="status"` for the connection state,
    // and scoping is the more precise assertion anyway, since what matters here
    // is that the TIMELINE announces once, not that the page contains one
    // region in total.
    await expect(
      page.locator('.dh-activity [role="status"][aria-live="polite"]'),
    ).toHaveCount(1);
  });

  test("no WCAG violations in light or dark, and no overflow from 320px up", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    const noteTitle = uniqueNoteTitle("person-timeline-a11y");

    await createNote(page, noteTitle);
    await createPerson(page, name);
    await linkNote(page, noteTitle);
    await openTimeline(page);

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectNoAxeViolations(page);
    }
    await page.emulateMedia({ colorScheme: "light" });

    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expectNoHorizontalOverflow(page);
    }
  });
});
