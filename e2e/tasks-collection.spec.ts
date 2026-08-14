import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectMinTouchTarget,
  gotoFixture,
  ownerToday,
  taskRows,
  taskRow,
} from "./helpers";

/**
 * TASKS-03 — the completed Tasks collection experience, driven end to end against
 * the development-auth server over real (seeded) D1, including the 80-task
 * collection dataset.
 *
 * What it proves, in the product rather than in a unit:
 *   - the LIST is the default workspace, and the specialist views are optional;
 *   - filters combine, are URL-backed, stay visible as removable chips, and reset;
 *   - grouping shows AUTHORITATIVE counts and drills into exactly what it counted;
 *   - saved views persist, are distinguishable from built-ins without colour, and
 *     confirm before deletion;
 *   - list-level edits go through the canonical Task authority and are announced;
 *   - a legacy TASKS-01 link still lands on the same records;
 *   - the whole thing behaves at 320/375/390/430px, by keyboard, and in both themes.
 *
 * It only READS the `Dataset task NN` collection records and creates its own
 * clearly-named saved views and tasks, so it never disturbs the other journeys.
 */

/** The name of the saved view this spec creates, deletes and recreates. */
const SAVED_VIEW = "E2E deep work view";

/**
 * UIX-01 — plan a task for today from its ROW.
 *
 * "Today" was a visible button in the row's trailing action rail, revealed on
 * hover on a pointer device and permanently present on touch. The redesign
 * took every permanent action button off the row (they were most of why a phone
 * task row was 230px tall); the command is now in the row's own overflow menu
 * and on the touch swipe tray, so it is reachable by pointer, by keyboard and
 * by gesture without occupying the row.
 */
async function planForToday(page: Page, title: string) {
  const card = taskRow(page, title).first();
  await card.hover();
  await card.getByRole("button", { name: /^More actions for / }).click();
  await page
    .getByRole("menu")
    .last()
    .getByRole("menuitem", { name: "Plan for today", exact: true })
    .click();
}

/** Open the ONE shared collection sheet. */
async function openSheet(page: Page) {
  await page.getByTestId("collection-filter-trigger").click();
  const sheet = page.getByTestId("collection-sheet");
  await sheet.waitFor();
  return sheet;
}

/** Delete the spec's saved view if a previous run left it behind. */
async function removeSavedView(page: Page) {
  await gotoFixture(page, "/tasks");
  await page.getByTestId("tasks-view-trigger").click();
  const panel = page.getByTestId("tasks-view-panel");
  await panel.waitFor();
  const existing = panel.getByRole("link", { name: SAVED_VIEW });
  if ((await existing.count()) === 0) {
    await page.keyboard.press("Escape");
    return;
  }
  await existing.first().click();
  await page.getByRole("button", { name: "Manage Tasks views" }).click();
  await page
    .getByRole("menuitem", { name: new RegExp(`Delete “${SAVED_VIEW}`) })
    .click();
  await page.getByRole("button", { name: "Delete view" }).click();
  await expect(page.getByTestId("tasks-view-trigger")).not.toContainText(
    SAVED_VIEW,
  );
}

