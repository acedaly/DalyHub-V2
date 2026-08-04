import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

/**
 * DS-14 — the visual acceptance pass.
 *
 * Two passes, because they answer different questions and a single matrix would
 * be either too shallow or unreasonably long (7 themes x 2 schemes x every
 * module x seven widths is thousands of images nobody reviews):
 *
 *   THEME COVERAGE — the two reference surfaces (Today for Collection, a Note
 *   record for Reading) in every registered theme under BOTH operating-system
 *   colour schemes. This is the pass that proves the token layer.
 *
 *   MODULE COVERAGE — every module and application edge, plus a deliberately
 *   SPARSE record of each kind, in one light theme and one dark theme at
 *   desktop, and at the two phone widths. This is the pass that proves the
 *   system was actually applied, and it is the one that catches a module left
 *   on the old language.
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

/* -------------------------------------------------------------------------- */
/* Deliberately SPARSE records — brief §11                                     */
/* -------------------------------------------------------------------------- */

/*
 * One record of every entity type carrying the MINIMUM its schema permits: no
 * description, no dates, no links, no progress, no metadata beyond a title.
 *
 * These are the records the design is most likely to be wrong on, and the
 * reason is structural rather than incidental: a visual system built on
 * progress bars, status pills and metadata rows has a defined appearance for
 * every value it was designed around and an UNDEFINED one for every value that
 * is absent. A populated fixture never exercises the second case. So the sparse
 * record is photographed alongside the populated one, and "how does this look
 * with nothing in it" stops being a question nobody asked.
 *
 * They are seeded and removed by the pass, so they never leak into the fixtures
 * the behavioural journeys assert against.
 */
const SPARSE_PREFIX = "ds14-sparse-";
const SPARSE_TS = "2026-08-03T00:00:00.000Z";

/** `[entity type, id suffix, title, the details INSERT (or null)]`. */
const SPARSE_RECORDS: readonly (readonly [
  string,
  string,
  string,
  string | null,
])[] = [
  [
    "area",
    "area",
    "Sparse area",
    `INSERT INTO area_details (workspace_id, entity_id, entity_type, archived_at, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "area")}, 'area', NULL, ${lit(SPARSE_TS)});`,
  ],
  [
    "goal",
    "goal",
    "Sparse goal",
    `INSERT INTO goal_details (workspace_id, entity_id, entity_type, target_date, definition_of_done, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "goal")}, 'goal', NULL, NULL, ${lit(SPARSE_TS)});`,
  ],
  [
    "project",
    "project",
    "Sparse project",
    `INSERT INTO project_details (workspace_id, entity_id, entity_type, status, archived_at, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "project")}, 'project', 'planned', NULL, ${lit(SPARSE_TS)});`,
  ],
  [
    "task",
    "task",
    "Sparse task",
    `INSERT INTO task_details (workspace_id, entity_id, entity_type, status, priority, due_date, scheduled_date, description, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "task")}, 'task', 'todo', NULL, NULL, NULL, NULL, ${lit(SPARSE_TS)});`,
  ],
  [
    "note",
    "note",
    "Sparse note",
    `INSERT INTO note_details (workspace_id, entity_id, entity_type, content, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "note")}, 'note', '', ${lit(SPARSE_TS)});`,
  ],
  [
    "diary",
    "diary",
    "Sparse diary entry",
    `INSERT INTO diary_entry_details (workspace_id, entity_id, entity_type, entry_type, occurred_at, timezone, source_channel, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "diary")}, 'diary', 'reflection', ${lit(SPARSE_TS)}, 'Australia/Sydney', 'manual', ${lit(SPARSE_TS)});`,
  ],
  [
    "meeting",
    "meeting",
    "Sparse meeting",
    `INSERT INTO meeting_details (workspace_id, entity_id, entity_type, starts_at, timezone, status, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "meeting")}, 'meeting', ${lit(SPARSE_TS)}, 'Australia/Sydney', 'planned', ${lit(SPARSE_TS)});`,
  ],
  [
    "person",
    "person",
    "Sparse person",
    `INSERT INTO person_details (workspace_id, entity_id, entity_type, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "person")}, 'person', ${lit(SPARSE_TS)});`,
  ],
  [
    "asset",
    "asset",
    "Sparse asset",
    `INSERT INTO asset_details (workspace_id, entity_id, entity_type, asset_type, status, updated_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "asset")}, 'asset', 'equipment', 'active', ${lit(SPARSE_TS)});`,
  ],
];

