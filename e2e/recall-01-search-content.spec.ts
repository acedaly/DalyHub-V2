/**
 * RECALL-01 — Search reaches content, driven end to end.
 *
 * `test/kernel/recall-01-search-content.test.ts` proves the SQL: which columns
 * match, how many statements it costs, that a 100 KiB body ships an excerpt
 * rather than a record, and that another workspace's hostile rows never
 * surface. This file proves the half only the real product can prove — that a
 * phrase existing ONLY inside a record, typed into the real Search surface,
 * returns the owning record through the real `/search` endpoint, opens the
 * canonical destination, states an honest match source, shows a bounded excerpt,
 * and highlights the matched text with the existing `<mark>` machinery.
 *
 * It also proves the two privacy boundaries that must be tests rather than
 * intentions: a Diary entry whose BODY matches is findable when typed and absent
 * from the unbidden empty-query list, and a phrase living only in a Person's
 * free-text notes finds nobody.
 *
 * Every fixture phrase is synthetic nonsense. No assertion prints a record body;
 * the excerpt assertions check the PHRASE and lengths, never the fixture prose.
 */

import { expect, test } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";
import { expectNoAxeViolations, mobileNavigationOpener } from "./helpers";

import type { Locator, Page } from "@playwright/test";

const WS = "local-dev-workspace";
const STAMP = `${Date.now()}`;

/** One distinctive phrase per body source, each present in exactly one record. */
const PHRASE = {
  meetingNotes: `quibblewax${STAMP}`,
  meetingAgenda: `florbulent${STAMP}`,
  meetingItem: `grondlesnap${STAMP}`,
  taskDescription: `vexicular${STAMP}`,
  reviewSection: `plimberwock${STAMP}`,
  diaryBody: `zibblethorn${STAMP}`,
  personNotes: `murkwaddle${STAMP}`,
} as const;

const ID = {
  meeting: `recall01-meeting-${STAMP}`,
  meetingItem: `recall01-item-${STAMP}`,
  task: `recall01-task-${STAMP}`,
  review: `recall01-review-${STAMP}`,
  diary: `recall01-diary-${STAMP}`,
  person: `recall01-person-${STAMP}`,
  diaryActivity: `recall01-diary-activity-${STAMP}`,
} as const;

const TITLE = {
  meeting: `Recall01 Meeting ${STAMP}`,
  task: `Recall01 Task ${STAMP}`,
  review: `Recall01 Review ${STAMP}`,
  diary: `Recall01 Diary ${STAMP}`,
  person: `Recall01 Person ${STAMP}`,
} as const;

const lit = sqlLiteral;

