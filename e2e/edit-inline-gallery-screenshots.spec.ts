/**
 * EDIT-01 / DS-16 — the approval capture for the editor, inline editing and the
 * Area/Project galleries.
 *
 * Opt-in exactly like every other screenshot pass, so the ordinary CI gate
 * neither slows down nor writes into the repository:
 *
 *     pnpm run build
 *     CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
 *       e2e/edit-inline-gallery-screenshots.spec.ts --workers=1
 *
 * Two rules inherited from the Gate D pass, both learned the hard way:
 *
 * 1. `animations: "disabled"`, so nothing is captured mid-transition — a
 *    half-faded panel is evidence about an animation, not about a component.
 * 2. Capture the AWKWARD states. 320px, a failed save, a sparse card and the
 *    dark appearance are all here, because a gate that only shows a tidy
 *    four-column grid at 1440px is evidence about 1440px.
 *
 * Appearance is EMULATED rather than stored: DalyHub ships one generated
 * light/dark pair (ADR-074) and PR #123's explicit Light/Dark preference simply
 * pins which half of it applies, so emulating `prefers-color-scheme` exercises
 * the same two stylesheets the preference selects.
 *
 * This spec creates one Note and renames nothing permanently: the inline-edit
 * captures use a rename that is immediately reverted, and the failed-save
 * capture submits an empty name, which the server refuses — so the workspace is
 * left as it was found.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { expectNoHorizontalOverflow, gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "edit-inline-gallery-2026-08",
);

const WIDE = { width: 1920, height: 1080 };
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

/* -------------------------------------------------------------------------- */
/* Galleries                                                                   */
/* -------------------------------------------------------------------------- */

test.describe("DS-16 galleries — wide desktop", () => {
  test.use({ viewport: WIDE });

  test("captures the five-column composition in both appearances", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await collection(page, "/areas", "Areas");
      await shot(page, `areas-wide-${scheme}`);
      await collection(page, "/projects", "Projects");
      await shot(page, `projects-wide-${scheme}`);
    }
  });
});

test.describe("DS-16 galleries — desktop", () => {
  test.use({ viewport: DESKTOP });

  test("captures the four-column composition in both appearances", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await collection(page, "/areas", "Areas");
      await expectNoHorizontalOverflow(page);
      await shot(page, `areas-desktop-${scheme}`);
      await collection(page, "/projects", "Projects");
      await expectNoHorizontalOverflow(page);
      await shot(page, `projects-desktop-${scheme}`);
    }
  });

  test("captures a card's overflow menu open over the grid", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await collection(page, "/projects", "Projects");
    const card = page.getByRole("article").first();
    await card.getByRole("button", { name: /^More actions for / }).click();
    await expect(card.getByRole("menu")).toBeVisible();
    // The menu opened and the card did NOT navigate — the URL is the proof.
    await expect(page).toHaveURL(/\/projects(\?|$)/);
    await shot(page, "projects-card-overflow-light");
  });
});

test.describe("DS-16 galleries — tablet", () => {
  test.use({ viewport: TABLET, colorScheme: "light" });

  test("captures the reduced-column composition", async ({ page }) => {
    await collection(page, "/areas", "Areas");
    await expectNoHorizontalOverflow(page);
    await shot(page, "areas-tablet-light");
    await collection(page, "/projects", "Projects");
    await expectNoHorizontalOverflow(page);
    await shot(page, "projects-tablet-light");
  });
});

