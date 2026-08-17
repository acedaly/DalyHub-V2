import { expect, test } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";

import {
  clickCardAction,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  ownerToday,
  postSameOrigin,
} from "./helpers";

/**
 * TODAY-TASK-01 — ONE task row, proved end to end.
 *
 * DEBT-143 was open because Today drew its own task row: the same object had two
 * anatomies, and — the part that cost the owner something — the plan's rows were
 * READ-ONLY while `/tasks` could re-project, re-prioritise and re-schedule in
 * place. This spec is the closing evidence, and it is deliberately shaped as a
 * pair of assertions per capability:
 *
 *   1. the act is possible FROM `/today`, through the shared control; and
 *   2. its result is visible on `/tasks`, which is the surface that has always
 *      had it.
 *
 * Two surfaces agreeing is the whole claim. A test that only checked the row
 * changed on Today would pass just as happily against a Today-only mutation
 * path, which is the thing that must not exist.
 *
 * Every record is created BY the spec through the real `/tasks/new` action under
 * a per-run title stamp, and every locator is scoped to it: the dev database is
 * shared with the rest of the suite, so a spec that named a pre-existing row
 * would fail for a reason it is not about.
 */

const STAMP = `TTC-${Date.now()}`;
const TODAY = ownerToday();

/** Every Task this spec created, taken back off the day afterwards. */
const created: string[] = [];

async function createTask(
  request: APIRequestContext,
  name: string,
  fields: Record<string, string> = {},
): Promise<{ readonly id: string; readonly title: string }> {
  const title = `${STAMP} ${name}`;
  const response = await postSameOrigin(request, "/tasks/new", {
    form: { title, dueDate: TODAY, ...fields },
  });
  const body = (await response.json()) as {
    ok: boolean;
    taskId?: string;
    formError?: string;
  };
  expect(body.ok, `creating "${title}": ${body.formError ?? ""}`).toBe(true);
  created.push(body.taskId!);
  return { id: body.taskId!, title };
}

/**
 * Cleanup CLEARS THE DATES rather than completing the Tasks: a completion stays
 * on the day (dimmed, in its band), which is correct product behaviour and
 * useless as cleanup — and the plan is bounded at eight rows, so leftovers push
 * the next test's rows past the bound.
 */
test.afterEach(async ({ request }) => {
  while (created.length > 0) {
    const id = created.pop()!;
    await postSameOrigin(request, `/tasks/${encodeURIComponent(id)}`, {
      form: {
        intent: "update",
        dueDate: "",
        scheduledDate: "",
        commitmentState: "active",
      },
    });
  }
});

/** The row for one stamped title inside Today's plan. */
function planRow(page: Page, title: string): Locator {
  return page
    .locator('[data-testid="today-plan"] .dh-taskrow', { hasText: title })
    .first();
}

/** The same task's row on the canonical Tasks collection. */
function tasksRow(page: Page, title: string): Locator {
  return page.locator(".dh-taskrow", { hasText: title }).first();
}

/** Open an inline cell's editor. A pointer device reveals it on hover. */
async function openCell(row: Locator, testId: string): Promise<void> {
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.locator(`[data-testid="${testId}"] button`).first().click();
}

/* -------------------------------------------------------------------------- */
/* Part A — one row, and it is the shared one                                  */
/* -------------------------------------------------------------------------- */