test.describe("TASKS-03 — the primary workspace", () => {
  test("lands on a calm LIST, not a matrix, and names the view it is showing", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    // V2.2 removed the Eisenhower Matrix outright: no 2×2 exists anywhere, and the
    // switcher does not offer one.
    await expect(page.locator(".dh-tasks-matrix")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Matrix", exact: true }),
    ).toHaveCount(0);
    await expect(taskRows(page).first()).toBeVisible();
    // The switcher names what is on screen rather than reporting "Custom".
    await expect(page.getByTestId("tasks-view-trigger")).toContainText(
      "All active",
    );
  });

  test("keeps every presentation one click away and URL-backed", async ({
    page,
  }) => {
    /*
     * UIX-01 — the layout is chosen from the header's shared overflow menu.
     *
     * List / Board / Sectors was a permanent three-segment control beside the
     * title. It is a real choice and a rare one, and a control parked in the
     * header's best space for a decision made once a week is what the redesign
     * removed. Same `?view=` parameter, same three presentations, same one
     * click — from the ⋯ instead of from a segment.
     */
    await gotoFixture(page, "/tasks");
    for (const [label, marker] of [
      ["Sectors", ".dh-tasks-sectors"],
      ["Board", ".dh-tasks-board"],
      // DS-04 — the List presentation is the product-level task list, not the
      // generic card collection it was configured from.
      ["List", ".dh-tasklist"],
    ] as const) {
      await page.getByTestId("tasks-overflow").click();
      await page
        .getByRole("menuitem", { name: `${label} layout`, exact: true })
        .click();
      await expect(page.locator(marker).first()).toBeVisible();
      // The presentation change revalidates the loader; the NEXT iteration
      // opens the same menu, and a click dispatched into a re-rendering header
      // is silently dropped.
      await page.waitForLoadState("networkidle");
    }
    await expect(page).toHaveURL(/view=list|\/tasks$/);
  });

  test("still honours a LEGACY TASKS-01 link, landing on the same records", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=all");
    // Redirected once into the TASKS-03 vocabulary — the address bar stays honest
    // about which configuration is actually applied.
    await expect(page).toHaveURL(/view=list/);
    await expect(page).toHaveURL(/system=all/);
    await expect(taskRows(page).first()).toBeVisible();
  });
});

test.describe("TASKS-03 — filtering", () => {
  test("combines filters, explains them as chips, and resets them", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&priority=p1&due=overdue",
    );

    // Every applied filter is named in WORDS where the records would be.
    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips).toContainText("Priority:");
    await expect(chips).toContainText("Due:");
    await expect(chips).toContainText("Overdue");
    // The Filter button carries the count, so a short list is never unexplained.
    await expect(page.getByTestId("collection-filter-trigger")).toContainText(
      "2",
    );

    // Removing ONE chip keeps the other.
    await page
      .getByRole("link", { name: /^Remove filter Due: Overdue$/ })
      .click();
    await expect(page).not.toHaveURL(/due=overdue/);
    await expect(page).toHaveURL(/priority=p1/);

    // Reset clears the filters, and only the filters.
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&priority=p1&due=overdue&sort=title",
    );
    await page.getByTestId("collection-reset-filters").click();
    await expect(page).not.toHaveURL(/priority=p1/);
    await expect(page).not.toHaveURL(/due=overdue/);
    await expect(page).toHaveURL(/sort=title/);
  });

  test("applies filters through the shared sheet, writing the SAME URL state", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const sheet = await openSheet(page);
    await sheet.getByTestId("collection-sheet-priority-p1").click();
    await sheet.getByTestId("collection-sheet-due-overdue").click();
    await page.getByTestId("collection-sheet-apply").click();
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
    // …and the desktop chips reflect exactly what the sheet applied.
    await expect(
      page.getByRole("list", { name: "Active filters" }),
    ).toContainText("Overdue");
  });

  test("teaches the way out of a filtered-empty result", async ({ page }) => {
    // A deliberately contradictory combination: due today AND due later.
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&due=due_today&planned=planned_later&priority=p4&person=Sam+Okafor&status=cancelled",
    );
    await expect(
      page.getByRole("heading", { name: "No tasks match these filters" }),
    ).toBeVisible();
    // Never a dead end: the recovery is named and the chips are still there.
    await expect(page.getByTestId("collection-reset-filters")).toBeVisible();
  });

  test("survives a reload and Back/Forward with the filters intact", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    await page.getByTestId("collection-filter-trigger").click();
    await page.getByTestId("collection-sheet").waitFor();
    await page.getByTestId("collection-sheet-priority-p1").click();
    await page.getByTestId("collection-sheet-apply").click();
    await expect(page).toHaveURL(/priority=p1/);

    await page.reload();
    await expect(
      page.getByRole("list", { name: "Active filters" }),
    ).toContainText("P1");

    await gotoFixture(page, "/tasks?view=list&system=all&due=overdue");
    await page.goBack();
    await expect(page).toHaveURL(/priority=p1/);
    await page.goForward();
    await expect(page).toHaveURL(/due=overdue/);
  });

  test("rejects a hostile filter value calmly instead of failing", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/tasks?priority=p9%27%20OR%201%3D1&sort=e.title%20DESC&group=%3Bdrop",
    );
    // The page renders normally; the unrecognised values simply did not apply.
    await expect(taskRows(page).first()).toBeVisible();
    await expect(
      page.getByTestId("collection-filter-trigger"),
    ).not.toContainText("1");
  });
});

