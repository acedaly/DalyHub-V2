/**
 * THEME-01 — the colour-scheme evidence pass.
 *
 * Opt-in, like every other screenshot pass in this repository:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/color-scheme-screenshots.spec.ts
 *
 * ── Why this set, and not more ───────────────────────────────────────────────
 * Five schemes × two appearances × fourteen routes × seven widths is 980 images,
 * and the repository has just finished deleting a screenshot dump of exactly that
 * shape. The system's correctness is a TOKEN CONTRACT, and that contract is
 * asserted exhaustively, deterministically and in milliseconds by
 * `test/unit/tokens` — every role present in every scheme, every `on-` pair over
 * AA, every composed surface, every chart ramp separated, the ladder ordered.
 * Screenshots cannot prove any of that and are not asked to.
 *
 * What they are for is the one question a test cannot answer: does each scheme
 * look like a considered personality rather than a hue rotation? So the matrix is
 * eleven images — one or two per scheme, on the surface that scheme is most
 * likely to fail on, in the appearance where it matters most — plus the picker.
 *
 *   Daly Violet   Today light + dark   the default, unchanged, in both halves
 *   Electric      Today dark           the deep blue-black shell is the claim
 *                 Tasks light          many simultaneous states, blue-on-blue risk
 *   Pulse         Today dark           where magenta+lime would be exhausting
 *                 Projects light       a gallery is where saturation goes wrong
 *   Ocean         Today light          "calm, not generic corporate blue"
 *                 Tasks dark           the cool scheme's busiest surface
 *   Graphite      Today light          "restrained, not unfinished"
 *                 Note dark            a writing surface must stay a page
 *   Settings      the scheme picker    the control itself
 */

import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { d1Execute } from "./d1";
import { gotoFixture, waitForInteractive } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "theme-01-2026-08",
);

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

const LAPTOP = { width: 1280, height: 900 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

// One at a time: the scheme is a stored OWNER preference, so two workers driving
// the same row would photograph each other's choices.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(() => {
  d1Execute(
    `UPDATE owner_app_preferences SET color_scheme = 'violet', appearance = 'system' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
});

/** Store a scheme directly, so the capture does not depend on the picker. */
function setScheme(scheme: string): void {
  d1Execute(
    `UPDATE owner_app_preferences SET color_scheme = '${scheme}' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

/** The eleven-image matrix: `[scheme, route, appearance, file]`. */
const MATRIX: ReadonlyArray<
  readonly [string, string, "light" | "dark", string]
> = [
  ["violet", "/today", "light", "violet-today-light"],
  ["violet", "/today", "dark", "violet-today-dark"],
  ["electric", "/today", "dark", "electric-today-dark"],
  ["electric", "/tasks", "light", "electric-tasks-light"],
  ["pulse", "/today", "dark", "pulse-today-dark"],
  ["pulse", "/projects", "light", "pulse-projects-light"],
  ["ocean", "/today", "light", "ocean-today-light"],
  ["ocean", "/tasks", "dark", "ocean-tasks-dark"],
  ["graphite", "/today", "light", "graphite-today-light"],
  ["violet", "/settings?section=general", "light", "settings-scheme-picker"],
];

for (const [scheme, route, appearance, name] of MATRIX) {
  test.describe(name, () => {
    test.use({ viewport: LAPTOP, colorScheme: appearance });

    test(`captures ${name}`, async ({ page }) => {
      setScheme(scheme);
      await gotoFixture(page, route);
      await shoot(page, name);
    });
  });
}

/*
 * Graphite on a NOTE, in dark — the writing-surface check (§22), and the only
 * capture that has to open a record rather than a route.
 */
test.describe("graphite-note-dark", () => {
  test.use({ viewport: LAPTOP, colorScheme: "dark" });

  test("captures graphite-note-dark", async ({ page }) => {
    setScheme("graphite");
    await gotoFixture(page, "/notes");
    // The note ROW's link, not a card: the Notes directory is a list surface, so
    // the gallery's `.dh-card__open` never matches and the capture would quietly
    // photograph the directory instead of the writing surface it is evidence for.
    const note = page.locator("a.dh-notes-list__item").first();
    const href = await note.getAttribute("href");
    // Navigated with `goto`, not clicked. Opening a note is a client-side
    // transition, and both `networkidle` and a URL match can settle while the
    // directory is still the thing on screen — which is how the first version of
    // this capture photographed the list and called it a writing surface.
    await gotoFixture(page, href ?? "/notes");
    await waitForInteractive(page);
    await shoot(page, "graphite-note-dark");
  });
});