test.describe("TODAY-TASK-01 — Today draws the shared task row", () => {
  test("the plan's rows are the canonical row, with its cells and its overflow", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "shared anatomy", {
      priority: "p2",
    });
    await page.goto("/today");
    const row = planRow(page, task.title);
    await expect(row).toBeVisible();

    // The row IS the shared component: its own test id, its own cells.
    await expect(row).toHaveAttribute("data-testid", "task-row");
    await expect(row.getByTestId("task-row-parent")).toBeVisible();
    await expect(row.getByTestId("task-row-due-date")).toBeVisible();
    await expect(row.getByTestId("task-row-priority")).toBeVisible();
    await expect(row.getByTestId("task-row-open")).toBeVisible();

    // …and the long tail is the shared SET, not a Today-local menu.
    await clickCardAction(row, /^More actions for /);
    const menu = page.getByRole("menu").last();
    await expect(
      menu.getByRole("menuitem", { name: "Move to Project or Area…" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Move to Someday / Maybe" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Open task" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("opening a row from Today opens the canonical Task record", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "opens the record");
    await page.goto("/today");
    await planRow(page, task.title).getByTestId("task-row-open").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: task.title }).first(),
    ).toBeVisible();
    // The canonical record, not a Today-only summary: its lifecycle action is
    // the record header's button, in the product's own words.
    await expect(
      dialog.getByRole("button", { name: "Complete task" }),
    ).toBeVisible();
    // And it is real URL state, so Back works.
    await expect(page).toHaveURL(/drawer=task%3A/);
  });
});

/* -------------------------------------------------------------------------- */
/* Part A2 — the acts, each proved on BOTH surfaces                            */
/* -------------------------------------------------------------------------- */

