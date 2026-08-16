import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  enterTaskSelection,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  taskRows,
  taskRow,
} from "./helpers";

/**
 * V2.2 (TASKS-05/06/07/08) — the daily-driver journeys, end to end against the
 * development-auth server over real (seeded) D1.
 *
 * The programme's claim is that ordinary task management happens FROM THE LIST, so
 * these journeys deliberately never open the full record to do ordinary things. What
 * they prove:
 *
 *   - **Direct edit** (§B): rename, set a priority, set a date and re-file a task
 *     without a single Edit form;
 *   - **Bulk cleanup** (§C): select ten tasks — by checkbox, by Shift-range and by
 *     Select all — then move, re-prioritise, reschedule, complete and DELETE them as
 *     single operations, with delete reversible from the Deleted view;
 *   - **Proper recurrence** (§D): author a custom rule with the two scheduling modes,
 *     read it in plain language before saving, and see the same wording on the row;
 *   - **Series change** (§E): skip an occurrence without completing it, and stop a
 *     repeat without losing history;
 *   - **Mobile** (§F): the same capture, edit, multi-select, bulk and recurrence at
 *     390px, plus the 320–430px width matrix and axe.
 *
 * Every task is uniquely stamped and prefixed `E2E ` so the seed clears them, and
 * anything filed goes into the dedicated fixture Project rather than one another
 * journey asserts about.
 */

const RUN = Date.now();

/** The dedicated seeded Project this journey files into (never a shared fixture). */
const FILING_PROJECT = "Daily driver filing project";

const LIST = "/tasks?view=list&system=all&sort=created&dir=desc";
const INBOX = "/tasks?view=list&system=inbox&sort=created&dir=desc";
const DELETED = "/tasks?view=list&system=deleted&sort=updated";

/** Capture a task through the in-workspace quick-add row. */
async function quickAdd(page: Page, text: string) {
  const field = page.getByTestId("tasks-quickadd-input");
  await field.fill(text);
  await field.press("Enter");
  await expect(field).toHaveValue("");
}

/**
 * Seed a scale journey through the same resource route the UI uses. Typing 105
 * rows through the composer makes the test about keyboard latency, not the product
 * rule being protected here.
 */
async function createTasksThroughRoute(
  page: Page,
  prefix: string,
  count: number,
) {
  await page.evaluate(
    async ({ prefix: innerPrefix, count: innerCount }) => {
      for (let index = 0; index < innerCount; index += 1) {
        const body = new FormData();
        body.set("title", `${innerPrefix} ${String(index).padStart(3, "0")}`);
        const response = await fetch("/tasks/new", {
          method: "POST",
          body,
        });
        const result = (await response.json()) as {
          readonly ok?: boolean;
          readonly formError?: string;
        };
        if (!response.ok || !result.ok) {
          throw new Error(result.formError ?? "Task create failed");
        }
      }
    },
    { prefix, count },
  );
}

function cardFor(page: Page, title: string): Locator {
  return taskRow(page, title);
}

/** The bulk bar, which only exists while something is selected. */
function bulkBar(page: Page): Locator {
  return page.getByRole("group", { name: "Bulk task actions" });
}

/**
 * Selection mode with NOTHING selected yet — the state the header toggle and a phone
 * long press produce. It is a different, differently-named surface from the bulk bar,
 * on purpose: an empty toolbar of disabled buttons would say nothing.
 */
function selectionPrompt(page: Page): Locator {
  return page.getByRole("group", { name: "Select tasks" });
}

/**
 * Open a row's overflow menu.
 *
 * The action rail REVEALS ON HOVER on a pointer device (UIQ-002) — concealed actions
 * are deliberately not hit-testable — so pointing at the row precedes the click,
 * exactly as a person performs it.
 */
async function openRowMenu(page: Page, title: string) {
  const card = cardFor(page, title);
  await card.hover();
  await card.getByRole("button", { name: /^More actions for / }).click();
}

