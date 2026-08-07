/**
 * UIQ-013 / UIQ-014 / UIQ-021 — the collection-header convergence evidence.
 *
 * Before/after captures of the representative collection headers (Tasks, Goals,
 * People, Reviews, Assets and the Areas gallery), plus a long overflow menu
 * opened near the bottom of the viewport — the surfaces the convergence
 * changes. Opt-in like every screenshot pass, and STAGED so the same spec
 * captures both sides of the change:
 *
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=before pnpm exec playwright test e2e/collection-header-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=after  pnpm exec playwright test e2e/collection-header-screenshots.spec.ts
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { gotoFixture } from "./helpers";

const STAGE = process.env.SHOT_STAGE === "before" ? "before" : "after";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "uiq-2026-08",
);

/** The laptop width PR #129 named as the first-class quality gate. */
const LAPTOP = { width: 1440, height: 900 };
const LAPTOP_SMALL = { width: 1280, height: 800 };
/** iPhone 15/16 logical resolution. */
const PHONE = { width: 390, height: 844 };

const SURFACES = [
  { name: "tasks", path: "/tasks", heading: "Tasks" },
  { name: "goals", path: "/goals", heading: "Goals" },
  { name: "people", path: "/people", heading: /People|All people/ },
  { name: "reviews", path: "/reviews", heading: "Reviews" },
  { name: "assets", path: "/assets", heading: "Assets" },
  { name: "areas-gallery", path: "/areas", heading: "Areas" },
  { name: "meetings", path: "/meetings/upcoming", heading: "Meetings" },
] as const;

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** The sticky band: pane header + filter row, clipped to content height. */
async function captureHeader(
  page: import("@playwright/test").Page,
  file: string,
) {
  const sticky = page.locator(".dh-collection__sticky").first();
  await expect(sticky).toBeVisible();
  await sticky.screenshot({ path: join(OUT, file) });
}

test.describe("collection headers — laptop", () => {
  test.use({ viewport: LAPTOP });

  test(`captures the collection headers at 1440 (${STAGE})`, async ({
    page,
  }) => {
    test.slow();
    for (const surface of SURFACES) {
      await gotoFixture(page, surface.path);
      await expect(
        page.getByRole("heading", { level: 1, name: surface.heading }),
      ).toBeVisible();
      await captureHeader(page, `uiq-013-${STAGE}-${surface.name}-1440.png`);
    }
  });

  test(`captures the Reviews full pane at 1440 (${STAGE})`, async ({
    page,
  }) => {
    // UIQ-014's subject: the whole pane shows where "New Review" sits relative
    // to the view pills and the content beneath.
    await gotoFixture(page, "/reviews");
    await expect(
      page.getByRole("heading", { level: 1, name: "Reviews" }),
    ).toBeVisible();
    await page.screenshot({
      path: join(OUT, `uiq-014-${STAGE}-reviews-full-1440.png`),
    });
  });
});

test.describe("collection headers — 1280 laptop", () => {
  test.use({ viewport: LAPTOP_SMALL });

  test(`captures Tasks and People at 1280 (${STAGE})`, async ({ page }) => {
    for (const surface of SURFACES.filter((entry) =>
      ["tasks", "people"].includes(entry.name),
    )) {
      await gotoFixture(page, surface.path);
      await expect(
        page.getByRole("heading", { level: 1, name: surface.heading }),
      ).toBeVisible();
      await captureHeader(page, `uiq-013-${STAGE}-${surface.name}-1280.png`);
    }
  });
});

test.describe("collection headers — phone", () => {
  test.use({ viewport: PHONE });

  test(`captures People and Reviews at 390 (${STAGE})`, async ({ page }) => {
    for (const surface of SURFACES.filter((entry) =>
      ["people", "reviews"].includes(entry.name),
    )) {
      await gotoFixture(page, surface.path);
      await expect(
        page.getByRole("heading", { level: 1, name: surface.heading }),
      ).toBeVisible();
      await page.screenshot({
        path: join(OUT, `uiq-013-${STAGE}-${surface.name}-390.png`),
      });
    }
  });
});

test.describe("Project identity colour", () => {
  test.use({ viewport: LAPTOP });

  test(`captures the Projects gallery, light and dark (${STAGE})`, async ({
    page,
  }) => {
    // #130 — several Projects, each on its own accent. The dark capture is the
    // theme half of the evidence: the accents come from the same generated
    // ramp Areas use, so they are correct in both appearances by construction
    // rather than by a second set of values.
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/projects");
      await expect(
        page.getByRole("heading", { level: 1, name: "Projects" }),
      ).toBeVisible();
      await page.screenshot({
        path: join(OUT, `project-colour-${STAGE}-gallery-${scheme}-1440.png`),
      });
    }
    await page.emulateMedia({ colorScheme: "light" });
  });
});

test.describe("overflow menu near the viewport bottom", () => {
  test.use({ viewport: LAPTOP_SMALL });

  test(`captures a low task-row menu (${STAGE})`, async ({ page }) => {
    await gotoFixture(page, "/tasks");
    const rows = page.locator("article.dh-card");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    // Walk the rows from the last upward until one sits in the lower third of
    // the viewport — a trigger low enough that a ~12-item menu opened below it
    // cannot fit.
    let chosen = rows.last();
    for (let index = count - 1; index >= 0; index -= 1) {
      const candidate = rows.nth(index);
      const box = await candidate.boundingBox();
      if (box && box.y > 520 && box.y < 760) {
        chosen = candidate;
        break;
      }
    }
    // UIQ-002 — a list row's actions are a hover-revealed overlay on a fine
    // pointer, so the ROW must be hovered before its ⋯ is hit-testable.
    await chosen.hover();
    await chosen.getByRole("button", { name: /More actions for/ }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.screenshot({
      path: join(OUT, `uiq-021-${STAGE}-menu-bottom-1280.png`),
    });
  });
});