test.describe("DS-16 galleries — phone", () => {
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

test.describe("DS-16 galleries — 320px", () => {
  test.use({ viewport: NARROW, colorScheme: "light" });

  test("captures the narrowest supported width, with the overflow assertion", async ({
    page,
  }) => {
    await collection(page, "/areas", "Areas");
    await expectNoHorizontalOverflow(page);
    await shot(page, "areas-320");
    await collection(page, "/projects", "Projects");
    await expectNoHorizontalOverflow(page);
    await shot(page, "projects-320");
  });
});

/*
 * The card states real data cannot reach without destroying it — a true-empty
 * collection, a filtered-empty one, and the sparse/rich extremes — come from the
 * dev-only fixture, which renders the SAME components inside the SAME shell.
 */
test.describe("DS-16 galleries — states", () => {
  test.use({ viewport: DESKTOP, colorScheme: "light" });

  test("captures empty, sparse and metadata-rich cards", async ({ page }) => {
    test.slow();
    const fixture = "/design/collection-states";

    await gotoFixture(page, `${fixture}?state=areas-empty`);
    await expect(page.getByText("No Areas yet")).toBeVisible();
    await shot(page, "areas-empty-light");

    await gotoFixture(page, `${fixture}?state=projects-empty`);
    await expect(page.getByText("No Projects yet")).toBeVisible();
    await shot(page, "projects-empty-light");

    await gotoFixture(page, `${fixture}?state=projects-filtered`);
    await expect(page.getByText("No archived projects")).toBeVisible();
    await shot(page, "projects-filtered-empty-light");

    // Zero-task, partially complete and fully complete in one frame — the
    // sparse card and the metadata-rich card side by side.
    await gotoFixture(page, `${fixture}?state=projects-progress`);
    await expect(page.getByRole("article").first()).toBeVisible();
    await shot(page, "projects-sparse-and-rich-light");
  });
});

/* -------------------------------------------------------------------------- */
/* Inline editing                                                              */
/* -------------------------------------------------------------------------- */

/** Open the first Area's record and return its heading control. */
async function firstAreaRecord(page: Page) {
  await collection(page, "/areas", "Areas");
  await page
    .getByRole("link", { name: /^Open / })
    .first()
    .click();
  await expect(page).toHaveURL(/\/areas\/[^/?#]+$/);
  return page.getByRole("button", { name: /^Area name:/ });
}

test.describe("DS-16 inline editing — desktop", () => {
  test.use({ viewport: DESKTOP });

  test("captures the read state, the editing state and a refused save", async ({
    page,
  }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: "light" });
    await firstAreaRecord(page);
    await shot(page, "inline-text-read-light");

    await page.getByRole("button", { name: /^Area name:/ }).click();
    const input = page.getByRole("textbox", { name: "Area name" });
    await expect(input).toBeFocused();
    await shot(page, "inline-text-editing-light");

    // A refused save: the server rejects an empty Area name, and the field must
    // stay open holding exactly what was typed. The behavioural assertions live
    // in the unit and E2E suites; what is captured here is what it LOOKS like.
    await input.fill("   ");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Area name" })).toHaveValue(
      "   ",
    );
    await shot(page, "inline-text-failed-save-light");
  });

  test("captures the read state in the dark appearance", async ({ page }) => {
    // A separate test so it starts from a clean page rather than from the
    // previous one's abandoned draft — a capture should never depend on
    // another capture's teardown.
    await page.emulateMedia({ colorScheme: "dark" });
    await firstAreaRecord(page);
    await shot(page, "inline-text-read-dark");
  });
});

test.describe("DS-16 inline editing — phone", () => {
  test.use({ viewport: MOBILE, colorScheme: "light" });

  test("captures inline editing at phone width", async ({ page }) => {
    const title = await firstAreaRecord(page);
    await title.click();
    await expect(
      page.getByRole("textbox", { name: "Area name" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, "inline-text-editing-mobile");
    await page.keyboard.press("Escape");
  });
});

/* -------------------------------------------------------------------------- */
/* The writing surface                                                         */
/* -------------------------------------------------------------------------- */

/** Create a Note carrying formatted content, and return its URL. */
async function seedNote(page: Page): Promise<string> {
  await page.goto("/notes?drawer=new-note");
  const dialog = page.getByRole("dialog", { name: "New Note" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByLabel(/Title/)
    .fill(`Editor capture ${Date.now().toString(36)}`);
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
  await expect(page.locator("[data-editor-ready='true']")).toBeVisible();
  await page.locator(".cm-content").click();
  await page.keyboard.type("## Release plan\n");
  await page.keyboard.type("The **cut** is on Friday and _nothing_ moves.\n\n");
  await page.keyboard.type("- [ ] Freeze the branch\n");
  await page.keyboard.type("Ship the notes\n");
  return page.url();
}

test.describe("EDIT-01 writing surface — desktop", () => {
  test.use({ viewport: DESKTOP });

  test("captures the editor in both appearances, with active formatting", async ({
    page,
  }) => {
    test.slow();
    await page.emulateMedia({ colorScheme: "light" });
    const noteUrl = await seedNote(page);
    await shot(page, "editor-writing-light");

    // Reading state — the same content through the ONE render pipeline.
    await page.getByRole("button", { name: "Read" }).click();
    await expect(
      page.getByRole("heading", { name: "Release plan" }),
    ).toBeVisible();
    await shot(page, "editor-reading-light");
    await page.getByRole("button", { name: "Write" }).click();

    // ACTIVE formatting. A line that is ONLY a bold span, with the caret placed
    // deterministically inside it — Home then three ArrowRights clears the `**`
    // and lands in the word. The assertion and the image come from the same run,
    // so the screenshot cannot show a state the test did not verify.
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.type("**cut**");
    await page.keyboard.press("Home");
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await shot(page, "editor-toolbar-active-light");

    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, noteUrl);
    await expect(page.locator("[data-editor-ready='true']")).toBeVisible();
    await shot(page, "editor-writing-dark");
  });
});

test.describe("EDIT-01 writing surface — phone", () => {
  test.use({ viewport: MOBILE, colorScheme: "light" });

  test("captures the phone editor with no page-level overflow", async ({
    page,
  }) => {
    await seedNote(page);
    await expectNoHorizontalOverflow(page);
    await shot(page, "editor-mobile-390");
  });
});

test.describe("EDIT-01 writing surface — 320px", () => {
  test.use({ viewport: NARROW, colorScheme: "light" });

  test("keeps a thirteen-control toolbar inside its own scroll box", async ({
    page,
  }) => {
    await seedNote(page);
    // The toolbar scrolls horizontally; the PAGE must not.
    await expectNoHorizontalOverflow(page);
    await shot(page, "editor-320");
  });
});