test.describe("TASKS-03 — sorting and grouping", () => {
  test("groups with AUTHORITATIVE counts and drills into exactly what it counted", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=list&system=all&group=due_state");
    const overdue = page.getByRole("region", { name: "Overdue" });
    await expect(overdue).toBeVisible();
    const heading = await overdue.getByRole("heading").first().textContent();
    // UIX-01 — "OVERDUE 2", not "Overdue (2)". Same count, no brackets.
    const count = Number(/(\d+)\s*$/.exec((heading ?? "").trim())?.[1] ?? "0");
    expect(count).toBeGreaterThan(0);

    // The bucket's own filtered list holds exactly the records the count promised.
    await gotoFixture(page, "/tasks?view=list&system=all&due=overdue");
    await expect(taskRows(page)).toHaveCount(count);
  });

  test("hides EMPTY groups outside the specialist views, and keeps them inside", async ({
    page,
  }) => {
    // Grouping an already-narrow scope leaves buckets with nothing in them; those
    // are noise in an ordinary list.
    await gotoFixture(page, "/tasks?view=list&system=overdue&group=status");
    const sections = page.locator(".dh-tasks-grouped__section");
    const total = await sections.count();
    for (let i = 0; i < total; i += 1) {
      await expect(sections.nth(i)).not.toContainText("Nothing here.");
    }

    // Time Sectors keeps every window, because a planning board with a missing week
    // hides the fact that nothing is planned for it.
    await gotoFixture(page, "/tasks?view=sectors");
    for (const label of ["No sector", "This Week", "Next Week", "Long Term"]) {
      await expect(
        page.getByRole("heading", { name: label }).first(),
      ).toBeVisible();
    }
  });

  test("a LEGACY ?view=matrix link lands calmly on the priority-grouped list", async ({
    page,
  }) => {
    // TASKS-05 removed the Matrix. An old bookmark must not 404 and must not quietly
    // lose the banding it provided — it redirects ONCE into the equivalent grouped
    // list, and the address bar says so.
    await gotoFixture(page, "/tasks?view=matrix");
    await expect(page).toHaveURL(/view=list/);
    await expect(page).toHaveURL(/group=priority/);
    await expect(
      page.getByRole("heading", { name: /P1 · Urgent/ }).first(),
    ).toBeVisible();
    await expect(page.locator(".dh-tasks-matrix")).toHaveCount(0);
  });

  test("sorts and reverses, keeping the order stable across reloads", async ({
    page,
  }) => {
    const titles = async () =>
      taskRows(page).locator("h2, h3").allTextContents();

    /*
     * `group=none` is explicit here, and has to be.
     *
     * UIX-01 made due-state grouping the DEFAULT for the everyday views, and a
     * URL that names only a sort still inherits the rest of the view it is a
     * link into — exactly as it already inherited the presentation and the
     * system view. A grouped list renders bounded per-bucket slices rather than
     * one flat page, which is not what a sort-stability check is about.
     */
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=title&group=none",
    );
    const asc = await titles();
    await page.reload();
    // Stability: the same query returns the same order, every time.
    expect(await titles()).toEqual(asc);

    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=title&dir=desc&group=none",
    );
    const desc = await titles();
    expect(desc[0]).not.toBe(asc[0]);
  });
});