function seed(): void {
  const now = new Date().toISOString();
  const startsAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
  d1Execute([
    // ── Meeting: agenda, notes and one captured decision item ───────────────
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.meeting)}, ${lit(WS)}, 'meeting', ${lit(TITLE.meeting)}, ${lit(now)}, ${lit(now)}, NULL);`,
    `INSERT OR IGNORE INTO meeting_details (workspace_id, entity_id, starts_at, timezone, status, agenda_markdown, notes_markdown, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.meeting)}, ${lit(startsAt)}, 'Australia/Sydney', 'planned',
             ${lit(`## Preparation\n\nBring the ${PHRASE.meetingAgenda} figures.`)},
             ${lit(`We agreed on the ${PHRASE.meetingNotes} approach.`)}, ${lit(now)});`,
    `UPDATE meeting_details SET agenda_markdown = ${lit(`## Preparation\n\nBring the ${PHRASE.meetingAgenda} figures.`)},
        notes_markdown = ${lit(`We agreed on the ${PHRASE.meetingNotes} approach.`)}, archived_at = NULL
      WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.meeting)};`,
    `INSERT OR IGNORE INTO meeting_items (workspace_id, id, meeting_id, kind, body_markdown, position, created_at, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.meetingItem)}, ${lit(ID.meeting)}, 'decision',
             ${lit(`Adopt the ${PHRASE.meetingItem} plan.`)}, 0, ${lit(now)}, ${lit(now)});`,

    // ── Task: a description-only match ──────────────────────────────────────
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.task)}, ${lit(WS)}, 'task', ${lit(TITLE.task)}, ${lit(now)}, ${lit(now)}, NULL);`,
    `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
     VALUES (${lit(WS)}, ${lit(ID.task)}, 'task', NULL);`,
    `INSERT OR IGNORE INTO task_details (workspace_id, entity_id, entity_type, status, description, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.task)}, 'task', 'todo',
             ${lit(`Check the ${PHRASE.taskDescription} readings before Friday.`)}, ${lit(now)});`,
    `UPDATE task_details SET description = ${lit(`Check the ${PHRASE.taskDescription} readings before Friday.`)}
      WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.task)};`,

    // ── Review: a reflection-only match ─────────────────────────────────────
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.review)}, ${lit(WS)}, 'review', ${lit(TITLE.review)}, ${lit(now)}, ${lit(now)}, NULL);`,
    `INSERT OR IGNORE INTO review_details (workspace_id, entity_id, review_type, period_start, period_end, status, template_id, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.review)}, 'weekly', '2026-08-17', '2026-08-23', 'draft', 'review.weekly.v1', ${lit(now)});`,
    `INSERT OR IGNORE INTO review_sections (workspace_id, review_id, section_id, body_markdown, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.review)}, 'summary.lessons', ${lit(`The ${PHRASE.reviewSection} lesson stuck.`)}, ${lit(now)});`,
    `UPDATE review_sections SET body_markdown = ${lit(`The ${PHRASE.reviewSection} lesson stuck.`)}
      WHERE workspace_id = ${lit(WS)} AND review_id = ${lit(ID.review)} AND section_id = 'summary.lessons';`,

    // ── Diary: a body-only match, seeded as the NEWEST activity ─────────────
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.diary)}, ${lit(WS)}, 'diary', ${lit(TITLE.diary)}, ${lit(now)}, ${lit(now)}, NULL);`,
    `INSERT OR IGNORE INTO diary_entry_details (workspace_id, entity_id, entity_type, entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.diary)}, 'diary', 'reflection', ${lit(`A ${PHRASE.diaryBody} afternoon.`)}, ${lit(now)}, 'Australia/Sydney', 'manual', NULL, ${lit(now)});`,
    `UPDATE diary_entry_details SET body = ${lit(`A ${PHRASE.diaryBody} afternoon.`)}
      WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.diary)};`,
    `INSERT OR IGNORE INTO activities (id, workspace_id, type, actor_type, actor_id, occurred_at, payload_json)
     VALUES (${lit(ID.diaryActivity)}, ${lit(WS)}, 'entity.created', 'user', 'recall01', ${lit(now)}, '{}');`,
    `INSERT OR IGNORE INTO activity_subjects (workspace_id, activity_id, entity_id, role)
     VALUES (${lit(WS)}, ${lit(ID.diaryActivity)}, ${lit(ID.diary)}, 'primary');`,

    // ── Person: the phrase lives ONLY in free-text notes ────────────────────
    `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
     VALUES (${lit(ID.person)}, ${lit(WS)}, 'person', ${lit(TITLE.person)}, ${lit(now)}, ${lit(now)}, NULL);`,
    `INSERT OR IGNORE INTO person_details (workspace_id, entity_id, entity_type, notes, updated_at)
     VALUES (${lit(WS)}, ${lit(ID.person)}, 'person', ${lit(`A private ${PHRASE.personNotes} observation.`)}, ${lit(now)});`,
    `UPDATE person_details SET notes = ${lit(`A private ${PHRASE.personNotes} observation.`)}, archived_at = NULL
      WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.person)};`,
  ]);
}

function cleanup(): void {
  d1Execute([
    `DELETE FROM meeting_items WHERE workspace_id = ${lit(WS)} AND meeting_id = ${lit(ID.meeting)};`,
    `DELETE FROM meeting_details WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.meeting)};`,
    `DELETE FROM task_details WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.task)};`,
    `DELETE FROM spine_records WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.task)};`,
    `DELETE FROM review_sections WHERE workspace_id = ${lit(WS)} AND review_id = ${lit(ID.review)};`,
    `DELETE FROM review_details WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.review)};`,
    `DELETE FROM activity_subjects WHERE workspace_id = ${lit(WS)} AND activity_id = ${lit(ID.diaryActivity)};`,
    `DELETE FROM activities WHERE workspace_id = ${lit(WS)} AND id = ${lit(ID.diaryActivity)};`,
    `DELETE FROM diary_entry_details WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.diary)};`,
    `DELETE FROM person_details WHERE workspace_id = ${lit(WS)} AND entity_id = ${lit(ID.person)};`,
    `DELETE FROM entities WHERE workspace_id = ${lit(WS)} AND id IN (${lit(ID.meeting)}, ${lit(ID.task)}, ${lit(ID.review)}, ${lit(ID.diary)}, ${lit(ID.person)});`,
  ]);
}

test.beforeAll(() => {
  seed();
});

test.afterAll(() => {
  cleanup();
});

function searchPanel(page: Page) {
  return page.locator(".dh-search__panel");
}

async function openSearch(page: Page) {
  await page.waitForLoadState("networkidle");
  await page
    .locator(".dh-topbar")
    .getByRole("button", { name: /^Search DalyHub/ })
    .first()
    .click();
  const input = page.getByRole("combobox", { name: "Search everything" });
  await expect(input).toBeVisible();
  return input;
}

