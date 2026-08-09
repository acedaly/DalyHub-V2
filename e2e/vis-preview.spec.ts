/**
 * Scratch preview capture — NOT part of the shipped suite.
 *
 * A fast single-shot loop used while iterating on the convergence pass; deleted
 * before the change lands. Opt-in like every other capture spec.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT =
  "/tmp/claude-0/-home-user-DalyHub-V2/8c6d0fae-867c-5ea1-9d66-b78ec5294203/scratchpad/preview";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

const ROUTES = (process.env.PREVIEW_ROUTES ?? "/today").split(",");

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

test.describe("preview desktop", () => {
  test.use({ viewport: { width: 1440, height: 950 } });
  test("captures", async ({ page }) => {
    test.slow();
    for (const route of ROUTES) {
      await gotoFixture(page, route);
      await shoot(page, `d-${route.replace(/\W+/g, "_")}`);
    }
  });
});

test.describe("preview phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("captures", async ({ page }) => {
    test.slow();
    for (const route of ROUTES) {
      await gotoFixture(page, route);
      await shoot(page, `p-${route.replace(/\W+/g, "_")}`);
    }
  });
});
