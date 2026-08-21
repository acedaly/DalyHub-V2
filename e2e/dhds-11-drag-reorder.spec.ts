import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoHorizontalOverflow,
  gotoFixture,
  taskRow,
} from "./helpers";
import {
  CHECKLIST_STEPS,
  CHECKLIST_TASK,
  DRAG_DELEGATE,
  GOAL_STAGES,
  HOME_PROJECT,
  HOME_TASKS,
  STAGED_GOAL,
  WORK_PROJECT,
  WORK_TASKS,
  cleanupDragFixture,
  seedDragFixture,
  storedParentOf,
  storedPriority,
  storedStages,
  storedSteps,
} from "./drag-fixtures";

/**
 * DHDS-11 — drag, reorder and object continuity, driven the way an owner drives
 * it.
 *
 * Every journey here ends in the SAME place: the database. A drag that only
 * moves pixels is the failure this phase is most at risk of, so nothing is
 * asserted on the pointer's coordinates — the assertions are the stored row, the
 * reloaded page, and the words the interface used.
 *
 * The journeys are the brief's own acceptance list:
 *
 *   A. reorder a manually ordered collection; reload; the order holds;
 *   B. drag a Task onto a Project; reload; it is still there; Undo puts it back;
 *   C. the SAME move through the non-drag path lands identically;
 *   D. the phone does the same work without a precision gesture;
 *   E. moving an object leaves the rest of the collection where it was.
 *
 * Plus the rules those depend on: a destination that would change nothing stays
 * dark, nothing is written while the pointer merely passes over a target, and a
 * keyboard reaches every one of these without a pointer at all.
 *
 * Timing is by visible state and by persisted server state. There are no sleeps
 * and no pixel choreography: a drag is expressed as "from this element's centre
 * to that element's centre", which is geometry the page itself supplies.
 */

/* -------------------------------------------------------------------------- */
/* Driving a drag                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Lift `handle` and release it over `destination`.
 *
 * Real Pointer Events on the real controls: this is the product's own
 * interaction, not a synthetic call into its internals. The intermediate moves
 * exist because a destination resolves from the pointer's position — one jump
 * would never cross the rectangles in between — and they are derived from the
 * two boxes rather than being a fixed pixel script.
 */
async function dragOnto(
  page: Page,
  handle: Locator,
  destination: Locator,
): Promise<void> {
  const from = await handle.boundingBox();
  const to = await destination.boundingBox();
  if (from === null || to === null) {
    throw new Error("both the handle and the destination must be on screen");
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await expect(destination).toHaveAttribute("data-dh-drop-active", "true");
  await page.mouse.up();
}

/** Lift `handle` and release it over the vertical centre of `slot`. */
async function dragOver(
  page: Page,
  handle: Locator,
  slot: Locator,
): Promise<void> {
  const from = await handle.boundingBox();
  const to = await slot.boundingBox();
  if (from === null || to === null) {
    throw new Error("both the handle and the target row must be on screen");
  }
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The Tasks collection, grouped by Project and filtered to this fixture's own
 * Tasks — so the page holds exactly two buckets and every assertion about them
 * is a complete statement. `?person=` is an ordinary product filter over a real
 * field; see `drag-fixtures.ts` for why the isolation is done that way.
 */
const GROUPED_BY_PROJECT = `/tasks?view=list&group=parent&person=${encodeURIComponent(
  DRAG_DELEGATE,
)}`;

const GROUPED_BY_PRIORITY = `/tasks?view=list&group=priority&person=${encodeURIComponent(
  DRAG_DELEGATE,
)}`;

function bucket(page: Page, title: string): Locator {
  return page.getByTestId("task-group").filter({
    has: page.getByRole("heading", { name: new RegExp(`^${title}\\b`) }),
  });
}

function rowHandle(page: Page, title: string): Locator {
  return taskRow(page, title)
    .first()
    .getByRole("button", { name: `Move ${title}` });
}

function recordUrl(taskId: string): string {
  return `/tasks?view=list&group=none&sort=created&dir=desc&drawer=task%3A${encodeURIComponent(taskId)}`;
}

function checklist(page: Page): Locator {
  return page.getByRole("dialog").getByTestId("task-checklist");
}

async function stepTitles(page: Page): Promise<string[]> {
  return checklist(page)
    .getByTestId("checklist-toggle")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label") ?? ""),
    );
}

/**
 * The stage titles, in the order the record draws them.
 *
 * A stage's check control is named by its wrapping `<label>` rather than by an
 * `aria-label` — the words are beside the control, which is what a label is for
 * — so the name is read from the label, not from an attribute that is correctly
 * absent.
 */
async function stageTitles(page: Page): Promise<string[]> {
  return page
    .getByTestId("goal-milestones")
    .getByRole("checkbox")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.closest("label")?.textContent?.trim() ?? ""),
    );
}

