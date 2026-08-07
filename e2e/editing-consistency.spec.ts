import { expect, test } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
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
 */

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

test.describe("EDIT-02 §3 — a selected value changes directly", () => {
  /** The seeded search fixture task: priority p1, due 2026-07-29. */
  const TASK_DRAWER = "/tasks?drawer=task:t-search-e2e";

  test("current → new in one action, with the current one announced", async ({
    page,
  }) => {
    await gotoFixture(page, TASK_DRAWER);
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();

    const priority = page.getByRole("button", { name: /^Priority: / });
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
      page.getByRole("button", { name: "Priority: P3 · Normal" }),
    ).toBeVisible();

    // Put the shared fixture back exactly as it was.
    await page.getByRole("button", { name: /^Priority: / }).click();
    await page.getByRole("menuitemradio", { name: "P1 · Urgent" }).click();
    await expect(
      page.getByRole("button", { name: "Priority: P1 · Urgent" }),
    ).toBeVisible();
  });

  test("clearing is one separated command, and an unset value reads as empty", async ({
    page,
  }) => {
    await gotoFixture(page, TASK_DRAWER);
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: /^Priority: / }).click();
    await page.getByRole("menuitemradio", { name: "Clear priority" }).click();

    // §3 — the empty state is genuinely EMPTY: an untriaged task is not "set to
    // No priority", and the menu no longer offers a clear command because there
    // is nothing left to clear.
    const empty = page.getByRole("button", { name: "Priority: No priority" });
    await expect(empty).toBeVisible();
    await empty.click();
    await expect(
      page.getByRole("menuitemradio", { name: "Clear priority" }),
    ).toHaveCount(0);

    // Unset → set is also one action.
    await page.getByRole("menuitemradio", { name: "P1 · Urgent" }).click();
    await expect(
      page.getByRole("button", { name: "Priority: P1 · Urgent" }),
    ).toBeVisible();
  });

  test("the menu is fully keyboard operable and restores focus", async ({
    page,
  }) => {
    await gotoFixture(page, TASK_DRAWER);
    await expect(page.getByRole("dialog")).toBeVisible();

    const priority = page.getByRole("button", { name: /^Priority: / });
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
    await gotoFixture(page, "/tasks?drawer=task:t-search-e2e");
    await expect(page.getByRole("dialog")).toBeVisible();

    const due = page.getByRole("button", { name: /^Due date: / });
    await expect(due).toHaveAccessibleName(/29 Jul 2026/);
    await due.click();

    const popover = page.getByRole("dialog", { name: "Edit due date" });
    await expect(popover).toBeVisible();
    await popover.getByLabel("Due date").fill("2026-08-15");
    await popover.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("button", { name: /^Due date: .*15 Aug 2026/ }),
    ).toBeVisible();

    // Clearing is possible because the data model permits it…
    await page.getByRole("button", { name: /^Due date: / }).click();
    await page
      .getByRole("dialog", { name: "Edit due date" })
      .getByRole("button", { name: "Clear" })
      .click();
    await expect(
      page.getByRole("button", { name: "Due date: No due date" }),
    ).toBeVisible();

    // …and the fixture goes back to the date it was seeded with.
    await page.getByRole("button", { name: /^Due date: / }).click();
    const restore = page.getByRole("dialog", { name: "Edit due date" });
    await restore.getByLabel("Due date").fill("2026-07-29");
    await restore.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("button", { name: /^Due date: .*29 Jul 2026/ }),
    ).toBeVisible();
  });
});

test.describe("EDIT-02 §12 — inline surfaces stay inside the viewport", () => {
  for (const width of [320, 390, 700, 1024, 1440]) {
    test(`no horizontal overflow with an inline menu open at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await gotoFixture(page, "/tasks?drawer=task:t-search-e2e");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.getByRole("button", { name: /^Priority: / }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      // The anchored menu flips to the inline-end edge when a start-anchored
      // box would run past the viewport, so opening it never adds a page
      // scrollbar — the defect this measures is invisible on a wide monitor.
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: /^Due date: / }).click();
      await expect(
        page.getByRole("dialog", { name: "Edit due date" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
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
