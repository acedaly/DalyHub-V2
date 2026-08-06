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

function summaryCards(page: Page) {
  return page.getByRole("list", { name: "Relationship" });
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
    await expect(
      summaryCards(page).getByText("Last interaction"),
    ).toBeVisible();
    await expect(summaryCards(page).getByText("None yet")).toBeVisible();
    await expect(
      stayInTouch(page).getByText("No shared history yet"),
    ).toBeVisible();
    await expect(summaryCards(page).getByText("Notes")).toHaveCount(0);

    // 2. Sharing a record with them changes the answer immediately — nothing is
    //    stored, so the next load simply tells the truth.
    await linkNote(page, noteTitle);
    await page.goto(personUrl);

    await expect(summaryCards(page).getByText("Notes")).toBeVisible();
    await expect(
      summaryCards(page).getByText("Total interactions"),
    ).toBeVisible();
    await expect(
      stayInTouch(page).getByText("Recently connected"),
    ).toBeVisible();
    // The state is TEXT, and its explanation is text too — never colour alone.
    await expect(
      stayInTouch(page).getByText(/You shared something/),
    ).toBeVisible();
    await expect(stayInTouch(page).getByText("How often")).toBeVisible();

    // 3. Cross-module navigation: a shared-record card opens the surface that lists
    //    and opens those records…
    await summaryCards(page)
      .getByRole("link", { name: /^Notes: 1$/ })
      .click();
    await expect(page).toHaveURL(/\?tab=linked/);
    await expect(
      page.getByRole("link", { name: new RegExp(noteTitle) }),
    ).toBeVisible();

    // …and an interaction card opens the ONE relationship timeline.
    await page.goto(personUrl);
    await summaryCards(page)
      .getByRole("link", { name: /^Last interaction:/ })
      .click();
    await expect(page).toHaveURL(/\?tab=activity/);
    const feed = page.getByRole("feed", { name: "Person timeline" });
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
    test.setTimeout(120_000);
    const name = `${TITLE_PREFIX}${Date.now()}`;
    await createPerson(page, name);

    // Both regions are real, named headings on the Summary tab.
    await expect(
      page.getByRole("heading", { name: "Relationship", level: 3 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Staying in touch", level: 3 }),
    ).toBeVisible();

    // Each navigable summary card is a single keyboard-reachable link that clears
    // the shared 44px target floor.
    const firstCard = summaryCards(page).getByRole("link").first();
    await firstCard.focus();
    await expect(firstCard).toBeFocused();
    await expectMinTouchTarget(firstCard);

    // Enter follows it, exactly like any other link in the product.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\?tab=(linked|activity)/);
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
    await expect(summaryCards(page)).toBeVisible();

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
      await expect(summaryCards(page)).toBeVisible();
    }

    // The collection carries the signal at phone width too.
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/people");
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
