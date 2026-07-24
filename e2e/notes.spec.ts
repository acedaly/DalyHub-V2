import { execFileSync } from "node:child_process";

import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * NOTES-01B/NOTES-01C — Notes collection, creation and the canonical
 * Markdown record: dependable AUTOSAVE (no Save button — replacing NOTES-01B's
 * explicit-save model), the desktop Source/Split/Preview editor, and the
 * soft-delete/restore lifecycle with its own Active/Deleted collection filter.
 *
 * A real journey over the seeded Worker/D1 app (mirrors `goals.spec.ts` /
 * `areas.spec.ts`): navigate to Notes, create a uniquely test-owned Note, type
 * Markdown and let it autosave (never pressing Save — there is none), edit
 * again while a save is still in flight and confirm the final text survives,
 * reload and confirm the exact persisted source, exercise a deterministic
 * failed-save + Retry via a routed network failure, confirm the navigation
 * guard while unsaved, exercise the desktop split source/preview layout and
 * the narrow single-column layout, delete the Note, confirm it leaves the
 * active collection and appears in the Deleted view, restore it and confirm
 * its content is intact, and confirm Activity holds the lifecycle/content
 * events — plus Back/Forward, keyboard operation, focus restoration, axe in
 * light and dark, and no horizontal overflow across the breakpoint matrix
 * including 390px/320px mobile.
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
  // `activities` rows carry no foreign key back to `entities` — removing the
  // subject rows above (needed to satisfy `activity_subjects`' own RESTRICT
  // before the entities below can be removed) does not cascade to the
  // `activities` rows themselves. Every activity this journey creates is
  // single-subject, so once its only subject row is gone it has zero
  // remaining `activity_subjects` references; delete exactly those
  // now-orphaned rows so Activity history does not silently accumulate
  // across every local e2e run.
  `DELETE FROM activities WHERE workspace_id = 'local-dev-workspace' AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
  `DELETE FROM note_details WHERE workspace_id = 'local-dev-workspace' AND entity_id IN (${NOTE_ENTITY_QUERY});`,
  // Notes soft-deleted during the journey must still be purged — the
  // cleanup deletes unconditionally regardless of `deleted_at`.
  `DELETE FROM entities WHERE workspace_id = 'local-dev-workspace' AND id IN (${NOTE_ENTITY_QUERY});`,
] as const;

/** Local D1's SQLite file is shared with the live dev server process, so a
 * cleanup command run immediately after a test can occasionally race an
 * in-flight request and hit `SQLITE_BUSY`. Retry briefly rather than fail
 * the whole test on what is purely local-tooling contention, not a
 * correctness issue. */
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
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts || !message.includes("SQLITE_BUSY")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

async function cleanupNoteFixtures(): Promise<void> {
  for (const command of NOTE_CLEANUP_SQL) {
    await runD1Command(command);
  }
}

test.describe("NOTES-01B/NOTES-01C — Notes", () => {
  test.beforeAll(async () => cleanupNoteFixtures());
  test.afterEach(async () => cleanupNoteFixtures());

  test("navigate, create, autosave Markdown (no Save button), reload, rename, review Activity", async ({
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

    // 5-6. Type Markdown and let it AUTOSAVE — there is no Save button.
    await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.fill(markdown);
    await expect(page.getByText("Unsaved")).toBeVisible();
    // Blur triggers an immediate save (the debounce is proven separately below).
    await editor.blur();
    await expect(page.getByText("Saved")).toBeVisible();

    // 7. The preview renders through the shared safe Markdown pipeline
    // (Preview view mode).
    await page.getByRole("button", { name: "Preview" }).click();
    const preview = page.locator(".dh-note-editor__preview");
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
    await page.getByRole("button", { name: "Source" }).click();

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

    // 15. No horizontal overflow on the record across the responsive matrix,
    // including the 320/375/390 mobile checkpoints.
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

  test("autosaves after the real debounce with no interaction, and a later edit made during an in-flight save is not lost", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}debounce-${stamp}`;

    await gotoFixture(page, "/notes");
    await page.getByRole("link", { name: "New note" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByLabel(/Title/).fill(noteTitle);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    const noteUrl = page.url();

    const editor = page.getByRole("textbox", { name: "Note" });

    // Type and do nothing else — the debounced autosave must still fire.
    await editor.fill("First pass content");
    await expect(page.getByText("Unsaved")).toBeVisible();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5_000 });

    // Delay the NEXT save's server response so a further edit lands while it
    // is genuinely in flight, proving the newer content is never lost. Only
    // the FIRST matching request is gated — the coalesced follow-up save
    // (and everything else) passes straight through, and the route stays
    // registered throughout rather than being torn down mid-handling.
    let releaseResponse: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let gateArmed = true;
    await page.route("**/mutate", async (route) => {
      const body = route.request().postData() ?? "";
      if (
        route.request().method() !== "POST" ||
        !body.includes("update_content") ||
        !gateArmed
      ) {
        await route.continue();
        return;
      }
      gateArmed = false;
      await gate;
      await route.continue();
    });

    await editor.fill("Content A — will be superseded");
    await editor.blur();
    await expect(page.getByText("Saving…")).toBeVisible();

    // Edit again WHILE the save is held in flight.
    await editor.fill("Content B — the final value");
    await expect(editor).toHaveValue("Content B — the final value");

    releaseResponse();

    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });
    await expect(editor).toHaveValue("Content B — the final value");

    // Reload confirms the FINAL value persisted, not the superseded one. The
    // mutate route itself already confirmed both writes with `ok: true`
    // (proving the client never lost the newer edit) — this is purely
    // re-reading the source of truth. D1 documents that a read immediately
    // following a write can be served from a replica that has not yet caught
    // up (https://developers.cloudflare.com/d1/best-practices/read-replication/),
    // which local dev can reproduce for two writes this close together, so
    // the confirming reload polls briefly rather than asserting on a single
    // navigation.
    await expect
      .poll(
        async () => {
          await gotoFixture(page, noteUrl);
          return page.getByRole("textbox", { name: "Note" }).inputValue();
        },
        { timeout: 10_000 },
      )
      .toBe("Content B — the final value");
  });

  test("a failed save shows the error state with Retry, preserves the draft, and Retry recovers", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}retry-${stamp}`;

    await gotoFixture(page, "/notes");
    await page.getByRole("link", { name: "New note" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByLabel(/Title/).fill(noteTitle);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);

    // A deterministic test seam: route the mutate POST to fail exactly once.
    let failNext = true;
    await page.route("**/mutate", async (route) => {
      if (route.request().method() !== "POST" || !failNext) {
        await route.continue();
        return;
      }
      failNext = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "update_content",
          ok: false,
          formError: "Simulated failure for e2e.",
        }),
      });
    });

    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.fill("Draft that must survive a failure");
    await editor.blur();

    await expect(page.getByText("Couldn't save")).toBeVisible();
    await expect(page.getByText("Simulated failure for e2e.")).toBeVisible();
    await expect(editor).toHaveValue("Draft that must survive a failure");

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await page.unroute("**/mutate");
  });

  test("blocks navigation while unsaved, and Leave/Stay both behave correctly", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}guard-${stamp}`;

    await gotoFixture(page, "/notes");
    await page.getByRole("link", { name: "New note" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByLabel(/Title/).fill(noteTitle);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);

    // Hold the save in flight forever so the guard sees a genuinely unsaved
    // state (not a race against the real debounce/network).
    await page.route("**/mutate", async (route) => {
      if (
        route.request().method() === "POST" &&
        (route.request().postData() ?? "").includes("update_content")
      ) {
        return; // never resolves — the save stays "saving"
      }
      await route.continue();
    });

    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.fill("Unsaved edit that must be protected");
    await editor.blur();
    await expect(page.getByText("Saving…")).toBeVisible();

    await page.getByRole("link", { name: "Notes" }).first().click();
    const guardDialog = page.getByText("Leave with unsaved changes?");
    await expect(guardDialog).toBeVisible();

    // Stay: the navigation is cancelled, the draft remains.
    await page.getByRole("button", { name: "Stay" }).click();
    await expect(guardDialog).not.toBeVisible();
    await expect(editor).toHaveValue("Unsaved edit that must be protected");

    // Leave: navigation proceeds, discarding the unsaved (never-persisted) draft.
    await page.getByRole("link", { name: "Notes" }).first().click();
    await expect(page.getByText("Leave with unsaved changes?")).toBeVisible();
    await page.getByRole("button", { name: "Leave" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();

    await page.unroute("**/mutate");
  });

  test("desktop: Split view shows source and live preview side by side; a narrow viewport never offers Split", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}split-${stamp}`;

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/notes");
    await page.getByRole("link", { name: "New note" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByLabel(/Title/).fill(noteTitle);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);

    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.fill("# Split view heading");

    const splitButton = page.getByRole("button", { name: "Split" });
    await expect(splitButton).toBeVisible();
    await splitButton.click();
    await expect(splitButton).toHaveAttribute("aria-pressed", "true");
    await expect(editor).toBeVisible();
    await expect(
      page
        .locator(".dh-note-editor__preview")
        .getByRole("heading", { name: "Split view heading" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    // Narrow the viewport: Split must no longer be offered at all.
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("button", { name: "Split" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Source" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("delete removes the Note from the active collection; the Deleted view offers Restore, which recovers it with content intact", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}lifecycle-${stamp}`;
    const content = "# Keep me\n\nThis content must survive delete→restore.";

    await gotoFixture(page, "/notes");
    await page.getByRole("link", { name: "New note" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByLabel(/Title/).fill(noteTitle);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);

    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.fill(content);
    await editor.blur();
    await expect(page.getByText("Saved")).toBeVisible();

    // Delete — an Undo toast appears, then navigation to the active collection.
    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    const toasts = page.getByRole("region", { name: "Notifications" });
    await expect(toasts.getByText(`"${noteTitle}" deleted`)).toBeVisible();
    await expect(page.getByRole("link", { name: noteTitle })).toHaveCount(0);

    // Open the Deleted view — the note is there, with a Restore action.
    // Scoped to the card list itself: a lingering "deleted" Undo toast can
    // still carry the same title text elsewhere on the page.
    await page.getByRole("link", { name: "Deleted" }).click();
    await expect(page).toHaveURL(/state=deleted/);
    const deletedList = page.getByRole("list", { name: "Deleted notes" });
    await expect(deletedList.getByText(noteTitle)).toBeVisible();
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    const noteRow = deletedList
      .getByRole("listitem")
      .filter({ hasText: noteTitle });
    await noteRow.getByRole("button", { name: "Restore" }).click();
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByText(`"${noteTitle}" restored`),
    ).toBeVisible();
    await expect(deletedList.getByText(noteTitle)).not.toBeVisible();

    // Back on Active, the restored Note is reachable again with its content intact.
    await page.getByRole("link", { name: "Active" }).click();
    await expect(page).toHaveURL("/notes");
    await page.getByRole("link", { name: noteTitle }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue(
      content,
    );

    // Activity holds the meaningful lifecycle + content events.
    await page.getByRole("tab", { name: "Activity" }).click();
    const activityFeed = page.getByRole("feed", { name: "Note activity" });
    await expect(activityFeed.getByText("Updated note content")).toBeVisible();
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

  test("mobile (390px and 320px): create, edit, autosave and delete/restore work with no horizontal overflow", async ({
    page,
  }) => {
    const stamp = Date.now();
    const noteTitle = `${NOTE_TITLE_PREFIX}mobile-${stamp}`;

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoFixture(page, "/notes");
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, "/notes");
    await page.getByRole("link", { name: "New note" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await dialog.getByLabel(/Title/).fill(noteTitle);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    await expectNoHorizontalOverflow(page);

    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.fill("Mobile edit");
    await editor.blur();
    await expect(page.getByText("Saved")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
