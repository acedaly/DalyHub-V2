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