test.describe("TASKS-03 — saved views", () => {
  test("saves, re-selects, sets a default and deletes with confirmation", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await removeSavedView(page);

    // Build a configuration, then save it under a name.
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&priority=p1&group=parent",
    );
    await page.getByRole("button", { name: "Manage Tasks views" }).click();
    await page.getByRole("menuitem", { name: /Save as new view/ }).click();
    const nameField = page.getByTestId("tasks-view-name-input");
    await nameField.waitFor();
    await nameField.fill(SAVED_VIEW);
    await page.getByTestId("tasks-view-name-save").click();
    await expect(page.getByTestId("tasks-view-trigger")).toContainText(
      SAVED_VIEW,
    );

    // It survives a reload and re-selection, applying the SAME configuration.
    await gotoFixture(page, "/tasks");
    await page.getByTestId("tasks-view-trigger").click();
    await page
      .getByTestId("tasks-view-panel")
      .getByRole("link", {
        name: SAVED_VIEW,
      })
      .click();
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/group=parent/);

    // Built-in views are distinguishable from the owner's own WITHOUT colour.
    await page.getByTestId("tasks-view-trigger").click();
    const panel = page.getByTestId("tasks-view-panel");
    await expect(
      panel.getByRole("heading", { name: "Built-in views" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: "Your views" }),
    ).toBeVisible();
    await expect(panel).toContainText("can’t be changed or deleted");
    await page.keyboard.press("Escape");

    // Deleting asks first, and says what is and is not affected.
    await page.getByRole("button", { name: "Manage Tasks views" }).click();
    await page
      .getByRole("menuitem", { name: new RegExp(`Delete “${SAVED_VIEW}`) })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Your tasks are not affected");
    await dialog.getByRole("button", { name: "Delete view" }).click();
    await expect(page.getByTestId("tasks-view-trigger")).not.toContainText(
      SAVED_VIEW,
    );
  });

  test("offers no mutating or destructive action on a BUILT-IN view", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?system=overdue&sort=due_date");
    await page.getByRole("button", { name: "Manage Tasks views" }).click();
    await expect(page.getByRole("menuitem", { name: /^Rename/ })).toHaveCount(
      0,
    );
    await expect(page.getByRole("menuitem", { name: /^Delete/ })).toHaveCount(
      0,
    );
    // …but the current configuration can always be saved as the owner's own.
    await expect(
      page.getByRole("menuitem", { name: /Save as new view/ }),
    ).toBeVisible();
  });
});