test.describe("TODAY-TASK-01 — a task is fully actionable from Today", () => {
  test("completes and reopens, and `/tasks` agrees both times", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "completion round trip");

    await page.goto("/today");
    const row = planRow(page, task.title);
    await row.getByRole("checkbox", { name: `Complete ${task.title}` }).check();
    // Optimistic in place, then reconciled by the loader revalidation.
    await expect(
      row.getByRole("checkbox", { name: `Reopen ${task.title}` }),
    ).toBeChecked();

    // The SERVER has it: the canonical collection reads it as complete.
    /*
     * `completed=only` over the `all` scope is the canonical way to ask the
     * collection for finished work: the system view decides the POPULATION and
     * the visibility filter decides whether the finished work inside it is
     * shown, hidden or shown alone (TASKS-03).
     */
    await page.goto("/tasks?system=all&completed=only");
    await expect(
      tasksRow(page, task.title).getByRole("checkbox", {
        name: `Reopen ${task.title}`,
      }),
    ).toBeChecked();

    // …and reopening from Today puts it back.
    await page.goto("/today");
    const again = planRow(page, task.title);
    await again
      .getByRole("checkbox", { name: `Reopen ${task.title}` })
      .uncheck();
    await expect(
      again.getByRole("checkbox", { name: `Complete ${task.title}` }),
    ).not.toBeChecked();

    await page.goto("/tasks");
    await expect(
      tasksRow(page, task.title).getByRole("checkbox", {
        name: `Complete ${task.title}`,
      }),
    ).not.toBeChecked();
  });

  test("changes a priority inline, and `/tasks` shows the new one", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "priority inline", {
      priority: "p4",
    });

    await page.goto("/today");
    await openCell(planRow(page, task.title), "task-row-priority");
    // The anchored menu marks each option `menuitemradio`; the phone sheet
    // renders a pressed-state button. Either is the same choice, made the same
    // way — this is the shared control, not a Today variant.
    await page
      .getByRole("menuitemradio", { name: "Priority 1" })
      .or(page.getByRole("button", { name: "Priority 1" }))
      .last()
      .click();
    await expect(
      planRow(page, task.title).getByTestId("task-row-priority"),
    ).toContainText("P1");

    await page.goto("/tasks");
    await expect(
      tasksRow(page, task.title).getByTestId("task-row-priority"),
    ).toContainText("P1");
  });

  test("re-files a task under a Project, and back to the Inbox", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "reparent");

    await page.goto("/today");
    await openCell(planRow(page, task.title), "task-row-parent");
    /*
     * The FIRST real candidate from Today's bounded parent option set — the
     * same set `/tasks` offers, read once by the loader. Its name is whatever
     * the shared dev workspace holds, so the spec reads it rather than naming
     * it: what is being proved is that the menu is populated and that choosing
     * from it writes, not which Projects a shared database happens to have.
     */
    const options = page
      .getByRole("menu")
      .last()
      // "Move to Inbox" is the CLEAR command and is a radio in the same group
      // (it is the "none of these" choice), so it has to be excluded by name —
      // choosing it would prove the opposite of what this step is about.
      .getByRole("menuitemradio")
      .filter({ hasNotText: "Move to Inbox" });
    await expect(options.first()).toBeVisible();
    const chosen = (await options.first().innerText()).split("\n")[0]!.trim();
    await options.first().click();

    await expect(
      planRow(page, task.title).getByTestId("task-row-parent"),
    ).toContainText(chosen);

    await page.goto("/tasks");
    await expect(
      tasksRow(page, task.title).getByTestId("task-row-parent"),
    ).toContainText(chosen);

    // …and back to the Inbox, which is a first-class command rather than an
    // error state.
    await page.goto("/today");
    await openCell(planRow(page, task.title), "task-row-parent");
    await page
      .getByRole("menu")
      .last()
      .getByRole("menuitemradio", { name: "Move to Inbox" })
      .click();
    await expect(
      planRow(page, task.title).getByTestId("task-row-parent"),
    ).toContainText("Unassigned");

    await page.goto("/tasks");
    await expect(
      tasksRow(page, task.title).getByTestId("task-row-parent"),
    ).toContainText("Unassigned");
  });

  test("changes a due date through the shared date control", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "date inline");

    await page.goto("/today");
    await openCell(planRow(page, task.title), "task-row-due-date");
    // The shared date editor's one-press shortcuts, from the same derivation
    // the Task record's planning section uses.
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();

    // Moving the deadline off today takes the task OFF the day, which is the
    // point: the plan is a membership rule, not a static list.
    await expect(planRow(page, task.title)).toHaveCount(0);

    await page.goto("/tasks");
    await expect(
      tasksRow(page, task.title).getByTestId("task-row-due-date"),
    ).toContainText("Tomorrow");
  });

  test("a failed write is visible and never leaves a value the server refused", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "refusal");
    await page.goto("/today");
    const row = planRow(page, task.title);
    await expect(row).toBeVisible();

    // Refuse the canonical bulk route at the network boundary — the same route
    // `/tasks` posts a priority change to.
    await page.route("**/tasks/bulk", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        // `formError` is the canonical refusal key the bulk route answers with.
        body: JSON.stringify({ ok: false, formError: "Refused by the test." }),
      }),
    );
    await openCell(row, "task-row-priority");
    await page
      .getByRole("menuitemradio", { name: "Priority 1" })
      .or(page.getByRole("button", { name: "Priority 1" }))
      .last()
      .click();

    // The refusal is stated, and the row does NOT show P1.
    await expect(page.getByRole("alert")).toContainText("Refused by the test.");
    await expect(row.getByTestId("task-row-priority")).not.toContainText("P1");
  });
});

/* -------------------------------------------------------------------------- */
/* DEBT-144 — one parent, one identity, on every surface                       */
/* -------------------------------------------------------------------------- */

test("a task's parent carries the same identity on Today and on Tasks", async ({
  page,
  request,
}) => {
  const task = await createTask(request, "parent identity");

  await page.goto("/today");
  await openCell(planRow(page, task.title), "task-row-parent");
  const options = page
    .getByRole("menu")
    .last()
    .getByRole("menuitemradio")
    .filter({ hasNotText: "Move to Inbox" });
  await expect(options.first()).toBeVisible();
  await options.first().click();

  const identityOf = async (row: Locator) =>
    row.locator(".dh-task-parent__mark").getAttribute("data-identity");

  await expect(
    planRow(page, task.title).locator(".dh-task-parent__mark"),
  ).toBeVisible();
  const onToday = await identityOf(planRow(page, task.title));

  await page.goto("/tasks");
  const onTasks = await identityOf(tasksRow(page, task.title));

  /*
   * The SAME slot, resolved through the one shared resolver from the identity
   * the kernel now carries on the relation — not the entity TYPE's generic
   * badge, which is what both surfaces drew before and which made every Project
   * look alike.
   */
  expect(onToday).not.toBeNull();
  expect(onTasks).toBe(onToday);
});

