import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  awaitMutation,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  expectMinTouchTarget,
  gotoFixture,
  openCollectionControls,
  ownerToday,
  pickCalendarDate,
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
  /*
   * DEBT-203 — wait for the PLAN to land, not for the optimistic paint.
   *
   * "Plan for today" is a single-id `/tasks/bulk` field change painted while it
   * is in flight (`TasksWorkspace`), so the row says "Today" the instant the
   * menu item is pressed. Both callers then either navigate or open a menu on
   * that same row. On a slow server the first abandoned the POST in flight, and
   * the second met the revalidation re-creating the row under its open menu —
   * measured on `main` as `tasks-collection.spec.ts:634` and `:700`, twice
   * each, on a tree neither PR had touched. The wait belongs on the answer the
   * product publishes.
   */
  await awaitMutation(page, "/tasks/bulk", () =>
    page
      .getByRole("menu")
      .last()
      .getByRole("menuitem", { name: "Plan for today", exact: true })
      .click(),
  );
}

/** Open the ONE shared collection sheet. */
/**
 * The collection's controls, in whichever presentation this viewport gets.
 *
 * CONTROL-01 made the Sheet the PHONE presentation and gave a pointer device an
 * anchored, live-applying popover; `openCollectionControls` is the shared
 * helper for both. This file used to drive `collection-sheet-*` at desktop
 * widths, where no sheet has rendered since, and three journeys timed out.
 */
