import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoHorizontalOverflow,
  gotoFixture,
  pickCalendarDate,
  taskRow,
  waitForInteractive,
} from "./helpers";

/**
 * DHDS-10 — inline manipulation, driven the way an owner drives it.
 *
 * The phase's quality bar is a workflow, not a component: *open Today, move a
 * task to today, change its priority, move it into another Project, correct its
 * title, complete it — and count the record navigations. The ideal number is
 * zero.* So the first test is that workflow, run against Today, and the
 * assertion that matters is the count.
 *
 * Everything after it protects one rule the workflow depends on:
 *
 *   - **server truth.** A change made inline survives a reload, because it went
 *     through a canonical intent rather than into local React state (§45).
 *   - **the escape hatch is inline.** "Search all Projects and Areas…" opens
 *     the shared picker over the row, not the Task's record (§11).
 *   - **quiet at rest.** A populated list draws no chevrons until it is engaged
 *     with, which is the difference between a task list and a spreadsheet (§6).
 *   - **keyboard first.** Open, arrow, choose, Escape — and focus comes back to
 *     the value the owner was standing on (§27).
 *   - **the phone gets a sheet**, at the touch-target floor, with no horizontal
 *     overflow at 393 or 320 (§28).
 *   - **a refusal is truthful.** The row keeps the value the record actually
 *     has, and says why (§30).
 *
 * Timing is by visible state and by persisted server state — never a sleep.
 */

/**
 * A flat, recently-updated list, so a probe stays where it was captured.
 *
 * The default `/tasks` view groups by due state and pages at fifty, so a
 * freshly-captured task with no date lands past the end of page one. The same
 * reasoning `inline-editor-overlay.spec.ts` records for its own probes.
 */
const FLAT_VIEW = "/tasks?group=none&sort=updated&dir=desc";

/** Capture a probe Task of this spec's own, through the product's quick-add. */
async function captureProbe(page: Page, suffix: string): Promise<string> {
  const title = `DHDS-10 probe ${suffix}`;
  await clearProbes(page, title);
  const quickAdd = page.getByRole("textbox", { name: "Task title" });
  await quickAdd.fill(title);
  await quickAdd.press("Enter");
  await expect(taskRow(page, title).first()).toBeVisible();
  await expect(taskRow(page, title)).toHaveCount(1);
  return title;
}

/**
 * Complete every active task of this title — however many there are.
 *
 * A run that fails mid-journey leaves an EDITED probe behind, and the next run
 * would then operate on "whichever sorts first". Clearing first makes each
 * journey start from the state it describes.
 */
async function clearProbes(page: Page, title: string) {
  const checkbox = page.getByRole("checkbox", { name: `Complete ${title}` });
  await expect
    .poll(
      async () => {
        const remaining = await checkbox.count();
        if (remaining === 0) return 0;
        await checkbox.first().click();
        await page.waitForLoadState("networkidle");
        return await checkbox.count();
      },
      { message: `no "${title}" probe should survive`, timeout: 30_000 },
    )
    .toBe(0);
}

/**
 * Open a row's overflow menu, and make sure it STAYS open.
 *
 * Same reason as {@link openCell}: an accepted change re-reads the list a beat
 * after the value lands, which detaches the row and with it any menu opened into
 * that window. Polling re-opens rather than asserting on the timing of a
 * re-read this spec is not testing.
 */
