/**
 * VIS-01 — the visual convergence pass's screenshot set.
 *
 * The brief for this pass is comparative: "capture current and final
 * screenshots" and compare them, surface by surface, against the approved
 * reference. So this spec captures ONE matrix — the widths and appearances the
 * brief names — and writes it under a `before-` prefix or none, chosen by an
 * environment variable, so the same code produces both halves of the comparison
 * and nothing about the "after" capture can differ from the "before" except the
 * product.
 *
 *     CAPTURE_SCREENSHOTS=1 SHOT_PREFIX=before- pnpm exec playwright test e2e/visual-convergence-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/visual-convergence-screenshots.spec.ts
 *
 * ── Why it seeds its own Goals ───────────────────────────────────────────────
 * Half of this pass is about how a MEASURABLE Goal draws — a target value, a
 * count, a currency total and a milestone track are four different pictures, and
 * the seeded workspace holds none of them. They are created through the real
 * product (the same route the owner uses) rather than injected, so what is
 * photographed is a Goal an owner could have made. Seeding is idempotent: a
 * second run finds the Goals already there and skips straight to capture, which
 * is what lets the "before" and "after" halves photograph the SAME data.
 *
 * The phone contexts declare `isMobile`/`hasTouch`, for the reason the M3X-02
 * spec records: a desktop Chromium narrowed to 390px still answers
 * `(hover: hover)`, so without it this would photograph the mouse layout at
 * phone width and file it under the phone.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture, ownerToday, waitForInteractive } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "visual-convergence-2026-08",
);

/** `before-` for the baseline half of the comparison, empty for the result. */
const PREFIX = process.env.SHOT_PREFIX ?? "";

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
  await page.screenshot({ path: join(OUT, `${PREFIX}${name}.png`) });
}

/* -------------------------------------------------------------------------- */
/* The measurable Goals this pass has to be able to draw                       */
/* -------------------------------------------------------------------------- */

const WEIGHT_GOAL = "Reach 70 kg";
const BOOKS_GOAL = "Read 12 books";
const SAVINGS_GOAL = "Save 15,000";
const MILESTONE_GOAL = "Run a half marathon";