function optionFor(page: Page, title: string): Locator {
  return page
    .getByRole("listbox")
    .getByRole("option")
    .filter({ hasText: title })
    .first();
}

/** Type a phrase and wait for the owning record's row. */
async function findByPhrase(
  page: Page,
  input: Locator,
  phrase: string,
  title: string,
) {
  await input.fill(phrase);
  const option = optionFor(page, title);
  await expect(option).toBeVisible();
  // The row for this QUERY, not the identical row the previous query left on
  // screen: the phrase is unique to one body field, so it can only appear once
  // the new response has rendered.
  await expect(option).toContainText(phrase);
  return option;
}

/**
 * The three things every content match must show: the honest source label, the
 * excerpt containing the phrase, and the phrase highlighted through the existing
 * `<mark>` machinery — all inside the ONE existing subtitle line.
 */
async function expectContentMatch(
  option: Locator,
  source: string,
  phrase: string,
) {
  const subtitle = option.locator(".dh-search__optionsubtitle");
  await expect(subtitle).toBeVisible();
  /*
   * Auto-retrying assertions throughout: consecutive queries in one journey
   * return the SAME record, so its row stays on screen while the next response
   * is in flight. A one-shot `innerText()` would happily read the previous
   * query's subtitle.
   */
  await expect(subtitle, `match source is "${source}"`).toHaveText(
    new RegExp(`^${source}\\b`),
  );
  await expect(subtitle, "excerpt carries the matched phrase").toContainText(
    phrase,
  );
  // The existing highlight machinery, over plain text — never provider HTML.
  const mark = subtitle.locator("mark.dh-search__mark").first();
  await expect(mark).toBeVisible();
  await expect(mark).toHaveText(new RegExp(phrase, "i"));
}

test.describe("RECALL-01 — a phrase inside a record finds the record", () => {
  test("finds a Meeting by its notes, its agenda and a captured decision", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);

    const notes = await findByPhrase(
      page,
      input,
      PHRASE.meetingNotes,
      TITLE.meeting,
    );
    await expectContentMatch(notes, "Notes", PHRASE.meetingNotes);

    const agenda = await findByPhrase(
      page,
      input,
      PHRASE.meetingAgenda,
      TITLE.meeting,
    );
    await expectContentMatch(agenda, "Agenda", PHRASE.meetingAgenda);
    // Plain text: the heading syntax around the agenda phrase is stripped.
    await expect(
      agenda.locator(".dh-search__optionsubtitle"),
    ).not.toContainText("##");

    const item = await findByPhrase(
      page,
      input,
      PHRASE.meetingItem,
      TITLE.meeting,
    );
    await expectContentMatch(item, "Decision", PHRASE.meetingItem);

    // ONE result for the owning record, and it opens the canonical destination.
    await expect(page.getByRole("option")).toHaveCount(1);
    await item.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/meeting/${ID.meeting}$`));
    await expect(
      page.getByRole("heading", { name: TITLE.meeting }),
    ).toBeVisible();
  });

  test("finds a Task by its description and opens the Task Drawer", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    const option = await findByPhrase(
      page,
      input,
      PHRASE.taskDescription,
      TITLE.task,
    );
    await expectContentMatch(option, "Description", PHRASE.taskDescription);

    await option.getByRole("link").click();
    await expect(page).toHaveURL(/\/tasks\?.*drawer=/);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("finds a Review by a section reflection", async ({ page }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    const option = await findByPhrase(
      page,
      input,
      PHRASE.reviewSection,
      TITLE.review,
    );
    // The honest source is the section's own name, not a generic "Body".
    await expectContentMatch(option, "Lessons", PHRASE.reviewSection);

    await option.getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/reviews/${ID.review}$`));
  });

  test("finds a Diary entry by its body and opens the canonical Diary surface", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    const option = await findByPhrase(
      page,
      input,
      PHRASE.diaryBody,
      TITLE.diary,
    );
    await expectContentMatch(option, "Entry", PHRASE.diaryBody);

    // RECALL-00's canonical Diary destination — the day surface with the
    // inspector open, never the raw JSON resource route.
    await option.getByRole("link").click();
    await expect(page).toHaveURL(
      new RegExp(`/diary\\?inspector=view:${ID.diary}$`),
    );
    // The day surface WITH the entry's inspector open — RECALL-00's canonical
    // Diary record surface, rendered as HTML rather than the resource route's
    // JSON. The title appears twice (timeline row + inspector), so this is
    // scoped to the inspector deliberately.
    await expect(
      page.getByLabel("Entry details").getByRole("heading", {
        name: TITLE.diary,
      }),
    ).toBeVisible();
  });
});

