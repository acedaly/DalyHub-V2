import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  CONV01_COMPLETED_AT_SEED,
  CONV01_DESTINATION,
  CONV01_PROJECT,
  CONV01_TASKS,
  CONV01_TASK_TOTAL,
  cleanupConv01Fixture,
  seedConv01Fixture,
} from "./conv-01-fixtures";
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
 * V2.8 CONV-01 — the Project record renders the shared Task row.
 *
 * ADR-115 decision 2: *a Task is rendered by the shared `TaskRow` wherever it
 * can be acted on, and exposes every action valid in that scope.* Until this
 * item the Project record's Tasks tab was the last surface drawing a generic
 * Card with hand-built props (DEBT-175), and it could not rename, select, act
 * in bulk, show a repeat, swipe, or depart with focus handed on — and below
 * 26rem it hid priority altogether.
 *
 * Every journey here runs on ONE Project record over a fixture this file owns
 * (`conv-01-fixtures.ts`), seeded once for the file, and proves a claim about
 * what the owner can now do there and what the SERVER holds afterwards:
 *
 *   1. the rows are the shared row — and carry no drag grip, because this scope
 *      draws no destination and stores no order (DEBT-188 stands);
 *   2. rename, due date and priority, from the row, survive a reload;
 *   3. completing on Open departs with focus handed on and is announced once;
 *      the Project's progress band follows the ACCEPTED save; reopen is the
 *      symmetric act on All;
 *   4. a Task moved to another Project from the row leaves this Project;
 *   5. three selected rows and one bulk action are ONE `/tasks/bulk` request;
 *   6. at 393px the row recomposes rather than hiding facts — priority stays
 *      reachable, nothing overflows, axe is clean;
 *   7. at 1440 the keyboard reaches the editors, the menu and selection, and
 *      axe is clean.
 *
 * Timing is by visible state and by persisted server state — never a sleep.
 */

const RECORD = `/projects/${CONV01_PROJECT.id}`;

test.beforeAll(() => {
  seedConv01Fixture();
});

test.afterAll(() => {
  cleanupConv01Fixture();
});

/** The tab's own list, so a locator can never match a row elsewhere on the page. */
function tab(page: Page): Locator {
  return page.getByRole("list", { name: "Project tasks" });
}

/** The record's progress meter, read as `[completed, total]`. */
async function progress(page: Page): Promise<readonly [number, number]> {
  const text =
    (await page
      .getByRole("progressbar", { name: "Tasks" })
      .getAttribute("aria-valuetext")) ?? "";
  const match = /(\d+) of (\d+) tasks/.exec(text);
  if (!match) throw new Error(`unreadable progress: "${text}"`);
  return [Number(match[1]), Number(match[2])];
}

/** Wait until the record's progress band reports exactly this pair. */
async function expectProgress(
  page: Page,
  completed: number,
  total: number,
): Promise<void> {
  await expect
    .poll(() => progress(page), {
      message: `the Project's progress band should read ${completed} of ${total}`,
    })
    .toEqual([completed, total]);
}

/**
 * Open a row's overflow menu, and make sure it STAYS open — an accepted change
 * re-reads the record a beat after the value lands, which can remount a menu
 * opened into that window. The same idiom `dhds-10-inline-manipulation` uses.
 */
