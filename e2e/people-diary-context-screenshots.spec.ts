import { test, expect, type Page } from "@playwright/test";

import { gotoFixture, waitForInteractive } from "./helpers";
import { d1Execute } from "./d1";

/**
 * PEOPLE-04 / DIARY-02 — the visual evidence set.
 *
 * Deliberately small: four captures that show the two things reviewers actually
 * need to see — that the Person capture surface carries its context on a phone,
 * and that a Diary entry's relationships read as SUPPORTING context rather than
 * as the entry's headline (the DIARY-01A hierarchy rule). It is not a screenshot
 * library; the behavioural proof lives in `people-diary-context.spec.ts`.
 *
 * Skipped unless `CAPTURE_EVIDENCE=1`, so an ordinary suite run neither pays for
 * it nor rewrites committed images.
 */

const WS = "local-dev-workspace";
const PREFIX = "PDC shot ";
const OUT = "docs/product/assets/people-diary-context";

const OWNED = `
  SELECT id FROM entities
  WHERE workspace_id = '${WS}' AND title LIKE '${PREFIX}%'
`;

const CLEANUP_SQL = [
  `DELETE FROM entity_links WHERE workspace_id = '${WS}' AND (source_entity_id IN (${OWNED}) OR target_entity_id IN (${OWNED}));`,
  `DELETE FROM activity_subjects WHERE workspace_id = '${WS}' AND entity_id IN (${OWNED});`,
  `DELETE FROM activities WHERE workspace_id = '${WS}' AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
  `DELETE FROM diary_entry_details WHERE workspace_id = '${WS}' AND entity_id IN (${OWNED});`,
  `DELETE FROM person_details WHERE workspace_id = '${WS}' AND entity_id IN (${OWNED});`,
  `DELETE FROM entities WHERE workspace_id = '${WS}' AND id IN (${OWNED});`,
] as const;

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
function d1(command: string | readonly string[]): void {
  d1Execute(command);
}

function cleanup(): void {
  for (const command of CLEANUP_SQL) d1(command);
}

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

test.describe("PEOPLE-04 / DIARY-02 evidence", () => {
  test.skip(
    process.env.CAPTURE_EVIDENCE !== "1",
    "Evidence capture runs only with CAPTURE_EVIDENCE=1",
  );

  test.beforeAll(() => cleanup());
  test.afterAll(() => cleanup());

  test("captures the phone and desktop evidence set", async ({ page }) => {
    test.setTimeout(120_000);
    const name = `${PREFIX}Vaughn Smith`;
    const entryTitle = `${PREFIX}Coffee with Vaughn`;

    // 1. The Person capture surface on a phone, carrying its context chip.
    await page.setViewportSize({ width: 390, height: 844 });
    const personUrl = await createPerson(page, name);
    await page
      .getByRole("button", { name: new RegExp(`More actions for ${name}`) })
      .click();
    await page.getByRole("menuitem", { name: "New diary entry" }).click();
    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet.getByTestId("capture-context-chip")).toBeVisible();
    await page.screenshot({
      path: `${OUT}/phone-390-person-capture-context.png`,
    });

    await sheet.getByRole("textbox", { name: /^Entry/ }).fill(entryTitle);
    await sheet.getByRole("button", { name: "Save entry" }).click();
    await expect(sheet.getByText(/captured/i).first()).toBeVisible();
    await sheet.getByRole("button", { name: /^Done/ }).click();

    // 2. The entry's Related section on a phone — subordinate to the entry.
    await gotoFixture(page, "/diary?mode=timeline");
    await page.getByRole("button", { name: entryTitle, exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 4, name: "Related" }),
    ).toBeVisible();
    // Wait for the relationship itself, not merely the heading — a screenshot of
    // the loading state would be evidence of nothing.
    await expect(page.getByRole("link", { name })).toBeVisible();
    await page.screenshot({ path: `${OUT}/phone-390-diary-related.png` });

    // 3. The narrowest supported width, to show nothing overflows.
    await page.setViewportSize({ width: 320, height: 720 });
    await page.screenshot({ path: `${OUT}/phone-320-diary-related.png` });

    // 4. Desktop: the Person's Linked surface reading the same one link.
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFixture(page, `${new URL(personUrl).pathname}?tab=linked`);
    await expect(
      page.getByRole("link", { name: new RegExp(entryTitle) }),
    ).toBeVisible();
    await page.screenshot({ path: `${OUT}/desktop-1280-person-linked.png` });
  });
});
