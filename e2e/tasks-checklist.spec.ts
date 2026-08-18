/**
 * TASKS-13 — Task checklists, driven end to end against the development-auth
 * server over real (seeded) D1.
 *
 * The journeys are the product's claims, in order:
 *
 *   - a checklist is built, edited, ticked, reordered and deleted from the Task
 *     record, entirely by keyboard;
 *   - the order and the ticks SURVIVE a reload, because they are rows;
 *   - a checklist item is never a Task: not in the Tasks collection, not on
 *     Today, not in Weekly Planning, not in search as a record of its own;
 *   - completing every step does not complete the Task, and completing a Task
 *     with unfinished steps is allowed and rewrites nothing;
 *   - a recurring Task's successor arrives with the STRUCTURE and no ticks;
 *   - the phone experience is intentional at 390 and does not overflow at 320;
 *   - a checklist tick made OFFLINE is queued and replayed exactly once.
 */

import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { d1Query, sqlLiteral } from "./d1";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  ownerToday,
  taskRow,
} from "./helpers";
import {
  cleanupAllChecklistTasks,
  removeChecklistTask,
  seedChecklistTask,
  WORKSPACE_ID,
} from "./checklist-fixtures";

/** The Tasks list with no grouping, newest first — where a seeded row is first. */
const TASKS_URL = "/tasks?view=list&group=none&sort=created&dir=desc";

function recordUrl(taskId: string): string {
  return `/tasks?view=list&group=none&sort=created&dir=desc&drawer=task%3A${taskId}`;
}

function record(page: Page): Locator {
  return page.getByRole("dialog");
}

function checklist(page: Page): Locator {
  return record(page).getByTestId("task-checklist");
}

/** The checklist rows, in the order the record draws them. */
function steps(page: Page): Locator {
  return checklist(page).getByTestId("checklist-item");
}

/** The step titles, read from the accessible names of their check controls. */
async function stepTitles(page: Page): Promise<string[]> {
  return checklist(page)
    .getByTestId("checklist-toggle")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label") ?? ""),
    );
}

/** Add one step through the composer, finishing rather than continuing. */
async function addStep(page: Page, title: string): Promise<void> {
  const before = await steps(page).count();
  await checklist(page).getByTestId("checklist-add").click();
  const composer = checklist(page).getByTestId("checklist-composer");
  await expect(composer).toBeFocused();
  await composer.fill(title);
  await composer.press("Meta+Enter");
  await expect(steps(page)).toHaveCount(before + 1);
}

/** This Task's checklist rows, straight from the database. */
function storedChecklist(
  taskId: string,
): readonly { title: string; position: number; completed: number }[] {
  return d1Query<{ title: string; position: number; completed: number }>(
    `SELECT title, position, completed FROM task_checklist_items
      WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND task_id = ${sqlLiteral(taskId)}
      ORDER BY position, created_at, id`,
  );
}

test.afterAll(() => {
  cleanupAllChecklistTasks();
});

/* -------------------------------------------------------------------------- */
/* Building a checklist                                                       */
/* -------------------------------------------------------------------------- */

test.describe("TASKS-13 — building a checklist on the Task record", () => {
  const TASK_ID = "e2e-cl-build";

  test.beforeEach(() => {
    seedChecklistTask({ id: TASK_ID, title: "Prepare camper for trip" });
  });

  test.afterEach(() => {
    removeChecklistTask(TASK_ID);
  });

  test("adds the first item from a restrained affordance", async ({ page }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const panel = checklist(page);
    await expect(panel).toBeVisible();
    // A Task with no checklist costs ONE subtle control, not an empty-state card.
    await expect(panel.getByTestId("checklist-add")).toHaveText(
      "Add checklist",
    );
    await expect(panel.getByTestId("checklist-progress")).toHaveCount(0);

    await addStep(page, "Check tyre pressures");

    await expect(
      panel.getByRole("checkbox", { name: "Check tyre pressures" }),
    ).toBeVisible();
    await expect(panel.getByTestId("checklist-progress")).toHaveText(
      /0 of 1 complete/,
    );
    // The affordance now offers the next STEP rather than the first checklist.
    await expect(panel.getByTestId("checklist-add")).toHaveText("Add item");
  });

  test("adds several with the keyboard — Enter saves and opens the next", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await checklist(page).getByTestId("checklist-add").click();
    const composer = checklist(page).getByTestId("checklist-composer");

    for (const title of [
      "Check tyre pressures",
      "Fill water tanks",
      "Charge batteries",
    ]) {
      await composer.fill(title);
      await composer.press("Enter");
      // The input stays, cleared and focused: the list is typed in one flow.
      await expect(composer).toHaveValue("");
      await expect(composer).toBeFocused();
    }
    await composer.press("Escape");

    await expect(steps(page)).toHaveCount(3);
    expect(await stepTitles(page)).toEqual([
      "Check tyre pressures",
      "Fill water tanks",
      "Charge batteries",
    ]);
    // Written as ROWS, densely ordered — not as text in a description.
    expect(storedChecklist(TASK_ID)).toEqual([
      { title: "Check tyre pressures", position: 0, completed: 0 },
      { title: "Fill water tanks", position: 1, completed: 0 },
      { title: "Charge batteries", position: 2, completed: 0 },
    ]);
  });

  test("keeps a long step readable rather than truncating it into uselessness", async ({
    page,
  }) => {
    const long =
      "Confirm that the camper registration and roadside assistance are both current";
    await gotoFixture(page, recordUrl(TASK_ID));
    await addStep(page, long);

    const row = steps(page).first();
    const label = row.locator(".dh-checklist__label");
    await expect(label).toContainText(long);
    // It WRAPS: the row grows past one line rather than clipping the sentence.
    const box = await row.boundingBox();
    expect(box!.height).toBeGreaterThan(44);
    await expectNoHorizontalOverflow(page);
  });
});

