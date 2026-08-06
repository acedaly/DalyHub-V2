/**
 * M3-01 — the visual acceptance capture.
 *
 * One pass over the surfaces that carry the most of the design language, in BOTH
 * appearances, so the overhaul can be looked at rather than described. It is
 * opt-in exactly like the other screenshot passes (`CAPTURE_SCREENSHOTS=1`), so
 * the ordinary gate neither slows down nor writes into the repository.
 *
 * Appearance is emulated rather than stored, because that is where the choice
 * actually lives now: DalyHub ships one generated light/dark pair selected by
 * `prefers-color-scheme` (ADR-074).
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/m3-screenshots.spec.ts
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "m3-2026-08",
);

const DESKTOP = { width: 1440, height: 900 };
/** iPhone 15/16 logical resolution. */
const IPHONE = { width: 393, height: 852 };

/** The surfaces that between them exercise most of the component library. */
const SURFACES = [
  { name: "today", path: "/today", heading: "Today" },
  { name: "tasks", path: "/tasks", heading: "Tasks" },
  { name: "projects", path: "/projects", heading: "Projects" },
  { name: "areas", path: "/areas", heading: "Areas" },
  { name: "settings", path: "/settings", heading: "Settings" },
] as const;

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.describe("M3-01 desktop surfaces", () => {
  test.use({ viewport: DESKTOP });

  for (const scheme of ["light", "dark"] as const) {
    test(`captures the desktop surfaces in the ${scheme} appearance`, async ({
      page,
    }) => {
      test.slow();
      await page.emulateMedia({ colorScheme: scheme });

      for (const surface of SURFACES) {
        await gotoFixture(page, surface.path);
        await expect(
          page.getByRole("heading", { level: 1, name: surface.heading }),
        ).toBeVisible();
        await page.screenshot({
          path: join(OUT, `${surface.name}-${scheme}.png`),
          fullPage: false,
        });
      }
    });
  }
});

test.describe("M3-01 component surfaces", () => {
  test.use({ viewport: DESKTOP });

  test("captures the shared form and card fixtures in both appearances", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const path of ["/design/forms", "/design/cards-filters"]) {
        await gotoFixture(page, path);
        await page.screenshot({
          path: join(OUT, `${path.split("/").pop()}-${scheme}.png`),
          fullPage: false,
        });
      }
    }
  });
});

test.describe("M3-01 the phone shell", () => {
  test.use({ viewport: IPHONE });

  test("captures the navigation bar and the FAB in both appearances", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/today");
      await expect(page.getByTestId("bottom-nav")).toBeVisible();
      await page.screenshot({ path: join(OUT, `phone-today-${scheme}.png`) });
    }
  });
});
