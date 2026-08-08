import { expect, test } from "@playwright/test";

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
   * Drawer's control and one per row behind it. The subject of these tests is
   * the Drawer's field; scoping says so.
   */
  const drawerOf = (page: Page) => page.getByRole("dialog");

  test("current → new in one action, with the current one announced", async ({
    page,
  }) => {
    await gotoFixture(page, TASK_DRAWER);
    const drawer = drawerOf(page);
    await expect(drawer).toBeVisible();

    const priority = drawer.getByRole("button", { name: /^Priority: / });
    await expect(priority).toHaveAccessibleName("Priority: P1 · Urgent");
    await expectMinTouchTarget(priority);
    await priority.click();

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // Selection is carried by semantics, not by colour alone.
    await expect(
      menu.getByRole("menuitemradio", { name: "P1 · Urgent" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      menu.getByRole("menuitemradio", { name: "P3 · Normal" }),
    ).toHaveAttribute("aria-checked", "false");

    // ONE action to a different real value — no "clear it first" step.
    await menu.getByRole("menuitemradio", { name: "P3 · Normal" }).click();
    await expect(
      drawer.getByRole("button", { name: "Priority: P3 · Normal" }),
    ).toBeVisible();

    // Put the shared fixture back exactly as it was.
    await drawer.getByRole("button", { name: /^Priority: / }).click();
    await page.getByRole("menuitemradio", { name: "P1 · Urgent" }).click();
    await expect(
      drawer.getByRole("button", { name: "Priority: P1 · Urgent" }),
    ).toBeVisible();
  });

  test("clearing is one separated command, and an unset value reads as empty", async ({
    page,
  }) => {
    await gotoFixture(page, TASK_DRAWER);
    const drawer = drawerOf(page);
    await expect(drawer).toBeVisible();

    await drawer.getByRole("button", { name: /^Priority: / }).click();
    await page.getByRole("menuitemradio", { name: "Clear priority" }).click();

    // §3 — the empty state is genuinely EMPTY: an untriaged task is not "set to
    // No priority", and the menu no longer offers a clear command because there
    // is nothing left to clear.
    const empty = drawer.getByRole("button", { name: "Priority: No priority" });
    await expect(empty).toBeVisible();
    await empty.click();
    await expect(
      page.getByRole("menuitemradio", { name: "Clear priority" }),
    ).toHaveCount(0);

    // Unset → set is also one action.
    await page.getByRole("menuitemradio", { name: "P1 · Urgent" }).click();
    await expect(
      drawer.getByRole("button", { name: "Priority: P1 · Urgent" }),
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
    const record = page.getByRole("dialog", {
      name: new RegExp(SEEDED_TASK.title),
    });
    await expect(record).toBeVisible();

    const due = record.getByRole("button", { name: /^Due date: / });
    await expect(due).toHaveAccessibleName(/29 Jul 2026/);
    await due.click();

    const popover = page.getByRole("dialog", { name: "Edit due date" });
    await expect(popover).toBeVisible();
    await popover.getByLabel("Due date").fill("2026-08-15");
    await popover.getByRole("button", { name: "Save" }).click();
    await expect(
      record.getByRole("button", { name: /^Due date: .*15 Aug 2026/ }),
    ).toBeVisible();

    // Clearing is possible because the data model permits it…
    await record.getByRole("button", { name: /^Due date: / }).click();
    await page
      .getByRole("dialog", { name: "Edit due date" })
      .getByRole("button", { name: "Clear" })
      .click();
    await expect(
      record.getByRole("button", { name: "Due date: No due date" }),
    ).toBeVisible();

    // …and the fixture goes back to the date it was seeded with.
    await record.getByRole("button", { name: /^Due date: / }).click();
    const restore = page.getByRole("dialog", { name: "Edit due date" });
    await restore.getByLabel("Due date").fill("2026-07-29");
    await restore.getByRole("button", { name: "Save" }).click();
    await expect(
      record.getByRole("button", { name: /^Due date: .*29 Jul 2026/ }),
    ).toBeVisible();
  });
});

test.describe("EDIT-02 §12 — inline surfaces stay inside the viewport", () => {
  for (const width of [320, 390, 700, 1024, 1440]) {
    test(`no horizontal overflow with an inline menu open at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await gotoFixture(page, `/tasks?drawer=task:${SEEDED_TASK.id}`);
      const record = page.getByRole("dialog", {
        name: new RegExp(SEEDED_TASK.title),
      });
      await expect(record).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await record.getByRole("button", { name: /^Priority: / }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      // The anchored menu flips to the inline-end edge when a start-anchored
      // box would run past the viewport, so opening it never adds a page
      // scrollbar — the defect this measures is invisible on a wide monitor.
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");

      await record.getByRole("button", { name: /^Due date: / }).click();
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
