/**
 * RECALL-02 — "What did I complete yesterday?", driven end to end.
 *
 * `test/kernel/recall-02-completed-time.test.ts` proves the SQL: which column
 * orders the list, which instants bound the window, that the keyset pages
 * without skipping or repeating, that another workspace's rows never surface,
 * and that Analytics' figure and the list its link opens are the same machine
 * value. This file proves the half only the running product can prove:
 *
 *   1. the question is answerable in **no more than two interactions from
 *      anywhere** — open the palette, choose "Completed yesterday";
 *   2. the destination is an ORDINARY Tasks configuration in the address bar,
 *      so it is shareable, saveable and adjustable with the ordinary controls;
 *   3. the Completed view's sentence and its order now agree, over a fixture
 *      that was completed earlier and EDITED since;
 *   4. the same journey works on a 393 px phone;
 *   5. the touched surface is axe-clean with no rule disabled.
 *
 * The fixture is seeded relative to the OWNER's calendar day (Australia/Sydney,
 * the seeded owner's timezone), because "yesterday" is theirs and the assertion
 * would otherwise be a statement about the runner's clock.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";
import {
  expectNoAxeViolations,
  gotoFixture,
  mobileNavigationOpener,
  openCollectionControls,
  ownerToday,
  taskRow,
} from "./helpers";

const WS = "local-dev-workspace";
const STAMP = `${Date.now()}`;

const ID = {
  area: `recall02-area-${STAMP}`,
  yesterday: `recall02-yesterday-${STAMP}`,
  earlier: `recall02-earlier-${STAMP}`,
  today: `recall02-today-${STAMP}`,
  open: `recall02-open-${STAMP}`,
} as const;

const TITLE = {
  yesterday: `Recall02 finished yesterday ${STAMP}`,
  earlier: `Recall02 finished earlier then edited ${STAMP}`,
  today: `Recall02 finished today ${STAMP}`,
  open: `Recall02 never finished ${STAMP}`,
} as const;

const lit = sqlLiteral;

/** `YYYY-MM-DD` shifted by whole days, as calendar arithmetic. */
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

/**
 * Midday on an owner-calendar day, as the UTC instant `completed_at` stores.
 *
 * `+10:00` is Sydney's standard offset; under daylight saving the same instant
 * reads as 13:00 rather than 12:00 — still comfortably inside the owner's day,
 * which is the only property this fixture needs.
 */
function ownerMiddayInstant(dayIso: string): string {
  return new Date(`${dayIso}T12:00:00+10:00`).toISOString();
}

const TODAY = ownerToday();
const YESTERDAY = shiftDay(TODAY, -1);
const FIVE_DAYS_AGO = shiftDay(TODAY, -5);

function seed(): void {
  const now = new Date().toISOString();
  const created = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const completedYesterday = ownerMiddayInstant(YESTERDAY);
  const completedEarlier = ownerMiddayInstant(FIVE_DAYS_AGO);

  const task = (id: string, title: string, completedAt: string | null) => [
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(id)}, ${lit(WS)}, 'task', ${lit(title)}, ${lit(created)}, ${lit(created)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${lit(WS)}, ${lit(id)}, 'task', ${completedAt === null ? "NULL" : lit(completedAt)});`,
    `UPDATE spine_records SET completed_at = ${completedAt === null ? "NULL" : lit(completedAt)}
      WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(id)};`,
    `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, updated_at)
     VALUES (${lit(WS)}, ${lit(id)}, 'task', 'todo', ${lit(created)});`,
    `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
     VALUES (${lit(`${id}-parent`)}, ${lit(WS)}, ${lit(id)}, ${lit(ID.area)}, 'task.area', ${lit(created)}, ${lit(created)}, NULL);`,
  ];

  d1Execute([
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.area)}, ${lit(WS)}, 'area', ${lit(`Recall02 Area ${STAMP}`)}, ${lit(created)}, ${lit(created)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${lit(WS)}, ${lit(ID.area)}, 'area', NULL);`,
    ...task(ID.yesterday, TITLE.yesterday, completedYesterday),
    ...task(ID.earlier, TITLE.earlier, completedEarlier),
    // Completed just now, so it is inside the owner's current week whichever day
    // that week starts on — which is what "this week" has to be asserted with.
    ...task(ID.today, TITLE.today, now),
    ...task(ID.open, TITLE.open, null),
    /*
     * The DEBT-230 fixture: the EARLIER completion was edited most recently, so
     * an `updated_at` order would put it first. Its completion has not moved.
     */
    `UPDATE entities SET updated_at = ${lit(now)}
      WHERE workspace_id = ${lit(WS)} AND id = ${lit(ID.earlier)};`,
  ]);
}

