import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";
import { d1Execute } from "./d1";

/**
 * PEOPLE-04 / DIARY-02 — the contextual relationship journeys.
 *
 * These are the proofs the two items were held open for. Unit and route tests can
 * show that a relationship is written; only a driven journey can show that the
 * user can GET there — from a Person record, on a phone, through the overflow, to
 * a linked Diary entry and back — and that the same clicks work at desktop width.
 *
 * Four journeys, matching the acceptance criteria:
 *
 *   1. Person → Diary on a 390px phone, ending on the Person with the link visible.
 *   2. An EXISTING Diary entry gains, then loses, a Person relationship — with both
 *      records surviving the removal.
 *   3. The full-form hand-off: start in Quick Capture, leave for the module's
 *      fuller form, and prove the context survived the route change.
 *   4. The same conceptual flow at desktop width, so mobile and desktop are one
 *      contract rather than two implementations.
 *
 * All test-owned records carry a run-unique title prefix and are removed from the
 * shared local D1 afterwards, links included.
 */

const WS = "local-dev-workspace";
const PREFIX = "PDC e2e ";
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const OWNED_ENTITIES = `
  SELECT id FROM entities
  WHERE workspace_id = '${WS}' AND title LIKE '${PREFIX}%'
`;

const CLEANUP_SQL = [
  `DELETE FROM entity_links WHERE workspace_id = '${WS}' AND (source_entity_id IN (${OWNED_ENTITIES}) OR target_entity_id IN (${OWNED_ENTITIES}));`,
  `DELETE FROM activity_subjects WHERE workspace_id = '${WS}' AND entity_id IN (${OWNED_ENTITIES});`,
  `DELETE FROM activities WHERE workspace_id = '${WS}' AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
  `DELETE FROM diary_entry_details WHERE workspace_id = '${WS}' AND entity_id IN (${OWNED_ENTITIES});`,
  `DELETE FROM person_details WHERE workspace_id = '${WS}' AND entity_id IN (${OWNED_ENTITIES});`,
  `DELETE FROM note_details WHERE workspace_id = '${WS}' AND entity_id IN (${OWNED_ENTITIES});`,
  `DELETE FROM entities WHERE workspace_id = '${WS}' AND id IN (${OWNED_ENTITIES});`,
] as const;

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
function runD1Command(command: string | readonly string[]): void {
  d1Execute(command);
}

function cleanup(): void {
  for (const command of CLEANUP_SQL) runD1Command(command);
}

function uniqueName(kind: string): string {
  return `${PREFIX}${kind} ${Date.now().toString(36)}${Math.floor(
    Math.random() * 1000,
  )}`;
}

/** Create a Person through the real drawer quick-add and land on their record. */
async function createPerson(page: Page, name: string): Promise<string> {
  await gotoFixture(page, "/people");
  await page.getByRole("link", { name: "New person" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Person" });
  await dialog.getByRole("textbox", { name: /^Name/ }).fill(name);
  await dialog.getByRole("button", { name: "Create person" }).click();
  await expect(page).toHaveURL(/\/person\/[^/?#]+$/);
  await waitForInteractive(page);
  return page.url();
}

/** Open the Person record's shared overflow and choose a capture entry. */
async function openPersonCapture(page: Page, name: string, entry: string) {
  // The capture actions live in the SAME shared overflow slot every record uses
  // — the Person summary stays restrained (UIQ-011). This asserts that, too:
  // if a redesign moved them back into an eight-button row, this fails.
  await page
    .getByRole("button", { name: new RegExp(`More actions for ${name}`) })
    .click();
  await page.getByRole("menuitem", { name: entry }).click();
  const sheet = page.getByTestId("capture-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("PEOPLE-04 / DIARY-02 — contextual relationships", () => {
  test.beforeAll(() => cleanup());
  test.afterAll(() => cleanup());

  test("journey 1 — Person → Diary entry on a phone, and back", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const name = uniqueName("Person");
    const entryTitle = uniqueName("Coffee");
    const personUrl = await createPerson(page, name);

    // 1–3. Open the record overflow and choose New diary entry.
    const sheet = await openPersonCapture(page, name, "New diary entry");

    // 4. The context is VISIBLE — relationship creation is never a hidden side
    //    effect of pressing Create.
    const chip = sheet.getByTestId("capture-context-chip");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(name);
    await expectMinTouchTarget(
      sheet.getByRole("button", { name: `Remove capture context ${name}` }),
    );
    await expectNoHorizontalOverflow(page);

    // 5–6. Capture the entry.
    await sheet.getByRole("textbox", { name: /^Entry/ }).fill(entryTitle);
    await sheet.getByRole("button", { name: "Save entry" }).click();
    await expect(sheet.getByText(/captured/i).first()).toBeVisible();
    await sheet.getByRole("button", { name: /^Done/ }).click();

    // 7–8. Open the entry and confirm the Person is under Related.
    await gotoFixture(page, "/diary?mode=timeline");
    await page.getByRole("button", { name: entryTitle, exact: true }).click();
    const related = page.getByRole("heading", { level: 4, name: "Related" });
    await expect(related).toBeVisible();
    await expect(page.getByRole("link", { name })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 9–10. Return to the Person: the relationship is represented there too,
    //       through the record's own Linked surface — one canonical link, read
    //       from both ends.
    await gotoFixture(page, `${new URL(personUrl).pathname}?tab=linked`);
    await expect(
      page.getByRole("link", { name: new RegExp(entryTitle) }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("journey 2 — an existing Diary entry gains and loses a Person", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const name = uniqueName("Person");
    const entryTitle = uniqueName("Entry");
    await createPerson(page, name);

    // Write first, connect later — the DIARY-01A order this item must preserve.
    await gotoFixture(page, "/diary");
    await page.getByRole("button", { name: "New diary entry" }).first().click();
    const capture = page.locator(".dh-diary-capture");
    await expect(capture.getByLabel("Title")).toBeVisible({ timeout: 15_000 });
    await capture.getByLabel("Title").fill(entryTitle);
    // No context, no relationship field: capture stays a type, a title and save.
    await expect(page.getByTestId("capture-context-chip")).toHaveCount(0);
    await capture.getByRole("button", { name: "Capture", exact: true }).click();
    await expect(capture).toHaveCount(0, { timeout: 15_000 });

    await gotoFixture(page, "/diary?mode=timeline");
    await page.getByRole("button", { name: entryTitle, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 4, name: "Related" }),
    ).toBeVisible();

    // Add the relationship through the SHARED picker, not a Diary-only one.
    const picker = page.getByRole("combobox", { name: /Link a record/ });
    await picker.fill(name);
    await page
      .getByRole("option", { name: new RegExp(name) })
      .first()
      .click();
    await expect(page.getByRole("link", { name })).toBeVisible();

    // Remove it: the relationship goes, both records stay.
    await page
      .getByRole("button", { name: new RegExp(`Remove link to ${name}`) })
      .click();
    await expect(page.getByRole("link", { name })).toHaveCount(0);
    // The entry itself is untouched — unlinking removes a relationship, never a
    // record. Scoped to the detail panel, since the timeline row behind it also
    // carries the title.
    await expect(
      page.locator(".dh-diary-detail__title", { hasText: entryTitle }),
    ).toBeVisible();
    await gotoFixture(page, "/people");
    await page.getByPlaceholder(/Search name/).fill(name);
    await expect(
      page.getByRole("article", { name: new RegExp(name) }),
    ).toBeVisible();
  });

  test("journey 3 — the full-form hand-off keeps the Person context", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const name = uniqueName("Person");
    const noteTitle = uniqueName("Note");
    await createPerson(page, name);

    const sheet = await openPersonCapture(page, name, "New note");
    await expect(sheet.getByTestId("capture-context-chip")).toContainText(name);

    /*
     * Leave the quick sheet for the module's fuller creation surface.
     *
     * This is the assertion that found the HARDEN-02 capture defect: pressing the
     * hand-off blurred the panel's empty title field, DS-06 grew an error summary
     * and an inline error ABOVE the link, and the link moved out from under the
     * pointer before it lifted — so no `click` was ever produced and the app
     * simply stayed on the Person. Fixed in `useForm` (a blur error is a field's
     * own message, not a summary) and in `CaptureSheet` (the hand-off does not
     * take focus from the field behind it).
     */
    await sheet.getByTestId("capture-full-form").click();
    await expect(page).toHaveURL(/\/notes\?.*drawer=new-note/);
    await waitForInteractive(page);

    // The context survived the ROUTE change — this is the DEBT-45 gap.
    const handedOff = page.getByTestId("capture-context-chip");
    await expect(handedOff).toBeVisible();
    await expect(handedOff).toContainText(name);

    await page
      .getByRole("dialog")
      .getByRole("textbox", { name: /^Title/ })
      .fill(noteTitle);
    await page.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+/);
    await waitForInteractive(page);

    // And the relationship was actually made. The Links tab is reached by URL
    // rather than by clicking, because at phone width the record's tab strip
    // moves into the shared overflow — the destination is the assertion here,
    // not the tab affordance (which `people.spec.ts` already covers).
    const noteUrl = new URL(page.url()).pathname;
    await gotoFixture(page, `${noteUrl}?tab=linked`);
    await expect(page.getByRole("link", { name })).toBeVisible();
  });

  test("journey 4 — the same flow at desktop width, same contract", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    const name = uniqueName("Person");
    const entryTitle = uniqueName("Desktop");
    const personUrl = await createPerson(page, name);

    const sheet = await openPersonCapture(page, name, "New diary entry");
    // The SAME chip, from the SAME shared contract — not a desktop variant.
    await expect(sheet.getByTestId("capture-context-chip")).toContainText(name);
    await sheet.getByRole("textbox", { name: /^Entry/ }).fill(entryTitle);
    await sheet.getByRole("button", { name: "Save entry" }).click();
    await expect(sheet.getByText(/captured/i).first()).toBeVisible();
    await sheet.getByRole("button", { name: /^Done/ }).click();

    await gotoFixture(page, `${new URL(personUrl).pathname}?tab=linked`);
    await expect(
      page.getByRole("link", { name: new RegExp(entryTitle) }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("the Person capture surface is accessible and overflow-free at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    const name = uniqueName("Person");
    await createPerson(page, name);
    const sheet = await openPersonCapture(page, name, "New diary entry");
    await expect(sheet.getByTestId("capture-context-chip")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });

  test("the Diary relationship surface is accessible on a phone", async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    const entryTitle = uniqueName("A11y");
    await gotoFixture(page, "/diary");
    await page.getByRole("button", { name: "New diary entry" }).first().click();
    const capture = page.locator(".dh-diary-capture");
    await expect(capture.getByLabel("Title")).toBeVisible({ timeout: 15_000 });
    await capture.getByLabel("Title").fill(entryTitle);
    await capture.getByRole("button", { name: "Capture", exact: true }).click();
    await expect(capture).toHaveCount(0, { timeout: 15_000 });

    await gotoFixture(page, "/diary?mode=timeline");
    await page.getByRole("button", { name: entryTitle, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 4, name: "Related" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
