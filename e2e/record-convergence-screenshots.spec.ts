/**
 * RECORD-01 — the record-screen convergence evidence.
 *
 * Before/after captures of every first-class record at laptop width, plus the
 * surfaces the convergence specifically changes: the Meeting's sticky capture,
 * a long-titled record, a phone-width record and one dark-mode record.
 *
 * STAGED, like the #130 collection evidence, so ONE spec captures both sides:
 *
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=before pnpm exec playwright test e2e/record-convergence-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=after  pnpm exec playwright test e2e/record-convergence-screenshots.spec.ts
 *
 * Every record is one of the RECORD-01 fixtures seeded by
 * `e2e/seed-record-convergence.sql`, so the captures are reproducible rather
 * than dependent on whatever happens to be in the local database.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const STAGE = process.env.SHOT_STAGE === "before" ? "before" : "after";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "record-2026-08",
);

/** The two first-class laptop viewports the brief names. */
const LAPTOP_SMALL = { width: 1280, height: 800 };
const LAPTOP = { width: 1440, height: 900 };
/** iPhone 15/16 logical resolution. */
const PHONE = { width: 390, height: 844 };

/** One entry per first-class record type, on the seeded RECORD-01 fixtures. */
const RECORDS = [
  { name: "area-active", path: "/areas/a-rc-home", heading: "Home & Property" },
  { name: "area-quiet", path: "/areas/a-rc-admin", heading: "Personal Admin" },
  {
    name: "goal",
    path: "/goals/g-rc-move",
    heading: "Finish the ground-floor renovation before summer",
  },
  { name: "project", path: "/projects/pr-rc-kitchen", heading: "Kitchen fit-out" },
  { name: "note", path: "/notes/n-rc-brief", heading: "Kitchen fit-out brief" },
  {
    name: "meeting",
    path: "/meeting/m-rc-site",
    heading: "Kitchen fit-out site walkthrough",
  },
  { name: "person-full", path: "/person/p-rc-dan", heading: "Dan Whitfield" },
  { name: "person-partial", path: "/person/p-rc-ana", heading: "Ana Ruiz" },
  { name: "asset", path: "/asset/as-rc-ute", heading: "Hilux SR5 — work ute" },
  {
    name: "review",
    path: "/reviews/rv-rc-week",
    heading: "Weekly review — 27 Jul to 2 Aug",
  },
] as const;

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** Land on a record and wait for its heading, so a capture is never mid-render. */
async function openRecord(page: Page, path: string, heading: string) {
  await gotoFixture(page, path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  // The record heading is an inline-edit trigger whose width settles a frame
  // after hydration; capturing before that produces a misleading header height.
  await page.waitForTimeout(250);
}

test.describe("record screens — 1280 laptop", () => {
  test.use({ viewport: LAPTOP_SMALL });

  test(`captures every record at 1280x800 (${STAGE})`, async ({ page }) => {
    test.slow();
    for (const record of RECORDS) {
      await openRecord(page, record.path, record.heading);
      await page.screenshot({
        path: join(OUT, `record-${STAGE}-${record.name}-1280.png`),
      });
    }
  });

  test(`captures the Meeting sticky capture at 1280x800 (${STAGE})`, async ({
    page,
  }) => {
    // The capture strip lives on the Meeting tab, over the meeting's own content —
    // the specific thing the convergence has to stop dominating the viewport.
    await openRecord(page, "/meeting/m-rc-site?tab=meeting", "Kitchen fit-out site walkthrough");
    await page.screenshot({
      path: join(OUT, `record-${STAGE}-meeting-capture-1280.png`),
    });
  });

  test(`captures the long-titled record at 1280x800 (${STAGE})`, async ({
    page,
  }) => {
    await openRecord(
      page,
      "/projects/pr-rc-long",
      "Consolidate every household insurance, utility and subscription renewal into one annual review cycle",
    );
    await page.screenshot({
      path: join(OUT, `record-${STAGE}-long-title-1280.png`),
    });
  });

  test(`captures the Asset history actions at 1280x800 (${STAGE})`, async ({
    page,
  }) => {
    await openRecord(page, "/asset/as-rc-ute?tab=history", "Hilux SR5 — work ute");
    await page.screenshot({
      path: join(OUT, `record-${STAGE}-asset-history-1280.png`),
    });
  });
});

test.describe("record screens — 1440 laptop", () => {
  test.use({ viewport: LAPTOP });

  test(`captures the reference records at 1440x900 (${STAGE})`, async ({
    page,
  }) => {
    test.slow();
    // The Project is the exemplar; the Area, Person and Asset are the three
    // records whose treatment changes most, so the wider capture is worth having.
    for (const record of RECORDS.filter((entry) =>
      ["project", "area-active", "person-full", "asset"].includes(entry.name),
    )) {
      await openRecord(page, record.path, record.heading);
      await page.screenshot({
        path: join(OUT, `record-${STAGE}-${record.name}-1440.png`),
      });
    }
  });
});

test.describe("record screens — phone", () => {
  test.use({ viewport: PHONE });

  test(`captures the Project at 390 (${STAGE})`, async ({ page }) => {
    await openRecord(page, "/projects/pr-rc-kitchen", "Kitchen fit-out");
    await page.screenshot({
      path: join(OUT, `record-${STAGE}-project-390.png`),
    });
  });
});

test.describe("record screens — dark", () => {
  test.use({ viewport: LAPTOP_SMALL, colorScheme: "dark" });

  test(`captures the Project in dark mode (${STAGE})`, async ({ page }) => {
    await openRecord(page, "/projects/pr-rc-kitchen", "Kitchen fit-out");
    await page.screenshot({
      path: join(OUT, `record-${STAGE}-project-dark-1280.png`),
    });
  });
});
