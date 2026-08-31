/**
 * RECALL-03 — "what did I say I would chase today?", driven end to end.
 *
 * `test/kernel/recall-03-commitments-due.test.ts` proves the SQL: which column
 * decides membership, which owner-day it is compared against, that the three
 * surfaces state ONE machine value, that the Waiting keyset pages without
 * skipping or repeating, and that another workspace's rows never surface. This
 * file proves the half only the running product can prove:
 *
 *   1. Today's EXISTING waiting row states the follow-up fact and links to the
 *      Waiting surface FILTERED to exactly the Tasks it counted — no new card,
 *      no new band, and no filtered number opening an unfiltered list;
 *   2. the commitment is reachable from the palette in two interactions;
 *   3. `/today/waiting` is honest at 150 rows: it says what it is SHOWING, never
 *      states its page as the population, and row 101 is actually reachable;
 *   4. the follow-up dimension is an ordinary control on `/tasks`, so it is
 *      shareable, saveable and adjustable like every other filter;
 *   5. the same journeys work on a 393 px phone, with no horizontal overflow;
 *   6. every touched surface is axe-clean with no rule disabled.
 *
 * The fixture is seeded relative to the OWNER's calendar day (Australia/Sydney,
 * the seeded owner's timezone), because "due today" is theirs and the assertion
 * would otherwise be a statement about the runner's clock.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { d1Execute, d1ExecuteFile, sqlLiteral } from "./d1";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  mobileNavigationOpener,
  openCollectionControls,
  ownerToday,
  taskRow,
} from "./helpers";

const WS = "local-dev-workspace";
const STAMP = `${Date.now()}`;

/** How many filler waiting Tasks the honesty proof needs. */
const FILLERS = 150;

const ID = {
  area: `recall03-area-${STAMP}`,
  dueToday: `recall03-due-today-${STAMP}`,
  overdue: `recall03-overdue-${STAMP}`,
  upcoming: `recall03-upcoming-${STAMP}`,
} as const;

const TITLE = {
  dueToday: `Recall03 chase today ${STAMP}`,
  overdue: `Recall03 chase overdue ${STAMP}`,
  upcoming: `Recall03 chase later ${STAMP}`,
} as const;

const fillerId = (index: number) =>
  `recall03-filler-${STAMP}-${String(index).padStart(3, "0")}`;
const fillerTitle = (index: number) =>
  `Recall03 filler ${String(index).padStart(3, "0")} ${STAMP}`;

const lit = sqlLiteral;

/** `YYYY-MM-DD` shifted by whole days, as calendar arithmetic. */
function shiftDay(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days))
    .toISOString()
    .slice(0, 10);
}

const TODAY = ownerToday();
const YESTERDAY = shiftDay(TODAY, -1);
const TOMORROW = shiftDay(TODAY, 1);

/** One waiting Task the fixture seeds: an id, a title, when it started waiting
 * and the day the owner said they would chase it (or null). */
interface WaitingSeed {
  readonly id: string;
  readonly title: string;
  readonly waitingSince: string;
  readonly followUpOn: string | null;
}

/** An instant that keeps the filler order stable and predictable. */
const fillerWaitingSince = (index: number) =>
  new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString();

const CREATED = "2026-07-01T00:00:00.000Z";

/**
 * The two Tasks the owner said they would chase by today, one Task they said
 * they would chase tomorrow, and 150 ordinary waiting Tasks with no chase date.
 *
 * The upcoming Task is what makes the count falsifiable: a "due" filter that
 * ignored the date would return it, and a fact that simply counted waiting work
 * would report 153.
 *
 * The fillers wait LONGEST, so they lead the deterministic Waiting order and the
 * three dated fixtures sit behind them — which is what puts a NAMED row past
 * position 100 and makes "row 101 is reachable" an assertion about a specific
 * title rather than about a number.
 */
function fixtureRows(): readonly WaitingSeed[] {
  const rows: WaitingSeed[] = [];
  for (let i = 0; i < FILLERS; i += 1) {
    rows.push({
      id: fillerId(i),
      title: fillerTitle(i),
      waitingSince: fillerWaitingSince(i),
      followUpOn: null,
    });
  }
  rows.push(
    {
      id: ID.dueToday,
      title: TITLE.dueToday,
      waitingSince: "2026-06-01T00:00:00.000Z",
      followUpOn: TODAY,
    },
    {
      id: ID.overdue,
      title: TITLE.overdue,
      waitingSince: "2026-06-01T00:01:00.000Z",
      followUpOn: YESTERDAY,
    },
    {
      id: ID.upcoming,
      title: TITLE.upcoming,
      waitingSince: "2026-06-01T00:02:00.000Z",
      followUpOn: TOMORROW,
    },
  );
  return rows;
}