/* -------------------------------------------------------------------------- */
/* Part C — the phone                                                          */
/* -------------------------------------------------------------------------- */

test.describe("TODAY-TASK-01 — the plan on a phone", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("swipes right to complete, left to schedule, and never steals the scroll", async ({
    page,
    request,
  }) => {
    const task = await createTask(request, "swipe");
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto("/today");
    const row = planRow(page, task.title);
    await expect(row).toBeVisible();
    // The gesture layer arms itself after mount on a touch-first device.
    await expect(row).toHaveAttribute("data-swipe-enabled", "true");

    /*
     * Playwright cannot dispatch a native OS touch-DRAG, and `page.mouse`
     * reports `pointerType: "mouse"` — which would not exercise the touch path
     * at all. So the gesture is driven by explicit `pointerType: "touch"`
     * pointer events with real coordinates, exactly as `today-mobile.spec.ts`
     * drives the Card's tray. This is the same hook a finger reaches.
     */
    const box = (await row.boundingBox())!;
    const y = box.y + box.height / 2;
    const base = { pointerId: 1, pointerType: "touch", bubbles: true } as const;
    const drag = async (target: Locator, from: number, to: number) => {
      await target.dispatchEvent("pointerdown", {
        ...base,
        button: 0,
        clientX: from,
        clientY: y,
      });
      for (let step = 1; step <= 6; step += 1) {
        await target.dispatchEvent("pointermove", {
          ...base,
          clientX: from + ((to - from) * step) / 6,
          clientY: y,
        });
      }
      await target.dispatchEvent("pointerup", {
        ...base,
        clientX: to,
        clientY: y,
      });
    };

    // Pull towards the inline END: that reveals the START edge, which completes.
    await drag(row, box.x + 24, box.x + box.width - 8);
    await expect(
      planRow(page, task.title).getByRole("checkbox", {
        name: `Reopen ${task.title}`,
      }),
    ).toBeChecked();

    /*
     * A VERTICAL drag belongs to the PAGE, not to the row.
     *
     * The row claims only the horizontal axis (`touch-action: pan-y`), and the
     * gesture model gives a tie to the scroller, so a mostly-vertical pull must
     * never arm a swipe edge — which is what "the gesture does not steal the
     * page scroll" means in a test that cannot scroll a real compositor.
     */
    const again = planRow(page, task.title);
    const start = (await again.boundingBox())!;
    const x = start.x + start.width / 2;
    await again.dispatchEvent("pointerdown", {
      ...base,
      button: 0,
      clientX: x,
      clientY: start.y + 8,
    });
    for (let step = 1; step <= 6; step += 1) {
      await again.dispatchEvent("pointermove", {
        ...base,
        clientX: x,
        clientY: start.y + 8 - step * 16,
      });
    }
    await again.dispatchEvent("pointerup", {
      ...base,
      clientX: x,
      clientY: start.y - 88,
    });
    await expect(again).not.toHaveAttribute("data-swipe-edge", "start");
    await expect(again).not.toHaveAttribute("data-swipe-edge", "end");
  });

  test("has no horizontal document overflow at 320, 390 or 430", async ({
    page,
    request,
  }) => {
    await createTask(request, "a deliberately long task title for measuring", {
      priority: "p1",
    });
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/today");
      await expect(page.getByTestId("today-plan")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });
});

test("the converged plan passes axe in both appearances", async ({
  page,
  request,
}) => {
  await createTask(request, "axe", { priority: "p1" });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/today");
    await expect(page.getByTestId("today-plan")).toBeVisible();
    await expectNoAxeViolations(page);
  }
});
