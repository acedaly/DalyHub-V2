import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * NOTES-01B — Notes collection, creation and canonical Markdown record.
 *
 * A real journey over the seeded Worker/D1 app (mirrors `goals.spec.ts` /
 * `areas.spec.ts`): navigate to Notes, confirm the PX-03 placeholder has been
 * replaced, create a uniquely test-owned Note, open its canonical record,
 * write Markdown (headings/list/link/formatting), Save it, confirm the
 * sanitised preview renders, reload and confirm the exact saved source
 * remains, rename it, confirm `note.content_updated` in Activity, exercise
 * Back/Forward through the route-backed rename Drawer, and prove keyboard
 * operation, focus restoration, axe cleanliness and no horizontal overflow on
 * phone and desktop.
 */

const NOTE_TITLE_PREFIX = "Notes e2e note ";

const NOTE_ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = 'local-dev-workspace'
    AND type = 'note'
    AND title LIKE '${NOTE_TITLE_PREFIX}%'
`;
const NOTE_CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${NOTE_ENTITY_QUERY});`,
  `DELETE FROM note_details WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${NOTE_ENTITY_QUERY});`,
  `DELETE FROM entities WHERE workspace_id = 'local-dev-workspace' AND id IN (${NOTE_ENTITY_QUERY});`,
] as const;

function cleanupNoteFixtures() {
  for (const command of NOTE_CLEANUP_SQL) {
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
}

test.describe("NOTES-01B — Notes", () => {
  test.beforeAll(() => cleanupNoteFixtures());
  test.afterEach(() => cleanupNoteFixtures());

  test("navigate, create, edit Markdown, preview, rename and review Activity", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}${stamp}`;
    const renamedTitle = `${noteTitle} (renamed)`;
    const markdown =
      "# Project kickoff\n\n" +
      "## Agenda\n\n" +
      "- Review scope\n" +
      "- Assign owners\n" +
      "- [DalyHub](https://example.com/dalyhub)\n\n" +
      "**Bold** and _italic_ text.";

    // 1. Navigate to Notes.
    await gotoFixture(page, "/notes");

    // 2. The PX-03 "Coming Soon" placeholder has been replaced with the real
    // collection.
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
    await expectNoAxeViolations(page);

    // 3. Create a Note with a unique, test-owned title.
    await page.getByRole("link", { name: "New note" }).first().click();
    const newNoteDialog = page.getByRole("dialog", { name: "New note" });
    await expect(newNoteDialog).toBeVisible();
    await expectNoAxeViolations(page);

    await newNoteDialog.getByRole("button", { name: "Create note" }).click();
    await expect(
      newNoteDialog.getByText("A title is required").first(),
    ).toBeVisible();

    await newNoteDialog.getByLabel(/Title/).fill(noteTitle);
    await newNoteDialog.getByRole("button", { name: "Create note" }).click();

    // 4. Lands on the canonical /notes/:noteId record.
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    const noteUrl = page.url();
    await expect(page.getByRole("heading", { name: noteTitle })).toBeVisible();
    const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(breadcrumb.getByText("Notes")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // 5-6. Enter Markdown (headings, list, link, formatting) and Save.
    const editor = page.getByRole("textbox", { name: "Note" });
    const saveButton = page.getByRole("button", { name: "Save" });
    await expect(saveButton).toBeDisabled();
    await editor.fill(markdown);
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText("Saved")).toBeVisible();
    await expect(saveButton).toBeDisabled();

    // 7. The preview renders through the shared safe Markdown pipeline.
    await page.getByRole("button", { name: "Show preview" }).click();
    const preview = page.locator(".dh-markdown-field__preview");
    await expect(
      preview.getByRole("heading", { level: 1, name: "Project kickoff" }),
    ).toBeVisible();
    await expect(
      preview.getByRole("heading", { level: 2, name: "Agenda" }),
    ).toBeVisible();
    await expect(preview.getByRole("listitem").first()).toBeVisible();
    const previewLink = preview.getByRole("link", { name: "DalyHub" });
    await expect(previewLink).toHaveAttribute(
      "href",
      "https://example.com/dalyhub",
    );
    await expect(preview.locator("strong")).toHaveText("Bold");
    await expect(preview.locator("em")).toHaveText("italic");
    // No script/HTML injection — the pipeline sanitises, never executes.
    await expect(preview.locator("script")).toHaveCount(0);
    await expectNoAxeViolations(page);

    // 8. Reload and confirm the EXACT saved source remains.
    await gotoFixture(page, noteUrl);
    await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue(
      markdown,
    );

    // 9. Rename the Note through the generic entity lifecycle contract.
    const renameButton = page.getByRole("button", { name: "Rename" });
    await renameButton.focus();
    await renameButton.click();
    const renameDialog = page.getByRole("dialog", { name: "Rename note" });
    await expect(renameDialog).toBeVisible();
    await expectNoAxeViolations(page);

    // 11a. Back closes the route-backed rename Drawer; Forward reopens it.
    await expect(page).toHaveURL(/drawer=rename/);
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();

    // 12-13. Keyboard operation + focus restoration: Escape closes the
    // Drawer and returns focus to the trigger.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(renameButton).toBeFocused();

    await renameButton.click();
    await renameDialog.getByLabel(/Title/).fill(renamedTitle);
    await renameDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: renamedTitle }),
    ).toBeVisible();

    // 10. note.content_updated (and the rename) appear in Activity.
    await page.getByRole("tab", { name: "Activity" }).click();
    const activityFeed = page.getByRole("feed", { name: "Note activity" });
    await expect(activityFeed.getByText("Updated note content")).toBeVisible();
    await expectNoAxeViolations(page);

    // 15. No horizontal overflow on the record across the responsive matrix.
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }

    // 14. Axe on the collection in dark mode too (light already scanned above).
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/notes");
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("keyboard-only: reach Notes, open New note, and submit with the keyboard", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}kbd-${stamp}`;

    await gotoFixture(page, "/notes");
    const newNoteLink = page.getByRole("link", { name: "New note" }).first();
    await newNoteLink.focus();
    await expect(newNoteLink).toBeFocused();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "New note" });
    await expect(dialog).toBeVisible();

    const titleField = dialog.getByLabel(/Title/);
    await titleField.focus();
    await page.keyboard.type(noteTitle);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: noteTitle })).toBeVisible();
  });
});
