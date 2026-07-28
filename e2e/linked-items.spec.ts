import { expect, test, type Page } from "@playwright/test";

import {
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
 * REL-01 — the Universal Relationship System's shared Linked Items section.
 *
 * A real journey over the seeded Worker/D1 app: create two Notes, open one
 * record's Linked tab, search-to-link the other, confirm it appears as a
 * navigable linked item, follow it, then remove it. Proves the shared section,
 * the `/links` endpoint, optimistic add/remove and the search-to-add picker
 * end-to-end — with axe (light + dark) and no horizontal overflow.
 */

const ownedNoteTitles = new Set<string>();

async function createNote(page: Page, title: string): Promise<string> {
  ownedNoteTitles.add(title);
  await gotoFixture(page, "/notes");
  await page.getByRole("link", { name: "New Note" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Note" });
  await expect(dialog).toBeVisible();
  await page.waitForLoadState("networkidle");
  await dialog.getByLabel(/Title/).fill(title);
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
  return page.url();
}

async function openLinkedTab(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Linked" }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("REL-01 — shared Linked Items", () => {
  test.beforeAll(async () => cleanupAllNoteFixtures());
  test.afterEach(async () => {
    for (const title of ownedNoteTitles) {
      await cleanupNoteByTitle(title);
    }
    ownedNoteTitles.clear();
  });

  test("link a record from the Linked tab, navigate to it, then remove it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const anchorTitle = uniqueNoteTitle("anchor");
    const targetTitle = uniqueNoteTitle("target");

    // Create the target first, then the anchor (and land on the anchor record).
    await createNote(page, targetTitle);
    const anchorUrl = await createNote(page, anchorTitle);

    await openLinkedTab(page);

    // Empty state before any link.
    await expect(page.getByText(/Nothing linked yet/)).toBeVisible();

    // Search-to-link the target via the shared picker.
    const search = page.getByPlaceholder("Search to link…");
    await expect(search).toBeVisible();
    await search.fill(targetTitle);
    const option = page.getByRole("option", { name: new RegExp(targetTitle) });
    await expect(option).toBeVisible();
    await option.click();

    // The linked target appears as a navigable link (optimistic, then reconciled).
    const linkedLink = page.getByRole("link", {
      name: new RegExp(targetTitle),
    });
    await expect(linkedLink).toBeVisible();
    await expectNoAxeViolations(page);

    // Following the link opens the target record.
    await linkedLink.click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    await expect(
      page.getByRole("heading", { name: new RegExp(targetTitle) }),
    ).toBeVisible();

    // Back to the anchor's Linked tab and remove the link.
    await page.goto(anchorUrl);
    await openLinkedTab(page);
    const remove = page.getByRole("button", {
      name: new RegExp(`Remove link to ${targetTitle}`),
    });
    await expect(remove).toBeVisible();
    await remove.click();

    // The link is gone (optimistic) and an Undo toast confirms the removal.
    await expect(
      page.getByRole("link", { name: new RegExp(targetTitle) }),
    ).toHaveCount(0);
    // The Undo toast confirms the removal (scope to the notifications region so
    // the polite live-region copy doesn't double-match).
    await expect(
      page.getByLabel("Notifications").getByText(/Removed link to/),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("[[wiki links]] resolve to the linked record", async ({ page }) => {
    test.setTimeout(120_000);
    const targetTitle = uniqueNoteTitle("wiki-target");
    const authorTitle = uniqueNoteTitle("wiki-author");
    await createNote(page, targetTitle);
    await createNote(page, authorTitle);

    // Write a [[wiki link]] to the target in the author note's live editor.
    await expect(page.locator('[data-editor-ready="true"]')).toBeVisible({
      timeout: 90_000,
    });
    await page.locator(".cm-content").click();
    await page.keyboard.type(`See [[${targetTitle}]]`);
    await page
      .locator(".cm-content")
      .evaluate((el) => (el as HTMLElement).blur());
    await page.waitForLoadState("networkidle");

    // In Read mode the wiki link renders as an internal resolver link.
    await page.getByRole("button", { name: /Read/ }).click();
    const wikiLink = page.getByRole("link", { name: targetTitle });
    await expect(wikiLink).toHaveAttribute("href", /\/notes\/resolve\?title=/);
  });
});