/** The spine kinds need a `spine_records` row to be complete records. */
const SPINE_KINDS = new Set(["area", "goal", "project", "task"]);

function removeSparseRecords(): void {
  const ids = SPARSE_RECORDS.map(([, suffix]) =>
    lit(SPARSE_PREFIX + suffix),
  ).join(", ");
  // Dependent rows first — every endpoint is ON DELETE RESTRICT.
  d1Execute(
    [
      `DELETE FROM activity_subjects WHERE workspace_id = ${lit(WORKSPACE_ID)} AND entity_id IN (${ids});`,
      `DELETE FROM entity_links WHERE workspace_id = ${lit(WORKSPACE_ID)} AND (source_entity_id IN (${ids}) OR target_entity_id IN (${ids}));`,
      "area_details",
      "goal_details",
      "project_details",
      "task_details",
      "note_details",
      "diary_entry_details",
      "meeting_details",
      "person_details",
      "asset_details",
    ]
      .map((entry) =>
        entry.startsWith("DELETE")
          ? entry
          : `DELETE FROM ${entry} WHERE workspace_id = ${lit(WORKSPACE_ID)} AND entity_id IN (${ids});`,
      )
      .concat([
        `DELETE FROM spine_records WHERE workspace_id = ${lit(WORKSPACE_ID)} AND entity_id IN (${ids});`,
        `DELETE FROM entities WHERE workspace_id = ${lit(WORKSPACE_ID)} AND id IN (${ids});`,
      ])
      .join(""),
  );
}

/*
 * The ONE link a sparse record needs, and it is structural rather than content.
 *
 * A Goal lives in an Area — that is the spine, not a field the owner filled in —
 * so a Goal with no parent is not a sparse record, it is an unreachable one (the
 * route 404s). The link is created so the record is sparse in everything the
 * DESIGN renders and complete in everything the MODEL requires, which is the
 * distinction the pass is trying to photograph.
 */
const SPARSE_GOAL_AREA_LINK = `INSERT INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at) VALUES (${lit(SPARSE_PREFIX + "goal-area")}, ${lit(WORKSPACE_ID)}, ${lit(SPARSE_PREFIX + "goal")}, ${lit(SPARSE_PREFIX + "area")}, 'goal.belongs_to_area', ${lit(SPARSE_TS)}, ${lit(SPARSE_TS)}, NULL);`;

function seedSparseRecords(): void {
  removeSparseRecords();
  for (const [type, suffix, title, details] of SPARSE_RECORDS) {
    const id = SPARSE_PREFIX + suffix;
    const statements = [
      `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (${lit(id)}, ${lit(WORKSPACE_ID)}, ${lit(type)}, ${lit(title)}, ${lit(SPARSE_TS)}, ${lit(SPARSE_TS)}, NULL);`,
    ];
    if (details) statements.push(details);
    if (SPINE_KINDS.has(type)) {
      statements.push(
        `INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at) VALUES (${lit(WORKSPACE_ID)}, ${lit(id)}, ${lit(type)}, NULL);`,
      );
    }
    d1Execute(statements.join(""));
  }
  d1Execute(SPARSE_GOAL_AREA_LINK);
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
  seedSparseRecords();
});