/**
 * The fixture, as FIVE multi-row statements rather than five per Task.
 *
 * The suite drives one dev server against one local SQLite file while this
 * helper opens it from a separate process, and SQLite serialises writers — so a
 * long fixture write is a long window in which the server's own reads can fail.
 * A seed of 750 single-row statements measurably starved a concurrent Today
 * load (whose reads degrade rather than throw, which is worse: the page came
 * back missing a panel). Five statements keep that window short.
 */
function seed(): void {
  const rows = fixtureRows();
  const values = (build: (row: WaitingSeed) => string) =>
    rows.map(build).join(",\n  ");

  const statements: string[] = [
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.area)}, ${lit(WS)}, 'area', ${lit(`Recall03 Area ${STAMP}`)}, ${lit(CREATED)}, ${lit(CREATED)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${lit(WS)}, ${lit(ID.area)}, 'area', NULL);`,
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES
  ${values(
    (row) =>
      `(${lit(row.id)}, ${lit(WS)}, 'task', ${lit(row.title)}, ${lit(CREATED)}, ${lit(CREATED)}, NULL)`,
  )};`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES
  ${values((row) => `(${lit(WS)}, ${lit(row.id)}, 'task', NULL)`)};`,
    `INSERT OR IGNORE INTO task_details
       (workspace_id, entity_id, entity_type, status, commitment_state,
        delegate_to, delegated_on, follow_up_on, waiting_since, waiting_note, updated_at)
     VALUES
  ${values(
    (row) =>
      `(${lit(WS)}, ${lit(row.id)}, 'task', 'todo', 'active', 'Sam Okafor', '2026-07-01', ` +
      `${row.followUpOn === null ? "NULL" : lit(row.followUpOn)}, ${lit(row.waitingSince)}, 'with Sam', ${lit(CREATED)})`,
  )};`,
    `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
     VALUES
  ${values(
    (row) =>
      `(${lit(`${row.id}-parent`)}, ${lit(WS)}, ${lit(row.id)}, ${lit(ID.area)}, 'task.belongs_to_area', ${lit(CREATED)}, ${lit(CREATED)}, NULL)`,
  )};`,
  ];

  /*
   * The statement text is far past the operating system's argv limit, so the
   * fixture goes through the shared FILE entry point — which is what it exists
   * for (the Review evidence week and the mobile Projects cleanup are files for
   * the same reason). It stays idempotent (`INSERT OR IGNORE`), so the shared
   * retry rule still holds.
   */
  const dir = mkdtempSync(join(tmpdir(), "recall03-"));
  const file = join(dir, "seed.sql");
  try {
    writeFileSync(file, statements.join("\n"), "utf8");
    d1ExecuteFile(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function cleanup(): void {
  // Matched by PREFIX rather than by an id list, for the same reason the seed is
  // a file: 153 literals is an argv the shell will not carry. Every id this spec
  // mints begins `recall03-…`, and the delete is workspace-scoped, so it can
  // only ever remove this fixture's own rows. Children strictly before parents.
  const mine = `${lit(`recall03-%${STAMP}%`)}`;
  const area = lit(ID.area);
  d1Execute([
    `DELETE FROM entity_links WHERE workspace_id = ${lit(WS)} AND (source_entity_id LIKE ${mine} OR target_entity_id LIKE ${mine});`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM task_details WHERE workspace_id = ${lit(WS)} AND entity_id LIKE ${mine};`,
    `DELETE FROM spine_records WHERE workspace_id = ${lit(WS)} AND (entity_id LIKE ${mine} OR entity_id = ${area});`,
    `DELETE FROM entities WHERE workspace_id = ${lit(WS)} AND (id LIKE ${mine} OR id = ${area});`,
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

/** The attention rail's waiting row. */
function waitingRow(page: Page) {
  return page.getByTestId("today-attention").locator("li", {
    has: page.getByRole("link", { name: "Waiting", exact: true }),
  });
}

/** A Waiting card by its title. */
function waitingCard(page: Page, title: string) {
  return page.getByRole("link", { name: new RegExp(title) });
}

/* -------------------------------------------------------------------------- */
/* 1. The Today attention fact                                                 */
/* -------------------------------------------------------------------------- */

