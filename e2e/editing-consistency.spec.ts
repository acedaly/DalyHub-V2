import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  postSameOrigin,
} from "./helpers";

/**
 * EDIT-02 — one editing vocabulary, measured across the modules.
 *
 * PR #124 built the shared inline-editing system and adopted it on two records;
 * this suite is the proof that the rest of the product now speaks it too, and
 * that the old ways of saying the same thing are gone rather than merely
 * deprecated. Each test states a rule from the brief and checks it where the
 * user would meet it:
 *
 *   §2  every canonical record's title is edited the same way, and the
 *       dedicated Rename control that used to sit beside it is gone;
 *   §3  an optional selected value changes `current → new` in one action, an
 *       unset one reads as EMPTY rather than as a chosen "No …", and clearing
 *       is one separated command;
 *   §4  a simple date is set, changed and cleared where it is shown;
 *   §8  editing stays content-first — no permanent input chrome at rest;
 *   §11 the keyboard reaches all of it, and focus comes back;
 *   §12 nothing an inline surface opens produces horizontal page overflow.
 *
 * Nothing here leaves a shared fixture altered: the title tests cancel with
 * Escape rather than saving, and the value tests put the fixture back.
 *
 * The put-back is enforced rather than merely written down. Restoring inline, at
 * the end of a test, is only correct while every assertion before it passes — a
 * failure part-way through the priority sequence would otherwise leave
 * `t-search-e2e` on P3 for whatever runs next. The `afterEach` below normalises
 * the two mutable fields unconditionally, through the same trusted endpoint the
 * tests use, so a red test cannot become a red *suite*.
 */

/** The seeded state of the task these tests borrow (see `e2e/seed-tasks.sql`). */
const SEEDED_TASK = {
  id: "t-search-e2e",
  title: "Global Search E2E Task",
  priority: "p1",
  dueDate: "2026-07-29",
};

/** Every canonical record, and the accessible name its title field carries. */
const TITLE_SURFACES = [
  { label: "Note", path: "/notes/n-search-e2e", field: "Note title" },
  { label: "Project", path: "/projects/pr-website", field: "Project name" },
  { label: "Goal", path: "/goals/g-launch", field: "Goal name" },
  { label: "Area", path: "/areas/a-dh", field: "Area name" },
  { label: "Person", path: "/person/p-search-e2e", field: "Person name" },
  { label: "Asset", path: "/asset/as-search-e2e", field: "Asset name" },
  { label: "Meeting", path: "/meeting/m-search-e2e", field: "Meeting title" },
] as const;

test.describe("EDIT-02 §2 — one way to edit a record title", () => {
  for (const surface of TITLE_SURFACES) {
    test(`${surface.label}: the heading is the control, and Rename is gone`, async ({
      page,
    }) => {
      await gotoFixture(page, surface.path);

      const trigger = page.getByRole("button", {
        name: new RegExp(`^${surface.field}: `),
      });
      await expect(trigger).toBeVisible();
      // §8 — a value at rest looks like content: no permanent input border, no
      // pencil beside it, and no second control repeating the same action.
      await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
      await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(
        0,
      );
      await expectMinTouchTarget(trigger);

      // §11 — Tab reaches it, Enter activates it, the caret lands in the text.
      await trigger.focus();
      await expect(trigger).toBeFocused();
      await page.keyboard.press("Enter");
      const input = page.getByRole("textbox", { name: surface.field });
      await expect(input).toBeFocused();

      // Escape cancels and hands focus back to the value it came from — so the
      // next Tab continues from where the user was, not from the top of the
      // document. The fixture's title is deliberately not changed.
      await input.fill("A discarded title");
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("textbox", { name: surface.field }),
      ).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveAccessibleName(
        new RegExp(`^${surface.field}: `),
      );
      await expect(
        page.getByText("A discarded title", { exact: true }),
      ).toHaveCount(0);
    });
  }
});

