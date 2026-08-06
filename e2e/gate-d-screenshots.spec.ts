/**
 * Gate D — the Areas and Projects approval capture.
 *
 * Opt-in exactly like the other screenshot passes, so the ordinary CI gate
 * neither slows down nor writes into the repository:
 *
 *     pnpm run build
 *     CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
 *       e2e/gate-d-screenshots.spec.ts --workers=1
 *
 * Two rules this pass exists to enforce, both learned the hard way on the
 * PR #121 picker gate:
 *
 * 1. `animations: "disabled"`. The first picker capture caught the sheet
 *    mid-transition — a semi-transparent panel with the page showing through,
 *    which is evidence about an animation rather than about the component.
 * 2. Capture the AWKWARD states, not only the flattering ones. 320px, the
 *    empty states, a zero-task Project and an Area with nothing in it are all
 *    here, because a gate that only shows a neat 3-column grid at 1440px is
 *    evidence about 1440px.
 *
 * Appearance is emulated rather than stored: DalyHub ships one generated
 * light/dark pair selected by `prefers-color-scheme` (ADR-074).
 *
 * The ordinary viewport captures come from the REAL `/areas` and `/projects`
 * routes against the seeded workspace. The states seeded data cannot reach
 * without destroying it — true-empty, filtered-empty, the progress extremes —
 * come from the dev-only `/design/collection-states` fixture, which renders the
 * SAME components inside the SAME shell. Each capture below says which.
 *
 * Nothing here mutates. Every route is a read.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "m3-polish-2026-08",
  "gate-d-areas-projects",
);

const DESKTOP = { width: 1440, height: 1000 };
const TABLET = { width: 1024, height: 1100 };
const MOBILE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 720 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

/** Land on a collection and wait for its cards, so nothing is captured mid-load. */
async function collection(page: Page, path: string, heading: string) {
  await gotoFixture(page, path);
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
  await expect(page.getByRole("article").first()).toBeVisible();
}

/** The invariant and the image come from the SAME run, so they cannot disagree. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}

test.describe("Gate D — desktop", () => {
  test.use({ viewport: DESKTOP });

  test("captures both collections in both appearances", async ({ page }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await collection(page, "/areas", "Areas");
      await shot(page, `areas-desktop-${scheme}`);
      await collection(page, "/projects", "Projects");
      await shot(page, `projects-desktop-${scheme}`);
    }
  });
});

test.describe("Gate D — tablet", () => {
  test.use({ viewport: TABLET, colorScheme: "light" });

  test("captures the two-column composition", async ({ page }) => {
    await collection(page, "/areas", "Areas");
    await expectNoHorizontalOverflow(page);
    await shot(page, "areas-tablet-light");
    await collection(page, "/projects", "Projects");
    await expectNoHorizontalOverflow(page);
    await shot(page, "projects-tablet-light");
  });
});

test.describe("Gate D — phone", () => {
  test.use({ viewport: MOBILE });

  test("captures the single-column composition in both appearances", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await collection(page, "/areas", "Areas");
      await expectNoHorizontalOverflow(page);
      await shot(page, `areas-mobile-${scheme}`);
      await collection(page, "/projects", "Projects");
      await expectNoHorizontalOverflow(page);
      await shot(page, `projects-mobile-${scheme}`);
    }
  });
});

test.describe("Gate D — 320px", () => {
  test.use({ viewport: NARROW, colorScheme: "light" });

  test("captures the narrowest supported width, with the overflow assertion", async ({
    page,
  }) => {
    await collection(page, "/areas", "Areas");
    await expectNoHorizontalOverflow(page);
    await shot(page, "areas-mobile-320");
    await collection(page, "/projects", "Projects");
    await expectNoHorizontalOverflow(page);
    await shot(page, "projects-mobile-320");
  });
});

/*
 * The states real data cannot reach. Rendered by the dev-only fixture over the
 * same components and the same shell — see `app/routes/design-collection-states.tsx`
 * for why this is a fixture rather than a mutation of the seeded workspace.
 */
test.describe("Gate D — states", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light" });

  test("captures empty, filtered-empty, progress and icon states", async ({
    page,
  }) => {
    test.slow();
    const fixture = "/design/collection-states";

    await gotoFixture(page, `${fixture}?state=areas-empty`);
    await expect(page.getByText("No Areas yet")).toBeVisible();
    await shot(page, "areas-empty");

    await gotoFixture(page, `${fixture}?state=areas-icons`);
    await expect(page.getByRole("article").first()).toBeVisible();
    await shot(page, "areas-custom-and-fallback-icons");

    await gotoFixture(page, `${fixture}?state=projects-empty`);
    await expect(page.getByText("No Projects yet")).toBeVisible();
    await shot(page, "projects-empty");

    // A DISTINCT message from the true-empty one: records exist, this filter
    // simply matches none of them.
    await gotoFixture(page, `${fixture}?state=projects-filtered`);
    await expect(page.getByText("No archived projects")).toBeVisible();
    await shot(page, "projects-filtered-empty");

    // Zero-task, partially complete and fully complete, in one frame.
    await gotoFixture(page, `${fixture}?state=projects-progress`);
    await expect(
      page.getByRole("article", { name: "Nothing planned yet" }),
    ).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Website relaunch" }),
    ).toBeVisible();
    await expect(
      page.getByRole("article", { name: "Kitchen renovation" }),
    ).toBeVisible();
    await shot(page, "projects-progress-states");

    await gotoFixture(page, `${fixture}?state=projects-icons`);
    await expect(page.getByRole("article").first()).toBeVisible();
    await shot(page, "projects-custom-and-fallback-icons");
  });
});