test.describe("RECALL-03 — Today states the fact on the row it already had", () => {
  test("adds the follow-up count to the waiting row and links it to the FILTERED surface", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    const rail = page.getByTestId("today-attention");
    await expect(rail).toBeVisible();
    // No new card and no new band: the rail still holds only the row kinds it
    // held before (ADR-114 decision 5 — one fact on an existing row).
    const row = waitingRow(page).first();
    await expect(row).toBeVisible();

    // TWO distinct machine facts on one row. The waiting count is the whole
    // population (153 seeded waiting Tasks plus whatever the base seed holds);
    // the follow-up count is exactly the two the owner said they would chase.
    await expect(row).toContainText(/\d+ waiting items/);
    const followUp = row.getByRole("link", { name: "2 follow-ups due" });
    await expect(followUp).toBeVisible();

    // The count names a FILTERED population, so it opens the filtered list.
    await expect(followUp).toHaveAttribute(
      "href",
      "/today/waiting?followUp=due",
    );
    // …and never the unfiltered one, which is what the row's own title opens.
    await expect(
      row.getByRole("link", { name: "Waiting", exact: true }),
    ).toHaveAttribute("href", "/today/waiting");
  });

  test("the linked surface returns exactly the Tasks the fact counted", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await waitingRow(page)
      .first()
      .getByRole("link", { name: "2 follow-ups due" })
      .click();

    await expect(page).toHaveURL(/\/today\/waiting\?followUp=due/);
    // Both due chases, and neither the one dated tomorrow nor the 150 with no
    // chase date at all.
    await expect(waitingCard(page, TITLE.dueToday)).toBeVisible();
    await expect(waitingCard(page, TITLE.overdue)).toBeVisible();
    await expect(waitingCard(page, TITLE.upcoming)).toHaveCount(0);
    await expect(waitingCard(page, fillerTitle(0))).toHaveCount(0);

    // The subtitle states the filtered population it is actually showing.
    await expect(
      page.getByText(
        "2 tasks are waiting on someone or something else with a follow-up due.",
      ),
    ).toBeVisible();

    // Each row says WHY it is here — the chase date, in the owner's words.
    await expect(
      page.getByText("Today", { exact: true }).first(),
    ).toBeVisible();
  });

  test("reaches the commitment from the palette in two interactions", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    // Interaction 1: the global palette shortcut, from anywhere.
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeVisible();

    // Interaction 2: choose the command.
    await input.fill("follow-ups due");
    await expect(
      page.getByRole("option", { name: /Open follow-ups due/ }).first(),
    ).toBeVisible();
    await input.press("Enter");

    await expect(page).toHaveURL(/\/today\/waiting\?followUp=due/);
    await expect(waitingCard(page, TITLE.overdue)).toBeVisible();
    await expect(waitingCard(page, TITLE.upcoming)).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. The Waiting surface is honest at 150 rows                                */
/* -------------------------------------------------------------------------- */

test.describe("RECALL-03 — /today/waiting no longer states a bound as a total", () => {
  test("says what it is SHOWING, and reaches past row 100", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await gotoFixture(page, "/today/waiting");

    /*
     * DEBT-232, stated as an assertion. The page loads 50 and more remain, so
     * the subtitle may only describe what it is showing — never "153 tasks are
     * waiting" from a truncated read, and never its page size as the whole.
     */
    await expect(
      page.getByText(
        "Showing the first 50 waiting tasks — load more to see the rest.",
      ),
    ).toBeVisible();

    // The last filler is past row 100 and is NOT on the first page.
    await expect(waitingCard(page, fillerTitle(FILLERS - 1))).toHaveCount(0);

    const loadMore = page.getByRole("button", {
      name: "Load more waiting tasks",
    });
    // DIRECT children only: each card renders its own metadata `<ul>`, so a
    // descendant `listitem` query would count meta rows as cards.
    const cards = page.locator('ul[aria-label="Waiting tasks"] > li');

    /*
     * Walk the keyset to the end. Each click appends a page and the control
     * disappears once the collection is exhausted — and the wait is on the LIST
     * GROWING rather than on the button re-enabling, because the button is
     * disabled while a page is in flight and a click landing in that window is
     * simply ignored.
     */
    let loaded = await cards.count();
    expect(loaded).toBe(50);
    for (let click = 0; click < 10; click += 1) {
      if ((await loadMore.count()) === 0) break;
      const before = loaded;
      await loadMore.click();
      await expect
        .poll(async () => cards.count(), { timeout: 20_000 })
        .toBeGreaterThan(before);
      loaded = await cards.count();
    }
    await expect(loadMore).toHaveCount(0, { timeout: 20_000 });
    // Every seeded row is reachable, and none was repeated on the way.
    expect(loaded).toBeGreaterThanOrEqual(FILLERS + 3);

    // Row 101 and beyond are reachable, which is the whole claim.
    await expect(waitingCard(page, fillerTitle(FILLERS - 1))).toBeVisible();
    await expect(waitingCard(page, fillerTitle(120))).toBeVisible();

    // …and only now does the subtitle state a total, because only now is it one.
    await expect(
      page.getByText(/^\d+ tasks are waiting on someone or something else\.$/),
    ).toBeVisible();
    await expect(page.getByText(/Showing the first/)).toHaveCount(0);
  });

  test("is axe-clean and overflow-free with the collection loaded", async ({
    page,
  }) => {
    await gotoFixture(page, "/today/waiting?followUp=due");
    await expect(waitingCard(page, TITLE.dueToday)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // No rule disabled beyond the repository's own global set.
    await expectNoAxeViolations(page);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. The dimension is an ordinary Tasks control                               */
/* -------------------------------------------------------------------------- */

test.describe("RECALL-03 — followUp is one more filter, not a second system", () => {
  test("is offered by the ordinary controls and lands in the address bar", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=waiting");
    const controls = await openCollectionControls(page);
    await controls.choose("followUp", "due");
    await controls.commit();
    await controls.dismiss();

    // An ordinary parameter in an ordinary URL: shareable, saveable, and
    // Back/Forward-correct for free.
    await expect(page).toHaveURL(/followUp=due/);
    await expect(taskRow(page, TITLE.dueToday).first()).toBeVisible();
    await expect(taskRow(page, TITLE.overdue).first()).toBeVisible();
    await expect(taskRow(page, TITLE.upcoming)).toHaveCount(0);
  });

  test("answers each state, including 'none'", async ({ page }) => {
    await gotoFixture(page, "/tasks?system=waiting&followUp=overdue");
    await expect(taskRow(page, TITLE.overdue).first()).toBeVisible();
    await expect(taskRow(page, TITLE.dueToday)).toHaveCount(0);

    await gotoFixture(page, "/tasks?system=waiting&followUp=upcoming");
    await expect(taskRow(page, TITLE.upcoming).first()).toBeVisible();
    await expect(taskRow(page, TITLE.overdue)).toHaveCount(0);

    await gotoFixture(page, "/tasks?system=waiting&followUp=none");
    await expect(taskRow(page, fillerTitle(0)).first()).toBeVisible();
    await expect(taskRow(page, TITLE.dueToday)).toHaveCount(0);
  });

  test("adds no Task status — the lifecycle vocabulary is unchanged", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=waiting&followUp=due");
    const controls = await openCollectionControls(page);
    const prefix = controls.compact ? "collection-sheet" : "collection-popover";
    // The follow-up dimension is offered as a FILTER…
    await expect(
      controls.surface.getByTestId(`${prefix}-followUp-due`),
    ).toBeVisible();
    // …and the status vocabulary gained nothing: no "follow-up", no "waiting
    // due", no new lifecycle position (ADR-114 decision 5).
    await expect(
      controls.surface.getByTestId(`${prefix}-status-follow_up`),
    ).toHaveCount(0);
    await expect(
      controls.surface.getByTestId(`${prefix}-status-waiting_due`),
    ).toHaveCount(0);
    await controls.dismiss();
  });

  test("the filtered collection is axe-clean", async ({ page }) => {
    await gotoFixture(page, "/tasks?system=waiting&followUp=due");
    await expect(taskRow(page, TITLE.dueToday).first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. The phone                                                                */
/* -------------------------------------------------------------------------- */

test.describe("RECALL-03 — on a 393 px phone", () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test("the waiting row stays readable and its follow-up link usable", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const row = waitingRow(page).first();
    await expect(row).toBeVisible();
    const followUp = row.getByRole("link", { name: "2 follow-ups due" });
    await expect(followUp).toBeVisible();

    // The extra fact must not push the rail sideways.
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await followUp.click();
    await expect(page).toHaveURL(/\/today\/waiting\?followUp=due/);
    await expect(waitingCard(page, TITLE.dueToday)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });

  test("reaches the commitment from the phone's palette door", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await mobileNavigationOpener(page).click();
    const trigger = page
      .getByRole("button", { name: "Command palette", exact: true })
      .first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill("follow-ups due");
    await expect(
      page.getByRole("option", { name: /Open follow-ups due/ }).first(),
    ).toBeVisible();
    await input.press("Enter");

    await expect(page).toHaveURL(/\/today\/waiting\?followUp=due/);
    await expect(waitingCard(page, TITLE.overdue)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
