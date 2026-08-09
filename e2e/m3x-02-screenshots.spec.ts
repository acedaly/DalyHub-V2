import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture } from "./helpers";

/**
 * M3X-02 — the Expressive COMPOSITION pass's screenshot set.
 *
 * The sibling of `expressive-screenshots.spec.ts`, at the widths this brief
 * names rather than the widths the first pass did: 1280 / 1440 / 1920 on the
 * desktop, and 375 / 390 / 430 on the phone, in BOTH appearances. The wide and
 * large-phone ends are the point — a composition that "uses width effectively"
 * and a first viewport that is "strong on an iPhone" are claims about the ends
 * of the range, and the first pass only captured the middle.
 *
 * Opt-in, like every other screenshot pass here, so the ordinary gate neither
 * slows down nor writes into the repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/m3x-02-screenshots.spec.ts
 *
 * There is no `before-` prefix here, and deliberately: the "before" for this pass
 * is PR #144's own after-state, which is already committed as the unprefixed set
 * in `assets/m3x-2026-08/`. Capturing it a second time would put ~80 identical
 * PNGs in the repository to say something the previous pass's evidence already
 * says.
 *
 * The phone contexts declare `isMobile`/`hasTouch`. That is not decoration: a
 * desktop Chromium narrowed to 390px still answers `(hover: hover)` and
 * `(pointer: fine)`, so without it this spec would photograph the mouse layout
 * at phone width and call it the phone.
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "m3x-02-2026-08",
);

const LAPTOP = { width: 1280, height: 900 };
const WIDE = { width: 1440, height: 950 };
const ULTRA = { width: 1920, height: 1080 };
const PHONE_SMALL = { width: 375, height: 812 };
const PHONE = { width: 390, height: 844 };
const PHONE_LARGE = { width: 430, height: 932 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/** Every surface the composition pass touches, plus the two it deliberately did not. */
const ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["/today", "today"],
  ["/tasks", "tasks"],
  ["/projects", "projects"],
  ["/areas", "areas"],
  ["/goals", "goals"],
  ["/notes", "notes"],
  ["/meetings", "meetings"],
  ["/diary", "diary"],
  ["/reviews", "analytics"],
];

/**
 * Open the first note in the directory — the editor's real entry point.
 *
 * The note's own href is FOLLOWED rather than tapped. On a touch context the
 * card's long-press and swipe handlers observe the same pointer sequence a
 * synthetic `click()` produces, and one of them can claim it; the capture then
 * photographs the directory and files it under the editor's name, which is worse
 * than no capture at all. Reading the href off the directory keeps this a
 * journey through the product rather than a hard-coded id.
 */
async function openFirstNote(page: Page) {
  await gotoFixture(page, "/notes");
  const href = await page
    .locator(".dh-card__open")
    .first()
    .getAttribute("href");
  if (href) {
    await gotoFixture(page, href);
  }
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`laptop ${scheme}`, () => {
    test.use({ viewport: LAPTOP, colorScheme: scheme });

    test(`captures every surface at 1280 (${scheme})`, async ({ page }) => {
      for (const [route, name] of ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-1280-${scheme}`);
      }
      await openFirstNote(page);
      await shoot(page, `notes-editor-1280-${scheme}`);
    });
  });

  test.describe(`wide ${scheme}`, () => {
    test.use({ viewport: WIDE, colorScheme: scheme });

    test(`captures the width-sensitive surfaces at 1440 (${scheme})`, async ({
      page,
    }) => {
      for (const route of [
        "/today",
        "/projects",
        "/goals",
        "/notes",
      ] as const) {
        await gotoFixture(page, route);
        await shoot(page, `${route.slice(1)}-1440-${scheme}`);
      }
      await openFirstNote(page);
      await shoot(page, `notes-editor-1440-${scheme}`);
    });
  });

  test.describe(`ultra ${scheme}`, () => {
    test.use({ viewport: ULTRA, colorScheme: scheme });

    // The width the brief asks specifically about: does a wide monitor get more
    // columns, or longer lines and more empty canvas?
    test(`proves the wide layouts use their width at 1920 (${scheme})`, async ({
      page,
    }) => {
      for (const route of ["/projects", "/today"] as const) {
        await gotoFixture(page, route);
        await shoot(page, `${route.slice(1)}-1920-${scheme}`);
      }
    });
  });

  test.describe(`phone 390 ${scheme}`, () => {
    test.use({
      viewport: PHONE,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
    });

    test(`captures every phone surface at 390 (${scheme})`, async ({
      page,
    }) => {
      for (const [route, name] of ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-390-${scheme}`);
      }
      await openFirstNote(page);
      await shoot(page, `notes-editor-390-${scheme}`);
    });
  });

  /*
   * 375 and 430 are the ENDS of the phone range, and only the five screens whose
   * first viewport the brief asks about are captured there — the question at
   * those widths is "does the composition still hold?", not "does every module
   * still render?", which 390 has already answered.
   */
  for (const [phone, label] of [
    [PHONE_SMALL, "375"],
    [PHONE_LARGE, "430"],
  ] as const) {
    test.describe(`phone ${label} ${scheme}`, () => {
      test.use({
        viewport: phone,
        isMobile: true,
        hasTouch: true,
        colorScheme: scheme,
      });

      test(`checks the first viewport at ${label} (${scheme})`, async ({
        page,
      }) => {
        for (const route of [
          "/today",
          "/tasks",
          "/projects",
          "/goals",
          "/notes",
        ] as const) {
          await gotoFixture(page, route);
          await shoot(page, `${route.slice(1)}-${label}-${scheme}`);
        }
      });
    });
  }

  test.describe(`phone interactions ${scheme}`, () => {
    test.use({
      viewport: PHONE,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
    });

    test(`captures Quick Capture and the navigation sheet (${scheme})`, async ({
      page,
    }) => {
      await gotoFixture(page, "/today");
      await page
        .locator("[data-testid='bottom-nav']")
        .getByRole("button", { name: "Capture" })
        .click();
      await page.getByTestId("capture-sheet").waitFor();
      await shoot(page, `quick-capture-390-${scheme}`);
      await page.keyboard.press("Escape");

      await page
        .locator("[data-testid='bottom-nav']")
        .getByRole("button", { name: "More" })
        .click();
      await page.waitForTimeout(300);
      await shoot(page, `navigation-390-${scheme}`);
    });
  });
}