test.describe("RECALL-01 — the privacy boundaries, as tests", () => {
  test("a Diary body match is typed-only: the empty query still never lists it", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);

    // The unbidden surface. The entry is the workspace's newest activity, so it
    // would lead the list if Diary were listable.
    const recent = page.getByRole("listbox", { name: "Recently worked on" });
    await expect(recent).toBeVisible();
    await expect(searchPanel(page)).not.toContainText(TITLE.diary);
    await expect(searchPanel(page)).not.toContainText(PHRASE.diaryBody);
    await expect(
      searchPanel(page).getByText(/Diary entries are never listed here/i),
    ).toBeVisible();

    // …and the moment the owner types the phrase, the entry is there.
    await input.fill(PHRASE.diaryBody);
    await expect(optionFor(page, TITLE.diary)).toBeVisible();

    // Clearing returns to the recency list — and the entry disappears again.
    await input.fill("");
    await expect(recent).toBeVisible();
    await expect(searchPanel(page)).not.toContainText(TITLE.diary);
  });

  test("a phrase that exists only in a Person's notes finds nobody", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await input.fill(PHRASE.personNotes);

    // The calm no-results state, not a People row: `notes` is deliberately
    // unmatched, and this asserts it in a workspace that CONTAINS the phrase.
    await expect(searchPanel(page)).not.toContainText(TITLE.person);
    await expect(page.getByRole("option")).toHaveCount(0);

    // The Person is not hidden — their name still finds them.
    await input.fill(TITLE.person);
    await expect(optionFor(page, TITLE.person)).toBeVisible();
  });
});

test.describe("RECALL-01 — the row stays the row", () => {
  test("keeps one bounded subtitle line at 1440, 393 and 320, and passes axe", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await findByPhrase(page, input, PHRASE.meetingNotes, TITLE.meeting);

    await expectNoAxeViolations(page, { include: ".dh-search__panel" });

    for (const width of [1440, 393, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const option = optionFor(page, TITLE.meeting);
      await expect(option).toBeVisible();

      const subtitle = option.locator(".dh-search__optionsubtitle");
      const metrics = await subtitle.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          whiteSpace: style.whiteSpace,
          overflow: style.overflow,
          height: node.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(style.lineHeight) || 0,
        };
      });
      // ONE line, truncated by the existing row overflow rules — an excerpt can
      // never turn a Search row into a multi-line card.
      expect(metrics.whiteSpace, `subtitle is one line at ${width}px`).toBe(
        "nowrap",
      );
      expect(metrics.overflow).toBe("hidden");
      if (metrics.lineHeight > 0) {
        expect(
          metrics.height,
          `subtitle height stays one line at ${width}px`,
        ).toBeLessThanOrEqual(metrics.lineHeight * 1.6);
      }

      const noOverflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return doc.scrollWidth <= doc.clientWidth + 1;
      });
      expect(noOverflow, `no horizontal overflow at ${width}px`).toBe(true);
    }
  });

  test("keyboard navigation still selects and opens a content match", async ({
    page,
  }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    await findByPhrase(page, input, PHRASE.taskDescription, TITLE.task);

    const listbox = page.getByRole("listbox", { name: "Search results" });
    await input.press("ArrowDown");
    await expect(
      listbox.locator('[role="option"][aria-selected="true"]'),
    ).toHaveCount(1);
    await input.press("Enter");
    await expect(searchPanel(page)).toBeHidden();
    await expect(page).toHaveURL(/\/tasks\?.*drawer=/);
  });
});

test.describe("RECALL-01 — content matches in dark appearance", () => {
  test.use({ colorScheme: "dark" });

  test("renders a content match and passes axe in dark", async ({ page }) => {
    await page.goto("/today");
    const input = await openSearch(page);
    const option = await findByPhrase(
      page,
      input,
      PHRASE.reviewSection,
      TITLE.review,
    );
    await expect(option.locator("mark.dh-search__mark").first()).toBeVisible();
    await expectNoAxeViolations(page, { include: ".dh-search__panel" });
  });
});

test.describe("RECALL-01 — content matches on a phone", () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test("opens from the phone navigation and shows a bounded excerpt", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    await mobileNavigationOpener(page).click();
    const sheet = page.getByRole("dialog", { name: "Navigation" });
    await sheet.getByRole("button", { name: "Search", exact: true }).click();

    const input = page.getByRole("combobox", { name: "Search everything" });
    await expect(input).toBeVisible();
    const option = await findByPhrase(
      page,
      input,
      PHRASE.meetingItem,
      TITLE.meeting,
    );
    await expectContentMatch(option, "Decision", PHRASE.meetingItem);
    await expectNoAxeViolations(page, { include: ".dh-search__panel" });
  });
});