async function openRowMenu(page: Page, title: string) {
  await expect
    .poll(
      async () => {
        const row = taskRow(page, title).first();
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

/**
 * Open one of a row's metadata editors, and make sure it STAYS open.
 *
 * The retry is about the LIST, not the editor: an accepted change re-groups the
 * row and the revalidation lands a beat after the value does, remounting any
 * editor opened into that window. That is pre-existing list behaviour, and
 * re-opening is how a test that is not about it avoids racing it.
 */
async function openCell(page: Page, title: string, testId: string) {
  await expect
    .poll(
      async () => {
        const trigger = taskRow(page, title)
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

test.describe("DHDS-10 — the acceptance workflow", () => {
  test("a working day is run from Today with ZERO record navigations", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });

    /*
     * The setup, on `/tasks`, is deliberately NOT part of the count.
     *
     * The probe is captured through quick-add, given a due date of TOMORROW and
     * planned for TODAY — which is exactly the state §49's workflow starts
     * from: a task on today's plan whose deadline the owner is about to pull
     * forward. Being planned for today is what keeps it on the panel while the
     * due date moves, so the later steps still have a row to work on.
     */
    await gotoFixture(page, FLAT_VIEW);
    const title = await captureProbe(page, "workflow");
    await openCell(page, title, "task-row-due-date");
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-due-date"),
    ).toContainText("Tomorrow");
    await openRowMenu(page, title);
    await page.getByRole("menuitem", { name: "Plan for today" }).click();
    await page.waitForLoadState("networkidle");

    await gotoFixture(page, "/today");
    await waitForInteractive(page);
    /*
     * The count that IS the acceptance test.
     *
     * Every full-record navigation lands on `/tasks?drawer=task:…` or on a
     * record route, so counting main-frame navigations away from `/today`
     * counts exactly the thing §49 asks about. It is armed here, after the
     * setup, and read at the end.
     */
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = new URL(frame.url());
      if (url.pathname !== "/today" || url.searchParams.has("drawer")) {
        navigations.push(frame.url());
      }
    });

    const todayRow = taskRow(page, title).first();
    await expect(todayRow).toBeVisible();

    // 1 — the DATE, from the row. "Tomorrow → click → Friday", in §4's words.
    await openCell(page, title, "task-row-due-date");
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-due-date"),
    ).toContainText("Today");

    // 2 — the PRIORITY, from the row.
    await openCell(page, title, "task-row-priority");
    await page.getByRole("menuitemradio", { name: "Priority 1" }).click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-priority"),
    ).toContainText("P1");

    // 3 — the PROJECT, from the row.
    await openCell(page, title, "task-row-parent");
    await page
      .getByRole("menuitemradio", { name: "Conference talk" })
      .first()
      .click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-parent"),
    ).toContainText("Conference talk");

    // 4 — the TITLE, from the row's overflow. This is what Today could not do.
    const corrected = `${title} corrected`;
    await openRowMenu(page, title);
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const input = page.getByRole("textbox", { name: `Rename ${title}` });
    await input.fill(corrected);
    await input.press("Enter");
    await expect(taskRow(page, corrected).first()).toBeVisible();

    // 5 — COMPLETE it, from the row's own control.
    await page
      .getByRole("checkbox", { name: `Complete ${corrected}` })
      .first()
      .click();
    await page.waitForLoadState("networkidle");

    // The bar: five changes, no record opened.
    expect(
      navigations,
      "changing a Task's date, priority, Project and title from Today must open no record",
    ).toEqual([]);

    await gotoFixture(page, FLAT_VIEW);
    await clearProbes(page, corrected);
  });
});

test.describe("DHDS-10 — server truth", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoFixture(page, FLAT_VIEW);
  });

  test("an inline priority change survives a reload", async ({ page }) => {
    const title = await captureProbe(page, "priority-truth");
    await openCell(page, title, "task-row-priority");
    await page.getByRole("menuitemradio", { name: "Priority 2" }).click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-priority"),
    ).toContainText("P2");

    // The whole point of posting a canonical intent rather than holding React
    // state: the SERVER has it.
    await page.reload();
    await waitForInteractive(page);
    await expect(
      taskRow(page, title).first().getByTestId("task-row-priority"),
    ).toContainText("P2");
    await clearProbes(page, title);
  });

  test("an inline due date can be set and REMOVED, and both persist", async ({
    page,
  }) => {
    const title = await captureProbe(page, "date-truth");
    await openCell(page, title, "task-row-due-date");
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-due-date"),
    ).toContainText("Tomorrow");

    await page.reload();
    await waitForInteractive(page);
    await openCell(page, title, "task-row-due-date");
    // The command's visible words are "No date"; its accessible NAME says
    // which field it empties, which is the product-wide wording for a clear.
    await page.getByRole("button", { name: "Clear due date" }).click();
    await page.reload();
    await waitForInteractive(page);
    // Removing a date is a first-class outcome, not an error state.
    await expect(
      taskRow(page, title).first().getByTestId("task-row-due-date"),
    ).not.toContainText("Tomorrow");
    await clearProbes(page, title);
  });

  test("a Task moves into a Project and back to the Inbox from the row", async ({
    page,
  }) => {
    const title = await captureProbe(page, "project-truth");
    await openCell(page, title, "task-row-parent");
    await page
      .getByRole("menuitemradio", { name: "Conference talk" })
      .first()
      .click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-parent"),
    ).toContainText("Conference talk");

    await page.reload();
    await waitForInteractive(page);
    await openCell(page, title, "task-row-parent");
    // The project-less state is a real DESTINATION, worded as one.
    await page.getByRole("menuitemradio", { name: "Move to Inbox" }).click();
    await page.reload();
    await waitForInteractive(page);
    await expect(
      taskRow(page, title).first().getByTestId("task-row-parent"),
    ).not.toContainText("Conference talk");
    await clearProbes(page, title);
  });

  test("the project field's escape hatch opens a PICKER, not the record", async ({
    page,
  }) => {
    const title = await captureProbe(page, "escape-hatch");
    const before = page.url();

    await openCell(page, title, "task-row-parent");
    await page
      .getByRole("menuitem", { name: /Search all Projects and Areas/ })
      .click();

    // A searchable listbox over the whole workspace, on the surface the owner
    // is already on. Before DHDS-10 this opened `?drawer=task-move:<id>`.
    const picker = page.getByRole("dialog", { name: /Project or Area/i });
    await expect(picker).toBeVisible();
    await expect(page.getByRole("listbox")).toBeVisible();
    expect(page.url(), "the escape hatch must not navigate").toBe(before);

    // And it commits through the same mutation the bounded menu does.
    await page.getByRole("combobox").fill("Kitchen");
    await page
      .getByRole("option", { name: /Kitchen fit-out/ })
      .first()
      .click();
    await expect(
      taskRow(page, title).first().getByTestId("task-row-parent"),
    ).toContainText("Kitchen fit-out");
    await page.reload();
    await waitForInteractive(page);
    await expect(
      taskRow(page, title).first().getByTestId("task-row-parent"),
    ).toContainText("Kitchen fit-out");
    await clearProbes(page, title);
  });
});

