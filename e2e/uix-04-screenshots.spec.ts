/**
 * UIX-04 — the Notes / Diary / Meetings redesign screenshot matrix.
 *
 * Same comparative shape as `uix-01`…`uix-03`: one spec captures one matrix and
 * writes it under a `before-` prefix or none, chosen by an environment variable,
 * so nothing between a `before-` and its pair differs except the product.
 *
 *     node e2e/today-fixtures.mjs writing
 *     CAPTURE_SCREENSHOTS=1 SHOT_PREFIX=before- pnpm exec playwright test \
 *       --config scratch.playwright.config.ts e2e/uix-04-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test \
 *       --config scratch.playwright.config.ts e2e/uix-04-screenshots.spec.ts
 *
 * The `writing` scenario is the dataset, because a writing surface can only be
 * judged against writing: it seeds a 900-word structured Note, a spread of Diary
 * entries across a fortnight, and a held Meeting carrying agenda, body,
 * decisions, outcomes and actions that became real Tasks.
 *
 * The phone contexts declare `isMobile`/`hasTouch` because a desktop Chromium
 * narrowed to 390px still answers `(hover: hover)` — without it this photographs
 * the mouse layout at phone width and files it under the phone.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "uix-04-2026-08",
);

/** `before-` for the baseline half of the comparison, empty for the result. */
const PREFIX = process.env.SHOT_PREFIX ?? "";

const LAPTOP = { width: 1280, height: 1000 };
const WIDE = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

/*
 * The seeded records, addressed by their fixture ids rather than by clicking
 * through the collection: the collection layouts are exactly what this matrix is
 * changing, so a navigation helper that depends on them would break in the
 * middle of the comparison it exists to make.
 */
/** The 900-word structured Note — the "would I write in this?" case. */
const LONG_NOTE = "/notes/tf-note-pathway";
/**
 * The Diary entry with a real reflective body. Its editor is the shared DS-10
 * Inspector keyed off the URL (`?inspector=edit:<id>`), not a page of its own —
 * `/diary/:id` is the drawer's data route and returns JSON.
 */
