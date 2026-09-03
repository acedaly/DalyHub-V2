import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  ownerDayPlus,
  ownerTodayIso,
  pickCalendarDayByKeyboard,
} from "./calendar-dates";
import {
  CONV02_DUE_TASKS,
  CONV02_LONG_SUBJECT,
  CONV02_SUBJECT,
  CONV02_TASKS,
  CONV02_TASK_TOTAL,
  cleanupConv02Fixture,
  fillerTitle,
  seedConv02Fixture,
} from "./conv-02-fixtures";
import { d1Query } from "./d1";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  taskRow,
  taskRows,
  waitForInteractive,
} from "./helpers";

/**
 * V2.8 CONV-02 — `/today/waiting` renders the shared Task row.
 *
 * ADR-115 decision 2: *a Task is rendered by the shared `TaskRow` wherever it
 * can be acted on.* Until this item the Waiting list was the last surface
 * drawing a read-only generic Card (DEBT-128): no completion control, no
 * editor, no menu — and it was the one surface that drew RECALL-03's follow-up
 * fact, which the shared row had no field for.
 *
 * Every journey here runs on ONE owned fixture (`conv-02-fixtures.ts`), seeded
 * once for the file, and proves a claim about what the owner can now do on the
 * Waiting list and what the SERVER holds afterwards:
 *
 *   1. the rows are the shared row, with the waiting fact on each — subject,
 *      since · elapsed, follow-up state — and no Card, grip or selection;
 *   2. the row's follow-up state is the MACHINE value the filter, the rail and
 *      `/tasks?followUp=` state (RECALL-03's parity, extended to the row);
 *   3. open the Task, edit an ordinary field from the row, change the follow-up
 *      through the canonical Details editor; all three survive a reload;
 *   4. completing departs with focus handed on, is announced once, the counts
 *      follow the server; reopening does NOT re-enter Waiting (completion
 *      cleared the waiting state) and the chase date is untouched;
 *   5. accumulated pages survive a mutation; row 51 stays reachable;
 *   6. keyboard reach and axe at 1440;
 *   7. 393 px and 320 px: the shared recomposition, the long subject wraps,
 *      the overdue wording is text, nothing overflows, axe is clean.
 *
 * Timing is by visible state and by persisted server state — never a sleep.
 */

const WAITING = "/today/waiting";
const WAITING_DUE = "/today/waiting?followUp=due";

test.beforeAll(() => {
  seedConv02Fixture();
});

test.afterAll(() => {
  cleanupConv02Fixture();
});

/** The surface's own list, so a locator can never match a row elsewhere. */
function list(page: Page): Locator {
  return page.getByRole("list", { name: "Waiting tasks" });
}

/** A fixture row's waiting fact. */
function waitingFact(page: Page, title: string): Locator {
  return taskRow(list(page), title).first().getByTestId("task-row-waiting");
}

/** The rail's follow-ups-due count, or 0 when the segment is absent. */
async function railFollowUpsDue(page: Page): Promise<number> {
  await gotoFixture(page, "/today");
  const link = page
    .getByTestId("today-attention")
    .getByRole("link", { name: /^\d+ follow-ups? due$/ });
  if ((await link.count()) === 0) return 0;
  const text = (await link.first().textContent()) ?? "";
  return Number(/(\d+)/.exec(text)?.[1] ?? "0");
}

/** Open a row's overflow menu, and make sure it STAYS open. */
async function openRowMenu(page: Page, title: string) {
  await expect
    .poll(
      async () => {
        const row = taskRow(list(page), title).first();
        const trigger = row.getByRole("button", {
          name: `More actions for ${title}`,
        });
        await row.hover();
        await trigger.click({ timeout: 4_000 }).catch(() => {});
        return await trigger.getAttribute("aria-expanded").catch(() => null);
      },
      { message: `the overflow for "${title}" should open`, timeout: 20_000 },
    )
    .toBe("true");
}

