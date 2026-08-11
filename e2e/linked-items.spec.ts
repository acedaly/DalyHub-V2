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
  return page.url();
}

/**
 * NOTES-02 split the Note record's relationship tabs by DIRECTION: "Backlinks"
 * (what points at this note) and "Links" (what this note points at). The shared
 * REL-01 Linked Items section — the surface this spec exercises — lives in its
 * own labelled section inside the "Links" tab.
 */
async function openLinkedTab(page: Page): Promise<void> {
  // `exact` matters: "Backlinks" also contains "Links".
  const tab = page.getByRole("tab", { name: "Links", exact: true });
  await tab.click();
  // Assert the tab actually took, rather than assuming the click landed.
  // Server-rendered markup is present and visible well before React attaches its
  // handlers, so a click dispatched in that window is silently dropped: the tab
  // is there, the click "succeeds", and the record stays on "Note". That is how
  // this spec failed — not on the linking it tests, but on a tab that never
  // opened — and `toHaveAttribute` turns it back into a wait.
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await page.waitForLoadState("networkidle");
}

/**
 * The shared Linked Items section itself.
 *
 * Every assertion about what IS or IS NOT linked has to be scoped to it, because
 * a Note record legitimately names the same note in three places: this section,
 * the NOTES-02 outgoing-links list beside it, and UIX-04's Notes rail, which
 * lists every note in the workspace. An unscoped `getByRole("link", …)` was
 * asking the rail whether a relationship existed, which it cannot answer — and
 * that is exactly how both of this file's failures read (DEBT-125).
 */
function linkedItems(page: Page) {
  return page.locator(".dh-linked-items");
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
    // Scoped to the Linked Items section for two reasons, both of which are the
    // page legitimately showing this note elsewhere: the NOTES-02 outgoing-links
    // list in the same tab shows the SAME relationship read from the other side,
    // and UIX-04's Notes rail lists every note in the workspace — including this
    // one — as a navigable link of its own.
    const linkedLink = linkedItems(page)
      .getByRole("link", { name: new RegExp(targetTitle) })
      .first();
    await expect(linkedLink).toBeVisible();
    await expectNoAxeViolations(page);

    // Following the link opens the target record.
    await linkedLink.click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    await expect(
      page.getByRole("heading", { name: new RegExp(targetTitle) }),
    ).toBeVisible();

    // Back to the anchor's Linked tab and remove the link.
    // `gotoFixture`, not a bare `goto`: the next thing this journey does is click
    // a tab, and a click dispatched before hydration is dropped silently.
    await gotoFixture(page, anchorUrl);
    await openLinkedTab(page);
    const remove = page.getByRole("button", {
      name: new RegExp(`Remove link to ${targetTitle}`),
    });
    await expect(remove).toBeVisible();
    await remove.click();

    // The link is gone from the Linked Items section (optimistic) and an Undo
    // toast confirms the removal.
    //
    // Scoped for the same reason as above, and this one is why the test was red:
    // unscoped, it asserted that NO link on the page names this note — which the
    // Notes rail contradicts by design, because removing a RELATIONSHIP does not
    // remove the note. The assertion was measuring the rail, not the removal.
    await expect(
      linkedItems(page).getByRole("link", { name: new RegExp(targetTitle) }),
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
    //
    // Scoped to the rendered PROSE, not the page: UIX-04's Notes rail lists every
    // note as a link, so an unscoped `getByRole("link", { name: targetTitle })`
    // resolves to the rail's entry for the target as well as to the wiki link —
    // a strict-mode violation that says nothing about wiki links. The subject
    // here is what the Markdown pipeline emitted, and `.markdown-content` is the
    // one place it reaches the DOM.
    await page.getByRole("button", { name: /Read/ }).click();
    const wikiLink = page
      .locator(".markdown-content")
      .getByRole("link", { name: targetTitle });
    await expect(wikiLink).toHaveAttribute("href", /\/notes\/resolve\?title=/);
  });
});
