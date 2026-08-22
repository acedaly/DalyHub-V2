import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture } from "./helpers";

/**
 * DHDS-13 — the commercial-quality gate's evidence set.
 *
 * The gate's question is one no assertion answers: *could a reasonable person
 * believe this is a mature commercial product?* So the frames are the argument,
 * and they are chosen to be the evidence rather than a gallery:
 *
 *   - every flagship module in BOTH appearances at 1440, because a phase that
 *     only proves light has proved half a product;
 *   - the narrow desktop widths (1280, 1100, 900) where a two-column
 *     composition either recomposes or collapses — 900 is also the tablet
 *     glyph rail, where the Capture button was a blank block;
 *   - the phone at 393 and 320, the width most handsets report and the
 *     narrowest the product supports;
 *   - the FLOATING surfaces in both appearances, because the scrim and the
 *     sheet's elevation are exactly the kind of thing that looks fine in a
 *     component gallery and disappears over a real page;
 *   - the states real seeded data cannot reach on their own — an empty
 *     collection, a menu, a picker, a toast.
 *
 * Opt-in, like every capture pass in this repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test \
 *       e2e/dhds-13-commercial-quality-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "dhds-13-2026-08",
);

const DESKTOP = { width: 1440, height: 1000 };
const LAPTOP = { width: 1280, height: 900 };
const NARROW = { width: 1100, height: 900 };
const TABLET = { width: 900, height: 900 };
const PHONE = { width: 393, height: 852 };
const SMALL_PHONE = { width: 320, height: 720 };

/** The flagship set, captured in both appearances. */
const FLAGSHIP: readonly (readonly [string, string])[] = [
  ["today", "/today"],
  ["tasks", "/tasks"],
  ["projects", "/projects"],
  ["goals", "/goals"],
  ["notes", "/notes"],
  ["people", "/people"],
  ["assets", "/assets"],
  ["analytics", "/analytics"],
  ["settings", "/settings"],
  ["views", "/views"],
  ["plan", "/plan"],
  ["areas", "/areas"],
];

/** Secondary modules — light only; commercial quality fails in these first. */
const SECONDARY: readonly (readonly [string, string])[] = [
  ["inbox", "/inbox"],
  ["diary", "/diary"],
  ["habits", "/habits"],
  ["meetings", "/meetings"],
  ["reviews", "/reviews"],
  ["upcoming", "/upcoming"],
];

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Opt-in capture pass: set CAPTURE_SCREENSHOTS=1.",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/**
 * Put the browser into an appearance.
 *
 * BOTH halves are required and the first capture pass proved it: the owner's
 * stored preference is `system`, and the shell's loader prefers the stored
 * record over the first-paint cookie (`appearance-action.ts`), so a cookie alone
 * produced a set of "dark" frames that were entirely light. `emulateMedia` is
 * what "the operating system is in dark mode" actually means here; the cookie
 * keeps the first byte agreeing with it so there is no flash to capture.
 */
async function useAppearance(
  page: import("@playwright/test").Page,
  appearance: "light" | "dark",
): Promise<void> {
  await page.context().addCookies([
    {
      name: "dh_appearance",
      value: appearance,
      url: "http://localhost:4173",
    },
  ]);
  await page.emulateMedia({ colorScheme: appearance });
}

test.describe("desktop 1440", () => {
  for (const appearance of ["light", "dark"] as const) {
    test(`flagship modules — ${appearance}`, async ({ page }) => {
      test.setTimeout(180_000);
      await useAppearance(page, appearance);
      await page.setViewportSize(DESKTOP);
      for (const [name, route] of FLAGSHIP) {
        await gotoFixture(page, route);
        await page.waitForTimeout(400);
        await page.screenshot({
          path: join(OUT, `desktop-1440-${appearance}-${name}.png`),
        });
      }
    });
  }

  test("secondary modules — light", async ({ page }) => {
    test.setTimeout(120_000);
    await useAppearance(page, "light");
    await page.setViewportSize(DESKTOP);
    for (const [name, route] of SECONDARY) {
      await gotoFixture(page, route);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(OUT, `desktop-1440-light-${name}.png`),
      });
    }
  });
});

