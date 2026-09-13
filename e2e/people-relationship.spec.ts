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
import { d1Execute } from "./d1";

/**
 * PEOPLE-03 — relationship intelligence on the Person record.
 *
 * A real journey over the seeded Worker/D1 app. It proves the promise of the
 * feature end to end: opening a Person answers "when did I last interact with
 * them", "what have we shared" and "how often do we interact" — and every one of
 * those aggregates leads somewhere, from the summary card to the timeline to the
 * originating record in its own module.
 *
 * Plus the cross-cutting guarantees the roadmap requires: axe in light AND dark,
 * keyboard operation, 44px touch targets and no horizontal overflow from 320px up.
 */

const TITLE_PREFIX = "People relationship e2e ";
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

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
async function runD1Command(
  command: string | readonly string[],
): Promise<void> {
  d1Execute(command);
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
  await page.getByRole("link", { name: "New person" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Person" });
  await dialog.getByRole("textbox", { name: /^Name/ }).fill(name);
  await dialog.getByRole("button", { name: "Create person" }).click();
  await expect(page).toHaveURL(/\/person\/[^/?#]+$/);
  return page.url();
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

/*
 * UNTITLED-13 — the DS-13 counting-tile grid is gone from this record.
 *
 * The Summary opened on up to NINE tiles of figures, two of which ("Total
 * interactions", "First interaction") were measuring the relationship rather
 * than describing it — and a count of a friendship is a CRM metric, which
 * People is explicitly not. The same questions are answered by two bands now:
 * "What you share" (one navigable row per kind of linked record) and "Staying
 * in touch" (the rhythm, its reasons, and the cadence facts behind them, with
 * the evidence counts as the band's own supporting line). Every assertion below
 * asks the same question of whichever band now answers it.
 */
function sharedRecords(page: Page) {
  return page.getByRole("list", { name: "What you share" });
}

function stayInTouch(page: Page) {
  return page.getByRole("region", { name: "Staying in touch" });
}

test.describe("PEOPLE-03 — relationship intelligence", () => {
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

  test("a Person answers who / when / what / how often, and every aggregate leads somewhere", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    const noteTitle = uniqueNoteTitle("person-relationship");

    await createNote(page, noteTitle);
    const personUrl = await createPerson(page, name);

    // 1. A brand-new Person reads as an invitation, never as a scoreboard of zeros.
    //    With nothing shared there is no "What you share" band at all — an empty
    //    band telling the owner what they have not filled in is the scoreboard
    //    in another shape.
    await expect(sharedRecords(page)).toHaveCount(0);
    /*
     * The derived STATE is on the record's header context line, not inside the
     * panel: RECORD-01 removed the panel's own pill because the header already
     * carried the same `StayInTouchIndicator` on every tab, and one fact stated
     * twice in one view is what that convergence removed. The panel keeps the
     * half the chip cannot do — WHY — so both halves are asserted, each where
     * the product actually puts it.
     */
    await expect(page.getByText("No shared history yet").first()).toBeVisible();
    await expect(
      stayInTouch(page).getByText("Not enough history yet"),
    ).toBeVisible();
    await expect(page.getByText("recorded moment")).toHaveCount(0);

    // 2. Sharing a record with them changes the answer immediately — nothing is
    //    stored, so the next load simply tells the truth.
    await linkNote(page, noteTitle);
    await page.goto(personUrl);

    await expect(sharedRecords(page).getByText("Notes")).toBeVisible();
    /*
     * The count that survives, and the one that does not.
     *
     * "Total interactions" was a tile — a bare figure at the top of the record,
     * which is a score. The same number is evidence when it sits under the
     * heading it explains, so it is the rhythm band's supporting line: "1
     * recorded moment". Nothing is recomputed; both came from the kernel's
     * evaluator then and now.
     */
    await expect(page.getByText(/\b1 recorded moment\b/)).toBeVisible();
    // The STATE is on the record's header context line, for the same RECORD-01
    // reason as in step 1: the panel states WHY, and only why.
    await expect(
      page
        .getByRole("list", { name: "Record context" })
        .getByText("Recently connected"),
    ).toBeVisible();
    // The state is TEXT, and its explanation is text too — never colour alone.
    await expect(
      stayInTouch(page).getByText(/You shared something/),
    ).toBeVisible();
    await expect(stayInTouch(page).getByText("How often")).toBeVisible();

    // 3. Cross-module navigation: a shared-record card opens the surface that lists
    //    and opens those records…
    await sharedRecords(page)
      .getByRole("link", { name: /^Notes: 1$/ })
      .click();
    await expect(page).toHaveURL(/\?tab=linked/);
    // Scoped to the panel that opened. The Summary tab now carries a bounded
    // activity stream of its own, whose entity links name the same Note, so an
    // unscoped query matched the outgoing panel as well as the incoming one.
    await expect(
      page
        .getByRole("tabpanel", { name: "Linked" })
        .getByRole("link", { name: new RegExp(noteTitle) })
        .first(),
    ).toBeVisible();

    // …and the bounded recent-activity band opens the ONE relationship timeline.
    // It used to be a counting tile linking to the same place; it is the real
    // stream now, read short, over the same `/person/:id/activity` endpoint.
    await page.goto(personUrl);
    await page.getByRole("link", { name: "All activity" }).click();
    await expect(page).toHaveURL(/\?tab=activity/);
    const feed = page.getByRole("group", { name: "Person timeline" });
    await expect(feed).toBeVisible();

    // 4. And every timeline item opens its ORIGINATING record, in its own module.
    const noteLink = feed
      .getByRole("link", { name: new RegExp(noteTitle) })
      .first();
    await expect(noteLink).toBeVisible();
    await noteLink.click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
  });

  test("the collection shows the same derived signal, from one batched read", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    await createPerson(page, name);

    await gotoFixture(page, "/people");
    const card = page.getByRole("article", { name: new RegExp(name) });
    await expect(card).toBeVisible();
    // The SAME vocabulary as the record — one shared indicator, not two dialects.
    await expect(card.getByText("No shared history yet")).toBeVisible();
    // The pill is not interactive: a card still has exactly one tab stop.
    await expect(card.getByRole("link")).toHaveCount(1);
  });

  test("is keyboard-operable, with real headings and large touch targets", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    const noteTitle = uniqueNoteTitle("person-relationship-keys");

    await createNote(page, noteTitle);
    const personUrl = await createPerson(page, name);
    await linkNote(page, noteTitle);
    await page.goto(personUrl);

    /*
     * Each band is a real heading on the Summary tab, at LEVEL 2.
     *
     * They were `h3`s under a `h2` the tab no longer draws — a band is now a
     * direct child of the record's `h1`, so `h3` would be a skipped level (axe
     * `heading-order`). The guarantee the test is making is unchanged: the
     * regions this record is built from are named headings, not styled divs.
     */
    for (const band of [
      "Staying in touch",
      "What you share",
      "Recent activity",
    ]) {
      await expect(
        page.getByRole("heading", { name: band, level: 2 }),
      ).toBeVisible();
    }

    // Each navigable shared-record row is a single keyboard-reachable link that
    // clears the shared 44px target floor.
    const firstRow = sharedRecords(page).getByRole("link").first();
    await firstRow.focus();
    await expect(firstRow).toBeFocused();
    await expectMinTouchTarget(firstRow);

    // Enter follows it, exactly like any other link in the product.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?tab=linked/);
  });

  test("no WCAG violations in light or dark, and no overflow from 320px up", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    const noteTitle = uniqueNoteTitle("person-relationship-a11y");

    await createNote(page, noteTitle);
    const personUrl = await createPerson(page, name);
    await linkNote(page, noteTitle);
    await page.goto(personUrl);
    await expect(sharedRecords(page)).toBeVisible();

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
      // The summary cards reflow rather than scrolling sideways at every width.
      await expect(sharedRecords(page)).toBeVisible();
    }

    // The collection carries the signal at phone width too.
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/people");
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