/**
 * UIX-01 — a row's selection checkbox appears in bulk-selection MODE, so this
 * enters the mode when it is not already open (see `enterTaskSelection`). The
 * specs that already call `enterTaskSelection` explicitly are unaffected: the
 * checkbox is there, and this finds it.
 */
async function selectTask(page: Page, title: string) {
  const box = page.getByRole("checkbox", { name: `Select ${title}` }).first();
  if ((await box.count()) === 0) {
    await enterTaskSelection(page);
  }
  await box.check();
}

/** Run a bulk action and wait for it to COMMIT (the bar clears its selection). */
async function runBulk(page: Page, action: () => Promise<unknown>) {
  await expect(bulkBar(page)).toBeVisible();
  await action();
  await expect(bulkBar(page)).toHaveCount(0);
}

async function openBulkMore(page: Page) {
  await bulkBar(page)
    .getByRole("button", { name: "More", exact: true })
    .click();
}

async function chooseBulk(page: Page, field: string, option: string) {
  await bulkBar(page)
    .getByRole("combobox", { name: field })
    .selectOption({ label: option });
}

/* ========================================================================== */
/* Scenario B — direct edit                                                    */
/* ========================================================================== */

test.describe("TASKS-05 — a task is edited where it is shown", () => {
  test("renames, prioritises, dates and re-files a task without opening a form", async ({
    page,
  }) => {
    const title = `E2E direct edit ${RUN}`;
    await gotoFixture(page, LIST);
    // Scenario A: capture is title-first and nothing else is required.
    await quickAdd(page, title);
    const card = cardFor(page, title);
    await expect(card).toBeVisible();

    // PRIORITY, in place. An untriaged task reads a quiet "P4" — `null` IS
    // Priority 4 (CONTROL-01) — and that quiet value IS the control, so there
    // is no pencil beside it.
    await card.hover();
    await card.getByRole("button", { name: /^Priority/ }).click();
    await page.getByRole("menuitemradio", { name: "Priority 1" }).click();
    await expect(cardFor(page, title)).toContainText("P1");

    // DUE DATE, in place, through the shared DS-16 date popover.
    const dated = cardFor(page, title);
    await dated.hover();
    await dated.getByRole("button", { name: /^Due date/ }).click();
    const duePopover = page.getByRole("dialog", { name: "Edit due date" });
    // CONTROL-01 — the product's own preset, in the product's own picker. There
    // is no native input to type into and no Save after a complete answer.
    await duePopover
      .getByRole("button", { name: "Today", exact: true })
      .click();
    /*
     * UIX-01 — the row states the due date as the WORD "Today", not as an
     * "Due today" urgency chip beside it.
     *
     * The chip existed because a raw "9 Aug 2026" cannot say a date has passed or
     * arrived; the date now reads "Yesterday"/"Today"/"Tomorrow" and takes the
     * state colour when it has slipped, so the chip beside it was the same fact
     * twice in a pill on every row. The fact under test is unchanged and still in
     * words, scoped to the row.
     */
    await expect(cardFor(page, title)).toContainText("Today");
    /*
     * …and the row has MOVED to the day it now belongs to.
     *
     * The word above is painted optimistically, off the client's own patch map;
     * the BUCKET is the server's, and `applyTaskPatchesToGrouping` deliberately
     * leaves it alone until the revalidation the change asked for comes back
     * ("An optimistic presentation may re-render a row; it may not restate an
     * authoritative figure" — `task-optimistic.ts`, ADR-086). So between the
     * paint and the answer this row says "Today" while still sitting under
     * "No date", and when the answer lands it is REMOVED from that group and
     * re-created under this one.
     *
     * HARDEN-04 added this wait, and the reason is worth keeping: the next step
     * opens a menu on this row, and on `main` @ `0b586eb` (run 31697528360,
     * shard 8) the revalidation landed 0.5 s after that menu opened. The trace
     * shows the row's React ids changing across the move (`_r_2_` → `_r_l_`) —
     * the row was re-created, taking the open menu with it, and the click that
     * followed spent the whole 30-second budget retrying against a detached
     * option. It failed on four of seven `main` runs and never locally, because
     * the size of the shared workspace decides how long that window is. Waiting
     * for the row to be where the server put it closes the window and proves the
     * documented regroup, which nothing asserted before.
     */
    await expect(
      taskRow(
        page.locator('.dh-tasks-grouped__section[aria-label="Today"]'),
        title,
      ),
    ).toBeVisible();

    // PROJECT, in place. ONE selection replaces the previous value — there is no
    // clear-then-save-then-reopen-then-choose sequence.
    const filed = cardFor(page, title);
    await filed.hover();
    await filed.getByRole("button", { name: /^Project or Area/ }).click();
    await page.getByRole("menuitemradio", { name: FILING_PROJECT }).click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /filed under/i }),
    ).toBeAttached();
    await gotoFixture(page, INBOX);
    // Filed means it has LEFT Inbox, because Inbox means unassigned.
    await expect(cardFor(page, title)).toHaveCount(0);

    // And back to Inbox from the same control.
    await gotoFixture(page, LIST);
    const refiled = cardFor(page, title);
    await refiled.hover();
    await refiled.getByRole("button", { name: /^Project or Area/ }).click();
    await page.getByRole("menuitemradio", { name: "Move to Inbox" }).click();
    await gotoFixture(page, INBOX);
    await expect(cardFor(page, title)).toBeVisible();
  });

  test("the Eisenhower Matrix is gone, everywhere it used to be", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    // Not in the view switcher…
    await expect(
      page.getByRole("link", { name: "Matrix", exact: true }),
    ).toHaveCount(0);
    // …not in the DOM…
    await expect(page.locator(".dh-tasks-matrix")).toHaveCount(0);
    // …and not in the Command Palette, which offers the grouped list instead.
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("combobox", { name: /Command|Search/ });
    await expect(palette).toBeVisible();
    await palette.fill("matrix");
    await expect(page.getByRole("option", { name: /Open Matrix/ })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("option", { name: /Open Tasks by priority/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

/* ========================================================================== */
/* Scenario C — bulk cleanup                                                   */
/* ========================================================================== */

test.describe("TASKS-06 — bulk management", () => {
  test.describe.configure({ timeout: 120_000 });

  test("selects many tasks and moves, re-prioritises and reschedules them at once", async ({
    page,
  }) => {
    const stamp = `${RUN}-bulk`;
    await gotoFixture(page, LIST);
    for (let index = 0; index < 4; index += 1) {
      await quickAdd(page, `E2E bulk ${stamp} ${index}`);
    }

    // Selection mode is reachable by an ordinary, labelled control — not only by a
    // gesture and not only by a checkbox nobody notices.
    await enterTaskSelection(page);
    await expect(selectionPrompt(page)).toBeVisible();

    // Shift-range: pick the first, then Shift-click the fourth.
    await page
      .getByRole("checkbox", { name: `Select E2E bulk ${stamp} 3` })
      .check();
    await page
      .getByRole("checkbox", { name: `Select E2E bulk ${stamp} 0` })
      .click({ modifiers: ["Shift"] });
    await expect(bulkBar(page)).toContainText("4 selected");

    // MOVE — one bounded atomic mutation, not four requests.
    await runBulk(page, () => chooseBulk(page, "Move", FILING_PROJECT));
    await gotoFixture(page, INBOX);
    for (let index = 0; index < 4; index += 1) {
      await expect(cardFor(page, `E2E bulk ${stamp} ${index}`)).toHaveCount(0);
    }

    // PRIORITY over a MIXED selection. The control states "Mixed" rather than
    // pretending the set shares a value.
    await gotoFixture(page, LIST);
    await selectTask(page, `E2E bulk ${stamp} 0`);
    await runBulk(page, () => chooseBulk(page, "Priority", "Priority 1"));
    await selectTask(page, `E2E bulk ${stamp} 0`);
    await selectTask(page, `E2E bulk ${stamp} 1`);
    await expect(
      bulkBar(page).getByRole("combobox", { name: "Priority" }),
    ).toContainText("Mixed");
    await runBulk(page, () => chooseBulk(page, "Priority", "Priority 2"));
    await expect(cardFor(page, `E2E bulk ${stamp} 0`)).toContainText("P2");
    await expect(cardFor(page, `E2E bulk ${stamp} 1`)).toContainText("P2");

    // DATE.
    await selectTask(page, `E2E bulk ${stamp} 2`);
    await runBulk(page, () => chooseBulk(page, "Date", "Due today"));
    // See the note above: the row says the date, not an urgency chip.
    await expect(cardFor(page, `E2E bulk ${stamp} 2`)).toContainText("Today");
  });

  test("bulk delete is reversible, says so, and restores from the Deleted view", async ({
    page,
  }) => {
    const stamp = `${RUN}-del`;
    await gotoFixture(page, LIST);
    for (let index = 0; index < 3; index += 1) {
      await quickAdd(page, `E2E delete ${stamp} ${index}`);
    }

    // "Select all" acts on what is VISIBLE, never on "everything matching".
    await enterTaskSelection(page);
    await selectionPrompt(page)
      .getByRole("button", { name: /^Select all/ })
      .click();
    await expect(bulkBar(page)).toContainText(/\d+ selected/);

    // Narrow to only the three just created, so the confirmation's count is exact.
    await bulkBar(page).getByRole("button", { name: "Done" }).click();
    for (let index = 0; index < 3; index += 1) {
      await selectTask(page, `E2E delete ${stamp} ${index}`);
    }
    await expect(bulkBar(page)).toContainText("3 selected");

    await openBulkMore(page);
    await bulkBar(page).getByRole("button", { name: "Delete…" }).click();
    // A calm confirmation that names the count AND explains the consequence.
    const confirm = page.getByRole("group", { name: "Confirm bulk delete" });
    await expect(confirm).toContainText("Delete 3 tasks?");
    await expect(confirm).toContainText(/restored/i);
    await confirm.getByRole("button", { name: /^Delete 3 tasks/ }).click();

    // Wait for the WRITE, not for the bar. While the confirmation is showing, the
    // "Bulk task actions" group is already gone — the component renders the confirm
    // panel INSTEAD of it — so `bulkBar` reaching zero says nothing about whether the
    // delete committed, and navigating on it aborted the in-flight POST. The live
    // region is the honest signal: it is written from the server's own result.
    await expect(
      page.locator("[role='status']").filter({ hasText: /3 tasks deleted/ }),
    ).toBeAttached();
    await expect(bulkBar(page)).toHaveCount(0);

    // Gone from the ordinary collection…
    await gotoFixture(page, LIST);
    await expect(cardFor(page, `E2E delete ${stamp} 0`)).toHaveCount(0);

    // …and reachable, and restorable, from the built-in Deleted view.
    await gotoFixture(page, DELETED);
    await expect(cardFor(page, `E2E delete ${stamp} 0`)).toBeVisible();
    // The trash is a RECOVERY surface: a deleted row offers no edit that could only
    // fail, so its inline fields and its Complete action are not there at all.
    await expect(
      cardFor(page, `E2E delete ${stamp} 0`).getByRole("button", {
        name: /^Priority/,
      }),
    ).toHaveCount(0);
    await expect(
      cardFor(page, `E2E delete ${stamp} 0`).getByRole("checkbox", {
        name: /^Complete /,
      }),
    ).toHaveCount(0);
    await selectTask(page, `E2E delete ${stamp} 0`);
    await runBulk(page, () =>
      bulkBar(page).getByRole("button", { name: "Restore" }).click(),
    );
    await gotoFixture(page, LIST);
    await expect(cardFor(page, `E2E delete ${stamp} 0`)).toBeVisible();
  });

  test("clears the selection when the query changes", async ({ page }) => {
    // Brief §20: a selection that survived a filter change would act on records the
    // owner can no longer see.
    const title = `E2E selection scope ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, title);
    await selectTask(page, title);
    await expect(bulkBar(page)).toContainText("1 selected");
    await gotoFixture(page, INBOX);
    await expect(bulkBar(page)).toHaveCount(0);
  });

  test("states and enforces the 100-task bulk bound after loading multiple pages", async ({
    page,
  }) => {
    const prefix = `E2E bulk bound ${RUN}`;
    await gotoFixture(page, LIST);
    await createTasksThroughRoute(page, prefix, 105);
    await gotoFixture(page, LIST);

    while ((await taskRows(page).count()) <= 100) {
      const before = await taskRows(page).count();
      await page.getByRole("button", { name: "Load more tasks" }).click();
      await expect
        .poll(async () => taskRows(page).count())
        .toBeGreaterThan(before);
    }

    const loaded = await taskRows(page).count();
    expect(loaded).toBeGreaterThan(100);

    await enterTaskSelection(page);
    await expect(selectionPrompt(page)).toContainText(
      `${loaded} tasks are loaded.`,
    );
    await expect(selectionPrompt(page)).toContainText(
      "Bulk actions work on up to 100 at a time",
    );
    await expect(
      selectionPrompt(page).getByRole("button", { name: "Select all 100" }),
    ).toBeVisible();

    await selectionPrompt(page)
      .getByRole("button", { name: "Select all 100" })
      .click();
    await expect(bulkBar(page)).toContainText("100 selected");
    await expect(bulkBar(page)).not.toContainText("Deselect");

    /*
     * "Done" clears the selection AND leaves selection mode, so the next
     * Shift-range starts from nothing — which is the point of the check below.
     *
     * UIX-01 — a row's selection checkbox is drawn IN selection mode (the row
     * leads with its completion circle otherwise), so re-entering the mode is
     * part of starting a second selection now. The bound, the range and the
     * refusal it is testing are unchanged.
     */
    await bulkBar(page).getByRole("button", { name: "Done" }).click();
    await enterTaskSelection(page);
    const rowChecks = taskRows(page).getByRole("checkbox", {
      name: /^Select /,
    });
    await rowChecks.nth(0).check();
    await rowChecks.nth(100).click({ modifiers: ["Shift"] });
    await expect(bulkBar(page)).toContainText("101 selected");
    await expect(bulkBar(page)).toContainText("Deselect 1 to continue.");
    await expect(
      bulkBar(page).getByRole("button", { name: /^Complete$/ }),
    ).toHaveCount(0);
  });
});

/* ========================================================================== */
/* Scenarios D and E — recurrence and series changes                           */
/* ========================================================================== */

test.describe("TASKS-07 — Recurrence 2.0", () => {
  test.describe.configure({ timeout: 120_000 });

  test("authors a CUSTOM after-completion interval, stated in plain language", async ({
    page,
  }) => {
    const title = `E2E cpap ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} tomorrow`);
    await openQuickEdit(page, title);
    const drawer = page.getByRole("dialog", { name: "Task" });

    const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
    await repeat.click();
    await repeat.fill("Custom");
    await drawer.getByRole("option", { name: /^Custom/ }).click();

    await drawer.getByLabel(/Repeat every/).fill("14");
    const unit = drawer.getByRole("combobox", { name: "Unit" });
    await unit.click();
    await unit.fill("days");
    await drawer.getByRole("option", { name: "days" }).click();
    await drawer
      .getByRole("radio", { name: /Repeat after completion/ })
      .click();

    // The owner reads the RESULT before committing to it — no decoding required.
    await expect(drawer.getByTestId("task-recurrence-summary")).toHaveText(
      "14 days after completion",
    );
    await drawer.getByRole("button", { name: "Save repeat" }).click();
    await expect(
      /*
       * The product's own announcement channel.
       *
       * This waited on `[role="status"]`, which was the live region the retired
       * quick-edit DRAWER HOST rendered around the panel. The record announces
       * through the shared feedback system instead, and that system deliberately
       * uses `aria-live` rather than an implicit `role="status"` — the reason is
       * recorded in `NotificationCenter`: two elements resolving to the same
       * implicit role made `getByRole` ambiguous. The toast is a labelled group,
       * so it is asked for by the name it publishes.
       */
      page.getByRole("group", { name: /repeats/i }),
    ).toBeVisible();

    // The SAME wording on the row: one formatter, every surface.
    await page.keyboard.press("Escape");
    await gotoFixture(page, LIST);
    await expect(cardFor(page, title)).toContainText(
      "14 days after completion",
    );
  });

  test("authors a weekday-pinned fixed schedule", async ({ page }) => {
    const title = `E2E admin review ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} tomorrow`);
    await openQuickEdit(page, title);
    const drawer = page.getByRole("dialog", { name: "Task" });

    const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
    await repeat.click();
    await repeat.fill("Custom");
    await drawer.getByRole("option", { name: /^Custom/ }).click();

    await drawer.getByRole("checkbox", { name: "Monday" }).check();
    await drawer.getByRole("checkbox", { name: "Thursday" }).check();
    await expect(drawer.getByTestId("task-recurrence-summary")).toHaveText(
      "Every Monday, Thursday",
    );
    await drawer.getByRole("button", { name: "Save repeat" }).click();
    await expect(
      /*
       * The product's own announcement channel.
       *
       * This waited on `[role="status"]`, which was the live region the retired
       * quick-edit DRAWER HOST rendered around the panel. The record announces
       * through the shared feedback system instead, and that system deliberately
       * uses `aria-live` rather than an implicit `role="status"` — the reason is
       * recorded in `NotificationCenter`: two elements resolving to the same
       * implicit role made `getByRole` ambiguous. The toast is a labelled group,
       * so it is asked for by the name it publishes.
       */
      page.getByRole("group", { name: /repeats/i }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await gotoFixture(page, LIST);
    await expect(cardFor(page, title)).toContainText("Every Monday, Thursday");
  });

  test("SKIPS an occurrence without completing it, and stops a repeat without losing it", async ({
    page,
  }) => {
    const title = `E2E lawn ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} tomorrow every week`);
    await expect(cardFor(page, title)).toContainText("Every week");

    // SKIP — the occurrence moves forward and stays OPEN. Nothing is marked done.
    await openRowMenu(page, title);
    await page.getByRole("menuitem", { name: "Skip this occurrence" }).click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /Skipped/ }),
    ).toBeAttached();
    await gotoFixture(page, "/tasks?view=list&system=completed&sort=updated");
    await expect(cardFor(page, title)).toHaveCount(0);
    await gotoFixture(page, LIST);
    await expect(cardFor(page, title)).toBeVisible();

    // STOP — the repeat ends; the task itself stays exactly where it is.
    await openRowMenu(page, title);
    await page.getByRole("menuitem", { name: "Stop repeating" }).click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /no longer repeats/ }),
    ).toBeAttached();
    await gotoFixture(page, LIST);
    await expect(cardFor(page, title)).toBeVisible();
    await expect(cardFor(page, title)).not.toContainText("Every week");
  });
});

/**
 * Open a row's Task record — the ONE surface that hosts the priority, the dates,
 * the horizon, the Someday/Maybe state and the recurrence editor. It is reached
 * from the row's own overflow, which is the path a touch device has always used
 * (there is no hover to reveal anything on a phone).
 *
 * CONTROL-01 §4 — this used to open `TaskQuickEditPanel` behind a menu item
 * reading "Priority, dates and repeat…", a SECOND drawer over the same task that
 * carried a different subset of its properties from the record beside it. The
 * two are merged; the menu offers one door, and the editor this helper's callers
 * drive came with it.
 */
async function openQuickEdit(page: Page, title: string) {
  await openRowMenu(page, title);
  await page.getByRole("menuitem", { name: "Open task" }).click();
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
}

/* ========================================================================== */
/* Scenario F — the phone                                                      */
/* ========================================================================== */

test.describe("TASKS-08 — the phone daily driver at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test.describe.configure({ timeout: 120_000 });

  test("captures, edits, multi-selects and bulk-moves from a phone", async ({
    page,
  }) => {
    const stamp = `${RUN}-m`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `E2E phone ${stamp} 0`);
    await quickAdd(page, `E2E phone ${stamp} 1`);

    /*
     * A priority edit from the row, at phone width.
     *
     * UIX-01 — the phone row is circle · title · date, and an untriaged
     * priority was not drawn on it: at 390px a "No priority" control took ~70px
     * out of a ~334px row, directly out of the title, to say that a dimension
     * the owner has not used is not used. The capability did not move off the
     * row — it moved into the row's own overflow → "Open task", which is the ONE
     * Task record and is already the phone's path for the horizon and the
     * recurrence (a phone has no hover to reveal anything).
     *
     * Once a task HAS a priority the row shows it at every width, which is what
     * the assertion at the end of this block proves.
     */
    await openQuickEdit(page, `E2E phone ${stamp} 0`);
    const quickEdit = page.getByRole("dialog", { name: "Task" });
    const priority = quickEdit.getByRole("combobox", { name: /^Priority/ });
    await priority.click();
    await quickEdit.getByRole("option", { name: "Priority 2" }).click();
    await page.keyboard.press("Escape");
    await expect(cardFor(page, `E2E phone ${stamp} 0`)).toContainText("P2");

    // Multi-select through the EXPLICIT control (the touch hold is an accelerator,
    // and a gesture-only capability would have no keyboard equivalent).
    await enterTaskSelection(page);
    await expect(selectionPrompt(page)).toBeVisible();
    await selectTask(page, `E2E phone ${stamp} 0`);
    await selectTask(page, `E2E phone ${stamp} 1`);
    await expect(bulkBar(page)).toContainText("2 selected");
    await runBulk(page, () => chooseBulk(page, "Move", FILING_PROJECT));
    await gotoFixture(page, INBOX);
    await expect(cardFor(page, `E2E phone ${stamp} 0`)).toHaveCount(0);

    await expectNoHorizontalOverflow(page);
  });

  test("the custom recurrence editor is usable at every phone width", async ({
    page,
  }) => {
    const title = `E2E phone repeat ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} tomorrow`);
    // At a phone WIDTH the harness still reports a fine pointer, so the row behaves
    // as it does on a desktop: the action rail reveals on hover. The newest row also
    // sits directly under the sticky top bar, which would otherwise take the click,
    // so it is scrolled clear first — the same thing a thumb does.
    const row = cardFor(page, title);
    await row.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, -160);
    await openRowMenu(page, title);
    await page.getByRole("menuitem", { name: "Open task" }).click();
    const drawer = page.getByRole("dialog", { name: "Task" });
    const repeat = drawer.getByRole("combobox", { name: /^Repeat/ });
    await repeat.click();
    await repeat.fill("Custom");
    await drawer.getByRole("option", { name: /^Custom/ }).click();
    await expect(drawer.getByTestId("task-recurrence-editor")).toBeVisible();

    // The seven weekday targets wrap rather than shrink, so 320px is legible.
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(
        drawer.getByRole("checkbox", { name: "Monday" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    // Axe over the composed editor, in both appearances.
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });
});

/* ========================================================================== */
/* Accessibility and the width matrix                                          */
/* ========================================================================== */

test.describe("V2.2 Tasks — accessibility and responsive", () => {
  test.describe.configure({ timeout: 180_000 });

  test("the bulk bar is keyboard-operable and axe-clean in both appearances", async ({
    page,
  }) => {
    const title = `E2E a11y bulk ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, title);
    await selectTask(page, title);
    await expect(bulkBar(page)).toBeVisible();

    // Selection is announced in WORDS, never by colour alone.
    await expect(bulkBar(page)).toContainText("1 selected");
    await expect(
      page.getByRole("checkbox", { name: `Select ${title}` }),
    ).toBeChecked();

    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });

    await bulkBar(page).getByRole("button", { name: "Done" }).click();
    await expect(bulkBar(page)).toHaveCount(0);
  });

  test("no horizontal overflow across the width matrix, including the Deleted view", async ({
    page,
  }) => {
    for (const query of [
      "view=list&system=all",
      "view=list&group=priority",
      "view=list&system=deleted",
      "view=matrix",
    ]) {
      for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await gotoFixture(page, `/tasks?${query}`);
        await expectNoHorizontalOverflow(page);
      }
    }
  });
});