const openSheet = openCollectionControls;

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
    const controls = await openSheet(page);
    await controls.choose("priority", "p1");
    await controls.choose("due", "overdue");
    await controls.commit();
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
    // …and the desktop chips reflect exactly what the sheet applied.
    await expect(
      page.getByRole("list", { name: "Active filters" }),
    ).toContainText("Overdue");
  });

  /**
   * V2.3-GATE-01 — two filters chosen faster than the collection can reload.
   *
   * The desktop popover LIVE-APPLIES (CONTROL-01): each choice is committed as
   * it is made, composed over what the collection reports as applied. That
   * committed state only advances when the navigation COMPLETES, and a
   * navigation completes only after its loader has answered — so a second choice
   * made inside that window used to be composed over a base that had never heard
   * of the first, which deleted it. MEASURED on `main` @ bcdba66: choosing
   * Priority 1 then Due Overdue wrote `/tasks?group=due_state&due=overdue`, and
   * `priority=p1` was simply gone.
   *
   * The window is held open DETERMINISTICALLY here — the first revalidation is
   * paused until the second choice has actually been made — so this is a real
   * product condition (a collection still loading) reproduced exactly, never a
   * sleep and never a race the test hopes to win.
   */
  test("combines two filters chosen before the first has finished loading", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const controls = await openSheet(page);
    // The pointer device gets the live-applying popover; that IS the surface
    // under test, so the test says so rather than assuming it.
    expect(controls.compact).toBe(false);

    let releaseFirstReload: (() => void) | undefined;
    const firstReloadHeld = new Promise<void>((resolve) => {
      releaseFirstReload = resolve;
    });
    let reloads = 0;
    await page.route(/\.data(\?|$)/, async (route) => {
      reloads += 1;
      // Only the FIRST is held; everything after it answers normally.
      if (reloads === 1) await firstReloadHeld;
      await route.continue();
    });

    await controls.choose("priority", "p1");
    // Made while the first choice is still in flight — the exact window.
    await controls.choose("due", "overdue");
    releaseFirstReload?.();
    await controls.commit();

    // BOTH dimensions survived, and the URL says so truthfully.
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
    await expect(page.getByTestId("collection-filter-trigger")).toContainText(
      "2",
    );
    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips).toContainText("P1");
    await expect(chips).toContainText("Overdue");
  });

  test("keeps BOTH filters through reload, Back and Forward", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const controls = await openSheet(page);
    await controls.choose("priority", "p1");
    await expect(page).toHaveURL(/priority=p1/);
    await controls.choose("due", "overdue");
    await controls.commit();
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);

    // A hard reload of the resulting link restores exactly the same two.
    await page.reload();
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips).toContainText("P1");
    await expect(chips).toContainText("Overdue");

    // Leaving and coming back is Back/Forward-correct in both directions: the
    // live commits `replace`, so the pair is ONE history entry rather than two.
    await gotoFixture(page, "/tasks?view=list&system=all&status=done");
    await expect(page).toHaveURL(/status=done/);
    await page.goBack();
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
    await page.goForward();
    await expect(page).toHaveURL(/status=done/);
    await expect(page).not.toHaveURL(/priority=p1/);
  });

  test("removes one of two applied filters and leaves the other", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks");
    const controls = await openSheet(page);
    await controls.choose("priority", "p1");
    await controls.choose("due", "overdue");
    await controls.commit();

    /*
     * "Two APPLIED filters" is this test's own title, and it had been assuming
     * it rather than asserting it. On a pointer viewport the controls apply
     * LIVE, so `commit()` is a no-op and the second choice's write may still be
     * in flight here. A chip is a `<Link>` whose destination was fixed at its
     * last render, so clicking one in that window follows a target composed
     * before the second filter existed — which removes both.
     *
     * MEASURED on CI run 32602831529 (p07): the URL after the click was
     * `/tasks?group=due_state`, with `due=overdue` gone as well as `priority=p1`.
     * The product is not at fault — `useAppliedParams` puts the pending write
     * into what the chips read, so a person one frame later sees the right
     * destination — but Playwright clicks inside a frame, and a test that races
     * its own precondition is not testing removal.
     *
     * The sibling journey above already waits for both parameters before going
     * on; this one now does the same. Nothing is weakened: if the two filters
     * genuinely failed to combine, this is where it fails, and it fails LOUDER
     * than a downstream expectation about what survived a removal.
     */
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);

    /*
     * Put the controls away before touching the chips, which is what a person
     * does and what this journey had never done. `commit()` closes the phone's
     * sheet and is a NO-OP on the pointer viewport's popover, so without this
     * the same journey reached across an open floating surface at one width and
     * a closed one at the other.
     *
     * MEASURED on CI runs 32604491454 and 32610240298: the chip click produced
     * no navigation at all — no third `.data` request, the URL unchanged.
     * `AnchoredSurface` dismisses on a capture-phase `pointerdown` and returns
     * focus to the trigger, so the page can move between `pointerdown` and
     * `pointerup` and the `click` never reaches the link. The sibling journey
     * that removes a chip with nothing open has always passed.
     */
    await controls.dismiss();

    await page
      .getByRole("link", { name: /^Remove filter Priority: P1$/ })
      .click();
    await expect(page).not.toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
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
    const controls = await openSheet(page);
    await controls.choose("priority", "p1");
    await controls.commit();
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
      page.getByRole("heading", { name: /Priority 1/ }).first(),
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
    /*
     * The canonical record agrees — it says "Completed" in words, and the only
     * completion act it now offers is the reverse one.
     *
     * CONTROL-01 §4 made completion the record header's ACTION rather than a
     * checkbox in the summary column, so there is no checked state to read: the
     * state is the header's status chip and the act is a named button. Both are
     * asserted, because "the record agrees" is a claim about the state, and
     * "the record is reversible from here" is a claim about the control.
     */
    await expect(dialog.getByText("Completed").first()).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();
  });

  test("sets a due date from the row without touching the planned date", async ({
    page,
  }) => {
    /*
     * A measured BUDGET correction (DEBT-203) — the second half of this
     * journey's repair, and the mechanism the wait above does not cover.
     *
     * MEASURED three ways on the same code: **9.4 s** in isolation on an idle
     * machine, **22.0 s** on the gate's own runner (#823, 73% of the 30 s
     * default), and **30.7 s** as the 138th test of a loaded sequential run.
     * A journey whose honest runtime is three quarters of its budget on a good
     * runner has no budget at all on an ordinary one, and that is why it went
     * red on `main` #833's p04 with nothing about it changed.
     *
     * It is a quick-add, an inline date popover driven through the shared
     * calendar, a revalidation, an overflow menu, a plan and a Drawer — eight
     * server round trips. Ninety seconds is the same size `tasks-journey.spec.ts`
     * gives its own multi-step journeys and `goals-alignment.spec.ts` got from
     * CONV-00. No assertion changes, `retries` stays 0.
     */
    test.setTimeout(90_000);
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
    /*
     * CONTROL-01 §2 — ONE DalyHub date control.
     *
     * The field inside this popover was the browser's native
     * `<input type="date">`, which `fill()` can write to. It is now the shared
     * calendar: `getByLabel("Due date")` resolves to its `role="grid"`, and
     * filling a grid is not a thing, so this failed with "Element is not an
     * <input>". `pickCalendarDate` is the suite's one way to drive it, and it
     * clicks the day the way an owner does — and the control COMMITS on
     * selection, because a calendar day is a complete answer, so the Save this
     * journey used to press no longer exists.
     */
    await awaitMutation(page, "/tasks/bulk", () =>
      pickCalendarDate(duePopover, ownerToday()),
    );
    await expect(duePopover).toHaveCount(0);
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
     *
     * DEBT-203 — this wait alone was not enough, and #833's p04 proved it: the
     * save above is now awaited on its own `/tasks/bulk` response, so this waits
     * for the REVALIDATION rather than for a write that may not have been sent
     * yet. Silence before the request goes out is silence, and that is the race
     * the two together close.
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
    /*
     * The same budget correction, on the journey CONV-00 recorded beside it
     * (DEBT-203).
     *
     * MEASURED: **22.0 s** on the gate's own runner (#823, 73% of the 30 s
     * default) and 30 s exactly — a timeout — 5 of 5 times in CONV-00's sandbox,
     * on the branch AND on an unchanged `origin/main` checkout, so it is not a
     * regression and never was. It is seven settled navigations, a quick-add,
     * two menus and a Drawer. The other half of its repair is the wait on the
     * `/tasks/bulk` answer in `planForToday` above; this is the half measurement
     * says the wait cannot fix.
     */
    test.setTimeout(90_000);
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
     * The path the product kept is the row's overflow → the Task record, which
     * is also the path a touch device has always used, so this now drives what a
     * phone drives.
     *
     * CONTROL-01 §4 — the menu item is "Open task", and it opens the ONE Task
     * drawer. It used to read "Priority, dates and repeat…" and open a SECOND
     * drawer (`TaskQuickEditPanel`) that edited a different subset of the same
     * task from the record beside it; that split is what §4 closed. The plan is
     * cleared here through the record's own Planning section — the same "Clear"
     * quick action the drawer has always carried.
     */
    await again.getByRole("button", { name: /^More actions for / }).click();
    await page
      .getByRole("menu")
      .last()
      .getByRole("menuitem", { name: "Open task" })
      .click();
    const record = page.getByRole("dialog");
    await expect(record.getByRole("group", { name: "Planning" })).toBeVisible();
    await record.getByRole("button", { name: "Clear plan" }).click();
    /*
     * Wait for the SERVER's answer, not the optimistic guess: the Scheduled
     * value returns to its unset state only once `/tasks/:id` has accepted the
     * clear. Navigating before that would abandon the mutation in flight and
     * then assert against a plan that was never cleared.
     */
    await expect(
      record.getByRole("button", { name: /^Scheduled date: (Not planned|—)/ }),
    ).toBeVisible();

    /*
     * And the OUTCOME is asserted where the plan actually lives: the canonical
     * `today` system view, which is the same rule Today reads. The previous
     * assertion — that the row no longer says "Scheduled today" — could not fail,
     * because no row says it any more.
     */
    await gotoFixture(page, "/tasks?view=list&system=today");
    await expect(taskRow(page, title)).toHaveCount(0);
  });

  /*
   * Its own `describe` for one reason: the restore has to be an `afterEach`.
   *
   * The default Tasks view is OWNER-LEVEL state — a bare `/tasks` honours it —
   * so a spec that sets it owes the workspace the same state back WHATEVER
   * happens to the test. It used to be the last line of the test, and on CI run
   * 32333645709 that turned one failure into six: this test failed at the
   * dashboard comparison, never reached the restore, and left `Waiting` as the
   * owner's default. Every `today-task-convergence` journey that then navigated
   * to a bare `/tasks` found a filtered collection with no row of its own, and
   * five innocent tests were reported as failures of their own code. An
   * `afterEach` runs on a failure and on a timeout alike; a last line runs on
   * neither.
   */
  test.describe("the default Tasks view", () => {
    /**
     * Click the switcher's set-default item, whichever of its two labels it is
     * currently showing. The control is one item that toggles between "make this
     * the default" and "clear the default", so a spec that hard-coded one label
     * would depend on the state a previous run left behind.
     */
    const toggleDefault = async (page: Page) => {
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

    /**
     * Put the workspace back to "no default Tasks view", from any state.
     *
     * Asked of the MENU ITEM's own label rather than of a "Default" badge beside
     * the trigger: that badge is rendered inside the switcher's dropdown panel,
     * against the row of whichever view carries it, so it is simply absent while
     * the panel is closed. A check that reads it therefore answers "no default"
     * every time, which is a cleanup that silently does nothing. On a bare
     * `/tasks` the item reads `Clear default …` when a default is stored and
     * `Make “…” the default` when none is, and that distinction is real.
     */
    const clearDefault = async (page: Page) => {
      await gotoFixture(page, "/tasks");
      await page.getByRole("button", { name: "Manage Tasks views" }).click();
      const clear = page.getByRole("menuitem", { name: /^Clear default/ });
      if (await clear.count()) {
        await clear.click();
        await expect(
          page.getByText(/Default Tasks view cleared\./),
        ).toBeAttached();
        return;
      }
      // Nothing stored — leave the menu as we found it.
      await page.keyboard.press("Escape");
    };

    test.beforeEach(async ({ page }) => {
      await clearDefault(page);
    });

    test.afterEach(async ({ page }) => {
      try {
        await clearDefault(page);
      } catch {
        // Best-effort, deliberately: a cleanup that throws would REPLACE the
        // failure the test actually found, which is the opposite of what this
        // hook is for.
      }
    });

    test("choosing a DEFAULT Tasks view does not change the Today dashboard", async ({
      page,
    }) => {
      /**
       * Today's own content, WITHOUT the shell's connection live region.
       *
       * `main` opens with `ConnectionStatus`, whose `role="status"` live region
       * carries an announcement that settles asynchronously — "Online. Not
       * stored offline yet." once the offline provider has looked, and it is
       * correct for it to say so. Comparing raw `main.innerText()` across two
       * visits therefore compares the dashboard AND a transient announcement
       * that has nothing to do with a Tasks preference. CI run 32333645709
       * caught it doing exactly that: the two snapshots differed by that one
       * line and by nothing else.
       *
       * Excluding the live region — and only the live region — keeps the
       * assertion at full strength over everything the claim is about.
       */
      const todayContent = () =>
        page.locator("main").evaluate((el) =>
          Array.from(el.children)
            .filter((child) => !child.matches('[role="status"]'))
            .map((child) => (child as HTMLElement).innerText)
            .join("\n"),
        );

      // Capture Today's own content before touching any Tasks preference.
      await gotoFixture(page, "/today");
      const before = await todayContent();

      // Make a narrow built-in view the default for /tasks.
      await gotoFixture(page, "/tasks?system=waiting");
      await toggleDefault(page);
      await gotoFixture(page, "/tasks");
      await expect(page.getByTestId("tasks-view-trigger")).toContainText(
        "Waiting",
      );

      // Today is unmoved: the Tasks default is a Tasks preference, not a
      // redefinition of what Today shows.
      await gotoFixture(page, "/today");
      expect(await todayContent()).toBe(before);

      // And the restore is real, not merely attempted by the hook below.
      await clearDefault(page);
      await gotoFixture(page, "/tasks");
      await expect(page.getByTestId("tasks-view-trigger")).toContainText(
        "All active",
      );
    });
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
    // Either presentation, for the reason `openSheet` gives above.
    await expect(
      page
        .getByTestId("collection-sheet")
        .or(page.getByTestId("collection-popover")),
    ).toBeVisible();
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
    const controls = await openSheet(page);
    // This block runs at 390px, so it genuinely gets the phone's sheet — and
    // says so, because "one sheet, every control" is a claim about the phone.
    expect(controls.compact).toBe(true);
    // One sheet, every control: filters, layout, grouping, sort and density.
    for (const heading of ["Priority", "Due", "Layout", "Group by", "Sort"]) {
      await expect(
        controls.surface.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
    }
    await controls.choose("priority", "p1");
    await controls.commit();
    await expect(page).toHaveURL(/priority=p1/);

    // The applied filter stays understandable on the phone, as a removable chip.
    await expect(
      page.getByRole("list", { name: "Active filters" }),
    ).toContainText("P1");
    await expectNoHorizontalOverflow(page);
  });

  test("applies Priority AND Due together from the one sheet", async ({
    page,
  }) => {
    /*
     * V2.3-GATE-01 — the compact half of the same contract.
     *
     * The Sheet edits a DRAFT and writes once on Apply, so it was never exposed
     * to the live-apply lost update the popover was; asserting it here is what
     * makes "filters combine" a claim about the PRODUCT rather than about one
     * viewport, and what would catch the sheet ever being converted to
     * live-apply without the same care.
     */
    await gotoFixture(page, "/tasks");
    const controls = await openSheet(page);
    expect(controls.compact).toBe(true);
    await controls.choose("priority", "p1");
    await controls.choose("due", "overdue");
    await controls.commit();

    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
    const chips = page.getByRole("list", { name: "Active filters" });
    await expect(chips).toContainText("P1");
    await expect(chips).toContainText("Overdue");

    // And the pair survives a reload on the phone exactly as on the desktop.
    await page.reload();
    await expect(page).toHaveURL(/priority=p1/);
    await expect(page).toHaveURL(/due=overdue/);
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