/**
 * Put the borrowed task back exactly as the seed left it, whatever happened.
 * Idempotent and cheap: `/tasks/bulk` treats an unchanged field as `unchanged`,
 * so this costs one request and writes nothing when the test already restored
 * it itself.
 */
test.afterEach(async ({ request }) => {
  // Typed explicitly: inferred as a union of the two literals, the elements
  // carry `dueDate?: undefined` / `priority?: undefined` members, and a spread
  // of those does not satisfy `postSameOrigin`'s
  // `Record<string, string | number | boolean>` form.
  const restores: ReadonlyArray<Record<string, string>> = [
    { intent: "set_priority", priority: SEEDED_TASK.priority },
    { intent: "set_due", dueDate: SEEDED_TASK.dueDate },
  ];
  for (const fields of restores) {
    await postSameOrigin(request, "/tasks/bulk", {
      form: { id: SEEDED_TASK.id, ...fields },
    }).catch(() => {
      // Best-effort: a cleanup failure must never fail the assertion the test
      // actually made.
    });
  }
});

/*
 * The shared record Drawer is named for the TYPE it renders, not for the record
 * — its heading is a plain "Task" and the title sits inside as the record's own
 * editable heading. Naming it here keeps the three describes below from each
 * inventing a different (and, for two of them, wrong) guess at that name.
 */
function taskDrawer(page: Page) {
  return page.getByRole("dialog", { name: "Task", exact: true });
}

