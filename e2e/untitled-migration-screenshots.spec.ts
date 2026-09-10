import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture } from "./helpers";

/**
 * UNTITLED-UI — the before/after visual evidence for the Untitled UI migration.
 *
 * One pass, run twice: once on the pre-migration tree and once after, into
 * sibling directories chosen by `UI_EVIDENCE_PASS` (default `before`). Every shot
 * is taken against the same seeded development database the journeys run on, so
 * the two passes are directly comparable rather than being mock-ups.
 *
 * Opt-in, like every other screenshot pass:
 *
 *     CAPTURE_SCREENSHOTS=1 UI_EVIDENCE_PASS=before \
 *       pnpm exec playwright test e2e/untitled-migration-screenshots.spec.ts
 */

const PASS = process.env.UI_EVIDENCE_PASS ?? "before";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "untitled-migration",
  PASS,
);

/** The four widths the migration brief requires every surface to survive. */
const DESKTOP = { width: 1440, height: 900 };
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 393, height: 852 };
const NARROW = { width: 320, height: 720 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: false });
}

/** The surfaces the brief names as mandatory desktop evidence. */
const DESKTOP_SURFACES: ReadonlyArray<readonly [string, string]> = [
  ["today", "/today"],
  ["tasks", "/tasks"],
  ["projects", "/projects"],
  ["areas", "/areas"],
  ["goals", "/goals"],
  ["finance", "/finance"],
  ["settings", "/settings"],
  ["notes", "/notes"],
  ["habits", "/habits"],
  ["people", "/people"],
];

/** The surfaces the brief names as mandatory phone evidence. */
const PHONE_SURFACES: ReadonlyArray<readonly [string, string]> = [
  ["today", "/today"],
  ["tasks", "/tasks"],
  ["projects", "/projects"],
  ["settings", "/settings"],
];

test.describe(`Untitled migration evidence — ${PASS}`, () => {
  for (const [name, path] of DESKTOP_SURFACES) {
    test(`desktop 1440 — ${name}`, async ({ page }) => {
      await page.setViewportSize(DESKTOP);
      await gotoFixture(page, path);
      await shoot(page, `desktop-1440-${name}`);
    });
  }

  for (const [name, path] of PHONE_SURFACES) {
    test(`phone 393 — ${name}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await gotoFixture(page, path);
      await shoot(page, `phone-393-${name}`);
    });
  }

  test("laptop 1280 — today", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await gotoFixture(page, "/today");
    await shoot(page, "laptop-1280-today");
  });

  test("narrow 320 — tasks", async ({ page }) => {
    await page.setViewportSize(NARROW);
    await gotoFixture(page, "/tasks");
    await shoot(page, "narrow-320-tasks");
  });
});