test.afterAll(() => {
  removeReadingNote();
  removeSparseRecords();
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

/* -------------------------------------------------------------------------- */
/* Module coverage                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Every module and every application edge.
 *
 * The list is deliberately explicit rather than derived from the route manifest:
 * a manifest walk would capture parameterised routes with no record to render
 * and would silently stop covering a surface whose route id changed, whereas a
 * missing entry here is a missing image somebody notices in review.
 *
 * SPARSE records are named separately from populated ones and are the point of
 * the pass rather than an afterthought — brief §11's "load and verify at least
 * one deliberately sparse record for every entity type". A design built on
 * progress bars and status pills regresses first on the record that has neither,
 * so the empty case is photographed, not assumed.
 */
const MODULE_SURFACES = [
  // Shell and the two collection reference surfaces
  { name: "today", path: "/today" },
  { name: "tasks-list", path: "/tasks" },
  { name: "tasks-matrix", path: "/tasks?view=matrix" },
  { name: "tasks-sectors", path: "/tasks?view=sectors" },
  { name: "tasks-inbox", path: "/tasks?project=none" },
  // The spine
  { name: "areas", path: "/areas" },
  { name: "goals", path: "/goals" },
  { name: "projects", path: "/projects" },
  // Capture and memory
  { name: "notes", path: "/notes" },
  { name: "diary", path: "/diary" },
  { name: "meetings", path: "/meetings" },
  { name: "people", path: "/people" },
  { name: "assets", path: "/assets" },
  { name: "reviews", path: "/reviews" },
  // Application edges
  { name: "settings", path: "/settings" },
  /*
   * Search and the Command Palette are OVERLAYS, not routes — `/search` is the
   * JSON provider endpoint. The `/design/*` fixtures render those exact shared
   * components inside the real application shell (see `e2e/helpers.ts`), which
   * is the only way to photograph them without driving a keystroke per theme
   * per width.
   */
  { name: "search", path: "/design/search" },
  { name: "command-palette", path: "/design/command-palette" },
  { name: "forms", path: "/design/forms" },
  { name: "feedback", path: "/design/feedback" },
  { name: "help", path: "/help" },
  { name: "about", path: "/about" },
  { name: "ai-placeholder", path: "/ai" },
  { name: "offline-shell", path: "/offline" },
  // Deliberately SPARSE records — one of every entity type (brief §11).
  { name: "sparse-area", path: `/areas/${SPARSE_PREFIX}area` },
  { name: "sparse-goal", path: `/goals/${SPARSE_PREFIX}goal` },
  { name: "sparse-project", path: `/projects/${SPARSE_PREFIX}project` },
  { name: "sparse-note", path: `/notes/${SPARSE_PREFIX}note` },
  /*
   * A Diary entry has no record ROUTE — `/diary/:entryId` is a data endpoint,
   * like `/search`. The entry is rendered by the day it happened on, so the
   * sparse entry is photographed there, on the date `SPARSE_TS` falls on in the
   * fixture's timezone.
   */
  { name: "sparse-diary", path: "/diary?date=2026-08-03" },
  { name: "sparse-meeting", path: `/meeting/${SPARSE_PREFIX}meeting` },
  { name: "sparse-person", path: `/person/${SPARSE_PREFIX}person` },
  { name: "sparse-asset", path: `/asset/${SPARSE_PREFIX}asset` },
] as const;

/** One light theme and one dark theme: the module pass proves APPLICATION. */
const MODULE_THEMES = ["daly-light", "daly-dark"] as const;

const MODULE_VIEWPORTS = [
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "desktop-1280", width: 1280, height: 800 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-320", width: 320, height: 720 },
] as const;

/**
 * Chunked, and each surface gets a FRESH PAGE.
 *
 * The first shape of this pass drove all ~28 surfaces through one long-lived
 * page in a single test, and it hung — not on any particular route (each one
 * loads in well under a second in isolation) but on the accumulated state of a
 * page that had already navigated twenty times against a dev server holding an
 * HMR socket open. `networkidle` never arrived, and the failure read exactly
 * like a broken route.
 *
 * A page per surface removes the accumulation, and chunking keeps any single
 * test's budget honest rather than pushing the timeout up until it passes.
 */
const MODULE_CHUNK_SIZE = 7;

const MODULE_CHUNKS = Array.from(
  { length: Math.ceil(MODULE_SURFACES.length / MODULE_CHUNK_SIZE) },
  (_, index) =>
    MODULE_SURFACES.slice(
      index * MODULE_CHUNK_SIZE,
      (index + 1) * MODULE_CHUNK_SIZE,
    ),
);

test.describe("DS-14 module coverage", () => {
  for (const viewport of MODULE_VIEWPORTS) {
    test.describe(viewport.label, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      for (const themeId of MODULE_THEMES) {
        for (const [index, chunk] of MODULE_CHUNKS.entries()) {
          test(`captures ${themeId} surfaces ${index + 1}`, async ({
            browser,
          }) => {
            test.slow();
            const context = await browser.newContext({
              viewport: { width: viewport.width, height: viewport.height },
            });
            try {
              // Stored through the product's own validated preferences action,
              // so what these images show is the theme an owner would get.
              const primer = await context.newPage();
              await useTheme(primer, themeId);
              await primer.close();

              for (const surface of chunk) {
                const page = await context.newPage();
                try {
                  await gotoFixture(page, surface.path);
                  await expect(page.locator("html")).toHaveAttribute(
                    "data-theme",
                    themeId,
                  );
                  await page.screenshot({
                    path: join(
                      OUT,
                      `${surface.name}-${themeId}-${viewport.label}.png`,
                    ),
                    fullPage: false,
                  });
                } finally {
                  await page.close();
                }
              }
            } finally {
              await context.close();
            }
          });
        }
      }
    });
  }
});
