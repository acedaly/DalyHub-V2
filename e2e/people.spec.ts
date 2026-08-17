import { expect, test, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import { d1Execute } from "./d1";

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

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
async function runD1Command(
  command: string | readonly string[],
): Promise<void> {
  d1Execute(command);
}

async function cleanup(): Promise<void> {
  for (const command of CLEANUP_SQL) {
    await runD1Command(command);
  }
}

async function createPerson(page: Page, name: string): Promise<string> {
  await gotoFixture(page, "/people");
  await page.getByRole("link", { name: "New person" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Person" });
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

    // 4. The Activity tab records the person's history (PX-06 renamed it from
    // "Timeline" so the shared tab vocabulary holds on every record).
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Person timeline" }),
    ).toBeVisible();

    // 5. Archive from Settings, then find in the Archived view and restore.
    await page.getByRole("tab", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Archive person" }).click();
    await expect(page.getByText("Archived").first()).toBeVisible();

    await gotoFixture(page, "/people/archived");
    const archivedRow = page.getByRole("article", { name: new RegExp(name) });
    await expect(archivedRow).toBeVisible();
    // UIX-05 — a Person is a ROW now, and its actions are in the shared overflow
    // menu (the same place a Project card and a Goal card put theirs) rather than
    // in a hover-revealed quick-action rail. Same command, same words.
    await archivedRow
      .getByRole("button", { name: new RegExp(`Actions for ${name}`) })
      .click();
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await expect(archivedRow).not.toBeVisible();

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
      page.getByRole("heading", { level: 1, name: "New Person" }),
    ).toBeVisible();
  });

  /*
   * DS-11 coverage, split into units that fit the per-test budget.
   *
   * This was ONE test doing a record creation, a touch-target check, EIGHTEEN
   * navigations (nine viewports x collection + record) and an axe scan inside a
   * single 30-second budget. It fitted on a fast runner and did not fit on a
   * slower one, which made it a reliable-looking test that was one bad machine
   * away from failing — reproduced deterministically during the V2 release
   * closure, where it timed out in `page.goto` with nothing else running.
   *
   * The coverage below is IDENTICAL: the same viewports, the same overflow
   * assertion on both surfaces, the same touch target, the same axe scan. Only
   * the packaging changed, and it changed the way `responsive.spec.ts` already
   * packages this matrix — one test per viewport. That is the same remedy the
   * CI shard split uses, applied a level down: the budget only ever has to cover
   * the worst UNIT, so make the unit smaller rather than the budget bigger.
   *
   * It also distributes: Playwright shards by test COUNT, so one 30-second test
   * is indivisible across runners while nine small ones are not.
   */

  /*
   * CONVERGE-01 §7 — the row leads with connection, and its actions are real.
   *
   * The seeded directory carries both shapes on purpose: People with contact
   * details recorded and People with none. UIQ-011's rule ("a control that can
   * never do anything is not a control") means the FULL row offers real
   * `mailto:`/`tel:` controls and the SPARSE one offers no control at all —
   * which only a browser over the real projection can prove, because the
   * difference is produced server-side by `personReach`.
   */
  test("row actions are present where the data is and absent where it is not", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/people");

    const rows = page.locator(".dh-prow");
    await expect(rows.first()).toBeVisible();

    const reachHrefs = await rows.evaluateAll((nodes) =>
      nodes.map((node) =>
        [...node.querySelectorAll(".dh-prow__reach-link")].map((link) =>
          link.getAttribute("href"),
        ),
      ),
    );
    const full = reachHrefs.filter((hrefs) => hrefs.length > 0);
    const sparse = reachHrefs.filter((hrefs) => hrefs.length === 0);
    expect(full.length).toBeGreaterThan(0);
    expect(sparse.length).toBeGreaterThan(0);
    // Every control that exists genuinely does something.
    for (const hrefs of full) {
      for (const href of hrefs) {
        expect(href).toMatch(/^(mailto:|tel:)/);
      }
    }
    // …and a row with nothing to reach with draws no dash and no dead control,
    // while still holding its track so the columns stay aligned.
    const emptyCells = await rows.evaluateAll((nodes) =>
      nodes
        .filter(
          (node) => node.querySelectorAll(".dh-prow__reach-link").length === 0,
        )
        .map((node) => ({
          present: node.querySelector(".dh-prow__reach") !== null,
          text: node.querySelector(".dh-prow__reach")?.textContent ?? null,
        })),
    );
    for (const cell of emptyCells) {
      expect(cell.present).toBe(true);
      expect(cell.text).toBe("");
    }
  });

  test("every row takes the same height, whatever it holds", async ({
    page,
  }) => {
    for (const size of [
      { width: 1440, height: 900 },
      { width: 393, height: 852 },
    ]) {
      await page.setViewportSize(size);
      await gotoFixture(page, "/people");
      const rows = page.locator(".dh-prow");
      await expect(rows.first()).toBeVisible();
      const heights = await rows.evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().height)),
      );
      // A Person with less data gets a QUIETER row, never a shorter one — and
      // one with more gets a truncated line, never a taller row.
      expect(new Set(heights).size).toBe(1);
      const clipped = await rows.evaluateAll(
        (nodes) =>
          nodes.filter(
            (node) =>
              node.scrollHeight >
              Math.round(node.getBoundingClientRect().height) + 1,
          ).length,
      );
      expect(clipped).toBe(0);
    }
  });

  test("the absence state is quiet, and never the loudest thing on a row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, "/people");
    const quiet = page.locator(
      '[data-testid="person-row-rhythm"][data-quiet="true"]',
    );
    test.skip(
      (await quiet.count()) === 0,
      "No Person in this workspace is without shared history.",
    );
    // The words survive — the information is demoted, not deleted…
    await expect(quiet.first()).toContainText("No shared history yet");
    // …and it loses the dot, which exists to agree with a state.
    expect(await quiet.first().locator(".dh-prow__dot").count()).toBe(0);
    // It is genuinely quieter than the name beside it, not merely labelled so.
    const weights = await quiet.first().evaluate((node) => {
      const row = node.closest(".dh-prow");
      const state = node.querySelector(".dh-prow__rhythm-state");
      return {
        state: getComputedStyle(state).color,
        muted: getComputedStyle(row.querySelector(".dh-prow__name")).color,
      };
    });
    expect(weights.state).not.toBe(weights.muted);
  });

  test("record header actions meet the 44px touch target", async ({ page }) => {
    await createPerson(page, `${TITLE_PREFIX}${Date.now()}`);
    await expectMinTouchTarget(page.getByRole("tab", { name: "Summary" }));
  });

  for (const viewport of RESPONSIVE_VIEWPORTS) {
    test(`collection and record are overflow-free at ${viewport.label} (${viewport.width}px)`, async ({
      page,
    }) => {
      const url = await createPerson(page, `${TITLE_PREFIX}${Date.now()}`);
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/people");
      await expectNoHorizontalOverflow(page);
      await page.goto(url);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("the People collection has no WCAG violations", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFixture(page, "/people");
    await expectNoAxeViolations(page);
  });
});