/** Open one of a row's metadata editors, and make sure it STAYS open. */
async function openCell(page: Page, title: string, testId: string) {
  await expect
    .poll(
      async () => {
        const trigger = taskRow(list(page), title)
          .first()
          .getByTestId(testId)
          .getByRole("button");
        await trigger.click();
        return await trigger.getAttribute("aria-expanded");
      },
      { message: `${testId} should open`, timeout: 15_000 },
    )
    .toBe("true");
}

test.describe("CONV-02 — the Waiting list renders the shared Task row", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test("draws every waiting Task as the shared row, with the waiting fact and no Card, grip or selection", async ({
    page,
  }) => {
    await gotoFixture(page, WAITING);
    await waitForInteractive(page);

    const rows = taskRows(list(page));
    // One page of the shared row, and none of the old anatomy.
    await expect(rows).toHaveCount(50);
    await expect(page.locator(".dh-card")).toHaveCount(0);
    await expect(page.locator(".dh-card__meta")).toHaveCount(0);
    await expect(page.locator("[data-dh-drag-item]")).toHaveCount(0);
    await expect(page.locator(".dh-taskrow__handle")).toHaveCount(0);
    await expect(page.getByTestId("task-select")).toHaveCount(0);
    await expect(
      page.getByText(
        "Showing the first 50 waiting tasks — load more to see the rest.",
      ),
    ).toBeVisible();

    // The row's controls, at rest: completion, open, the inline editors, the
    // overflow — and exactly one checkbox-like control per row.
    const title = CONV02_TASKS.dueToday.title;
    const row = taskRow(list(page), title).first();
    await expect(row).toHaveClass(/dh-taskrow/);
    await expect(
      row.getByRole("checkbox", { name: `Complete ${title}` }),
    ).toBeVisible();
    expect(await row.getByRole("checkbox").count()).toBe(1);
    await expect(
      row.getByRole("link", { name: `Open ${title}` }),
    ).toBeVisible();
    await expect(row.getByTestId("task-row-due-date")).toBeAttached();
    await expect(row.getByTestId("task-row-parent")).toContainText(
      "CONV-02 fixture project",
    );
    await expect(row.getByTestId("task-row-priority")).toContainText("P3");
    await expect(row.getByTestId("task-row-state")).toHaveText("Waiting");
    await expect(
      row.getByRole("button", { name: `More actions for ${title}` }),
    ).toBeAttached();

    // The waiting FACT: subject, since · elapsed, follow-up state in words.
    const fact = row.getByTestId("task-row-waiting");
    await expect(fact.getByTestId("task-row-waiting-subject")).toContainText(
      `Waiting for${CONV02_SUBJECT}`,
    );
    await expect(fact.getByTestId("task-row-waiting-since")).toHaveText(
      /^Since \d{1,2} \w{3} \d{4} · .+/,
    );
    await expect(fact.getByTestId("task-row-follow-up")).toHaveText(
      "Follow up due · Today",
    );
    await expect(fact).toHaveAttribute("data-follow-up-state", "due_today");
    await expect(
      waitingFact(page, CONV02_TASKS.overdue.title).getByTestId(
        "task-row-follow-up",
      ),
    ).toHaveText("Follow up overdue · Yesterday");
    await expect(
      waitingFact(page, CONV02_TASKS.upcoming.title).getByTestId(
        "task-row-follow-up",
      ),
    ).toHaveText(/^Follow up · /);
    await expect(
      waitingFact(page, CONV02_TASKS.edit.title).getByTestId(
        "task-row-follow-up",
      ),
    ).toHaveCount(0);
    // The recurrence signal follows the row's own rule.
    await expect(
      taskRow(list(page), CONV02_TASKS.repeat.title).getByTestId(
        "task-row-repeat",
      ),
    ).toContainText("Repeats: Every week");
  });

  test("the row's follow-up state is the machine value the filter, the rail and /tasks state", async ({
    page,
  }) => {
    await gotoFixture(page, WAITING);
    await waitForInteractive(page);
    // The row states each chase's state as data — the value every parity
    // assertion below compares, never the words.
    const expected: Record<string, string | null> = {
      [CONV02_TASKS.dueToday.title]: "due_today",
      [CONV02_TASKS.overdue.title]: "overdue",
      [CONV02_TASKS.upcoming.title]: "upcoming",
      [CONV02_TASKS.complete.title]: "overdue",
      [CONV02_TASKS.edit.title]: null,
    };
    for (const [title, state] of Object.entries(expected)) {
      if (state === null) {
        await expect(waitingFact(page, title)).not.toHaveAttribute(
          "data-follow-up-state",
        );
      } else {
        await expect(waitingFact(page, title)).toHaveAttribute(
          "data-follow-up-state",
          state,
        );
      }
    }

    // The FILTERED Waiting surface holds exactly the rows whose state is due
    // (overdue or due today), and none whose state is upcoming or absent.
    await gotoFixture(page, WAITING_DUE);
    await waitForInteractive(page);
    for (const due of CONV02_DUE_TASKS) {
      const fact = waitingFact(page, due.title);
      await expect(fact).toBeVisible();
      await expect(fact).toHaveAttribute(
        "data-follow-up-state",
        /^(overdue|due_today)$/,
      );
    }
    await expect(taskRow(list(page), CONV02_TASKS.upcoming.title)).toHaveCount(
      0,
    );
    await expect(taskRow(list(page), CONV02_TASKS.edit.title)).toHaveCount(0);
    await expect(taskRow(list(page), fillerTitle(0))).toHaveCount(0);
    const dueRows = await taskRows(list(page)).count();

    // Today's rail counts the SAME population — the number it links here.
    expect(await railFollowUpsDue(page)).toBe(dueRows);

    // …and `/tasks?followUp=due` returns the same rows, drawing the SAME fact
    // through the same row — no second waiting presentation anywhere.
    await gotoFixture(page, "/tasks?system=waiting&followUp=due");
    await waitForInteractive(page);
    for (const due of CONV02_DUE_TASKS) {
      const row = taskRow(page, due.title).first();
      await expect(row).toBeVisible();
      await expect(row.getByTestId("task-row-waiting")).toHaveAttribute(
        "data-follow-up-state",
        /^(overdue|due_today)$/,
      );
      await expect(row.getByTestId("task-row-waiting-subject")).toContainText(
        due.subject,
      );
    }
    await expect(taskRow(page, CONV02_TASKS.upcoming.title)).toHaveCount(0);
    // An UPCOMING chase reads as upcoming there too, with the same fact.
    await gotoFixture(page, "/tasks?system=waiting&followUp=upcoming");
    await waitForInteractive(page);
    await expect(
      taskRow(page, CONV02_TASKS.upcoming.title)
        .first()
        .getByTestId("task-row-waiting"),
    ).toHaveAttribute("data-follow-up-state", "upcoming");
    // …while an ordinary configuration draws no waiting fact at all: the
    // whole active collection narrowed to Sam's delegations (the fixture is
    // delegated to Sam), newest first — neither the Waiting view nor a
    // follow-up question.
    await gotoFixture(
      page,
      `/tasks?system=all&group=none&sort=created&dir=desc&person=${encodeURIComponent(CONV02_SUBJECT)}`,
    );
    await waitForInteractive(page);
    await expect(
      taskRow(page, CONV02_TASKS.upcoming.title).first(),
    ).toBeVisible();
    await expect(
      taskRow(page, CONV02_TASKS.upcoming.title).getByTestId(
        "task-row-waiting",
      ),
    ).toHaveCount(0);
  });

  test("opens the Task, edits a priority from the row and the follow-up through the canonical editor; the server keeps both", async ({
    page,
  }) => {
    await gotoFixture(page, WAITING);
    await waitForInteractive(page);
    const title = CONV02_TASKS.edit.title;

    // 1 — OPEN, from the row's title, into the shared Task record.
    await taskRow(list(page), title)
      .first()
      .getByRole("link", { name: `Open ${title}` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/today\/waiting\?drawer=task%3A/);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/today\/waiting$/);

    // 2 — an ORDINARY field, from the row: the priority.
    await openCell(page, title, "task-row-priority");
    await page.getByRole("menuitemradio", { name: "Priority 1" }).click();
    await expect(
      taskRow(list(page), title).first().getByTestId("task-row-priority"),
    ).toContainText("P1");

    // 3 — the FOLLOW-UP date, through the established editor: the row's
    // overflow → Open task → Details → Edit details → Follow up. No inline
    // calendar was built for this; the record's form is the one authority.
    await expect(
      waitingFact(page, title).getByTestId("task-row-follow-up"),
    ).toHaveCount(0);
    await openRowMenu(page, title);
    await page.getByRole("menuitem", { name: "Open task" }).click();
    await expect(dialog).toBeVisible();
    const record = page.getByRole("dialog", { name: "Task" });
    await record.getByRole("button", { name: "Edit details" }).click();
    await record.getByRole("button", { name: "Follow up" }).click();
    /*
     * CONV-00-E — the target is DERIVED from the owner's day and its label is
     * generated in the grid's own shape; the field is unset, so the grid opens
     * on the owner's month and the walk is counted from it, never by hand.
     */
    const picker = page.getByRole("dialog", { name: /Choose follow up/i });
    await expect(picker).toBeVisible();
    const tomorrow = ownerDayPlus(1);
    await pickCalendarDayByKeyboard(
      picker,
      picker.getByRole("grid", { name: "Follow up" }),
      ownerTodayIso(),
      tomorrow,
    );
    await expect(picker).toBeHidden();
    await record.getByRole("button", { name: "Save changes" }).click();
    await expect(
      record.getByRole("button", { name: "Edit details" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(record).toBeHidden();
    // The row draws the fact the server now holds, through its own slot.
    const followUp = waitingFact(page, title).getByTestId("task-row-follow-up");
    await expect(followUp).toHaveText("Follow up · Tomorrow", {
      timeout: 15_000,
    });
    await expect(waitingFact(page, title)).toHaveAttribute(
      "data-follow-up-state",
      "upcoming",
    );

    // The whole point of posting canonical intents: the SERVER has both.
    await page.reload();
    await waitForInteractive(page);
    await expect(
      taskRow(list(page), title).first().getByTestId("task-row-priority"),
    ).toContainText("P1");
    await expect(
      waitingFact(page, title).getByTestId("task-row-follow-up"),
    ).toHaveText("Follow up · Tomorrow");
  });

  test("completing departs with focus handed on and one announcement; the counts follow the server; reopening does not re-enter Waiting and keeps the chase date", async ({
    page,
  }) => {
    const title = CONV02_TASKS.complete.title;
    const followUpBefore = CONV02_TASKS.complete.followUpOn;
    const railBefore = await railFollowUpsDue(page);

    await gotoFixture(page, WAITING_DUE);
    await waitForInteractive(page);
    const dueBefore = await taskRows(list(page)).count();
    await expect(
      page.getByText(
        `${dueBefore} tasks are waiting on someone or something else with a follow-up due.`,
      ),
    ).toBeVisible();

    const row = taskRow(list(page), title).first();
    await row.getByRole("checkbox", { name: `Complete ${title}` }).click();
    // The row leads the server (ADR-086)…
    await expect(row).toHaveAttribute("data-completed", "true");
    // …then the loader's answer no longer holds it — completion cleared the
    // waiting state atomically — and it LEAVES.
    await expect(taskRow(list(page), title)).toHaveCount(0, {
      timeout: 15_000,
    });
    // Focus was handed to the row that took its place — never to <body>.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const active = document.activeElement;
            if (!(active instanceof HTMLElement)) return "none";
            if (active.closest("[data-testid='task-row']")) {
              return active.getAttribute("data-testid") ?? "row-control";
            }
            return active.getAttribute("aria-label") ?? active.tagName;
          }),
        {
          message:
            "focus should land on the successor row's completion control",
        },
      )
      .toBe("task-complete");
    // Announced ONCE, in the surface's one live region.
    await expect(
      page
        .locator("[role='status']")
        .filter({ hasText: `Completed ${title}.` }),
    ).toHaveCount(1);
    // The subtitle states the SERVER's count of what is loaded now.
    await expect(taskRows(list(page))).toHaveCount(dueBefore - 1);
    await expect(
      page.getByText(
        `${dueBefore - 1} tasks are waiting on someone or something else with a follow-up due.`,
      ),
    ).toBeVisible();
    // …and Today's rail follows the same server truth.
    expect(await railFollowUpsDue(page)).toBe(railBefore - 1);

    // REOPEN, where completed work is kept. Reopening restores the Task, not
    // its waiting state (TODAY-03's rule), so it does not re-enter Waiting…
    await gotoFixture(page, "/tasks?view=list&system=completed&sort=updated");
    await waitForInteractive(page);
    const done = taskRow(page, title).first();
    await expect(done).toHaveAttribute("data-completed", "true");
    await done.getByRole("checkbox", { name: `Reopen ${title}` }).click();
    await expect(done).not.toHaveAttribute("data-completed", "true");
    await expect(
      page.locator("[role='status']").filter({ hasText: `Reopened ${title}.` }),
    ).toHaveCount(1);
    await gotoFixture(page, WAITING);
    await waitForInteractive(page);
    await expect(taskRow(list(page), title)).toHaveCount(0);
    // …and the chase date the owner wrote down is UNTOUCHED by either act
    // (RECALL-03): the record holds it, open and no longer waiting.
    const [stored] = d1Query<{
      follow_up_on: string | null;
      waiting_since: string | null;
      completed_at: string | null;
    }>(
      `SELECT td.follow_up_on, td.waiting_since, sr.completed_at
         FROM task_details td
         JOIN spine_records sr ON sr.workspace_id = td.workspace_id AND sr.entity_id = td.entity_id
        WHERE td.entity_id = '${CONV02_TASKS.complete.id}'`,
    );
    expect(stored?.follow_up_on).toBe(followUpBefore);
    expect(stored?.waiting_since).toBeNull();
    expect(stored?.completed_at).toBeNull();
  });

  test("keeps the loaded pages when a mutation re-reads the list, and row 51 stays reachable", async ({
    page,
  }) => {
    await gotoFixture(page, WAITING);
    await waitForInteractive(page);
    const rows = taskRows(list(page));
    await expect(rows).toHaveCount(50);
    // The last filler is past row 50 and is NOT on the first page.
    await expect(taskRow(list(page), fillerTitle(54))).toHaveCount(0);

    /*
     * Walk the keyset to the end. The workspace's shared seed holds a few
     * waiting Tasks of its own beside this fixture's, so the total is READ
     * from the surface rather than assumed: it must be at least the fixture,
     * every fixture row must be reachable, and the subtitle must state the
     * same number the list shows.
     */
    const loadMore = page.getByRole("button", {
      name: "Load more waiting tasks",
    });
    let loaded = 50;
    for (let click = 0; click < 10; click += 1) {
      if ((await loadMore.count()) === 0) break;
      const before = loaded;
      await loadMore.click();
      await expect
        .poll(async () => rows.count(), { timeout: 20_000 })
        .toBeGreaterThan(before);
      loaded = await rows.count();
    }
    await expect(loadMore).toHaveCount(0, { timeout: 20_000 });
    expect(loaded).toBeGreaterThanOrEqual(CONV02_TASK_TOTAL);
    await expect(taskRow(list(page), fillerTitle(54))).toBeVisible();
    await expect(
      page.getByText(
        `${loaded} tasks are waiting on someone or something else.`,
      ),
    ).toBeVisible();

    // Complete a page-ONE row. The re-read merges the fresh first page in by
    // id; the second page is still there, and the owner is not dropped back
    // to the first fifty.
    const title = CONV02_TASKS.pageOne.title;
    await taskRow(list(page), title)
      .first()
      .getByRole("checkbox", { name: `Complete ${title}` })
      .click();
    await expect(
      page
        .locator("[role='status']")
        .filter({ hasText: `Completed ${title}.` }),
    ).toHaveCount(1);
    await expect(taskRow(list(page), title)).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(rows).toHaveCount(loaded - 1);
    await expect(taskRow(list(page), fillerTitle(54))).toBeVisible();
    await expect(loadMore).toHaveCount(0);
    await expect(
      page.getByText(
        `${loaded - 1} tasks are waiting on someone or something else.`,
      ),
    ).toBeVisible();
  });

  test("the keyboard reaches the editors and the menu, the fact is text, and the surface is axe-clean", async ({
    page,
  }) => {
    await gotoFixture(page, WAITING);
    await waitForInteractive(page);
    const title = CONV02_TASKS.overdue.title;
    const row = taskRow(list(page), title).first();
    // Tab order inside a row: completion → title → date → project → priority → ⋯
    // The waiting fact is TEXT on the way: nothing in it takes a stop.
    await row.getByRole("checkbox").focus();
    await page.keyboard.press("Tab");
    await expect(
      row.getByRole("link", { name: `Open ${title}` }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      row.getByTestId("task-row-due-date").getByRole("button"),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      row.getByTestId("task-row-parent").getByRole("button"),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      row.getByTestId("task-row-priority").getByRole("button"),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    const overflow = row.getByRole("button", {
      name: `More actions for ${title}`,
    });
    await expect(overflow).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Plan for today" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(overflow).toBeFocused();
    expect(
      await row
        .getByTestId("task-row-waiting")
        .locator("a, button, input")
        .count(),
    ).toBe(0);

    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await gotoFixture(page, WAITING_DUE);
    await waitForInteractive(page);
    await expectNoAxeViolations(page);
  });
});

for (const width of [393, 320] as const) {
  test.describe(`CONV-02 — the Waiting list on a ${width}px phone`, () => {
    test.use({
      viewport: { width, height: 852 },
      isMobile: true,
      hasTouch: true,
    });

    test(`recomposes the shared row, wraps a long subject, keeps the overdue words, and is axe-clean at ${width}px`, async ({
      page,
    }) => {
      await gotoFixture(page, WAITING);
      await waitForInteractive(page);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator(".dh-card")).toHaveCount(0);

      const title = CONV02_TASKS.longSubject.title;
      const row = taskRow(list(page), title).first();
      await expect(row).toBeVisible();
      await expect(row).toHaveClass(/dh-taskrow/);
      // The shared row's phone composition: the meta line is a real flex
      // container, the waiting fact is a line of its own under it.
      await expect(row.locator(".dh-taskrow__meta")).toHaveCSS(
        "display",
        "flex",
      );
      const fact = row.getByTestId("task-row-waiting");
      await expect(fact).toBeVisible();
      await expect(fact.getByTestId("task-row-waiting-subject")).toContainText(
        CONV02_LONG_SUBJECT,
      );
      // The state is WORDS, at this width too — never a colour alone.
      await expect(fact.getByTestId("task-row-follow-up")).toHaveText(
        /^Follow up overdue · /,
      );
      // The long subject stays inside the viewport: it wraps, it does not
      // take the document wide (the old Card ladder hid it to avoid exactly
      // this), and priority is still on the row.
      const box = await fact.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      await expect(row.getByTestId("task-row-priority")).toContainText("P3");
      // The row's actions are usable at the touch floor.
      await expectMinTouchTarget(
        row.getByRole("button", { name: `More actions for ${title}` }),
      );
      // The completion control's TARGET is its 44px label box, which the
      // shared `.dh-check-circle-target` draws around the 20px ring.
      await expectMinTouchTarget(
        row.getByRole("checkbox", { name: `Complete ${title}` }).locator(".."),
      );

      await expectNoHorizontalOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await expectNoAxeViolations(page);
    });
  });
}