test.beforeEach(() => {
  seedDragFixture();
});

test.afterAll(() => {
  cleanupDragFixture();
});

/* -------------------------------------------------------------------------- */
/* Journey A — reorder, reload, the order holds                               */
/* -------------------------------------------------------------------------- */

test.describe("DHDS-11 Journey A — a manually ordered collection", () => {
  test("drags a checklist step to a new position, and the order survives a reload", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
    await expect(checklist(page)).toBeVisible();
    expect(await stepTitles(page)).toEqual([...CHECKLIST_STEPS]);

    const rows = checklist(page).getByTestId("checklist-item");
    const last = checklist(page).getByRole("button", {
      name: `Reorder ${CHECKLIST_STEPS[2]}`,
    });
    await rows.nth(2).hover();
    await dragOver(page, last, rows.nth(0));

    await expect
      .poll(() => storedSteps(CHECKLIST_TASK.id), {
        message: "the new order should reach the database",
      })
      .toEqual([CHECKLIST_STEPS[2], CHECKLIST_STEPS[0], CHECKLIST_STEPS[1]]);

    await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
    await expect(checklist(page)).toBeVisible();
    // Poll rather than read once: this is a fresh navigation, and the record's
    // steps arrive with it rather than before it.
    await expect
      .poll(() => stepTitles(page), {
        message: "the reloaded record should draw the persisted order",
      })
      .toEqual([CHECKLIST_STEPS[2], CHECKLIST_STEPS[0], CHECKLIST_STEPS[1]]);
  });

  test("reaches the same order from the keyboard alone", async ({ page }) => {
    await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
    const grip = checklist(page).getByRole("button", {
      name: `Reorder ${CHECKLIST_STEPS[0]}`,
    });
    await grip.focus();
    await page.keyboard.press("Enter");
    await expect(grip).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect
      .poll(() => storedSteps(CHECKLIST_TASK.id))
      .toEqual([CHECKLIST_STEPS[1], CHECKLIST_STEPS[2], CHECKLIST_STEPS[0]]);
    // Focus never leaves the control the owner is holding.
    await expect(
      checklist(page).getByRole("button", {
        name: `Reorder ${CHECKLIST_STEPS[0]}`,
      }),
    ).toBeFocused();
  });

  test("Escape abandons a keyboard reorder and writes nothing", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
    const grip = checklist(page).getByRole("button", {
      name: `Reorder ${CHECKLIST_STEPS[0]}`,
    });
    await grip.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");

    await expect(grip).toHaveAttribute("aria-pressed", "false");
    expect(await stepTitles(page)).toEqual([...CHECKLIST_STEPS]);
    expect(storedSteps(CHECKLIST_TASK.id)).toEqual([...CHECKLIST_STEPS]);
  });

  test("reorders a Goal's stages, and progress is untouched", async ({
    page,
  }) => {
    await gotoFixture(page, `/goals/${STAGED_GOAL.id}`);
    const stages = page.getByTestId("goal-milestones");
    await expect(stages).toBeVisible();
    expect(await stageTitles(page)).toEqual([...GOAL_STAGES]);

    // Complete the first stage, so the reorder has progress to leave alone.
    await stages.getByRole("checkbox", { name: GOAL_STAGES[0] }).click();
    await expect
      .poll(() =>
        page
          .getByTestId("goal-milestones")
          .getByRole("checkbox", { name: GOAL_STAGES[0] })
          .isChecked(),
      )
      .toBe(true);

    const grip = stages.getByRole("button", {
      name: `Reorder ${GOAL_STAGES[2]}`,
    });
    await grip.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");

    await expect
      .poll(() => storedStages(STAGED_GOAL.id))
      .toEqual([GOAL_STAGES[2], GOAL_STAGES[0], GOAL_STAGES[1]]);

    await gotoFixture(page, `/goals/${STAGED_GOAL.id}`);
    await expect(page.getByTestId("goal-milestones")).toBeVisible();
    await expect
      .poll(() => stageTitles(page), {
        message: "the reloaded Goal should draw the persisted stage order",
      })
      .toEqual([GOAL_STAGES[2], GOAL_STAGES[0], GOAL_STAGES[1]]);
    // Reordering is not progress: the completed stage is still completed.
    await expect(
      page
        .getByTestId("goal-milestones")
        .getByRole("checkbox", { name: GOAL_STAGES[0] }),
    ).toBeChecked();
  });
});