test.describe("DHDS-10 — quiet at rest", () => {
  test("a populated Task list draws no chevrons until a row is engaged with", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoFixture(page, "/tasks");
    await waitForInteractive(page);

    const visibleCarets = async () =>
      page.evaluate(
        () =>
          [...document.querySelectorAll(".dh-inline-select__caret")].filter(
            (node) => Number(getComputedStyle(node).opacity) > 0.05,
          ).length,
      );

    // §48's visual acceptance test, as a number: at rest, none.
    expect(
      await visibleCarets(),
      "a task list at rest must not look like a row of dropdowns",
    ).toBe(0);

    await page.getByTestId("task-row").first().hover();
    await expect
      .poll(visibleCarets, {
        message: "engaging a row reveals its affordances",
      })
      .toBeGreaterThan(0);
  });
});

test.describe("DHDS-10 — keyboard", () => {
  test("a record's status opens, arrows, commits and returns focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoFixture(page, "/projects/pr-rc-kitchen");
    await waitForInteractive(page);

    const trigger = page.getByTestId("project-status-edit").getByRole("button");
    await trigger.focus();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu", { name: "Status" });
    await expect(menu).toBeVisible();

    // Arrow keys operate the canonical menu pattern: the shared `Menu` moves
    // real DOM focus between its items (roving focus), so "the arrow key
    // worked" is "focus is now on a menu item".
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitemradio").first()).toBeVisible();
    await expect
      .poll(async () =>
        page.evaluate(
          () => document.activeElement?.getAttribute("role") ?? null,
        ),
      )
      .toBe("menuitemradio");

    // Escape closes AND hands focus back to the value it was opened from.
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    // Choosing also returns focus, and the server keeps the answer.
    await page.keyboard.press("Enter");
    await page.getByRole("menuitemradio", { name: "On hold" }).click();
    await expect(
      page.getByTestId("project-status-edit").getByRole("button"),
    ).toBeFocused();
    await page.reload();
    await waitForInteractive(page);
    await expect(page.getByTestId("project-status-edit")).toContainText(
      "On hold",
    );

    // Put it back, so the spec leaves the workspace as it found it.
    await page.getByTestId("project-status-edit").getByRole("button").click();
    await page.getByRole("menuitemradio", { name: "Active" }).click();
    await expect(page.getByTestId("project-status-edit")).toContainText(
      "Active",
    );
  });
});

test.describe("DHDS-10 — beyond Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  test("a Project's parent is a searchable choice from the collection table", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects?view=table");
    await waitForInteractive(page);

    const row = page
      .getByTestId("project-table-row")
      .filter({ hasText: "Office move" })
      .first();
    const cell = row.getByTestId("project-table-area");
    const before = (await cell.innerText()).trim();

    await row.hover();
    await cell.getByRole("button").click();
    // The same searchable surface a Task's Project uses — one grammar for
    // "choose one record out of many", wherever the relationship is (§32).
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("combobox").fill("Home");
    await page
      .getByRole("option", { name: /Home & Property/ })
      .first()
      .click();
    await expect(cell).toContainText("Home & Property");

    await page.reload();
    await waitForInteractive(page);
    await expect(
      page
        .getByTestId("project-table-row")
        .filter({ hasText: "Office move" })
        .first()
        .getByTestId("project-table-area"),
    ).toContainText("Home & Property");

    // Put it back, so the spec leaves the workspace as it found it.
    const restored = page
      .getByTestId("project-table-row")
      .filter({ hasText: "Office move" })
      .first();
    await restored.hover();
    await restored
      .getByTestId("project-table-area")
      .getByRole("button")
      .click();
    await page.getByRole("combobox").fill(before);
    await page
      .getByRole("option", { name: new RegExp(before) })
      .first()
      .click();
    await expect(restored.getByTestId("project-table-area")).toContainText(
      before,
    );
  });

  test("a Goal's target date is set from the workspace it is read in", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals?goal=g-rc-move");
    await waitForInteractive(page);

    const field = page.getByTestId("goal-pane-target-date");
    await expect(field).toBeVisible();
    await field.getByRole("button").click();

    /*
     * A calendar DAY rather than a one-press preset, deliberately: the Goal's
     * date field offers no Task shortcuts, because "Today" is not a sensible
     * one-press answer for a target a Goal is aiming at. The product's own
     * month grid is the control, and it is the same one the canonical record
     * opens.
     */
    const chosen = "2027-03-31";
    await pickCalendarDate(page.getByRole("dialog"), chosen);
    await expect(field).toContainText("31 Mar 2027");

    // The pane and the Goal's own record post the SAME focused
    // `set_target_date` intent, so the two can never write it differently.
    await page.reload();
    await waitForInteractive(page);
    await expect(page.getByTestId("goal-pane-target-date")).toContainText(
      "31 Mar 2027",
    );

    // Progress is NOT editable here, and must not become so: a Goal's status is
    // derived from its measurements (§15).
    await expect(page.getByText("Current status")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Current status/ }),
    ).toHaveCount(0);
  });
});

