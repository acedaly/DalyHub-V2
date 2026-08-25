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
      page.getByRole("link", { name: "New area" }).first(),
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

  test("the Goal record’s editable values and actions meet the minimum", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals/g-launch");
    // EDIT-02 retired the `Rename` and `Edit details` buttons: the title, the
    // target date and the definition of done are edited where they are shown.
    // Those three affordances are the controls a thumb now aims at, so they are
    // what has to clear the 44px minimum — the same substitution this file
    // already made for the Area heading above.
    await expectMinTouchTarget(
      page.getByRole("button", { name: /^Goal name:/ }),
    );
    await expectMinTouchTarget(
      page.getByRole("button", { name: /^Target date:/ }),
    );
    await expectMinTouchTarget(
      page.getByRole("button", { name: /^Definition of done:/ }),
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

  test("the record’s title, lifecycle actions and formatting toolbar meet the minimum", async ({
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
    // signalling ready means the record's header (the inline title and the
    // overflow) and toolbar have mounted and their DS-01 sizing has applied. Measuring before this settles
    // is what produced the transient 21px (unstyled) toolbar/action height in CI.
    // The wide timeout absorbs the one-time cold CodeMirror compile on this shard.
    await expect(page.locator('[data-editor-ready="true"]')).toBeVisible({
      timeout: 90_000,
    });

    // EDIT-02 retired the `Rename` header button: a Note's title is edited on
    // the heading, so the heading's affordance is the target under test — it is
    // the primary way to rename a Note on a phone.
    await expectMinTouchTarget(
      page.getByRole("button", { name: /^Note title:/ }),
    );
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
    // UIX-04 §9 moved Checklist behind "More" — the permanently-visible set is
    // the seven a person writing prose reaches for. `Numbered list` takes its
    // place here as the second permanent control sampled; the moved ones are
    // measured below, where the group is opened.
    //
    // Not `Link`: `getByRole`'s `name` is a case-insensitive SUBSTRING match by
    // default, and this toolbar also carries "Record link", so "Link" names two
    // controls at once.
    for (const name of ["Bold", "Numbered list"] as const) {
      await expectMinTouchTarget(toolbar.getByRole("button", { name }));
    }
    // MOBILE-01 moved the low-frequency commands behind "More" INSIDE the same
    // toolbar, so a phone is not given a permanent row of every command. They are
    // still toolbar buttons held to the same 44px floor — reveal and measure one.
    await expectMinTouchTarget(toolbar.getByRole("button", { name: "More" }));
    await toolbar.getByRole("button", { name: "More" }).click();
    for (const name of ["Table", "Checklist", "Strikethrough"] as const) {
      await expectMinTouchTarget(toolbar.getByRole("button", { name }));
    }
    // Exact: an accessible name matches by SUBSTRING by default, and the shell's
    // notification bell is named "Notifications, none unread".
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Read", exact: true }),
    );

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

/**
 * DEBT-50 — row actions meet 44px at phone WIDTHS, with a MOUSE.
 *
 * The shared Card and the shared overflow trigger both raised themselves to
 * 44px under `@media (hover: none)` — a statement about the input DEVICE. WCAG
 * 2.2 §2.5.8 is written about target SIZE, so a narrow viewport driven by a
 * POINTER (a small desktop window, a resized browser, a touchscreen laptop
 * reporting a fine pointer) kept the compact control while being exactly the
 * layout the rule exists for. MEASURED before the fix: **32×32** at 390px.
 *
 * It stayed invisible because every phone journey and every other test in this
 * file runs under touch EMULATION, where the product genuinely met 44px — so it
 * was correct everywhere anyone looked and wrong everywhere they did not. These
 * assertions are therefore made deliberately WITHOUT `hasTouch`, at the widths
 * the entry names, which is the only configuration that can see it.
 *
 * The trigger measured is the SHARED `OverflowMenu` one, which is the control a
 * person actually meets on a row — the entry's own point that this "affects
 * every Card in the product, not only Tasks".
 */
test.describe("touch targets — row actions at phone widths with a POINTER", () => {
  // No `hasTouch`: a fine pointer at a narrow viewport, which is the case.
  test.use({ hasTouch: false, isMobile: false });

  for (const width of [320, 375, 390, 430] as const) {
    test(`the row overflow trigger meets 44px at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 780 });
      await gotoFixture(page, "/areas");
      const trigger = page
        .getByRole("button", { name: /More actions for/ })
        .first();
      await trigger.scrollIntoViewIfNeeded();
      await expectMinTouchTarget(trigger);
    });
  }
});