/* -------------------------------------------------------------------------- */
/* Journey B — a Task onto a Project                                          */
/* -------------------------------------------------------------------------- */

test.describe("DHDS-11 Journey B — moving a Task to another Project", () => {
  test("drops it onto the destination bucket, and reload agrees", async ({
    page,
  }) => {
    await gotoFixture(page, GROUPED_BY_PROJECT);
    const moving = WORK_TASKS[0].title;
    await expect(bucket(page, WORK_PROJECT.title)).toBeVisible();
    await expect(bucket(page, HOME_PROJECT.title)).toBeVisible();

    await taskRow(page, moving).first().hover();
    await dragOnto(
      page,
      rowHandle(page, moving),
      bucket(page, HOME_PROJECT.title),
    );

    await expect
      .poll(() => storedParentOf(WORK_TASKS[0].id), {
        message: "the drop should change the Task's structural parent",
      })
      .toBe(HOME_PROJECT.id);

    await gotoFixture(page, GROUPED_BY_PROJECT);
    await expect(
      bucket(page, HOME_PROJECT.title).getByText(moving),
    ).toBeVisible();
    await expect(
      bucket(page, WORK_PROJECT.title).getByText(moving),
    ).toHaveCount(0);
  });

  test("offers Undo, and Undo puts the Task back", async ({ page }) => {
    await gotoFixture(page, GROUPED_BY_PROJECT);
    const moving = WORK_TASKS[1].title;
    await taskRow(page, moving).first().hover();
    await dragOnto(
      page,
      rowHandle(page, moving),
      bucket(page, HOME_PROJECT.title),
    );

    /*
     * The toast names the DESTINATION, not the gesture — and it is located by
     * ROLE, as every other toast assertion in this suite is. A bare text match
     * would also find the two live regions that (correctly) say the same thing
     * in their own words.
     */
    const toast = page.getByRole("group", {
      name: `Moved to ${HOME_PROJECT.title}`,
    });
    await expect(toast).toBeVisible();
    await expect
      .poll(() => storedParentOf(WORK_TASKS[1].id))
      .toBe(HOME_PROJECT.id);

    await toast.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(() => storedParentOf(WORK_TASKS[1].id), {
        message: "Undo should restore the Project the Task came from",
      })
      .toBe(WORK_PROJECT.id);
  });

  test("drops onto a PRIORITY bucket, writing the priority the bucket names", async ({
    page,
  }) => {
    await gotoFixture(page, GROUPED_BY_PRIORITY);
    const moving = WORK_TASKS[0].title;
    // The fixture seeds two priorities precisely so both buckets exist: an
    // empty priority bucket is not drawn, so a single-priority fixture would
    // have nowhere to drop TO.
    await expect(bucket(page, "Priority 3")).toBeVisible();
    await expect(bucket(page, "Priority 1")).toBeVisible();

    await taskRow(page, moving).first().hover();
    await dragOnto(page, rowHandle(page, moving), bucket(page, "Priority 1"));

    await expect.poll(() => storedPriority(WORK_TASKS[0].id)).toBe("p1");
  });

  test("keeps the bucket the Task is ALREADY in dark, and refuses nothing", async ({
    page,
  }) => {
    await gotoFixture(page, GROUPED_BY_PROJECT);
    const moving = WORK_TASKS[0].title;
    const handle = rowHandle(page, moving);
    await taskRow(page, moving).first().hover();

    const from = await handle.boundingBox();
    const home = await bucket(page, WORK_PROJECT.title).boundingBox();
    const away = await bucket(page, HOME_PROJECT.title).boundingBox();
    if (from === null || home === null || away === null) {
      throw new Error("the fixture's buckets should both be on screen");
    }
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    // Over the OTHER bucket first, which proves the drag is genuinely live.
    await page.mouse.move(away.x + away.width / 2, away.y + away.height / 2, {
      steps: 8,
    });
    await expect(bucket(page, HOME_PROJECT.title)).toHaveAttribute(
      "data-dh-drop-candidate",
      "true",
    );
    // The bucket it came from never became a candidate at all.
    await expect(bucket(page, WORK_PROJECT.title)).not.toHaveAttribute(
      "data-dh-drop-candidate",
      "true",
    );

    await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2, {
      steps: 8,
    });
    await expect(bucket(page, WORK_PROJECT.title)).not.toHaveAttribute(
      "data-dh-drop-active",
      "true",
    );
    await page.mouse.up();

    // Nothing was written, and nothing was reported as an error.
    expect(storedParentOf(WORK_TASKS[0].id)).toBe(WORK_PROJECT.id);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("writes NOTHING while the pointer merely passes over a destination", async ({
    page,
  }) => {
    await gotoFixture(page, GROUPED_BY_PROJECT);
    const moving = WORK_TASKS[0].title;
    await taskRow(page, moving).first().hover();
    const handle = rowHandle(page, moving);

    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") requests.push(request.url());
    });

    const from = await handle.boundingBox();
    const away = await bucket(page, HOME_PROJECT.title).boundingBox();
    if (from === null || away === null) throw new Error("missing geometry");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(away.x + away.width / 2, away.y + away.height / 2, {
      steps: 16,
    });
    await expect(bucket(page, HOME_PROJECT.title)).toHaveAttribute(
      "data-dh-drop-active",
      "true",
    );
    expect(requests, "hovering a destination must not mutate anything").toEqual(
      [],
    );

    // Abandon it rather than committing: cancelling is not an error either.
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(requests).toEqual([]);
    expect(storedParentOf(WORK_TASKS[0].id)).toBe(WORK_PROJECT.id);
  });
});