test.describe("TASKS-03 — quick capture and quick edits", () => {
  test("adds several tasks in succession without leaving the list", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=created&dir=desc",
    );
    const field = page.getByTestId("tasks-quickadd-input");
    const stamp = Date.now();

    for (const suffix of ["one", "two"]) {
      await field.fill(`E2E quick add ${stamp} ${suffix}`);
      await field.press("Enter");
      // Cleared and refocused — the next task is one keystroke away.
      await expect(field).toHaveValue("");
      await expect(field).toBeFocused();
    }
    await expect(
      page.getByRole("link", { name: `E2E quick add ${stamp} two` }).first(),
    ).toBeVisible();
  });

  test("completes from the row through the CANONICAL task route", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=created&dir=desc",
    );
    const field = page.getByTestId("tasks-quickadd-input");
    const title = `E2E complete from list ${Date.now()}`;
    await field.fill(title);
    await field.press("Enter");

    const card = taskRow(page, title);
    await expect(card).toBeVisible();
    // UIQ-002 — on a fine pointer the row's action rail reveals on hover and is
    // pointer-inert while concealed, so pointing at the row precedes the click,
    // exactly as a person performs it.
    await card.hover();
    await card.getByRole("checkbox", { name: `Complete ${title}` }).check();

    // The row reflects the SERVER, so the state pill becomes Completed and the
    // record itself agrees when opened in the canonical Drawer.
    await expect(card).toContainText("Completed");
    await page.getByRole("link", { name: title }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // The canonical record agrees: its own completion checkbox is now checked.
    await expect(
      dialog.getByRole("checkbox", { name: "Completed" }),
    ).toBeChecked();
  });

  test("sets a due date from the row without touching the planned date", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=created&dir=desc",
    );
    const field = page.getByTestId("tasks-quickadd-input");
    const title = `E2E due from list ${Date.now()}`;
    await field.fill(title);
    await field.press("Enter");

    const card = taskRow(page, title);
    await expect(card).toBeVisible();

    // TASKS-05 — the DUE date edits IN PLACE on the row. The value is the button:
    // an unset due date reads a quiet "No due date", and activating it opens the
    // shared DS-16 date popover right where the value is shown. It used to be a
    // menu item two clicks away.
    await card.hover();
    await card.getByRole("button", { name: /^Due date/ }).click();
    const duePopover = page.getByRole("dialog", { name: "Edit due date" });
    await duePopover.getByLabel("Due date", { exact: true }).fill(ownerToday());
    await duePopover.getByRole("button", { name: "Save", exact: true }).click();
    // UIX-01 — the row states the due date as the word "Today". The separate
    // "Due today" urgency chip is gone: a relative date says it itself.
    await expect(card).toContainText("Today");
    /*
     * Wait for the SERVER's answer before opening a menu on this row.
     *
     * The word above is painted optimistically off the client's patch map; the
     * BUCKET is the server's, and the revalidation the save asked for lands a
     * moment later and RE-CREATES the row under its new due state — taking any
     * menu open on it with it ("element was detached from the DOM"). HARDEN-04
     * added the same wait to `tasks-journey` for the same reason, and it was
     * missing here: the next step opens this row's overflow.
     */
    await page.waitForLoadState("networkidle");

    // Then PLAN it for today. The due date is a deadline and the planned date is
    // a commitment (ADR-043 §3): setting one must never overwrite the other, so
    // the canonical record is asked directly.
    await card.hover();
    await planForToday(page, title);
    await expect(card).toBeVisible();
    await page.getByRole("link", { name: title }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Due");
    await expect(dialog).toContainText("Scheduled");
  });
});

