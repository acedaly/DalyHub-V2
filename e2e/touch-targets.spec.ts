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

import {
  expectMinTouchTarget,
  gotoFixture,
  mobileNavigationOpener,
} from "./helpers";
import { cleanupNoteByTitle, uniqueNoteTitle } from "./notes-fixtures";

test.describe("touch targets — the offline surfaces (mobile)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("the offline capture and sync controls meet the 44px minimum", async ({
    page,
  }) => {
    // The offline page renders OUTSIDE the app shell, so it does not inherit the
    // shell's target sizing — these are its own, and they are the controls
    // someone uses one-handed on a phone with no signal.
    await gotoFixture(page, "/offline");
    await expectMinTouchTarget(page.getByRole("button", { name: /Sync now/ }));
  });

  test("the Settings offline controls meet the minimum", async ({ page }) => {
    await gotoFixture(page, "/settings?section=offline");
    await expectMinTouchTarget(
      page.getByRole("button", { name: /Refresh now|Refreshing/ }),
    );
    // The section's destructive controls ("Clear snapshot…", "Reset offline
    // data…") are deliberately NOT asserted here. They are the shared
    // `.dh-settings-danger-button`, which reaches the 44px minimum behind
    // `@media (pointer: coarse)` rather than unconditionally — so under this
    // file's plain viewport resize they measure the 36px control height, and
    // asserting on them here would contradict the scope stated at the top of
    // this file. Their offline-specific behaviour is covered by the offline
    // lifecycle spec; their sizing belongs to the shared settings surface.
  });
});

test.describe("touch targets — shell (mobile)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("the mobile navigation toggle meets the 44px minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await expectMinTouchTarget(mobileNavigationOpener(page));
  });

  test("the mobile navigation sheet’s close control meets the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await mobileNavigationOpener(page).click();
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

  test("the Areas collection’s primary action and record tabs meet the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas");
    await expectMinTouchTarget(
      page.getByRole("link", { name: "New Area" }).first(),
    );

    await gotoFixture(page, "/areas/a-dh");
    // DS-16 — the Area name IS the rename control now (the Drawer form is gone),
    // so the target under test is the heading's inline-edit affordance. It has
    // to clear the same 44px minimum: it is the primary way to rename an Area
    // on a phone, and it is a touch target like any other.
    await expectMinTouchTarget(
      page.getByRole("button", { name: /^Area name:/ }),
    );
    for (const name of ["Goals", "Projects", "Activity"] as const) {
      await expectMinTouchTarget(page.getByRole("tab", { name }));
    }
  });

  test("the Goal record’s actions and the Alignment evidence control meet the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals/g-launch");
    // M3-INT — the header keeps ONE secondary ("Edit details") and folds the
    // rest into the shared overflow, so Rename is a MENU ITEM behind ⋯ now,
    // not a header button. This spec still looked for the retired button and
    // so could never pass (the same staleness the Notes test below already
    // corrected for Delete) — measure the real controls the user touches.
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Edit details" }),
    );
    await expectMinTouchTarget(page.getByRole("button", { name: "Complete" }));
    const overflow = page.getByRole("button", { name: /^More actions for / });
    await expectMinTouchTarget(overflow);
    await overflow.click();
    await expectMinTouchTarget(page.getByRole("menuitem", { name: "Rename" }));
    await page.keyboard.press("Escape");
  });
});

test.describe("touch targets — Notes (mobile, NOTES-01C)", () => {
  test.use({
    viewport: { width: 320, height: 720 },
    isMobile: true,
    hasTouch: true,
  });

  test("the record’s Rename/Delete actions and the editor’s formatting toolbar meet the minimum", async ({
    page,
  }) => {
    // This is the only test in this shard that mounts the note-editor route, so
    // it pays the one-time cold client-mount of the code-split CodeMirror chunk;
    // an explicit per-test timeout grants that one-time compile head room without
    // touching the global timeout.
    test.setTimeout(120_000);
    const noteTitle = uniqueNoteTitle("touch-targets");
    // Fixture setup, not a UI assertion: the Notes header's duplicate "New Note"
    // button was removed by the shell cleanup, so this opens the SAME (untouched,
    // URL-backed) create drawer by its canonical URL.
    await gotoFixture(page, "/notes?drawer=new-note");
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
    for (const name of ["Bold", "Checklist"] as const) {
      await expectMinTouchTarget(toolbar.getByRole("button", { name }));
    }
    // MOBILE-01 moved the low-frequency commands behind "More" INSIDE the same
    // toolbar, so a phone is not given a permanent row of every command. They are
    // still toolbar buttons held to the same 44px floor — reveal and measure one.
    await expectMinTouchTarget(toolbar.getByRole("button", { name: "More" }));
    await toolbar.getByRole("button", { name: "More" }).click();
    await expectMinTouchTarget(toolbar.getByRole("button", { name: "Table" }));
    await expectMinTouchTarget(page.getByRole("button", { name: "Read" }));

    // Removal itself now runs through the same overflow menu measured above —
    // there is no longer a Delete button in the record header (PX-04). Notes are
    // `deleteMode: "reversible"`, so the item deletes on a single activation and
    // offers Undo; there is no confirmation step to clear here.
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