/* -------------------------------------------------------------------------- */
/* A realistic collection, not a demo one                                     */
/* -------------------------------------------------------------------------- */

test.describe("DHDS-11 — a populated collection", () => {
  /**
   * The same drag, on the WHOLE workspace rather than on this fixture's four
   * Tasks.
   *
   * The committed E2E workspace holds ninety-odd Tasks across a dozen parents,
   * so this is a page of a dozen buckets and fifty rows — every one of which the
   * pointer loop hit-tests, and every one of which the collection re-renders
   * around when the destination changes. The assertion is the same as the
   * isolated journey's, deliberately: what is under test is that the operation
   * still WORKS at that size, not a timing number a CI runner cannot promise.
   */
  test("resolves a destination and commits on a page of many buckets", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=list&group=parent");
    const moving = WORK_TASKS[0].title;
    await expect(taskRow(page, moving).first()).toBeVisible();
    await expect(page.getByTestId("task-group").first()).toBeVisible();
    // More buckets than the fixture's two, so the hit test has real work.
    expect(await page.getByTestId("task-group").count()).toBeGreaterThan(3);

    await taskRow(page, moving).first().scrollIntoViewIfNeeded();
    await taskRow(page, moving).first().hover();
    await dragOnto(
      page,
      rowHandle(page, moving),
      bucket(page, HOME_PROJECT.title),
    );

    await expect
      .poll(() => storedParentOf(WORK_TASKS[0].id))
      .toBe(HOME_PROJECT.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Journey C — the non-drag path lands in the same place                      */
/* -------------------------------------------------------------------------- */

test.describe("DHDS-11 Journey C — the same move, without a drag", () => {
  test("the row's own Project control writes exactly what the drop wrote", async ({
    page,
  }) => {
    await gotoFixture(page, GROUPED_BY_PROJECT);
    const moving = HOME_TASKS[0].title;
    const row = taskRow(page, moving).first();
    await row.hover();
    await row.getByTestId("task-row-parent").getByRole("button").click();
    await page
      .getByRole("menuitemradio", { name: new RegExp(WORK_PROJECT.title) })
      .click();

    await expect
      .poll(() => storedParentOf(HOME_TASKS[0].id), {
        message: "the picker and the drop must write the same relationship",
      })
      .toBe(WORK_PROJECT.id);
  });
});

/* -------------------------------------------------------------------------- */
/* Journey D — the phone                                                      */
/* -------------------------------------------------------------------------- */

test.describe("DHDS-11 Journey D — a phone", () => {
  /*
   * A real phone, not a narrow desktop window: `isMobile` + `hasTouch` is what
   * makes Chromium report `pointer: coarse` and `hover: none`, and both of the
   * rules under test here are gated on exactly that. The repo's other phone
   * journeys (`today-mobile`, `iphone-daily-driver`) emulate the same way.
   */
  test.use({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
  });

  test("reorders a checklist by grip, at the touch floor and without overflow", async ({
    page,
  }) => {
    await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
    const grip = checklist(page).getByRole("button", {
      name: `Reorder ${CHECKLIST_STEPS[2]}`,
    });
    await expect(grip).toBeVisible();
    await expectMinTouchTarget(grip);
    await expectNoHorizontalOverflow(page);

    const rows = checklist(page).getByTestId("checklist-item");
    await dragOver(page, grip, rows.nth(0));
    await expect
      .poll(() => storedSteps(CHECKLIST_TASK.id))
      .toEqual([CHECKLIST_STEPS[2], CHECKLIST_STEPS[0], CHECKLIST_STEPS[1]]);
  });

  test("keeps the reorder usable at the MINIMUM supported width", async ({
    page,
  }) => {
    // 320 is the product's floor. A grip that only fits at 393 is a grip that
    // does not fit.
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, recordUrl(CHECKLIST_TASK.id));
    const grip = checklist(page).getByRole("button", {
      name: `Reorder ${CHECKLIST_STEPS[1]}`,
    });
    await expect(grip).toBeVisible();
    await expectMinTouchTarget(grip);
    await expectNoHorizontalOverflow(page);
  });

  test("offers a Task NO free drag, and the contextual move instead", async ({
    page,
  }) => {
    await gotoFixture(page, GROUPED_BY_PROJECT);
    const moving = WORK_TASKS[0].title;
    await expect(taskRow(page, moving).first()).toBeVisible();
    /*
     * A phone-width Tasks list draws no grip: a Task row is also a link, a
     * checkbox and a swipe surface, and a free drag between buckets on a
     * touch screen would fight the scroll it shares. The move is the row's own
     * overflow, which works with a thumb, a mouse and a screen reader alike.
     */
    await expect(rowHandle(page, moving)).toHaveCount(0);
    await taskRow(page, moving)
      .first()
      .getByRole("button", { name: `More actions for ${moving}` })
      .click();
    await expect(
      page.getByRole("menuitem", { name: /Move to Project or Area/ }),
    ).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* Journey E — continuity                                                     */
/* -------------------------------------------------------------------------- */

test.describe("DHDS-11 Journey E — the collection keeps its place", () => {
  test("a move leaves scroll, the other buckets and the filters as they were", async ({
    page,
  }) => {
    await gotoFixture(page, GROUPED_BY_PROJECT);
    const moving = WORK_TASKS[0].title;
    const staying = WORK_TASKS[1].title;

    const urlBefore = page.url();
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await taskRow(page, moving).first().hover();
    await dragOnto(
      page,
      rowHandle(page, moving),
      bucket(page, HOME_PROJECT.title),
    );
    await expect
      .poll(() => storedParentOf(WORK_TASKS[0].id))
      .toBe(HOME_PROJECT.id);

    // The URL — and with it the grouping and the filter — is untouched.
    expect(page.url()).toBe(urlBefore);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    // The Task that did not move is exactly where it was.
    await expect(
      bucket(page, WORK_PROJECT.title).getByText(staying),
    ).toBeVisible();
  });

  test("a completed row departs instead of vanishing, and focus lands somewhere named", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      `/tasks?view=list&group=none&system=active&person=${encodeURIComponent(DRAG_DELEGATE)}`,
    );
    const going = WORK_TASKS[0].title;
    const check = page.getByRole("checkbox", { name: `Complete ${going}` });
    await expect(check).toBeVisible();
    await check.focus();
    await check.press("Space");

    // The row is reported gone while its pixels are still collapsing…
    await expect
      .poll(
        async () =>
          await page.evaluate(
            () =>
              document.activeElement?.closest("[data-dh-exit='true']") !== null,
          ),
        { message: "focus must not be left inside the departing row" },
      )
      .toBe(false);
    // …and focus is on a real control rather than on the document body.
    expect(
      await page.evaluate(() => document.activeElement?.tagName ?? ""),
    ).not.toBe("BODY");
  });
});