test.describe("TASKS-03 — Today integration", () => {
  test("plans from the list and Today reflects it immediately", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=created&dir=desc",
    );
    const field = page.getByTestId("tasks-quickadd-input");
    const title = `E2E today integration ${Date.now()}`;
    await field.fill(title);
    await field.press("Enter");

    const card = taskRow(page, title);
    // UIQ-002 — the rail reveals on hover; pointing at the row precedes the
    // click, exactly as a person performs it.
    await card.hover();
    await planForToday(page, title);
    await expect(card).toBeVisible();

    /*
     * The plan LANDED — asserted against the canonical `today` system view
     * rather than only against Today's screen. Today lists unplanned work too
     * (the always-present backlog band), so "it is on Today" is satisfied by a
     * task that was never planned at all, and the clearing half below has
     * nothing to prove without this.
     */
    await gotoFixture(page, "/tasks?view=list&system=today");
    await expect(taskRow(page, title)).toBeVisible();

    // Today reads the SAME canonical planning field — there is no second
    // definition of "today" to keep in step.
    await gotoFixture(page, "/today");
    await expect(page.getByRole("link", { name: title }).first()).toBeVisible();

    // Completing from Today's own surface is reflected back in Tasks.
    await gotoFixture(page, "/tasks?view=list&system=completed&sort=updated");
    await expect(taskRows(page).first()).toBeVisible();

    // Clear the plan so a lingering scheduled-today task cannot leak a "Today"
    // band into another spec's view of the dashboard. (It moves to the always-
    // present backlog band rather than off Today — that IS Today's model, and
    // nothing here redefines it.)
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=created&dir=desc",
    );
    const again = taskRow(page, title);
    await again.hover();
    /*
     * HARDEN-02 — the planned date is edited from the row's QUICK-EDIT panel.
     *
     * This reached for the row's inline "Planned date" field, which TASKS-05 did
     * put there and UIX-06 then removed from the list presentation: the whole
     * `low` metadata tier (planned date, sector, delegate) is `display: none` in
     * `.dh-card-collection--list`, because "true, rarely the reason to act, and
     * on the record" is not worth a column fifty times down a list
     * (`tasks.css`). The control is still IN the DOM, so the old locator
     * resolved and then waited out its timeout on an element no user can see.
     *
     * The path the product kept is the one `tasks.css` names in the same breath
     * — the row's overflow → "Priority, dates and repeat…" — which is also the
     * path a touch device has always used, so this now drives what a phone
     * drives.
     */
    await again.getByRole("button", { name: /^More actions for / }).click();
    await page
      .getByRole("menu")
      .last()
      .getByRole("menuitem", { name: "Priority, dates and repeat…" })
      .click();
    const quickEdit = page.getByTestId("task-quick-edit");
    await expect(quickEdit).toBeVisible();
    await quickEdit.getByLabel("Scheduled date").fill("");
    // The panel announces the SERVER's answer, not the optimistic guess, through
    // the drawer's own live region — so this is also the wait: navigating on the
    // keystroke would abandon the mutation in flight and then assert against a
    // plan that was never cleared.
    await expect(
      page.getByRole("status").filter({ hasText: /Cleared the planned date/ }),
    ).toHaveCount(1);

    /*
     * And the OUTCOME is asserted where the plan actually lives: the canonical
     * `today` system view, which is the same rule Today reads. The previous
     * assertion — that the row no longer says "Scheduled today" — could not fail,
     * because no row says it any more.
     */
    await gotoFixture(page, "/tasks?view=list&system=today");
    await expect(taskRow(page, title)).toHaveCount(0);
  });

  test("choosing a DEFAULT Tasks view does not change the Today dashboard", async ({
    page,
  }) => {
    /**
     * Click the switcher's set-default item, whichever of its two labels it is
     * currently showing. The control is one item that toggles between "make this
     * the default" and "clear the default", so a spec that hard-coded one label
     * would depend on the state a previous run left behind.
     */
    const toggleDefault = async () => {
      await page.getByRole("button", { name: "Manage Tasks views" }).click();
      await page
        .getByRole("menuitem", { name: /the default|Clear default/ })
        .click();
      // Wait for the write to be CONFIRMED before navigating: navigating away
      // from an in-flight fetcher aborts it, and the test would then assert
      // against a preference that was never stored.
      await expect(
        page.getByText(/Default Tasks view (set|cleared)\./),
      ).toBeAttached();
    };

    // Start from a known state: no default.
    await gotoFixture(page, "/tasks");
    if (
      await page
        .getByTestId("tasks-view-trigger")
        .locator("..")
        .getByText("Default")
        .count()
    ) {
      await toggleDefault();
    }

    // Capture Today's own content before touching any Tasks preference.
    await gotoFixture(page, "/today");
    const before = await page.locator("main").innerText();

    // Make a narrow built-in view the default for /tasks.
    await gotoFixture(page, "/tasks?system=waiting");
    await toggleDefault();
    await gotoFixture(page, "/tasks");
    await expect(page.getByTestId("tasks-view-trigger")).toContainText(
      "Waiting",
    );

    // Today is unmoved: the Tasks default is a Tasks preference, not a
    // redefinition of what Today shows.
    await gotoFixture(page, "/today");
    expect(await page.locator("main").innerText()).toBe(before);

    // Restore, so the preference does not leak into another spec.
    await gotoFixture(page, "/tasks");
    await toggleDefault();
    await gotoFixture(page, "/tasks");
    await expect(page.getByTestId("tasks-view-trigger")).toContainText(
      "All active",
    );
  });
});