test.describe("DHDS-10 — the phone", () => {
  /*
   * `hasTouch` is what makes the browser report `(pointer: coarse)`, and that
   * is what every touch-target floor in the product is gated on — the DHDS-10
   * `meta` presentation included, which narrows to WCAG 2.2 §2.5.8's 24px only
   * for a device that positively declares a fine pointer WITH hover. A narrow
   * viewport on a mouse is a narrow window, not a phone, and asserting the
   * 44px floor there would be asserting something the product deliberately does
   * not promise.
   */
  test.use({ isMobile: true, hasTouch: true });

  for (const width of [393, 320]) {
    test(`a metadata choice is a SHEET at ${width}px, and nothing overflows`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await gotoFixture(page, "/tasks");
      await waitForInteractive(page);
      await expectNoHorizontalOverflow(page);

      const trigger = page
        .getByTestId("task-row")
        .first()
        .getByTestId("task-row-priority")
        .getByRole("button");
      /*
       * The row's HIT AREA is the floor even though its ink is not.
       *
       * A task row cannot afford 44px of height per metadata control — four of
       * them would take a phone row from 73px to ~93px — so it extends the
       * target with a pseudo-element on the block axis instead
       * (`task-list.css`). A bounding box cannot see a pseudo-element, so this
       * asks the layout what is actually hittable at the control's centre.
       */
      await expect
        .poll(
          async () => {
            const box = await trigger.boundingBox();
            if (box === null) return 0;
            return page.evaluate(
              ({ x, y }) => {
                const cx = x;
                let top = y;
                let bottom = y;
                const hits = (py: number) =>
                  document
                    .elementsFromPoint(cx, py)
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
          { message: "the row's metadata target meets the touch floor" },
        )
        .toBeGreaterThanOrEqual(43.5);
      await trigger.click();

      // DHDS-09's canonical adaptation: the same options, in the shared sheet.
      const sheet = page.getByRole("dialog");
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("menuitemradio").first()).toBeVisible();
      await expectMinTouchTarget(sheet.getByRole("menuitemradio").first());
      await expectNoHorizontalOverflow(page);
    });
  }

  test("a record's own metadata choice is a sheet too", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 800 });
    await gotoFixture(page, "/asset/as-rc-ute");
    await waitForInteractive(page);
    await expectNoHorizontalOverflow(page);

    const trigger = page.getByTestId("asset-status-edit").getByRole("button");
    await expectMinTouchTarget(trigger);
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("menuitemradio", { name: "Under repair" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("DHDS-10 — a refusal tells the truth", () => {
  test("a refused inline save keeps the value the record actually has", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await gotoFixture(page, FLAT_VIEW);
    const title = await captureProbe(page, "refusal");

    // Refuse the mutation at the transport, which is what the field's own
    // error path is written for. Nothing about the domain is stubbed: the
    // route is simply never reached.
    await page.route("**/tasks/bulk", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "bulk",
          status: "error",
          formError: "That change couldn’t be saved.",
        }),
      }),
    );

    await openCell(page, title, "task-row-priority");
    await page.getByRole("menuitemradio", { name: "Priority 1" }).click();

    // The server's own words, beside a value that did not move.
    await expect(page.getByRole("alert")).toContainText(
      "That change couldn’t be saved.",
    );
    await expect(
      taskRow(page, title).first().getByTestId("task-row-priority"),
    ).toContainText("P4");

    await page.unroute("**/tasks/bulk");
    await page.reload();
    await waitForInteractive(page);
    // And the record really is unchanged — the refusal was not cosmetic.
    await expect(
      taskRow(page, title).first().getByTestId("task-row-priority"),
    ).toContainText("P4");
    await clearProbes(page, title);
  });
});