/** Create one Goal through the Area's own New Goal route, and return its URL. */
async function createGoal(
  page: Page,
  options: {
    readonly title: string;
    readonly type: "target_value" | "accumulation" | "milestone";
    readonly unit?: string;
    readonly baseline?: string;
    readonly target?: string;
    readonly targetDate: string;
  },
): Promise<string> {
  await gotoFixture(page, "/areas/a-dh");
  await page.getByRole("tab", { name: "Goals" }).click();
  await page.getByRole("link", { name: "New Goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Goal" });
  await dialog.getByLabel(/Title/).fill(options.title);
  await dialog.getByTestId(`new-goal-measurement-${options.type}`).check();
  if (options.unit !== undefined) {
    await dialog.getByRole("textbox", { name: /^Measure in/ }).fill(
      options.unit,
    );
  }
  if (options.baseline !== undefined) {
    await dialog
      .getByRole("textbox", { name: /^Starting value/ })
      .fill(options.baseline);
  }
  if (options.target !== undefined) {
    await dialog
      .getByRole("textbox", { name: /^(Target value|Total to reach)/ })
      .fill(options.target);
  }
  await dialog.getByLabel("Target date").fill(options.targetDate);
  await dialog.getByRole("button", { name: "Create Goal" }).click();
  await expect(page).toHaveURL(/\/goals\/[^/?#]+$/);
  await waitForInteractive(page);
  return page.url();
}

/** Record a run of readings against the Goal currently open. */
async function logReadings(
  page: Page,
  readings: ReadonlyArray<readonly [string, string]>,
) {
  for (const [value, measuredOn] of readings) {
    await page.getByTestId("goal-record-measurement").first().click();
    const sheet = page.getByTestId("goal-check-in-sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("textbox", { name: /^Measurement/ }).fill(value);
    await sheet.getByLabel("Date").fill(measuredOn);
    await page.getByTestId("goal-check-in-save").click();
    await expect(sheet).toHaveCount(0);
  }
}

/**
 * Seed the four measurable Goals, once.
 *
 * Returns the weight Goal's URL — the record screen the brief asks for a capture
 * of, because a target-value Goal with real history is the one that exercises
 * the trend, the target line and the check-in together.
 */
async function seedMeasurableGoals(page: Page): Promise<string> {
  await gotoFixture(page, "/goals");
  const existing = page.getByRole("link", { name: WEIGHT_GOAL }).first();
  if ((await existing.count()) > 0) {
    const href = await existing.getAttribute("href");
    if (href) return href;
  }

  const weightUrl = await createGoal(page, {
    title: WEIGHT_GOAL,
    type: "target_value",
    unit: "kg",
    baseline: "85",
    target: "70",
    targetDate: "2026-12-20",
  });
  await logReadings(page, [
    ["85.0", "2026-05-01"],
    ["83.4", "2026-05-31"],
    ["82.1", "2026-06-10"],
    ["81.0", "2026-07-10"],
    ["80.2", "2026-08-01"],
    ["79.3", ownerToday()],
  ]);

  await createGoal(page, {
    title: BOOKS_GOAL,
    type: "accumulation",
    unit: "books",
    target: "12",
    targetDate: "2026-12-31",
  });
  await logReadings(page, [
    ["2", "2026-05-20"],
    ["4", "2026-07-02"],
    ["5", ownerToday()],
  ]);

  await createGoal(page, {
    title: SAVINGS_GOAL,
    type: "target_value",
    unit: "$",
    baseline: "0",
    target: "15000",
    targetDate: "2026-12-31",
  });
  await logReadings(page, [
    ["2400", "2026-05-15"],
    ["5100", "2026-06-28"],
    ["7240", ownerToday()],
  ]);

  const milestoneUrl = await createGoal(page, {
    title: MILESTONE_GOAL,
    type: "milestone",
    targetDate: "2026-11-15",
  });
  await gotoFixture(page, milestoneUrl);
  const stages = [
    "Build a 10 km base",
    "Run 15 km without stopping",
    "Complete an 18 km long run",
    "Race day",
  ];
  const milestones = page.getByTestId("goal-milestones");
  for (const stage of stages) {
    await milestones.getByRole("textbox", { name: "New stage" }).fill(stage);
    await milestones.getByRole("button", { name: "Add" }).click();
    await expect(milestones.getByRole("checkbox", { name: stage })).toBeVisible();
  }
  for (const stage of stages.slice(0, 2)) {
    // Clicked rather than `check()`ed: completing a stage posts to the canonical
    // route and the list re-renders from the server's answer, which replaces the
    // node `check()` would then re-read to confirm itself.
    await milestones.getByRole("checkbox", { name: stage }).click();
    await expect(
      milestones.getByRole("checkbox", { name: stage }),
    ).toBeChecked();
  }

  return weightUrl;
}

/** Open the first note in the directory — the editor's real entry point. */
async function openFirstNote(page: Page) {
  await gotoFixture(page, "/notes");
  const href = await page
    .locator(".dh-card__open")
    .first()
    .getAttribute("href");
  if (href) await gotoFixture(page, href);
}

/* -------------------------------------------------------------------------- */
/* The matrix                                                                  */
/* -------------------------------------------------------------------------- */

/** The Goal record URL, resolved once by the seeding test and reused after. */
let goalRecordUrl = "";

test.describe.configure({ mode: "serial" });

test.describe("seed", () => {
  test.use({ viewport: WIDE });
  test("creates the four measurable Goals", async ({ page }) => {
    test.slow();
    goalRecordUrl = await seedMeasurableGoals(page);
  });
});

/** The surfaces captured at every desktop width. */
const DESKTOP_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["/today", "today"],
  ["/tasks", "tasks"],
  ["/projects", "projects"],
  ["/goals", "goals"],
];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`desktop 1440 ${scheme}`, () => {
    test.use({ viewport: WIDE, colorScheme: scheme });

    test(`captures the wide desktop matrix (${scheme})`, async ({ page }) => {
      test.slow();
      for (const [route, name] of DESKTOP_ROUTES) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-1440-${scheme}`);
      }
      await gotoFixture(page, goalRecordUrl);
      await shoot(page, `goal-record-1440-${scheme}`);
      await openFirstNote(page);
      await shoot(page, `notes-editor-1440-${scheme}`);
    });
  });

  test.describe(`desktop 1280 ${scheme}`, () => {
    test.use({ viewport: LAPTOP, colorScheme: scheme });

    test(`captures Today at 1280 (${scheme})`, async ({ page }) => {
      await gotoFixture(page, "/today");
      await shoot(page, `today-1280-${scheme}`);
    });
  });

  test.describe(`desktop 1920 ${scheme}`, () => {
    test.use({ viewport: ULTRA, colorScheme: scheme });

    test(`captures Today at 1920 (${scheme})`, async ({ page }) => {
      await gotoFixture(page, "/today");
      await shoot(page, `today-1920-${scheme}`);
    });
  });

  test.describe(`phone 390 ${scheme}`, () => {
    test.use({
      viewport: PHONE,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
    });

    test(`captures the phone matrix at 390 (${scheme})`, async ({ page }) => {
      test.slow();
      for (const [route, name] of [
        ...DESKTOP_ROUTES,
        ["/notes", "notes"],
      ] as ReadonlyArray<readonly [string, string]>) {
        await gotoFixture(page, route);
        await shoot(page, `${name}-390-${scheme}`);
      }
      await gotoFixture(page, goalRecordUrl);
      await shoot(page, `goal-record-390-${scheme}`);
    });
  });
}

/* The ends of the phone range, light only: the question there is whether the
 * composition still holds, which 390 has already answered for every module. */
for (const [phone, label] of [
  [PHONE_SMALL, "375"],
  [PHONE_LARGE, "430"],
] as const) {
  test.describe(`phone ${label} light`, () => {
    test.use({
      viewport: phone,
      isMobile: true,
      hasTouch: true,
      colorScheme: "light",
    });

    test(`checks Today's first viewport at ${label}`, async ({ page }) => {
      await gotoFixture(page, "/today");
      await shoot(page, `today-${label}-light`);
    });
  });
}
