/**
 * V2.4-GATE-02 — honest signals on a Task row.
 *
 * Two claims, both of which the product got wrong before this item and both of
 * which are asserted here against the RENDERED surface rather than against a
 * class name or a source file:
 *
 *   1. **A Task row shows one checkbox-like control at rest** (DEBT-194 /
 *      DEBT-164). Weekly Planning's queue drew a selection checkbox and a
 *      completion checkbox 8px apart on every row, so the surface built for
 *      scheduling could complete work by mis-click. Selection is now an explicit
 *      mode, and in it the selection control REPLACES completion.
 *   2. **A passed due date is late only while the owner still owes the work**
 *      (DEBT-197). A cancelled Task's passed deadline was painted in the overdue
 *      colour beside its own "Cancelled" pill. The colour assertions below read
 *      the PAINTED value through `getComputedStyle`, which is what the debt
 *      entry's closing condition asks for.
 *
 * The semantic matrix itself is proven exhaustively and cheaply at the authority
 * (`test/unit/task-record/task-commitment.test.ts`); what is proven here is that
 * the authority's answer actually reaches the pixels, on more than one surface.
 */

import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  GATE_02_PROJECT_ID,
  clearGate02Fixture,
  gate02Task,
  seedGate02Fixture,
} from "./gate-02-fixtures";
import {
  addDays,
  clearPlanFixture,
  planFixture,
  seedPlanFixture,
  type PlanFixture,
} from "./plan-fixtures";
import { expectNoAxeViolations, gotoFixture, taskRow } from "./helpers";

let plan: PlanFixture;

test.beforeAll(() => {
  plan = planFixture();
  seedGate02Fixture();
});

/*
 * Re-seeded before EVERY test, not once.
 *
 * These journeys place work and complete work, which is the point of them — and
 * a Task this file placed is a Task the next journey cannot find in the queue.
 * `seedPlanFixture` is idempotent by construction (an `INSERT OR IGNORE` per row
 * followed by an `UPDATE` to the exact intended values), so re-running it repairs
 * whatever the previous journey did rather than depending on test order.
 */
test.beforeEach(() => {
  seedPlanFixture(plan);
});

test.afterAll(() => {
  clearGate02Fixture();
  clearPlanFixture(plan);
});

/* -------------------------------------------------------------------------- */
/* 1 — the Plan journey                                                        */
/* -------------------------------------------------------------------------- */

/** Every checkbox-like control a row draws: the two the design system defines. */
function rowSignals(row: Locator): Locator {
  return row.locator(".dh-check-circle, .dh-checkbox__control");
}

/**
 * Open one row's overflow menu, the way every other spec in this suite does.
 *
 * The trigger is a `dh-action-reveal`, so its own wrapper wins the hit test until
 * the row is hovered (DEBT-180). Hovering and polling is the established pattern
 * (`dhds-10-inline-manipulation.spec.ts`), and it is used here rather than a bare
 * click so this file is not asserting the reveal contract it does not own.
 */
async function openRowMenu(row: Locator, title: string): Promise<void> {
  const trigger = row.getByRole("button", {
    name: `More actions for ${title}`,
  });
  await expect
    .poll(
      async () => {
        await row.hover();
        await trigger.click({ timeout: 4_000 }).catch(() => {});
        return await trigger.getAttribute("aria-expanded").catch(() => null);
      },
      { message: `the overflow for "${title}" should open`, timeout: 20_000 },
    )
    .toBe("true");
}