async function openRowMenu(page: Page, title: string) {
  await expect
    .poll(
      async () => {
        const row = taskRow(tab(page), title).first();
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
        const trigger = taskRow(tab(page), title)
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

test.describe("CONV-01 — the Project record renders the shared Task row", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test("draws every task as the shared row, with its signals and no drag grip", async ({
    page,
  }) => {
    await gotoFixture(page, `${RECORD}?tasks=all`);
    await waitForInteractive(page);

    const rows = taskRows(tab(page));
    await expect(rows).toHaveCount(CONV01_TASK_TOTAL);
    // The old anatomy is gone from the tab: no generic Card, no Card metadata.
    await expect(page.locator(".dh-project-tasks .dh-card")).toHaveCount(0);
    await expect(page.locator(".dh-project-tasks .dh-card__meta")).toHaveCount(
      0,
    );
    // No grip, no drag item: the scope draws no destination and stores no order.
    await expect(
      page.locator(".dh-project-tasks .dh-taskrow__handle"),
    ).toHaveCount(0);
    await expect(
      page.locator(".dh-project-tasks [data-dh-drag-item]"),
    ).toHaveCount(0);

    // The facts the Card path lacked: the recurrence signal and the priority
    // editor, drawn by the row's own rules.
    const repeat = taskRow(tab(page), CONV01_TASKS.repeat.title);
    await expect(repeat.getByTestId("task-row-repeat")).toBeAttached();
    await expect(repeat.getByTestId("task-row-repeat")).toContainText(
      "Repeats: Every week",
    );
    await expect(
      repeat.getByTestId("task-row-priority").getByRole("button"),
    ).toBeAttached();
    // The seeded completion renders the row's canonical completed state.
    const done = taskRow(tab(page), CONV01_TASKS.done.title);
    await expect(done).toHaveAttribute("data-completed", "true");
    await expect(
      done.getByRole("checkbox", { name: `Reopen ${CONV01_TASKS.done.title}` }),
    ).toBeChecked();
    // One checkbox-like control per row at rest (V2.4-GATE-02's invariant).
    for (const row of await rows.all()) {
      expect(await row.getByRole("checkbox").count()).toBe(1);
    }
    await expectProgress(page, CONV01_COMPLETED_AT_SEED, CONV01_TASK_TOTAL);
  });

  test("renames, dates and prioritises a task from the row, and the server keeps all three", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    await waitForInteractive(page);

    // 1 — the TITLE, from the row's overflow.
    const before = CONV01_TASKS.rename.title;
    const renamed = `${before} (renamed)`;
    await openRowMenu(page, before);
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = page.getByRole("textbox", { name: `Rename ${before}` });
    await input.fill(renamed);
    await input.press("Enter");
    await expect(taskRow(tab(page), renamed).first()).toBeVisible();

    // 2 — the DUE DATE, from the row.
    const dated = CONV01_TASKS.date.title;
    await openCell(page, dated, "task-row-due-date");
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(
      taskRow(tab(page), dated).first().getByTestId("task-row-due-date"),
    ).toContainText("Tomorrow");

    // 3 — the PRIORITY, from the row.
    const prioritised = CONV01_TASKS.priority.title;
    await openCell(page, prioritised, "task-row-priority");
    await page.getByRole("menuitemradio", { name: "Priority 1" }).click();
    await expect(
      taskRow(tab(page), prioritised).first().getByTestId("task-row-priority"),
    ).toContainText("P1");

    // The whole point of posting canonical intents: the SERVER has all three.
    await page.reload();
    await waitForInteractive(page);
    await expect(taskRow(tab(page), renamed).first()).toBeVisible();
    await expect(
      taskRow(tab(page), dated).first().getByTestId("task-row-due-date"),
    ).toContainText("Tomorrow");
    await expect(
      taskRow(tab(page), prioritised).first().getByTestId("task-row-priority"),
    ).toContainText("P1");
  });

  test("completing on Open departs with focus handed on, is announced once, and moves the progress band; reopen is symmetric on All", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    await waitForInteractive(page);
    const [doneBefore, total] = await progress(page);

    const title = CONV01_TASKS.complete.title;
    const row = taskRow(tab(page), title).first();
    const checkbox = row.getByRole("checkbox", { name: `Complete ${title}` });
    await checkbox.click();

    // The row leads the server (ADR-086)…
    await expect(row).toHaveAttribute("data-completed", "true");
    // …then the loader's answer no longer holds it, and it LEAVES the Open scope.
    await expect(taskRow(tab(page), title)).toHaveCount(0, { timeout: 15_000 });
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
    // Announced ONCE, in the tab's one live region.
    await expect(
      page
        .locator("[role='status']")
        .filter({ hasText: `Completed ${title}.` }),
    ).toHaveCount(1);
    // The Project's own facts follow the ACCEPTED save.
    await expectProgress(page, doneBefore + 1, total);

    // Reopen, on the scope that keeps completed work.
    await gotoFixture(page, `${RECORD}?tasks=all`);
    await waitForInteractive(page);
    const reopenTitle = CONV01_TASKS.done.title;
    const doneRow = taskRow(tab(page), reopenTitle).first();
    await expect(doneRow).toHaveAttribute("data-completed", "true");
    await doneRow
      .getByRole("checkbox", { name: `Reopen ${reopenTitle}` })
      .click();
    await expect(doneRow).not.toHaveAttribute("data-completed", "true");
    // On All the row STAYS — completed work is this scope's membership rule.
    await expect(taskRow(tab(page), reopenTitle)).toHaveCount(1);
    await expect(
      page
        .locator("[role='status']")
        .filter({ hasText: `Reopened ${reopenTitle}.` }),
    ).toHaveCount(1);
    await expectProgress(page, doneBefore, total);
    await page.reload();
    await waitForInteractive(page);
    await expect(
      taskRow(tab(page), reopenTitle)
        .first()
        .getByRole("checkbox", { name: `Complete ${reopenTitle}` }),
    ).toBeVisible();
  });

  test("moves a task to another Project from the row, and it leaves this Project", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    await waitForInteractive(page);
    const [done, totalBefore] = await progress(page);
    const title = CONV01_TASKS.move.title;

    // DHDS-10 §11 — the escape hatch is a PICKER over the row, not the record.
    const before = page.url();
    await openCell(page, title, "task-row-parent");
    await page
      .getByRole("menuitem", { name: /Search all Projects and Areas/ })
      .click();
    const picker = page.getByRole("dialog", { name: /Project or Area/i });
    await expect(picker).toBeVisible();
    expect(page.url(), "the escape hatch must not navigate").toBe(before);
    await page.getByRole("combobox").fill("CONV-01 destination");
    await page
      .getByRole("option", { name: new RegExp(CONV01_DESTINATION.title) })
      .first()
      .click();

    // The Task is no longer this Project's, so its row leaves this scope…
    await expect(taskRow(tab(page), title)).toHaveCount(0, { timeout: 15_000 });
    // …and the record's total follows the accepted save.
    await expectProgress(page, done, totalBefore - 1);
    // The server has it under the destination.
    await gotoFixture(page, `/projects/${CONV01_DESTINATION.id}`);
    await waitForInteractive(page);
    await expect(taskRow(tab(page), title).first()).toBeVisible();
  });

  test("selects three rows and completes them with ONE /tasks/bulk request; the record follows", async ({
    page,
  }) => {
    await gotoFixture(page, RECORD);
    await waitForInteractive(page);
    const [doneBefore, total] = await progress(page);
    const titles = [
      CONV01_TASKS.bulkOne.title,
      CONV01_TASKS.bulkTwo.title,
      CONV01_TASKS.bulkThree.title,
    ];

    await page.getByTestId("project-tasks-select").click();
    // In selection mode the selection control REPLACES completion (one control).
    await expect(tab(page).getByTestId("task-select").first()).toBeVisible();
    await expect(tab(page).getByTestId("task-complete")).toHaveCount(0);
    for (const title of titles) {
      await page.getByRole("checkbox", { name: `Select ${title}` }).check();
    }
    const bar = page.getByRole("group", { name: "Bulk task actions" });
    await expect(bar).toContainText("3 selected");

    /*
     * ONE request, to the canonical route. The bar submits through a router
     * fetcher, so under single-fetch the browser posts to `/tasks/bulk.data`;
     * the pathname is matched on its route half, and the ids are read from
     * the raw multipart body rather than re-parsed as a query string.
     */
    const request = page.waitForRequest(
      (candidate) =>
        candidate.method() === "POST" &&
        /^\/tasks\/bulk(?:\.data)?$/.test(new URL(candidate.url()).pathname),
    );
    await bar.getByRole("button", { name: "Complete", exact: true }).click();
    const posted = await request;
    const body = posted.postData() ?? "";
    expect(body).toContain("complete");
    const selectedIds: readonly string[] = [
      CONV01_TASKS.bulkOne.id,
      CONV01_TASKS.bulkTwo.id,
      CONV01_TASKS.bulkThree.id,
    ];
    for (const id of selectedIds) expect(body).toContain(id);
    // …and ONLY those three: no other fixture Task rode along.
    for (const task of Object.values(CONV01_TASKS)) {
      if (!selectedIds.includes(task.id)) expect(body).not.toContain(task.id);
    }

    // The outcome is announced once, the selection ends with the act, the rows
    // leave the Open scope, and the record's band reports the accepted change.
    await expect(
      page
        .locator("[role='status']")
        .filter({ hasText: "3 tasks completed, 0 unchanged." }),
    ).toHaveCount(1);
    await expect(bar).toHaveCount(0);
    for (const title of titles) {
      await expect(taskRow(tab(page), title)).toHaveCount(0, {
        timeout: 15_000,
      });
    }
    await expect(tab(page).getByTestId("task-complete").first()).toBeVisible();
    await expectProgress(page, doneBefore + 3, total);
  });

  test("the keyboard reaches the editors, the menu and selection, and the record is axe-clean", async ({
    page,
  }) => {
    await gotoFixture(page, `${RECORD}?tasks=all`);
    await waitForInteractive(page);

    const title = CONV01_TASKS.repeat.title;
    const row = taskRow(tab(page), title).first();
    // Tab order inside a row: completion → title → date → project → priority → ⋯
    await row.getByRole("checkbox").focus();
    await page.keyboard.press("Tab");
    await expect(
      row.getByRole("link", { name: `Open ${title}` }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      row.getByTestId("task-row-scheduled-date").getByRole("button"),
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
    // Open, read, close — and focus comes back to where it was.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overflow).toBeFocused();

    // Selection from the keyboard, through the toolbar's toggle.
    await page.getByTestId("project-tasks-select").focus();
    await page.keyboard.press("Enter");
    const select = page.getByRole("checkbox", { name: `Select ${title}` });
    await select.focus();
    await page.keyboard.press("Space");
    await expect(select).toBeChecked();
    await expect(
      page.getByRole("group", { name: "Bulk task actions" }),
    ).toContainText("1 selected");
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(
      page.getByRole("group", { name: "Bulk task actions" }),
    ).toHaveCount(0);
    await expectNoAxeViolations(page);
  });
});

test.describe("CONV-01 — the Project record on a phone", () => {
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });

  test("at 393px the shared row recomposes, priority stays reachable, nothing overflows, axe is clean", async ({
    page,
  }) => {
    await gotoFixture(page, `${RECORD}?tasks=all`);
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);

    // The shared row's phone composition, not the old Card's: no Card, and the
    // row's own two-line grid (its meta line is a real flex container here).
    await expect(page.locator(".dh-project-tasks .dh-card")).toHaveCount(0);
    const title = CONV01_TASKS.date.title;
    const row = taskRow(tab(page), title).first();
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/dh-taskrow/);
    await expect(row.locator(".dh-taskrow__meta")).toHaveCSS("display", "flex");

    // PRIORITY is on the row at this width — the fact the old ladder hid — and
    // it is the inline EDITOR, at the touch floor, opening the shared sheet.
    const priority = row.getByTestId("task-row-priority").getByRole("button");
    await expect(priority).toBeVisible();
    // On screen before it is measured: `elementsFromPoint` sees the viewport.
    await priority.scrollIntoViewIfNeeded();
    /*
     * The row's HIT AREA is the floor even though its ink is not: the shared
     * row extends each metadata target with a pseudo-element on the block
     * axis (`task-list.css`), which a bounding box cannot see. So this asks
     * the layout what is actually hittable at the control's centre — the same
     * measurement `dhds-10-inline-manipulation.spec.ts` makes on `/tasks`.
     */
    await expect
      .poll(
        async () => {
          const box = await priority.boundingBox();
          if (box === null) return 0;
          return page.evaluate(
            ({ x, y }) => {
              let top = y;
              let bottom = y;
              const hits = (py: number) =>
                document
                  .elementsFromPoint(x, py)
                  .some((node) => node.closest(".dh-inline-edit__trigger"));
              while (top > 0 && hits(top - 1)) top -= 1;
              while (bottom < window.innerHeight - 1 && hits(bottom + 1)) {
                bottom += 1;
              }
              return bottom - top;
            },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          );
        },
        { message: "the row's priority target meets the touch floor" },
      )
      .toBeGreaterThanOrEqual(43.5);
    await priority.click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("menuitemradio", { name: "Priority 2" }).click();
    await expect(row.getByTestId("task-row-priority")).toContainText("P2");
    // The recurrence signal follows the row's own rule here too.
    await expect(
      taskRow(tab(page), CONV01_TASKS.repeat.title).getByTestId(
        "task-row-repeat",
      ),
    ).toBeAttached();
    // The overflow is reachable at the touch floor.
    await expectMinTouchTarget(
      row.getByRole("button", { name: `More actions for ${title}` }),
    );

    await expectNoHorizontalOverflow(page);
    // Scanned from the top of the page, as every other phone scan is: a
    // control left half-under the sticky bar by the scroll the measurement
    // above needed is a scroll offset, not a fact about the row.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoAxeViolations(page);
  });
});