/* -------------------------------------------------------------------------- */
/* Editing an existing checklist                                              */
/* -------------------------------------------------------------------------- */

test.describe("TASKS-13 — editing an existing checklist", () => {
  const TASK_ID = "e2e-cl-edit";

  test.beforeEach(() => {
    seedChecklistTask({
      id: TASK_ID,
      title: "Prepare camper for trip",
      items: [
        { title: "Check tyre pressures" },
        { title: "Fill water tanks" },
        { title: "Charge batteries" },
        { title: "Pack the fridge" },
      ],
    });
  });

  test.afterEach(() => {
    removeChecklistTask(TASK_ID);
  });

  test("reads its progress as two numbers, never a percentage", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const progress = checklist(page).getByTestId("checklist-progress");
    await expect(progress).toHaveText(/0 of 4 complete/);
    await expect(progress).not.toContainText("%");
  });

  test("completes and uncompletes one step, leaving its neighbours alone", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const panel = checklist(page);
    const second = panel.getByRole("checkbox", { name: "Fill water tanks" });

    await second.click();
    await expect(second).toBeChecked();
    await expect(panel.getByTestId("checklist-progress")).toHaveText(
      /1 of 4 complete/,
    );
    await expect
      .poll(() => storedChecklist(TASK_ID).map((item) => item.completed))
      .toEqual([0, 1, 0, 0]);

    await second.click();
    await expect(second).not.toBeChecked();
    await expect(panel.getByTestId("checklist-progress")).toHaveText(
      /0 of 4 complete/,
    );
  });

  test("renames a step through the shared inline field", async ({ page }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const panel = checklist(page);
    await panel
      .getByRole("button", { name: /^Step: Charge batteries/ })
      .click();
    const input = panel.getByRole("textbox", {
      name: /^Step: Charge batteries/,
    });
    await input.fill("Charge the leisure batteries");
    await input.press("Enter");

    await expect(
      panel.getByRole("checkbox", { name: "Charge the leisure batteries" }),
    ).toBeVisible();
    await expect
      .poll(() => storedChecklist(TASK_ID).map((item) => item.title))
      .toEqual([
        "Check tyre pressures",
        "Fill water tanks",
        "Charge the leisure batteries",
        "Pack the fridge",
      ]);
  });

  test("reorders through Move up, and the positions stay dense", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await steps(page)
      .nth(2)
      .getByRole("button", { name: /More actions for Charge batteries/ })
      .click();
    await page.getByRole("menuitem", { name: "Move up" }).click();

    await expect
      .poll(async () => stepTitles(page))
      .toEqual([
        "Check tyre pressures",
        "Charge batteries",
        "Fill water tanks",
        "Pack the fridge",
      ]);
    expect(storedChecklist(TASK_ID).map((item) => item.position)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  test("deletes a step, closes the gap and keeps focus in the list", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await steps(page)
      .nth(1)
      .getByRole("button", { name: /More actions for Fill water tanks/ })
      .click();
    await page.getByRole("menuitem", { name: "Delete item" }).click();

    await expect(steps(page)).toHaveCount(3);
    expect(await stepTitles(page)).toEqual([
      "Check tyre pressures",
      "Charge batteries",
      "Pack the fridge",
    ]);
    // Focus lands on the step that took its place, never on the document body.
    await expect(
      checklist(page).getByRole("checkbox", { name: "Charge batteries" }),
    ).toBeFocused();
    expect(storedChecklist(TASK_ID).map((item) => item.position)).toEqual([
      0, 1, 2,
    ]);
  });

  test("survives a reload — the order and the ticks are STORED", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await checklist(page)
      .getByRole("checkbox", { name: "Pack the fridge" })
      .click();
    await steps(page)
      .nth(3)
      .getByRole("button", { name: /More actions for Pack the fridge/ })
      .click();
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await expect
      .poll(async () => (await stepTitles(page))[2])
      .toBe("Pack the fridge");

    await page.reload();
    await expect(checklist(page)).toBeVisible();
    expect(await stepTitles(page)).toEqual([
      "Check tyre pressures",
      "Fill water tanks",
      "Pack the fridge",
      "Charge batteries",
    ]);
    await expect(
      checklist(page).getByRole("checkbox", { name: "Pack the fridge" }),
    ).toBeChecked();
  });

  test("is reachable and operable entirely by keyboard", async ({ page }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const first = checklist(page).getByRole("checkbox", {
      name: "Check tyre pressures",
    });

    // Space on the focused checkbox completes it — no pointer anywhere.
    await first.focus();
    await page.keyboard.press("Space");
    await expect(first).toBeChecked();

    // The item menu opens and moves the step from the keyboard alone.
    await steps(page)
      .nth(0)
      .getByRole("button", { name: /More actions for Check tyre pressures/ })
      .focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Move down" }).press("Enter");
    await expect
      .poll(async () => (await stepTitles(page))[1])
      .toBe("Check tyre pressures");

    // And a new step is added without leaving the keyboard.
    await checklist(page).getByTestId("checklist-add").focus();
    await page.keyboard.press("Enter");
    const composer = checklist(page).getByTestId("checklist-composer");
    await expect(composer).toBeFocused();
    await page.keyboard.type("Empty the toilet cassette");
    await page.keyboard.press("Enter");
    await expect(steps(page)).toHaveCount(5);
  });

  test("has no accessibility violations, in light and in dark", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await expect(checklist(page)).toBeVisible();
    await expectNoAxeViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(checklist(page)).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

/* -------------------------------------------------------------------------- */
/* A checklist item is not a Task                                             */
/* -------------------------------------------------------------------------- */

test.describe("TASKS-13 — a checklist item is not a Task", () => {
  const TASK_ID = "e2e-cl-notatask";
  const TITLE = "Prepare camper for the coast";
  const STEP = "Check the tyre pressures thoroughly";

  test.beforeEach(() => {
    seedChecklistTask({
      id: TASK_ID,
      title: TITLE,
      scheduledDate: ownerToday(),
      items: [{ title: STEP, completed: true }, { title: "Fill water tanks" }],
    });
  });

  test.afterEach(() => {
    removeChecklistTask(TASK_ID);
  });

  test("appears ONCE in the Tasks collection, with its progress and no steps", async ({
    page,
  }) => {
    await gotoFixture(page, TASKS_URL);
    const row = taskRow(page, TITLE);
    await expect(row).toHaveCount(1);
    // The compact figure, in the row's own words.
    await expect(row.getByTestId("task-row-checklist")).toHaveText("1 of 2");
    // The STEPS are not rows: the collection is a list of commitments.
    await expect(page.getByRole("link", { name: `Open ${STEP}` })).toHaveCount(
      0,
    );
    await expect(page.getByText(STEP, { exact: true })).toHaveCount(0);
  });

  test("does not make the Task row taller at 1440 or 1280", async ({
    page,
  }) => {
    // MEASURED, because "it costs no height" is the claim that justifies putting
    // the figure on the row at all.
    seedChecklistTask({
      id: "e2e-cl-plain",
      title: "A task with no steps at all",
    });
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
    ] as const) {
      await page.setViewportSize({ width, height });
      await gotoFixture(page, TASKS_URL);
      const withList = await taskRow(page, TITLE).boundingBox();
      const without = await taskRow(
        page,
        "A task with no steps at all",
      ).boundingBox();
      expect(withList!.height, `${width}px`).toBe(without!.height);
    }
    removeChecklistTask("e2e-cl-plain");
  });

  test("stops drawing the figure on a phone, where it would wrap the title", async ({
    page,
  }) => {
    /*
     * The measured decision. Below `md` the row is two stacked lines and the
     * title has its narrowest measure, so five characters beside it take width
     * off the title rather than sitting in spare space: MEASURED at 100px
     * against 81px for the same row without a checklist. The count is one tap
     * away in the record.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, TASKS_URL);
    await expect(taskRow(page, TITLE)).toBeVisible();
    await expect(
      taskRow(page, TITLE).getByTestId("task-row-checklist"),
    ).toBeHidden();

    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoFixture(page, TASKS_URL);
    await expect(
      taskRow(page, TITLE).getByTestId("task-row-checklist"),
    ).toBeVisible();
  });

  test("puts no step on Today", async ({ page }) => {
    await gotoFixture(page, "/today");
    await expect(page.getByRole("link", { name: `Open ${TITLE}` })).toHaveCount(
      1,
    );
    await expect(page.getByText(STEP, { exact: true })).toHaveCount(0);
  });

  test("puts no step in Weekly Planning", async ({ page }) => {
    await gotoFixture(page, "/plan");
    await expect(page.getByText(STEP, { exact: true })).toHaveCount(0);
    // The Task itself is there exactly once — a checklist does not multiply it.
    await expect(page.getByRole("link", { name: `Open ${TITLE}` })).toHaveCount(
      1,
    );
  });

  test("is found through search as the parent TASK, never as a record", async ({
    page,
  }) => {
    // `/search` is the product's one search authority — a JSON resource route the
    // palette and the search surface both read — so the assertion is made against
    // it directly rather than against one of its two presentations.
    await gotoFixture(page, TASKS_URL);
    const body = await page.evaluate(async () => {
      const response = await fetch("/search?q=tyre%20pressures%20thoroughly", {
        headers: { Accept: "application/json" },
      });
      return (await response.json()) as {
        groups: {
          entityType?: string;
          results: { title: string; entityType?: string }[];
        }[];
      };
    });
    const results = body.groups.flatMap((group) => group.results);
    // The parent TASK is the hit.
    expect(results.map((hit) => hit.title)).toContain(TITLE);
    // The step is not: it has no route, no record and no result of its own.
    expect(results.map((hit) => hit.title)).not.toContain(STEP);
    expect(results.every((hit) => hit.entityType !== "checklist_item")).toBe(
      true,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Completion semantics                                                       */
/* -------------------------------------------------------------------------- */

test.describe("TASKS-13 — completion semantics", () => {
  const TASK_ID = "e2e-cl-completion";

  test.beforeEach(() => {
    seedChecklistTask({
      id: TASK_ID,
      title: "Prepare camper before Friday",
      items: [{ title: "Check tyre pressures" }, { title: "Fill water tanks" }],
    });
  });

  test.afterEach(() => {
    removeChecklistTask(TASK_ID);
  });

  test("ticking every step does NOT complete the Task, and says so", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    const panel = checklist(page);
    await panel.getByRole("checkbox", { name: "Check tyre pressures" }).click();
    await panel.getByRole("checkbox", { name: "Fill water tanks" }).click();

    await expect(panel.getByTestId("checklist-progress")).toHaveText(
      /2 of 2 complete/,
    );
    // The record still offers to complete the Task, which is the whole point.
    await expect(
      record(page).getByRole("button", { name: "Complete task" }),
    ).toBeVisible();
    await expect(panel.getByTestId("checklist-progress")).toContainText(
      "still open until you complete it",
    );
    expect(
      d1Query<{ completed_at: string | null }>(
        `SELECT completed_at FROM spine_records
          WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
            AND entity_id = ${sqlLiteral(TASK_ID)}`,
      )[0]!.completed_at,
    ).toBeNull();
  });

  test("completing the Task with unfinished steps is allowed and rewrites nothing", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await checklist(page)
      .getByRole("checkbox", { name: "Check tyre pressures" })
      .click();
    await expect
      .poll(() => storedChecklist(TASK_ID).map((item) => item.completed))
      .toEqual([1, 0]);

    // No confirmation, no friction: the owner decides the commitment is met.
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();

    // The unfinished step is STILL unfinished. Nothing was tidied.
    expect(storedChecklist(TASK_ID).map((item) => item.completed)).toEqual([
      1, 0,
    ]);
    await expect(checklist(page).getByTestId("checklist-progress")).toHaveText(
      /1 of 2 complete/,
    );
  });

  test("reopening the Task preserves the checklist exactly", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await checklist(page)
      .getByRole("checkbox", { name: "Fill water tanks" })
      .click();
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();
    await record(page).getByRole("button", { name: "Reopen task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Complete task" }),
    ).toBeVisible();

    expect(storedChecklist(TASK_ID)).toEqual([
      { title: "Check tyre pressures", position: 0, completed: 0 },
      { title: "Fill water tanks", position: 1, completed: 1 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Recurrence                                                                 */
/* -------------------------------------------------------------------------- */

test.describe("TASKS-13 — a recurring Task's successor", () => {
  const TASK_ID = "e2e-cl-repeat";
  const SERIES = "e2e-cl-series";

  test.beforeEach(() => {
    seedChecklistTask({
      id: TASK_ID,
      title: "Monthly camper check",
      scheduledDate: ownerToday(),
      // The schema requires a monthly rule to name its day, and the planned date
      // is the day it repeats on.
      repeat: {
        frequency: "month",
        seriesId: SERIES,
        anchorDay: Number(ownerToday().slice(8, 10)),
      },
      items: [
        { title: "Check tyre pressures", completed: true },
        { title: "Check gas bottle", completed: true },
        { title: "Check batteries", completed: true },
      ],
    });
  });

  test.afterEach(() => {
    cleanupAllChecklistTasks();
  });

  test("arrives with the STRUCTURE and none of the ticks", async ({ page }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await record(page).getByRole("button", { name: "Complete task" }).click();
    await expect(
      record(page).getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();

    // The successor, found by its position in the SERIES rather than by a guess.
    const successor = d1Query<{ entity_id: string }>(
      `SELECT entity_id FROM task_recurrence_rules
        WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
          AND series_id = ${sqlLiteral(SERIES)} AND sequence = 1`,
    );
    expect(successor).toHaveLength(1);

    expect(storedChecklist(successor[0]!.entity_id)).toEqual([
      { title: "Check tyre pressures", position: 0, completed: 0 },
      { title: "Check gas bottle", position: 1, completed: 0 },
      { title: "Check batteries", position: 2, completed: 0 },
    ]);
    // And the completed occurrence's own history is untouched.
    expect(storedChecklist(TASK_ID).map((item) => item.completed)).toEqual([
      1, 1, 1,
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Phone                                                                      */
/* -------------------------------------------------------------------------- */

test.describe("TASKS-13 — phone", () => {
  const TASK_ID = "e2e-cl-phone";

  test.beforeEach(() => {
    seedChecklistTask({
      id: TASK_ID,
      title: "Prepare camper for trip",
      items: [
        { title: "Check tyre pressures", completed: true },
        {
          title:
            "Confirm that the camper registration and roadside assistance are both current",
        },
        { title: "Fill water tanks" },
      ],
    });
  });

  test.afterEach(() => {
    removeChecklistTask(TASK_ID);
  });

  test("completes a step in one tap at 390, with a real touch target", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, recordUrl(TASK_ID));
    const target = checklist(page)
      .getByRole("checkbox", { name: "Fill water tanks" })
      .locator("xpath=..");
    await expectMinTouchTarget(target);

    await checklist(page)
      .getByRole("checkbox", { name: "Fill water tanks" })
      .click();
    await expect(
      checklist(page).getByRole("checkbox", { name: "Fill water tanks" }),
    ).toBeChecked();
    await expectNoHorizontalOverflow(page);
  });

  test("adds a step at 390 with the keyboard visible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, recordUrl(TASK_ID));
    await checklist(page).getByTestId("checklist-add").click();
    const composer = checklist(page).getByTestId("checklist-composer");
    await expect(composer).toBeFocused();
    await expectMinTouchTarget(composer);
    await composer.fill("Empty the toilet cassette");
    await composer.press("Enter");
    await expect(steps(page)).toHaveCount(4);
    await expectNoHorizontalOverflow(page);
  });

  test("does not overflow at 320, and a long step still wraps", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await gotoFixture(page, recordUrl(TASK_ID));
    await expect(checklist(page)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const long = steps(page).nth(1);
    await expect(long).toContainText("roadside assistance");
    // Wrapped, not clipped: the sentence is still readable at the narrow tier.
    const box = await long.boundingBox();
    expect(box!.height).toBeGreaterThan(44);
    expect(box!.width).toBeLessThanOrEqual(320);
  });

  test("reorders without a precision drag", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, recordUrl(TASK_ID));
    const menu = steps(page)
      .nth(2)
      .getByRole("button", { name: /More actions for Fill water tanks/ });
    await expectMinTouchTarget(menu);
    await menu.click();
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await expect
      .poll(async () => (await stepTitles(page))[1])
      .toBe("Fill water tanks");
  });
});

/* -------------------------------------------------------------------------- */
/* Offline                                                                    */
/* -------------------------------------------------------------------------- */

interface QueuedMutation {
  readonly id: string;
  readonly entityId: string;
  readonly targetId: string | null;
  readonly operation: string;
  readonly status: string;
  readonly attempts: number;
}

/** Read the queued Task changes straight out of IndexedDB. */
async function readMutations(page: Page): Promise<QueuedMutation[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dalyhub-offline");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!database.objectStoreNames.contains("mutations")) {
      database.close();
      return [];
    }
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database
        .transaction("mutations", "readonly")
        .objectStore("mutations")
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return rows as QueuedMutation[];
  });
}

/** Wait until the device has stored a snapshot — proof of a prior online session. */
async function waitForSnapshot(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("dalyhub-offline");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (!database.objectStoreNames.contains("meta")) {
            database.close();
            return 0;
          }
          const rows = await new Promise<unknown[]>((resolve, reject) => {
            const request = database
              .transaction("meta", "readonly")
              .objectStore("meta")
              .getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          });
          database.close();
          return rows.length;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}

/**
 * Take the network away from EVERYTHING, including the service worker's own
 * fetches — `setOffline` alone leaves a worker-issued fetch able to reach the
 * server, which would silently turn an offline assertion into an online one.
 */
async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
}

async function goOnline(context: BrowserContext): Promise<void> {
  await context.unroute("**/*");
  await context.setOffline(false);
}

test.describe("TASKS-13 — offline", () => {
  const TASK_ID = "e2e-cl-offline";

  test.beforeEach(() => {
    seedChecklistTask({
      id: TASK_ID,
      title: "Prepare camper offline",
      items: [{ title: "Check tyre pressures" }, { title: "Fill water tanks" }],
    });
  });

  test.afterEach(() => {
    removeChecklistTask(TASK_ID);
  });

  test("queues a tick made offline, and replays it exactly once", async ({
    page,
    context,
  }) => {
    await gotoFixture(page, recordUrl(TASK_ID));
    await expect(checklist(page)).toBeVisible();
    await waitForSnapshot(page);

    await goOffline(context);
    const step = checklist(page).getByRole("checkbox", {
      name: "Fill water tanks",
    });
    await step.click();
    // The tick is painted immediately — the change is real and on this device.
    await expect(step).toBeChecked();

    // ONE queued change, addressed at the ITEM inside the Task.
    await expect
      .poll(async () => (await readMutations(page)).length, { timeout: 20_000 })
      .toBe(1);
    const queued = (await readMutations(page))[0]!;
    expect(queued.operation).toBe("set_checklist_completed");
    expect(queued.entityId).toBe(TASK_ID);
    expect(queued.targetId).toBe(`${TASK_ID}-i1`);
    // Nothing reached the server while the network was away.
    expect(storedChecklist(TASK_ID).map((item) => item.completed)).toEqual([
      0, 0,
    ]);

    await goOnline(context);
    // Drained: a confirmed change is pruned, never kept as history.
    await expect
      .poll(async () => (await readMutations(page)).length, { timeout: 45_000 })
      .toBe(0);

    // Applied EXACTLY once, and to the right step.
    expect(storedChecklist(TASK_ID).map((item) => item.completed)).toEqual([
      0, 1,
    ]);
  });

  test("replays two ticks on DIFFERENT steps without losing either", async ({
    page,
    context,
  }) => {
    // The case a naive coalesce destroys: two changes to one Task that are not
    // two changes to one field.
    await gotoFixture(page, recordUrl(TASK_ID));
    await expect(checklist(page)).toBeVisible();
    await waitForSnapshot(page);

    await goOffline(context);
    await checklist(page)
      .getByRole("checkbox", { name: "Check tyre pressures" })
      .click();
    await checklist(page)
      .getByRole("checkbox", { name: "Fill water tanks" })
      .click();
    await expect
      .poll(async () => (await readMutations(page)).length, { timeout: 20_000 })
      .toBe(2);

    await goOnline(context);
    await expect
      .poll(async () => (await readMutations(page)).length, { timeout: 45_000 })
      .toBe(0);
    expect(storedChecklist(TASK_ID).map((item) => item.completed)).toEqual([
      1, 1,
    ]);
  });
});
