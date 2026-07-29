import { test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { gotoFixture } from "./helpers";

/**
 * TASKS-03 — the Tasks collection-experience screenshot pass.
 *
 * Captures the surfaces this change is judged on, into the existing product-audit
 * asset convention (`docs/product/assets/<pass>/`), so a reviewer can see the
 * result without running the app. Every shot is taken against the SAME seeded
 * development database the journeys run on — including the 80-task collection
 * dataset — so nothing here is a mock or a staged screen.
 *
 * Opt-in, exactly like the MOBILE-01 pass: it is skipped unless
 * `CAPTURE_SCREENSHOTS=1`, so the ordinary gate neither slows down nor writes into
 * the repository. Run it with:
 *
 *     CAPTURE_SCREENSHOTS=1 pnpm exec playwright test e2e/tasks-screenshots.spec.ts
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "product",
  "assets",
  "tasks-03-2026-07",
);

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

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

test.describe("desktop", () => {
  test.use({ viewport: DESKTOP });

  test("captures the desktop Tasks surfaces in light and dark", async ({
    page,
  }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      // The default workspace: the calm list, not a matrix.
      await gotoFixture(page, "/tasks");
      await shoot(page, `desktop-tasks-list-${scheme}`);

      // Several compatible filters applied at once, with the chips explaining them.
      await gotoFixture(
        page,
        "/tasks?priority=p1&due=overdue&parentType=project",
      );
      await shoot(page, `desktop-tasks-filters-${scheme}`);

      // The saved-view switcher, open, showing built-in and user groups.
      await gotoFixture(page, "/tasks");
      await page.getByTestId("tasks-view-trigger").click();
      await page.getByTestId("tasks-view-panel").waitFor();
      await shoot(page, `desktop-tasks-view-switcher-${scheme}`);
      await page.keyboard.press("Escape");

      // A grouped list with authoritative per-bucket counts.
      await gotoFixture(page, "/tasks?group=parent");
      await shoot(page, `desktop-tasks-grouped-${scheme}`);

      // The retained specialist views, reachable but not the default.
      await gotoFixture(page, "/tasks?view=matrix");
      await shoot(page, `desktop-tasks-matrix-${scheme}`);
      await gotoFixture(page, "/tasks?view=board&group=due_state");
      await shoot(page, `desktop-tasks-board-${scheme}`);
    }
  });
});

test.describe("phone", () => {
  test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

  test("captures the phone Tasks surfaces in light and dark", async ({
    page,
  }) => {
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      await gotoFixture(page, "/tasks");
      await shoot(page, `mobile-tasks-list-${scheme}`);

      // The quick-add row is the phone's title-first capture inside the workspace.
      await page.getByTestId("tasks-quickadd-input").focus();
      await shoot(page, `mobile-tasks-quick-capture-${scheme}`);

      // The ONE shared collection sheet, carrying filters, sort and grouping.
      await page.getByTestId("collection-filter-trigger").click();
      await page.getByTestId("collection-sheet").waitFor();
      await shoot(page, `mobile-tasks-filter-sheet-${scheme}`);
      await page.keyboard.press("Escape");

      // Active filters remain understandable on a phone, as chips.
      await gotoFixture(page, "/tasks?priority=p1&due=overdue");
      await shoot(page, `mobile-tasks-filters-${scheme}`);
    }
  });
});
