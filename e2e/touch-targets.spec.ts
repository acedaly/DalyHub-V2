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

import { test } from "@playwright/test";

import { expectMinTouchTarget, gotoFixture } from "./helpers";

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
