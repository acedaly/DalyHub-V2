import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

/**
 * DS-14 — the foundation's visual acceptance pass.
 *
 * Captures the TWO reference surfaces the foundation restyles — Today (the
 * Collection reference) and a Note record (the Reading reference, the serif
 * column at its capped measure inside sans chrome) — in every registered theme,
 * under both operating-system colour schemes.
 *
 * WHY BOTH SCHEMES FOR EVERY THEME, when five of the seven are light-only
 * palettes: because "a curated theme does not follow the OS" is an invariant
 * (ADR-061), and the cheapest way for it to break is for someone to make a
 * surface consult `prefers-color-scheme` directly instead of consuming a token.
 * The pair of images for each theme is the evidence that it did not — Eucalypt
 * under a dark OS must be byte-identical to Eucalypt under a light one. The two
 * dark palettes and `system`'s dark half are what give the pass genuine dark
 * coverage.
 *
 * The theme is stored through the product's OWN preferences action, so what these
 * images show is the theme an owner would actually get, resolved server-side on
 * the first byte, rather than a class the test toggled.
 *
 * Opt-in, exactly like the THEME-02, MOBILE-01 and TASKS-03 passes: skipped
 * unless `CAPTURE_SCREENSHOTS=1`, so the ordinary gate neither slows down nor
 * writes into the repository. Run it with:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/ds-14-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "ds-14-2026-08",
);

const DESKTOP = { width: 1440, height: 900 };

/* -------------------------------------------------------------------------- */
/* The Reading reference needs real prose                                      */
/* -------------------------------------------------------------------------- */

/*
 * The pass seeds its OWN note rather than photographing one of the shared
 * fixtures, and the reason is the point of the image: a 46ch measure cap only
 * shows up as a measure when there are enough words to wrap several times. The
 * seeded search fixture is a single line whose newline escapes are stored
 * literally, so it renders as one long heading — an image of it would show the
 * serif but would prove nothing about the column.
 *
 * Created and removed through the same local-D1 path the other journeys use
 * (`notes-fixtures.ts` documents the FK ordering this mirrors), so nothing here
 * depends on a record a developer happens to have.
 */
const WORKSPACE_ID = "local-dev-workspace";
const NOTE_ID = "n-ds14-reading-reference";
const NOTE_TITLE = "The reading column";

/** Real prose, long enough that the measure has to do something. */
const NOTE_PARAGRAPHS = [
  "## Why a measure is capped",
  "A line of text that runs the full width of a 1440px pane is not easier to read for being longer. The eye has to travel back to a left edge it can no longer locate by feel, and it loses its place — once a paragraph is enough to make long-form reading tiring rather than absorbing.",
  "So the Reading preset caps the column at 46 characters and sets it in a serif at sixteen pixels over a line height of 1.75. The three values are one decision, not three: a shorter measure wants a taller line, and a serif at this size wants both.",
  "Everything around the column stays sans. The tabs above it, the toolbar, the save status, the metadata and the record header are all chrome — things the owner operates rather than reads — and chrome that borrows the reading face stops looking like something you can click.",
  "That contrast is the whole reference implementation: one surface, two families, and a boundary between them you can point at.",
];

function d1Execute(command: string): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "pipe",
    },
  );
}

/** SQL-escape a single-quoted literal. */
const lit = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The body, assembled with `char(10)` rather than embedded newlines: the command
 * travels through a shell argument, and a literal newline in it is the exact way
 * the existing search fixture ended up storing its escapes as two characters.
 */
const NOTE_BODY_SQL = NOTE_PARAGRAPHS.map(lit).join(
  " || char(10) || char(10) || ",
);

function removeReadingNote(): void {
  // Dependent rows first — every endpoint is ON DELETE RESTRICT.
  d1Execute(
    `DELETE FROM activity_subjects WHERE workspace_id = ${lit(WORKSPACE_ID)} AND entity_id = ${lit(NOTE_ID)};` +
      `DELETE FROM activities WHERE workspace_id = ${lit(WORKSPACE_ID)} AND NOT EXISTS ` +
      `(SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);` +
      `DELETE FROM entity_links WHERE workspace_id = ${lit(WORKSPACE_ID)} AND (source_entity_id = ${lit(NOTE_ID)} OR target_entity_id = ${lit(NOTE_ID)});` +
      `DELETE FROM note_details WHERE workspace_id = ${lit(WORKSPACE_ID)} AND entity_id = ${lit(NOTE_ID)};` +
      `DELETE FROM entities WHERE workspace_id = ${lit(WORKSPACE_ID)} AND id = ${lit(NOTE_ID)};`,
  );
}

function seedReadingNote(): void {
  removeReadingNote();
  d1Execute(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) ` +
      `VALUES (${lit(NOTE_ID)}, ${lit(WORKSPACE_ID)}, 'note', ${lit(NOTE_TITLE)}, ` +
      `'2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', NULL);` +
      `INSERT INTO note_details (workspace_id, entity_id, entity_type, content, updated_at) ` +
      `VALUES (${lit(WORKSPACE_ID)}, ${lit(NOTE_ID)}, 'note', ${NOTE_BODY_SQL}, '2026-08-03T00:00:00.000Z');`,
  );
}

/**
 * Every registered theme. Deliberately restated here rather than imported from
 * the kernel: a Playwright spec runs outside the app's module graph, and the
 * theme-invariant unit test is what guarantees the registry is complete. If a
 * theme is added and this list is not updated, the pass is short one pair of
 * images and the acceptance matrix says so.
 */
const THEMES = [
  "daly-light",
  "daly-dark",
  "modern-light",
  "modern-dark",
  "eucalypt",
  "coastal",
  "ember",
] as const;

/** The two reference surfaces, by the route that renders them. */
const SURFACES = [
  {
    name: "today",
    path: "/today",
    /* The Collection region wrapper is the thing being proved. */
    region: '[data-density="collection"]',
  },
  {
    name: "note-record",
    path: `/notes/${NOTE_ID}`,
    region: '[data-density="reading"]',
  },
] as const;

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  seedReadingNote();
});

test.afterAll(() => {
  removeReadingNote();
});

/** Store the owner's theme through the real, validated preferences action. */
async function useTheme(page: Page, themeId: string): Promise<void> {
  const response = await page.request.post("/preferences/theme", {
    form: { theme: themeId },
    maxRedirects: 0,
  });
  expect(response.status()).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
}

test.describe("DS-14 reference surfaces", () => {
  test.use({ viewport: DESKTOP });

  for (const scheme of ["light", "dark"] as const) {
    test.describe(`under a ${scheme} operating system`, () => {
      test.use({ colorScheme: scheme });

      for (const themeId of THEMES) {
        test(`captures both reference surfaces in ${themeId}`, async ({
          page,
        }) => {
          test.slow();
          await useTheme(page, themeId);

          for (const surface of SURFACES) {
            await gotoFixture(page, surface.path);

            // The theme resolved server-side, and did NOT follow the OS.
            await expect(page.locator("html")).toHaveAttribute(
              "data-theme",
              themeId,
            );
            // The surface is actually inside the region it is meant to prove —
            // an image of an unclassified surface would prove nothing.
            await expect(page.locator(surface.region).first()).toBeVisible();

            await page.screenshot({
              path: join(OUT, `${surface.name}-${themeId}-os-${scheme}.png`),
              fullPage: false,
            });
          }
        });
      }
    });
  }
});