function cleanup(): void {
  const ids = [ID.yesterday, ID.earlier, ID.today, ID.open];
  d1Execute([
    `DELETE FROM entity_links WHERE workspace_id = ${lit(WS)} AND id IN (${ids
      .map((id) => lit(`${id}-parent`))
      .join(", ")});`,
    `DELETE FROM task_details WHERE workspace_id = ${lit(WS)} AND entity_id IN (${ids.map(lit).join(", ")});`,
    `DELETE FROM spine_records WHERE workspace_id = ${lit(WS)} AND entity_id IN (${[...ids, ID.area].map(lit).join(", ")});`,
    `DELETE FROM entities WHERE workspace_id = ${lit(WS)} AND id IN (${[...ids, ID.area].map(lit).join(", ")});`,
  ]);
}

test.beforeAll(() => {
  seed();
});

test.afterAll(() => {
  cleanup();
});

function palette(page: Page) {
  return page.getByRole("combobox", { name: "Search commands and records" });
}

/** Where the two fixture rows sit relative to each other on screen. */
async function fixturePositions(
  page: Page,
): Promise<{ yesterday: number; earlier: number }> {
  const boxes = await Promise.all(
    [TITLE.yesterday, TITLE.earlier].map(async (title) => {
      const row = taskRow(page, title).first();
      await expect(row).toBeVisible();
      return (await row.boundingBox())?.y ?? Number.NaN;
    }),
  );
  return { yesterday: boxes[0]!, earlier: boxes[1]! };
}

test.describe("RECALL-02 — the question is two interactions away", () => {
  test("palette → Completed yesterday lands on an ordinary Tasks configuration", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    // Interaction 1: open the palette (the global shortcut, from anywhere).
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeVisible();

    // Interaction 2: choose the command.
    await input.fill("Completed yesterday");
    const option = page
      .getByRole("option", { name: /Completed yesterday/ })
      .first();
    await expect(option).toBeVisible();
    await input.press("Enter");

    /*
     * The address bar holds the ORDINARY vocabulary — the Completed system view,
     * the completion sort and the owner's yesterday as an explicit window. No
     * private route state: this URL round-trips through the normal controls, can
     * be shared, and can be saved as a view.
     */
    await expect(page).toHaveURL(
      new RegExp(
        `/tasks\\?.*system=completed.*sort=completed.*completedFrom=${YESTERDAY}.*completedTo=${YESTERDAY}`,
      ),
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();

    // And it answers the question: yesterday's completion, and nothing else.
    await expect(taskRow(page, TITLE.yesterday).first()).toBeVisible();
    await expect(taskRow(page, TITLE.earlier)).toHaveCount(0);
    await expect(taskRow(page, TITLE.open)).toHaveCount(0);
  });

  test("palette → Completed this week widens to the owner's week", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill("Completed this week");
    await expect(
      page.getByRole("option", { name: /Completed this week/ }).first(),
    ).toBeVisible();
    await input.press("Enter");

    await expect(page).toHaveURL(
      /\/tasks\?.*system=completed.*sort=completed.*completedFrom=\d{4}-\d{2}-\d{2}.*completedTo=\d{4}-\d{2}-\d{2}/,
    );
    /*
     * A Task completed a moment ago is inside the owner's current week whatever
     * day that week starts on. YESTERDAY deliberately is not asserted: on a week
     * that begins today, yesterday belongs to the previous one — which is the
     * owner's week-start preference doing exactly its job.
     */
    await expect(taskRow(page, TITLE.today).first()).toBeVisible();
    // Never-completed work is not "completed this week" under any window.
    await expect(taskRow(page, TITLE.open)).toHaveCount(0);

    // The window brackets today, in the owner's own calendar.
    const url = new URL(page.url());
    const from = url.searchParams.get("completedFrom") ?? "";
    const to = url.searchParams.get("completedTo") ?? "";
    expect(
      from <= TODAY && TODAY <= to,
      `${from} … ${to} contains ${TODAY}`,
    ).toBe(true);
  });
});