test.describe("EDIT-02 §3 — a selected value changes directly", () => {
  /** The seeded search fixture task: priority p1, due 2026-07-29. */
  const TASK_DRAWER = `/tasks?drawer=task:${SEEDED_TASK.id}`;

  /*
   * Every inline control below is asked for INSIDE the Drawer.
   *
   * When this was written the Drawer held the only inline priority and date
   * fields in the product, so a page-wide locator was unambiguous. TASKS-05 put
   * the same shared fields on every task ROW, and the Tasks collection is what
   * is behind this Drawer — so a page-wide `/^Priority: /` now matches the
   * Drawer's control and one per row behind it, and fails strict mode before it
   * touches anything.
   *
   * This is a test defect, not an accessibility one: the background genuinely IS
   * `inert` while a drawer is open (`use-inert-background.ts`), so no keyboard or
   * screen-reader user can reach those rows. Playwright's role engine simply does
   * not honour `inert`. The subject of these tests is the Drawer's own field, and
   * scoping is how the test says so.
   */
  const drawerOf = taskDrawer;

  test("current → new in one action, with the current one announced", async ({
    page,
  }) => {
    await gotoFixture(page, TASK_DRAWER);
    const drawer = drawerOf(page);
    await expect(drawer).toBeVisible();

    const priority = drawer.getByRole("button", { name: /^Priority: / });
    await expect(priority).toHaveAccessibleName("Priority: Priority 1");
    await expectMinTouchTarget(priority);
    await priority.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Selection is carried by semantics, not by colour alone.
    await expect(
      menu.getByRole("menuitemradio", { name: "Priority 1" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      menu.getByRole("menuitemradio", { name: "Priority 3" }),
    ).toHaveAttribute("aria-checked", "false");

    // ONE action to a different real value — no "clear it first" step.
    await menu.getByRole("menuitemradio", { name: "Priority 3" }).click();
    await expect(
      drawer.getByRole("button", { name: "Priority: Priority 3" }),
    ).toBeVisible();

    // Put the shared fixture back exactly as it was.
    await drawer.getByRole("button", { name: /^Priority: / }).click();
    await page.getByRole("menuitemradio", { name: "Priority 1" }).click();
    await expect(
      drawer.getByRole("button", { name: "Priority: Priority 1" }),
    ).toBeVisible();
  });

  test("priority has four values and no clear command", async ({ page }) => {
    /*
     * CONTROL-01 — a stored `null` IS Priority 4, so there is nothing to clear
     * TO and the menu offers four real values and nothing else.
     *
     * This test used to drive a "Clear priority" command and then assert the
     * field read "Priority: No priority". Both halves were the fifth state the
     * priority contract does not have: the same records the drawer called "No
     * priority" were drawn with a grey P4 flag by every row in the product, and
     * a filter for "Priority 4" did not return them.
     */
    await gotoFixture(page, TASK_DRAWER);
    const drawer = drawerOf(page);
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: /^Priority: / }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitemradio")).toHaveCount(4);
    await expect(
      page.getByRole("menuitemradio", { name: /Clear|No priority/ }),
    ).toHaveCount(0);

    // Changing to a different real value is still ONE action.
    await page.getByRole("menuitemradio", { name: "Priority 1" }).click();
    await expect(
      drawer.getByRole("button", { name: "Priority: Priority 1" }),
    ).toBeVisible();

    // …and back, so the shared fixture is left exactly as it was.
    await drawer.getByRole("button", { name: /^Priority: / }).click();
    await page.getByRole("menuitemradio", { name: "Priority 3" }).click();
    await expect(
      drawer.getByRole("button", { name: "Priority: Priority 3" }),
    ).toBeVisible();
  });

  test("the menu is fully keyboard operable and restores focus", async ({
    page,
  }) => {
    await gotoFixture(page, TASK_DRAWER);
    const drawer = drawerOf(page);
    await expect(drawer).toBeVisible();

    const priority = drawer.getByRole("button", { name: /^Priority: / });
    await priority.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(priority).toBeFocused();
  });
});

test.describe("EDIT-02 §4 — a simple date is edited where it is shown", () => {
  test("set, change and clear a Task's due date from the record", async ({
    page,
  }) => {
    await gotoFixture(page, `/tasks?drawer=task:${SEEDED_TASK.id}`);
    // Scoped to the RECORD Drawer — the Tasks rows behind it carry the same
    // shared inline date field since TASKS-05 (see §3's note).
    const record = taskDrawer(page);
    await expect(record).toBeVisible();

    const due = record.getByRole("button", { name: /^Due date: / });
    await expect(due).toHaveAccessibleName(/29 Jul 2026/);
    await due.click();

    const popover = page.getByRole("dialog", { name: "Edit due date" });
    await expect(popover).toBeVisible();
    /*
     * CONTROL-01 — DalyHub's own month grid, not a native `<input type="date">`,
     * and a calendar day COMMITS on selection: a day is an unambiguous complete
     * answer, unlike a half-typed `dd/mm/yyyy`, so there is no Save after it.
     *
     * Days are addressed by their FULL spoken date, which is what a screen
     * reader hears; "15" alone would name nothing. `PageDown` walks the month,
     * which is the keyboard contract the grid publishes.
     */
    const grid = popover.getByRole("grid", { name: "Due date" });
    await expect(popover.locator('input[type="date"]')).toHaveCount(0);
    await grid.press("PageDown");
    await grid.getByRole("button", { name: "Saturday 15 August 2026" }).click();
    await expect(
      record.getByRole("button", { name: /^Due date: .*15 Aug 2026/ }),
    ).toBeVisible();

    // Clearing is possible because the data model permits it…
    await record.getByRole("button", { name: /^Due date: / }).click();
    await page
      .getByRole("dialog", { name: "Edit due date" })
      .getByRole("button", { name: "Clear due date" })
      .click();
    await expect(
      record.getByRole("button", { name: "Due date: No due date" }),
    ).toBeVisible();

    // …and the fixture goes back to the date it was seeded with.
    await record.getByRole("button", { name: /^Due date: / }).click();
    const restore = page.getByRole("dialog", { name: "Edit due date" });
    const restoreGrid = restore.getByRole("grid", { name: "Due date" });
    // Unset, so the grid opens on the owner's own month; July is one back.
    await restoreGrid.press("PageUp");
    await restoreGrid
      .getByRole("button", { name: "Wednesday 29 July 2026" })
      .click();
    await expect(
      record.getByRole("button", { name: /^Due date: .*29 Jul 2026/ }),
    ).toBeVisible();
  });
});

test.describe("EDIT-02 §12 — inline surfaces stay inside the viewport", () => {
  /** The DS-01 `md` breakpoint, below which an inline editor is a sheet. */
  const COMPACT_MAX = 768;

  for (const width of [320, 390, 700, 1024, 1440]) {
    test(`no horizontal overflow with an inline editor open at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await gotoFixture(page, `/tasks?drawer=task:${SEEDED_TASK.id}`);
      const record = taskDrawer(page);
      await expect(record).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await record.getByRole("button", { name: /^Priority: / }).click();
      /*
       * EDIT-03 — the select has TWO presentations, and this width decides
       * which one is correct.
       *
       * Above `md` it is the anchored WAI-ARIA menu. Below it, it is the shared
       * phone sheet (a `dialog` named for the field) — a 28px menu item hanging
       * off a 28px trigger is a desktop idea, and a phone has no hover to
       * reveal the trigger with. The overflow assertion below is what this spec
       * is actually for, and it is unchanged and made at every width; only the
       * expectation about WHICH surface opened has moved with the design.
       */
      await expect(
        width <= COMPACT_MAX
          ? page.getByRole("dialog", { name: "Priority" })
          : page.getByRole("menu"),
      ).toBeVisible();
      // Neither surface may add a page scrollbar: the anchored menu slides back
      // from the viewport edge rather than running past it, and the sheet is
      // the width of the phone. The defect this measures is invisible on a wide
      // monitor, which is why it is asserted at five widths.
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");

      await record.getByRole("button", { name: /^Due date: / }).click();
      // The date editor keeps ONE accessible name across both presentations —
      // the popover and the sheet are the same `dialog`, so this locator is
      // deliberately not branched.
      await expect(
        page.getByRole("dialog", { name: "Edit due date" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    });
  }
});

test.describe("EDIT-02 §12 — a title the inline field cannot break between words", () => {
  /**
   * The regression this exists for.
   *
   * The inline heading deliberately breaks between WORDS rather than anywhere,
   * so a crowded flex row cannot squeeze a record's name to a sliver (PR #127).
   * But `overflow-wrap: break-word` does not reduce an element's intrinsic
   * min-content size, so a title containing one long unbroken token sized the
   * heading to that whole token and pushed the PAGE wider than a phone.
   *
   * It went unnoticed because exactly one spec — `assets.spec.ts` — creates such
   * a title, and only Areas and Projects carried the inline heading at the time.
   * Adopting the pattern on five more records is what surfaced it. This walks
   * every record that now has the heading, at the narrowest supported viewport,
   * so the next adoption cannot reintroduce it.
   */
  for (const surface of TITLE_SURFACES) {
    test(`${surface.label}: an unbreakable title does not widen the page at 320px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 720 });
      await gotoFixture(page, surface.path);
      const trigger = page.getByRole("button", {
        name: new RegExp(`^${surface.field}: `),
      });
      await expect(trigger).toBeVisible();

      // A CSS question, so the token is swapped in the DOM only — no record is
      // renamed, and the fixture is untouched.
      await page.evaluate(() => {
        const value = document.querySelector(".dh-inline-edit__value");
        if (value) {
          value.textContent =
            "longunbrokenwordthatmustwrapsomehowratherthanwideningthewholepage";
        }
      });

      await expectNoHorizontalOverflow(page);
    });
  }
});

test.describe("EDIT-02 — light and dark behave the same", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`the inline title editor passes axe in ${scheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/goals/g-launch");
      await page.getByRole("button", { name: /^Goal name: / }).click();
      await expect(
        page.getByRole("textbox", { name: "Goal name" }),
      ).toBeFocused();
      await expectNoAxeViolations(page);
      await page.keyboard.press("Escape");
    });
  }
});