test("Weekly Planning: one signal at rest, selection is a mode, and both acts survive a reload", async ({
  page,
}) => {
  // 1. Open Weekly Planning.
  await gotoFixture(page, "/plan");
  const queue = page.getByTestId("plan-queue");
  await expect(queue).toBeVisible();

  // 2. Locate a Task in "Still to place".
  const unplaced = plan.task("unplaced");
  const routine = plan.task("routine-unplaced");
  const queueRow = taskRow(queue, unplaced.title);
  await expect(queueRow).toHaveCount(1);

  // 3. ONE checkbox-like control at rest, and it is completion.
  await expect(rowSignals(queueRow)).toHaveCount(1);
  await expect(queueRow.getByTestId("task-complete")).toBeVisible();
  await expect(queueRow.getByTestId("task-select")).toHaveCount(0);
  // Every row in the queue, not just the one this journey acts on.
  const restingSignals = await queue
    .getByTestId("task-row")
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          row.querySelectorAll(".dh-check-circle, .dh-checkbox__control")
            .length,
      ),
    );
  expect(restingSignals.length).toBeGreaterThan(1);
  expect(restingSignals.every((count) => count === 1)).toBe(true);
  // The placement bar is not drawn either: at rest the queue is a list of work,
  // not a toolbar waiting for an act nobody has started.
  await expect(page.getByTestId("plan-place-bar")).toHaveCount(0);

  // 4. Enter the selection state INTENTIONALLY — and by KEYBOARD first, because
  //    the way in must not depend on a pointer or on hover.
  const toggle = queue.getByTestId("plan-queue-select-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.focus();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  /*
   * And Escape LEAVES it, without losing the owner's place.
   *
   * The rows lose their selection controls when the mode ends, so focus must
   * already be on something outside them — the control that owns the mode. A
   * browser moves focus from a removed element to the document body, which for
   * a keyboard user means their place is gone (AGENTS.md §6).
   */
  const box = queue.getByRole("checkbox", {
    name: `Select ${unplaced.title} to place on a day`,
  });
  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toBeFocused();
  await expect(page.locator(".dh-plan [role='status']")).toContainText(
    /Left selection/,
  );
  await expect(queue.getByTestId("task-select")).toHaveCount(0);
  await expect(page.getByTestId("plan-place-bar")).toHaveCount(0);

  // Back in, for the rest of the journey — and the change of MODE is announced,
  // not left to be inferred from controls appearing. The planner's own live
  // region is the one that says it (`role="status"`, `aria-live="polite"`).
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dh-plan [role='status']")).toContainText(
    /Selecting tasks to place/,
  );

  /*
   * axe, IN SELECTION MODE — the state this item introduces.
   *
   * `plan-responsive.spec.ts` already scans the WHOLE of `/plan` at rest, in both
   * appearances and on a phone; none of those sees the mode. The rule this scan
   * is really here for is duplicate control naming: a row that draws two
   * checkbox-like controls whose names differ only in a verb is exactly what
   * DEBT-194 was, and only a scan of the live mode can see it. Scoped to the
   * queue because the queue is what changed — the rest of the page is what those
   * three existing scans already cover. No rule is disabled for it.
   */
  await expectNoAxeViolations(page, { include: ".dh-plan__queue" });
  // Still exactly one control per row — selection REPLACED completion.
  await expect(rowSignals(queueRow)).toHaveCount(1);
  await expect(queueRow.getByTestId("task-complete")).toHaveCount(0);
  const selectingSignals = await queue
    .getByTestId("task-row")
    .evaluateAll((rows) =>
      rows.map(
        (row) =>
          row.querySelectorAll(".dh-check-circle, .dh-checkbox__control")
            .length,
      ),
    );
  expect(selectingSignals.every((count) => count === 1)).toBe(true);

  // 10. The two acts are announced with DISTINCT names — the assertion is made
  //     here, while both are one toggle apart, rather than in a separate test.
  await expect(
    queue.getByRole("checkbox", {
      name: `Select ${unplaced.title} to place on a day`,
    }),
  ).toBeVisible();
  await expect(
    queue.getByRole("checkbox", { name: `Complete ${unplaced.title}` }),
  ).toHaveCount(0);

  // 5. Select MULTIPLE Tasks.
  await queue
    .getByRole("checkbox", {
      name: `Select ${unplaced.title} to place on a day`,
    })
    .check();
  await queue
    .getByRole("checkbox", {
      name: `Select ${routine.title} to place on a day`,
    })
    .check();
  await expect(page.getByTestId("plan-place-bar")).toContainText("2 selected");

  // 6. Place them on a day.
  const target = addDays(plan.weekStart, 3);
  await page
    .locator(`[data-testid="plan-place-day"][data-date="${target}"]`)
    .click();

  const daySection = page.locator(
    `[data-testid="plan-day"][data-date="${target}"]`,
  );
  await expect(taskRow(daySection, unplaced.title)).toHaveCount(1);
  await expect(taskRow(daySection, routine.title)).toHaveCount(1);
  // Placing ENDS the mode: the rows go back to their completion control.
  await expect(queue.getByTestId("plan-queue-select-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  // 7. The accepted state survives a reload.
  await gotoFixture(page, "/plan");
  const reloaded = page.locator(
    `[data-testid="plan-day"][data-date="${target}"]`,
  );
  await expect(taskRow(reloaded, unplaced.title)).toHaveCount(1);
  await expect(taskRow(reloaded, routine.title)).toHaveCount(1);

  // 8. Complete a Task INDEPENDENTLY — through the row's own control, at rest.
  const placedRow = taskRow(reloaded, unplaced.title);
  await expect(rowSignals(placedRow)).toHaveCount(1);
  await placedRow
    .getByRole("checkbox", { name: `Complete ${unplaced.title}` })
    .check();

  // 9. The completion survives a reload.
  await gotoFixture(page, "/tasks?system=completed");
  await expect(taskRow(page, unplaced.title)).toHaveCount(1);
});