test.describe("RECALL-02 — the Completed view's label is true", () => {
  test("orders by completion, not by the most recent edit", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=completed&saved=completed");

    // The sentence the view makes, and the order it delivers, now agree.
    await expect(page.getByTestId("tasks-view-trigger")).toContainText(
      "Completed",
    );

    const positions = await fixturePositions(page);
    // The Task completed yesterday leads the Task completed five days ago —
    // even though the latter was edited most recently. Under `sort=updated`
    // this assertion inverts, which is the falsification DEBT-230 asks for.
    expect(
      positions.yesterday,
      "yesterday's completion leads the earlier one",
    ).toBeLessThan(positions.earlier);

    // Both are in the list; the never-completed Task is not.
    await expect(taskRow(page, TITLE.open)).toHaveCount(0);
  });

  test("still puts the edited-since Task first under the edit sort", async ({
    page,
  }) => {
    // The discriminator: the SAME fixture, ordered by `updated`, reverses. If
    // this stopped being true the fixture would no longer prove anything.
    await gotoFixture(page, "/tasks?system=completed&sort=updated");
    const positions = await fixturePositions(page);
    expect(positions.earlier).toBeLessThan(positions.yesterday);
  });

  test("offers the completion window in the ordinary controls", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=completed&saved=completed");
    const controls = await openCollectionControls(page);
    await controls.choose("completedWithin", "1d");
    await controls.commit();
    await controls.dismiss();

    await expect(page).toHaveURL(/completedWithin=1d/);
    // "Today" holds the Task finished a moment ago and neither of the older two.
    await expect(taskRow(page, TITLE.today).first()).toBeVisible();
    await expect(taskRow(page, TITLE.yesterday)).toHaveCount(0);
    await expect(taskRow(page, TITLE.earlier)).toHaveCount(0);
  });
});

test.describe("RECALL-02 — accessibility", () => {
  test("the completed-window collection is axe-clean", async ({ page }) => {
    await gotoFixture(
      page,
      `/tasks?system=completed&sort=completed&completedFrom=${FIVE_DAYS_AGO}&completedTo=${YESTERDAY}`,
    );
    await expect(taskRow(page, TITLE.yesterday).first()).toBeVisible();
    // No rule disabled beyond the repository's own global set.
    await expectNoAxeViolations(page);
  });
});

test.describe("RECALL-02 — on a 393 px phone", () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test("answers the same question in two interactions, and stays axe-clean", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    // Interaction 1: the phone's own palette door.
    await mobileNavigationOpener(page).click();
    const trigger = page
      .getByRole("button", { name: "Command palette", exact: true })
      .first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    // Interaction 2: choose the command.
    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill("Completed yesterday");
    await expect(
      page.getByRole("option", { name: /Completed yesterday/ }).first(),
    ).toBeVisible();
    await input.press("Enter");

    await expect(page).toHaveURL(
      new RegExp(`/tasks\\?.*completedFrom=${YESTERDAY}`),
    );
    await expect(taskRow(page, TITLE.yesterday).first()).toBeVisible();
    await expect(taskRow(page, TITLE.earlier)).toHaveCount(0);

    // The page does not scroll sideways to say it, and it is axe-clean here too.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth <= doc.clientWidth + 1;
    });
    expect(overflow, "no horizontal overflow at 393px").toBe(true);
    await expectNoAxeViolations(page);
  });
});
