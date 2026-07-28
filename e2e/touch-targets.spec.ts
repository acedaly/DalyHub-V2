/**
 * DS-11 — touch-target regression tests (WCAG 2.2 §2.5.8, ≥44px).
 *
 * The design system sizes every interactive control to the `--dh-touch-target-min`
 * (44px) token, but a token alone does not fail CI if a shared control regresses.
 * This spec exercises `expectMinTouchTarget` against the shared interactive
 * surfaces so a regression below the documented minimum actually fails the build.
 *
 * The controls checked meet the minimum UNCONDITIONALLY (not only behind a
 * `hover: none` / `pointer: coarse` media query), so the assertions are stable
 * under a plain viewport resize without device-input emulation. Controls that are
 * enlarged only on coarse pointers are exercised by their own component specs.
 */

import { expect, test } from "@playwright/test";

import { expectMinTouchTarget, gotoFixture } from "./helpers";
import { cleanupNoteByTitle, uniqueNoteTitle } from "./notes-fixtures";

test.describe("touch targets — shell (mobile)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("the mobile navigation toggle meets the 44px minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await expectMinTouchTarget(
      page.getByRole("button", { name: /open navigation/i }),
    );
  });

  test("the mobile navigation sheet's close control meets the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.getByRole("button", { name: /open navigation/i }).click();
    await page.getByRole("dialog", { name: /navigation/i }).waitFor();
    await expectMinTouchTarget(
      page.getByRole("button", { name: /close navigation/i }),
    );
  });
});

test.describe("touch targets — Command Palette", () => {
  test("the palette input, options and close control meet the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/command-palette");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    await expectMinTouchTarget(
      dialog.getByRole("combobox", { name: /search commands/i }),
    );
    await expectMinTouchTarget(
      dialog.getByRole("button", { name: /close command palette/i }),
    );
    // The listbox options are the primary touch surface of the palette.
    await expectMinTouchTarget(dialog.getByRole("option").first());
  });
});

test.describe("touch targets — Search", () => {
  test("the search input and close control meet the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/search");
    await page.keyboard.press("/");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();

    await expectMinTouchTarget(
      dialog.getByRole("combobox", { name: /search everything/i }),
    );
    await expectMinTouchTarget(
      dialog.getByRole("button", { name: /close search/i }),
    );
  });
});

test.describe("touch targets — Areas & Goals (mobile)", () => {
  // `RecordAction`/tab controls only grow to the 44px floor under a coarse
  // pointer (`@media (hover: none), (pointer: coarse)` in record-layout.css) —
  // a plain narrow desktop viewport keeps the 36px medium control height, so
  // touch must be emulated to exercise the SAME path a phone takes (matching
  // `today-mobile.spec.ts`/`projects-mobile.spec.ts`).
  test.use({
    viewport: { width: 320, height: 720 },
    isMobile: true,
    hasTouch: true,
  });

  test("the Areas collection's primary action and record tabs meet the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas");
    await expectMinTouchTarget(
      page.getByRole("link", { name: "New Area" }).first(),
    );

    await gotoFixture(page, "/areas/a-dh");
    await expectMinTouchTarget(page.getByRole("button", { name: "Rename" }));
    for (const name of ["Goals", "Projects", "Activity"] as const) {
      await expectMinTouchTarget(page.getByRole("tab", { name }));
    }
  });

  test("the Goal record's actions and the Alignment evidence control meet the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals/g-launch");
    await expectMinTouchTarget(page.getByRole("button", { name: "Rename" }));
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Edit details" }),
    );
    await expectMinTouchTarget(page.getByRole("button", { name: "Complete" }));
  });
});

test.describe("touch targets — Notes (mobile, NOTES-01C)", () => {
  test.use({
    viewport: { width: 320, height: 720 },
    isMobile: true,
    hasTouch: true,
  });

  test("the record's Rename/Delete actions and the editor's formatting toolbar meet the minimum", async ({
    page,
  }) => {
    // This is the only test in this shard that mounts the note-editor route, so
    // it pays the one-time cold client-mount of the code-split CodeMirror chunk;
    // an explicit per-test timeout grants that one-time compile head room without
    // touching the global timeout.
    test.setTimeout(120_000);
    const noteTitle = uniqueNoteTitle("touch-targets");
    await gotoFixture(page, "/notes");
    await page.getByRole("link", { name: "New Note" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New Note" });
    await expect(dialog).toBeVisible();
    // Let the drawer-open loader revalidation settle before submitting, so the
    // create-navigation isn't dropped racing it (leaving the URL stuck on
    // `/notes?drawer=new-note`, as it did on a cold CI shard).
    await page.waitForLoadState("networkidle");
    await dialog.getByLabel(/Title/).fill(noteTitle);
    await dialog.getByRole("button", { name: "Create note" }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    // Gate measurement on the note record being fully laid out: the live editor
    // signalling ready means the record's header (Rename/Delete) and toolbar have
    // mounted and their DS-01 sizing has applied. Measuring before this settles
    // is what produced the transient 21px (unstyled) toolbar/action height in CI.
    // The wide timeout absorbs the one-time cold CodeMirror compile on this shard.
    await expect(page.locator('[data-editor-ready="true"]')).toBeVisible({
      timeout: 90_000,
    });

    await expectMinTouchTarget(page.getByRole("button", { name: "Rename" }));
    // PX-04/DS-12 moved every lifecycle action into the ONE shared overflow (⋯),
    // so Delete is a MENU ITEM behind that trigger, not a header button. This
    // spec still looked for the retired button and so could never pass — measure
    // the real controls the user touches: the overflow trigger and its items.
    const overflow = page.getByRole("button", { name: /^More actions for / });
    await expectMinTouchTarget(overflow);
    await overflow.click();
    await expectMinTouchTarget(
      page.getByRole("menuitem", { name: "Delete Note" }),
    );
    await page.keyboard.press("Escape");
    // NOTES-05 retired Source/Split/Preview: the writing surface exposes a
    // formatting toolbar plus a Read toggle. Sample a toolbar button and the
    // toggle — all share the same 44px-floor rule.
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    for (const name of ["Bold", "Checklist", "Table"] as const) {
      await expectMinTouchTarget(toolbar.getByRole("button", { name }));
    }
    await expectMinTouchTarget(page.getByRole("button", { name: "Read" }));

    await overflow.click();
    await page.getByRole("menuitem", { name: "Delete Note" }).click();
    await page.getByRole("link", { name: "Deleted" }).click();
    // Scoped to this test's own card — an orphaned Deleted Note left behind
    // by an earlier failed run would otherwise make "Restore" ambiguous.
    const ownCard = page.getByRole("listitem").filter({ hasText: noteTitle });
    await expectMinTouchTarget(
      ownCard.getByRole("button", { name: "Restore" }),
    );

    // Cleanup: this fixture is not covered by e2e/notes.spec.ts's own cleanup
    // hooks, so remove it directly through the SAME shared, FK-ordered,
    // race-tolerant helper (this journey deletes/restores the Note, recording
    // `entity.deleted`/`entity.restored` Activity whose `activity_subjects` rows
    // must go before the entity itself).
    await cleanupNoteByTitle(noteTitle);
  });
});