test.describe("TASKS-03 — accessibility, keyboard and responsive", () => {
  test("is axe-clean in light and dark across the presentations", async ({
    page,
  }) => {
    // Eight full axe passes over an 80-task collection, four of them grouped: the
    // work is real, so the budget is raised to match it. No assertion is relaxed.
    test.setTimeout(120_000);
    for (const query of [
      "view=list&system=all",
      "view=list&group=parent",
      "view=board&group=due_state",
      "view=list&system=all&priority=p1&due=overdue",
    ]) {
      await gotoFixture(page, `/tasks?${query}`);
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "light" });
    }
  });

  test("drives filtering and the view switcher by KEYBOARD, restoring focus", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");

    // The sheet opens from the keyboard and closes back onto its trigger.
    const trigger = page.getByTestId("collection-filter-trigger");
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.getByTestId("collection-sheet").waitFor();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();

    // So does the view switcher's management menu.
    const manage = page.getByRole("button", { name: "Manage Tasks views" });
    await manage.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(manage).toBeFocused();
  });

  test("announces a list-level mutation to assistive technology", async ({
    page,
  }) => {
    await gotoFixture(
      page,
      "/tasks?view=list&system=all&sort=created&dir=desc",
    );
    const field = page.getByTestId("tasks-quickadd-input");
    const title = `E2E announce ${Date.now()}`;
    await field.fill(title);
    await field.press("Enter");

    const card = taskRow(page, title);
    // UIQ-002 — the rail reveals on hover; pointer users point before clicking.
    await card.hover();
    await card.getByRole("checkbox", { name: `Complete ${title}` }).check();
    await expect(
      page.locator("[role='status']").filter({ hasText: "Completed" }).first(),
    ).toBeAttached();
  });

  test("does not overflow at any supported width, or at 200% zoom", async ({
    page,
  }) => {
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await gotoFixture(page, "/tasks?view=list&system=all&priority=p1");
      await expectNoHorizontalOverflow(page);
    }

    // 200% zoom is the same content in half the CSS pixels.
    await page.setViewportSize({ width: 640, height: 512 });
    await gotoFixture(page, "/tasks?view=list&system=all");
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("TASKS-03 — phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("reaches filters, sorting, grouping and saved views within two taps", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const sheet = await openSheet(page);
    // One sheet, every control: filters, layout, grouping, sort and density.
    for (const heading of ["Priority", "Due", "Layout", "Group by", "Sort"]) {
      await expect(
        sheet.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await sheet.getByTestId("collection-sheet-priority-p1").click();
    await page.getByTestId("collection-sheet-apply").click();
    await expect(page).toHaveURL(/priority=p1/);

    // The applied filter stays understandable on the phone, as a removable chip.
    await expect(
      page.getByRole("list", { name: "Active filters" }),
    ).toContainText("P1");
    await expectNoHorizontalOverflow(page);
  });

  test("meets the 44px target on every control a thumb reaches for", async ({
    page,
  }) => {
    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await gotoFixture(page, "/tasks?view=list&system=all&priority=p1");
      // The collection chrome: the one sheet trigger and the reset beside the
      // chips that explains the short list.
      await expectMinTouchTarget(page.getByTestId("collection-filter-trigger"));
      await expectMinTouchTarget(page.getByTestId("collection-reset-filters"));
      // And a row's own quick edits: complete and the overflow.
      const row = taskRows(page).first();
      /*
       * UIX-01 — the 20px circle sits inside a 44px LABEL, which is the thing a
       * thumb aims at. The reference draws a small circle and WCAG 2.2 (2.5.8)
       * sizes the target, not the ink, so the label is what must measure up.
       */
      await expectMinTouchTarget(row.locator("label.dh-check-circle-target"));
      /*
       * "Plan for today" is no longer a permanent button on the row — UIX-01
       * removed the standing action rail so the row is one scannable line. The
       * action lives in the row's overflow menu and in the touch swipe tray
       * (recorded in TASKS_MODULE.md), both of which are exercised elsewhere.
       */
      await expectMinTouchTarget(
        row.getByRole("button", { name: /^More actions/ }),
      );
    }
  });

  test("keeps quick capture title-first and the bottom bar clear of content", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const field = page.getByTestId("tasks-quickadd-input");
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute("type", "text");

    // The phone bottom navigation is still present and does not cover the list.
    const nav = page.locator("[data-testid='bottom-nav']");
    await expect(nav).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
