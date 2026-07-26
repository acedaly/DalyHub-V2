import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * PEOPLE-01 — the People foundation.
 *
 * A real journey over the seeded Worker/D1 app: navigate to People, create a
 * uniquely test-owned Person, edit their contact details, confirm the Timeline
 * records the history, archive → find in the Archived view → restore, search,
 * drive the command palette, and delete. Plus the cross-cutting guarantees:
 * axe (light), 44px touch targets, and no horizontal overflow from 320px up.
 *
 * All test-owned People carry the "People e2e " title prefix so `setup-local-db`
 * and this spec's own cleanup remove exactly their rows from the shared local D1.
 */

const TITLE_PREFIX = "People e2e ";
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
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === attempts || !message.includes("SQLITE_BUSY")) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
}

async function cleanup(): Promise<void> {
  for (const command of CLEANUP_SQL) {
    await runD1Command(command);
  }
}

async function createPerson(page: Page, name: string): Promise<string> {
  await gotoFixture(page, "/people");
  await page.getByRole("link", { name: "New person" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New person" });
  // DS-06 marks a required field's accessible name "<label> (required)".
  await dialog.getByRole("textbox", { name: /^Name/ }).fill(name);
  await dialog.getByRole("button", { name: "Create person" }).click();
  await expect(page).toHaveURL(/\/person\/[^/?#]+$/);
  return page.url();
}

test.describe("PEOPLE-01 — the People foundation", () => {
  test.beforeAll(async () => cleanup());
  test.afterEach(async () => cleanup());

  test("create, edit, timeline, archive, restore, delete", async ({ page }) => {
    const name = `${TITLE_PREFIX}${Date.now()}`;

    // 1. Navigate to the real People collection (not a placeholder).
    await gotoFixture(page, "/people");
    await expect(
      page.getByRole("heading", { level: 1, name: "People" }),
    ).toBeVisible();

    // 2. Create a person via the drawer quick-add.
    await createPerson(page, name);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    // 3. Edit contact details on the Contact tab.
    await page.getByRole("tab", { name: "Contact" }).click();
    await page.getByRole("textbox", { name: /^Role/ }).fill("Trusted friend");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Trusted friend").first()).toBeVisible();

    // 4. The Timeline records the person's history.
    await page.getByRole("tab", { name: "Timeline" }).click();
    await expect(
      page.getByRole("feed", { name: "Person timeline" }),
    ).toBeVisible();

    // 5. Archive from Settings, then find in the Archived view and restore.
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Archive person" }).click();
    await expect(page.getByText("Archived").first()).toBeVisible();

    await gotoFixture(page, "/people/archived");
    const archivedCard = page.getByRole("article", { name: new RegExp(name) });
    await expect(archivedCard).toBeVisible();
    await archivedCard.getByRole("button", { name: "Restore" }).click();
    await expect(archivedCard).not.toBeVisible();

    // 6. The active collection search finds them again.
    await gotoFixture(page, "/people");
    await page.getByPlaceholder(/Search name/).fill(name);
    await expect(
      page.getByRole("article", { name: new RegExp(name) }),
    ).toBeVisible();

    // 7. Delete from Settings.
    await page
      .getByRole("article", { name: new RegExp(name) })
      .getByRole("link")
      .first()
      .click();
    await expect(page).toHaveURL(/\/person\//);
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: /Delete person/ }).click();
    const confirm = page.getByRole("dialog");
    await confirm.getByRole("button", { name: "Delete person" }).click();
    await expect(page).toHaveURL(/\/people$/);
  });

  test("the command palette creates a person", async ({ page }) => {
    await gotoFixture(page, "/people");
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog");
    await palette.getByRole("combobox").fill("Create Person");
    await expect(
      palette.getByRole("option", { name: /Create Person/ }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/new\/person$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "New person" }),
    ).toBeVisible();
  });

  test("no WCAG violations, 44px touch targets and no overflow from 320px up", async ({
    page,
  }) => {
    const name = `${TITLE_PREFIX}${Date.now()}`;
    const url = await createPerson(page, name);

    // Touch targets on the record header actions.
    await expectMinTouchTarget(page.getByRole("tab", { name: "Summary" }));

    // No horizontal overflow across the responsive matrix, on both the
    // collection and the record.
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/people");
      await expectNoHorizontalOverflow(page);
      await page.goto(url);
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFixture(page, "/people");
    await expectNoAxeViolations(page);
  });
});