test.describe("the desktop viewport matrix", () => {
  for (const [label, size] of [
    ["1280", LAPTOP],
    ["1100", NARROW],
    ["900", TABLET],
  ] as const) {
    test(`Today, Tasks and Plan at ${label}`, async ({ page }) => {
      test.setTimeout(120_000);
      await useAppearance(page, "light");
      await page.setViewportSize(size);
      for (const [name, route] of [
        ["today", "/today"],
        ["tasks", "/tasks"],
        ["plan", "/plan"],
        ["projects", "/projects"],
      ] as const) {
        await gotoFixture(page, route);
        await page.waitForTimeout(400);
        await page.screenshot({
          path: join(OUT, `desktop-${label}-light-${name}.png`),
        });
      }
    });
  }
});

test.describe("the phone", () => {
  for (const appearance of ["light", "dark"] as const) {
    test(`393 — ${appearance}`, async ({ page }) => {
      test.setTimeout(180_000);
      await useAppearance(page, appearance);
      await page.setViewportSize(PHONE);
      for (const [name, route] of [
        ["today", "/today"],
        ["tasks", "/tasks"],
        ["projects", "/projects"],
        ["goals", "/goals"],
        ["notes", "/notes"],
        ["plan", "/plan"],
        ["views", "/views"],
      ] as const) {
        await gotoFixture(page, route);
        await page.waitForTimeout(400);
        await page.screenshot({
          path: join(OUT, `phone-393-${appearance}-${name}.png`),
        });
      }
    });
  }

  test("320 — the narrowest supported width", async ({ page }) => {
    test.setTimeout(120_000);
    await useAppearance(page, "light");
    await page.setViewportSize(SMALL_PHONE);
    for (const [name, route] of [
      ["today", "/today"],
      ["tasks", "/tasks"],
      ["plan", "/plan"],
    ] as const) {
      await gotoFixture(page, route);
      await page.waitForTimeout(400);
      await page.screenshot({
        path: join(OUT, `phone-320-light-${name}.png`),
      });
    }
  });
});

test.describe("floating surfaces over a real page", () => {
  for (const appearance of ["light", "dark"] as const) {
    test(`Capture, palette, menu and picker — ${appearance}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await useAppearance(page, appearance);
      await page.setViewportSize(DESKTOP);

      // The global Capture sheet — the surface whose scrim and elevation this
      // phase repaired.
      await gotoFixture(page, "/today");
      await page.getByRole("button", { name: "Capture" }).first().click();
      await page.waitForTimeout(700);
      await page.screenshot({
        path: join(OUT, `floating-${appearance}-capture.png`),
      });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // The command palette, with a query, over the same page.
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(500);
      await page.keyboard.type("kitchen");
      await page.waitForTimeout(800);
      await page.screenshot({
        path: join(OUT, `floating-${appearance}-command-palette.png`),
      });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // A row's overflow MENU and an inline date PICKER, on Tasks.
      await gotoFixture(page, "/tasks");
      const row = page.locator(".dh-taskrow").first();
      await row.hover();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: join(OUT, `floating-${appearance}-row-engaged.png`),
      });
      await row.locator(".dh-taskrow__cell--due button").first().click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: join(OUT, `floating-${appearance}-date-picker.png`),
      });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // The shared filter/sort popover — the product's densest menu.
      await page
        .getByRole("button", { name: /Filter & sort/i })
        .first()
        .click();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: join(OUT, `floating-${appearance}-filter-sort.png`),
      });
      await page.keyboard.press("Escape");
    });
  }

  test("the phone sheet — light", async ({ page }) => {
    test.setTimeout(120_000);
    await useAppearance(page, "light");
    await page.setViewportSize(PHONE);
    await gotoFixture(page, "/today");
    await page
      .locator("[data-testid='bottom-nav']")
      .getByRole("button")
      .filter({ hasText: /Add|Capture/ })
      .first()
      .click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "phone-393-light-capture.png") });
  });
});

test.describe("states real data does not reach", () => {
  test("an empty collection, a record panel and a toast", async ({ page }) => {
    test.setTimeout(150_000);
    await useAppearance(page, "light");
    await page.setViewportSize(DESKTOP);

    // Empty — Meetings has none seeded, so this is the genuine empty state.
    await gotoFixture(page, "/meetings");
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, "state-empty-meetings.png") });

    // A record panel over its list.
    await gotoFixture(page, "/tasks");
    await page.locator(".dh-taskrow a").first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, "state-task-drawer.png") });

    // Completion — the optimistic mutation and its undoable toast.
    await gotoFixture(page, "/tasks");
    await page.locator(".dh-check-circle-target").first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUT, "state-toast-undo.png") });
  });
});