const DIARY_ENTRY = "/diary?inspector=edit:tf-diary-today-eve";
/** The same entry's READ panel, which is what selecting an entry opens. */
const DIARY_ENTRY_READ = "/diary?inspector=view:tf-diary-today-eve";
/** The chronological timeline across days, rather than the single-day view. */
const DIARY_TIMELINE = "/diary?mode=timeline";
/** The held Meeting carrying the full structured notebook. */
const HELD_MEETING = "/meeting/tf-meet-past-1";
/** The Meeting still ahead today — agenda prepared, nothing written yet. */
const TODAY_MEETING = "/meeting/tf-meet-today";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${PREFIX}${name}.png`) });
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("notes — desktop light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  test("notes index 1280", async ({ page }) => {
    await gotoFixture(page, "/notes");
    await shoot(page, "notes-index-1280-light");
  });

  test("note detail 1280", async ({ page }) => {
    await gotoFixture(page, LONG_NOTE);
    await shoot(page, "note-detail-1280-light");
  });

  /*
   * The secondary formatting group, open — §64 asks for the toolbar in an
   * active state.
   *
   * Addressed by `data-action`, not by name: the control RENAMES itself when it
   * expands ("More formatting options" → "Fewer formatting options"), which is
   * correct behaviour and makes a name-based locator stop matching the moment it
   * is clicked.
   */
  test("note editor toolbar 1280", async ({ page }) => {
    await gotoFixture(page, LONG_NOTE);
    const more = page.locator('.dh-md-toolbar [data-action="more"]').first();
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await shoot(page, "note-editor-toolbar-1280-light");
  });
});

test.describe("notes — desktop wide light", () => {
  test.use({ viewport: WIDE, colorScheme: "light" });

  test("notes index 1440", async ({ page }) => {
    await gotoFixture(page, "/notes");
    await shoot(page, "notes-index-1440-light");
  });

  test("note detail 1440", async ({ page }) => {
    await gotoFixture(page, LONG_NOTE);
    await shoot(page, "note-detail-1440-light");
  });
});

test.describe("notes — desktop dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  test("notes index 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/notes");
    await shoot(page, "notes-index-1280-dark");
  });

  test("note detail 1280 dark", async ({ page }) => {
    await gotoFixture(page, LONG_NOTE);
    await shoot(page, "note-detail-1280-dark");
  });
});

test.describe("notes — phone", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });

  test("notes index 390", async ({ page }) => {
    await gotoFixture(page, "/notes");
    await shoot(page, "notes-index-390-light");
  });

  test("note detail 390", async ({ page }) => {
    await gotoFixture(page, LONG_NOTE);
    await shoot(page, "note-detail-390-light");
  });
});

test.describe("notes — phone dark", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });

  test("notes index 390 dark", async ({ page }) => {
    await gotoFixture(page, "/notes");
    await shoot(page, "notes-index-390-dark");
  });

  test("note detail 390 dark", async ({ page }) => {
    await gotoFixture(page, LONG_NOTE);
    await shoot(page, "note-detail-390-dark");
  });
});

/* -------------------------------------------------------------------------- */
/* Diary                                                                       */
/* -------------------------------------------------------------------------- */

test.describe("diary — desktop light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  test("diary index 1280", async ({ page }) => {
    await gotoFixture(page, "/diary");
    await shoot(page, "diary-index-1280-light");
  });

  test("diary timeline 1280", async ({ page }) => {
    await gotoFixture(page, DIARY_TIMELINE);
    await shoot(page, "diary-timeline-1280-light");
  });

  test("diary read panel 1280", async ({ page }) => {
    await gotoFixture(page, DIARY_ENTRY_READ);
    await shoot(page, "diary-read-1280-light");
  });

  test("diary entry 1280", async ({ page }) => {
    await gotoFixture(page, DIARY_ENTRY);
    await shoot(page, "diary-entry-1280-light");
  });
});

test.describe("diary — desktop wide light", () => {
  test.use({ viewport: WIDE, colorScheme: "light" });

  test("diary index 1440", async ({ page }) => {
    await gotoFixture(page, "/diary");
    await shoot(page, "diary-index-1440-light");
  });

  test("diary timeline 1440", async ({ page }) => {
    await gotoFixture(page, DIARY_TIMELINE);
    await shoot(page, "diary-timeline-1440-light");
  });
});

test.describe("diary — desktop dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  test("diary index 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/diary");
    await shoot(page, "diary-index-1280-dark");
  });

  test("diary read panel 1280 dark", async ({ page }) => {
    await gotoFixture(page, DIARY_ENTRY_READ);
    await shoot(page, "diary-read-1280-dark");
  });

  test("diary entry 1280 dark", async ({ page }) => {
    await gotoFixture(page, DIARY_ENTRY);
    await shoot(page, "diary-entry-1280-dark");
  });
});

test.describe("diary — phone", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });

  test("diary index 390", async ({ page }) => {
    await gotoFixture(page, "/diary");
    await shoot(page, "diary-index-390-light");
  });

  test("diary timeline 390", async ({ page }) => {
    await gotoFixture(page, DIARY_TIMELINE);
    await shoot(page, "diary-timeline-390-light");
  });

  test("diary entry 390", async ({ page }) => {
    await gotoFixture(page, DIARY_ENTRY);
    await shoot(page, "diary-entry-390-light");
  });
});

test.describe("diary — phone dark", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });

  test("diary index 390 dark", async ({ page }) => {
    await gotoFixture(page, "/diary");
    await shoot(page, "diary-index-390-dark");
  });
});

/* -------------------------------------------------------------------------- */
/* Meetings                                                                    */
/* -------------------------------------------------------------------------- */

test.describe("meetings — desktop light", () => {
  test.use({ viewport: LAPTOP, colorScheme: "light" });

  test("meetings index 1280", async ({ page }) => {
    await gotoFixture(page, "/meetings");
    await shoot(page, "meetings-index-1280-light");
  });

  test("meeting detail 1280", async ({ page }) => {
    await gotoFixture(page, HELD_MEETING);
    await shoot(page, "meeting-detail-1280-light");
  });

  /* The other half of the lifecycle: prepared, not yet held, nothing written. */
  test("meeting upcoming detail 1280", async ({ page }) => {
    await gotoFixture(page, TODAY_MEETING);
    await shoot(page, "meeting-upcoming-1280-light");
  });
});

test.describe("meetings — desktop wide light", () => {
  test.use({ viewport: WIDE, colorScheme: "light" });

  test("meetings index 1440", async ({ page }) => {
    await gotoFixture(page, "/meetings");
    await shoot(page, "meetings-index-1440-light");
  });

  test("meeting detail 1440", async ({ page }) => {
    await gotoFixture(page, HELD_MEETING);
    await shoot(page, "meeting-detail-1440-light");
  });
});

test.describe("meetings — desktop dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  test("meetings index 1280 dark", async ({ page }) => {
    await gotoFixture(page, "/meetings");
    await shoot(page, "meetings-index-1280-dark");
  });

  test("meeting detail 1280 dark", async ({ page }) => {
    await gotoFixture(page, HELD_MEETING);
    await shoot(page, "meeting-detail-1280-dark");
  });
});

test.describe("meetings — phone", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "light",
    isMobile: true,
    hasTouch: true,
  });

  test("meetings index 390", async ({ page }) => {
    await gotoFixture(page, "/meetings");
    await shoot(page, "meetings-index-390-light");
  });

  test("meeting detail 390", async ({ page }) => {
    await gotoFixture(page, HELD_MEETING);
    await shoot(page, "meeting-detail-390-light");
  });
});

test.describe("meetings — phone dark", () => {
  test.use({
    viewport: PHONE,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
  });

  test("meetings index 390 dark", async ({ page }) => {
    await gotoFixture(page, "/meetings");
    await shoot(page, "meetings-index-390-dark");
  });

  test("meeting detail 390 dark", async ({ page }) => {
    await gotoFixture(page, HELD_MEETING);
    await shoot(page, "meeting-detail-390-dark");
  });
});