test("Weekly Planning: both acts stay reachable, at rest and in selection mode", async ({
  page,
}) => {
  await gotoFixture(page, "/plan");
  const queue = page.getByTestId("plan-queue");
  /*
   * The `overdue` band's fixture Task, deliberately — the same choice
   * `plan-weekly-planning.spec.ts` documents. The queue is BOUNDED at fifteen
   * and the committed E2E workspace is heavy, so a later band's Task is
   * correctly beyond the bound and reaching for one would assert the bound
   * rather than the behaviour.
   */
  const task = plan.task("routine-unplaced");
  const row = taskRow(queue, task.title);

  // AT REST: one control, and PLACEMENT is in the row's long tail, in words —
  // the one-gesture, keyboard-complete path PLAN-01 shipped, untouched.
  await expect(rowSignals(row)).toHaveCount(1);
  await expect(row.getByTestId("task-complete")).toBeVisible();
  await openRowMenu(row, task.title);
  await expect(
    page.getByRole("menuitem", { name: /^Plan for \w+day \d+ \w+/ }),
  ).not.toHaveCount(0);
  // At rest the menu carries NO completion item: the control is 200px to its
  // left, and a menu item duplicating it is noise.
  await expect(
    page.getByRole("menuitem", { name: "Complete", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  // IN SELECTION MODE: completion is displaced from the lead and appears in the
  // long tail instead, so the capability is never removed from the surface.
  await queue.getByTestId("plan-queue-select-toggle").click();
  await expect(rowSignals(row)).toHaveCount(1);
  await expect(row.getByTestId("task-complete")).toHaveCount(0);
  await openRowMenu(row, task.title);
  await expect(
    page.getByRole("menuitem", { name: "Complete", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menuitem", { name: "Complete", exact: true }),
  ).toHaveCount(0);
});

/* -------------------------------------------------------------------------- */
/* 2 — one checkbox-like signal at rest, product-wide                          */
/* -------------------------------------------------------------------------- */

/**
 * How many checkbox-like controls each rendered Task row draws on this page.
 *
 * The row selector is a parameter because a Project's Tasks tab is still the
 * generic `Card` rather than the shared `TaskRow` (DEBT-175, which this item
 * deliberately does not take on). The INVARIANT is the same on both anatomies,
 * and asserting it on both is what makes criterion 1 a claim about the product
 * rather than about one component.
 */
async function signalsPerRow(
  page: Page,
  rowSelector: string,
): Promise<number[]> {
  return page.evaluate(
    (selector) =>
      [...document.querySelectorAll(selector)].map(
        (row) =>
          row.querySelectorAll(".dh-check-circle, .dh-checkbox__control")
            .length,
      ),
    rowSelector,
  );
}

const AT_REST_SURFACES = [
  // `/plan` is absent, and not by omission: the journey above already counts the
  // controls on EVERY queue row, at rest and in selection mode, which is a
  // stronger form of this claim than one more page load of it.
  { route: "/today", rows: "[data-testid='task-row']" },
  {
    route: `/projects/${GATE_02_PROJECT_ID}?tasks=all`,
    rows: ".dh-card",
  },
  // `/tasks` — criterion 1's fourth surface — is asserted in the test below,
  // which already has that page open for the colour measurements. A page load on
  // this seeded workspace is ~3s of the gate's measured budget, and the claim is
  // the same claim wherever it is made.
] as const;

test("no Task row on Today or a Project draws two checkbox-like controls at rest", async ({
  page,
}) => {
  // Criterion 1 is a claim about the PRODUCT, so it is asserted over four
  // surfaces rather than one screen — and in one test, because four page loads
  // are the cost and four test fixtures on top of them are not.
  const offenders: string[] = [];
  for (const surface of AT_REST_SURFACES) {
    await gotoFixture(page, surface.route);
    // Only containers that actually hold a control are rows for this purpose: a
    // Project record draws cards that are not Tasks, and they have none.
    const counts = (await signalsPerRow(page, surface.rows)).filter(
      (count) => count > 0,
    );
    expect(
      counts.length,
      `${surface.route} rendered no Task row to measure`,
    ).toBeGreaterThan(0);
    if (counts.some((count) => count > 1)) {
      offenders.push(`${surface.route} at rest: ${counts.join(", ")}`);
    }

    /*
     * While the Project's Tasks tab is open — the SECOND surface the semantic
     * rule has to hold on, and the interesting one.
     *
     * It is still the generic `Card` rather than the shared `TaskRow`
     * (DEBT-175), so it does not inherit the row's answer; what it shares is the
     * inline date CONTROL. If the two ever disagreed, this is where it would
     * show, and DEBT-197's entry names exactly this pair.
     */
    if (surface.route.startsWith("/projects/")) {
      const live = await dateColour(page, gate02Task("live").title, ".dh-card");
      expect(
        live.painted,
        "the Project tab did not render the live overdue fixture Task",
      ).toBe(live.overdue);
      for (const suffix of ["cancelled", "completed", "someday"]) {
        const measured = await dateColour(
          page,
          gate02Task(suffix).title,
          ".dh-card",
        );
        expect(
          measured.painted,
          `${suffix} paints overdue on a Project's Tasks tab`,
        ).not.toBe(measured.overdue);
      }
    }
  }
  expect(
    offenders,
    "a surface draws a selection control beside a completion control",
  ).toEqual([]);
});

/* -------------------------------------------------------------------------- */
/* 3 — "overdue" means still owed, and the PAINT says so                       */
/* -------------------------------------------------------------------------- */

/**
 * The painted colour of one Task's due date, plus the page's own overdue token.
 *
 * Read from `getComputedStyle`, which is the whole point: DEBT-197's closing
 * condition is explicitly *"asserted by a test that reads the painted colour
 * rather than the class"*, because the class was right on one surface and wrong
 * on another for a whole phase.
 */
async function dateColour(
  page: Page,
  title: string,
  rowSelector = "[data-testid='task-row']",
): Promise<{ painted: string; overdue: string }> {
  return page.evaluate(
    ([rowTitle, selector]) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--dh-color-overdue)";
      document.body.append(probe);
      const overdue = getComputedStyle(probe).color;
      probe.remove();
      for (const date of document.querySelectorAll(
        "[data-testid='task-row-due-date']",
      )) {
        const row = date.closest(selector!);
        if (row?.textContent?.includes(rowTitle!)) {
          return { painted: getComputedStyle(date).color, overdue };
        }
      }
      return { painted: "", overdue };
    },
    [title, rowSelector] as const,
  );
}

test("/tasks: one signal at rest, one in selection, and overdue only on work still owed", async ({
  page,
}) => {
  await gotoFixture(page, "/tasks?system=all&sort=due_date&direction=asc");

  // Criterion 1's fourth surface, at rest.
  const atRest = await signalsPerRow(page, "[data-testid='task-row']");
  expect(atRest.length).toBeGreaterThan(0);
  expect(atRest.filter((count) => count > 1)).toEqual([]);

  for (const appearance of ["light", "dark"] as const) {
    // The appearance is the only thing that changes, and `--dh-color-overdue`
    // resolves to a different value in each — so the probe is re-read per
    // appearance rather than compared against a hard-coded hex.
    await page.emulateMedia({ colorScheme: appearance });

    const live = await dateColour(page, gate02Task("live").title);
    expect(
      live.painted,
      `a live overdue Task must paint overdue in ${appearance}`,
    ).toBe(live.overdue);

    for (const suffix of ["cancelled", "completed", "someday"]) {
      const task = gate02Task(suffix);
      const measured = await dateColour(page, task.title);
      expect(
        measured.painted,
        `${task.title} paints its passed date overdue in ${appearance}`,
      ).not.toBe(measured.overdue);
      // The DATE itself is still printed — history stays visible, only the
      // claim of urgency goes.
      await expect(
        taskRow(page, task.title).getByTestId("task-row-due-date"),
      ).toContainText(/ago|Yesterday/);
    }

    // On hold is still owed, and stays late. Blocked is not abandoned.
    const onHold = await dateColour(page, gate02Task("onhold").title);
    expect(onHold.painted).toBe(onHold.overdue);
  }

  /*
   * And the Tasks collection's OWN selection mode, from the page still open.
   *
   * `/tasks` was the second surface that drew both controls together — its rows
   * kept the completion circle while the bulk-selection checkbox was on. It is
   * the same shared row, so the same rule now holds: selection replaces
   * completion, and the bulk bar's own "Complete" is what acts on the selection.
   */
  await page.getByTestId("tasks-overflow").click();
  await page.getByRole("menuitem", { name: "Select tasks" }).click();
  await expect(page.getByTestId("task-select").first()).toBeVisible();

  const during = await signalsPerRow(page, "[data-testid='task-row']");
  expect(during.length).toBeGreaterThan(0);
  expect(during.filter((count) => count > 1)).toEqual([]);
  await expect(page.getByTestId("task-complete")).toHaveCount(0);

  /*
   * There is deliberately NO second axe scan here, and the reason is written
   * down rather than left as an omission.
   *
   * The thing this item changed on `/tasks` is the shared `TaskRow` in selection
   * mode — the same component, in the same state, that the Plan journey above
   * scans with axe. A second scan of it costs 8 s of the gate's measured budget
   * (this page carries 106 rows) to ask a question that has already been
   * answered. `accessibility.spec.ts` scans `/tasks` at rest, and the bulk bar
   * this mode reveals is unchanged by this item.
   */
});
