/**
 * UNTITLED-17 — the Insight / Reports / Reviews / AI evidence set.
 *
 * Deliberately small, and the same shape as the #131/#132 and REVIEW-03 sets:
 * the question these captures answer is "does this surface SAY something, and
 * does it belong to the same product as Projects and Finance", not "does it
 * render" — the functional specs already prove that.
 *
 * STAGED, so ONE spec captures both sides of the change:
 *
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=before pnpm exec playwright test e2e/untitled-17-screenshots.spec.ts
 *     CAPTURE_SCREENSHOTS=1 SHOT_STAGE=after  pnpm exec playwright test e2e/untitled-17-screenshots.spec.ts
 *
 * Every Review frame is taken against `e2e/seed-review-insights.sql` — a week
 * that actually happened — so those captures are reproducible rather than
 * dependent on whatever is in the local database. The Insight, Reports and AI
 * frames use the development workspace's own seeded history, which is what an
 * owner's first month looks like.
 *
 * Four frames per surface: the populated desktop state, the phone, the dark
 * appearance, and — where the surface has one — the state that is easy to get
 * wrong (a report's answer, a Review in progress, AI with its provider off).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture, waitForInteractive } from "./helpers";

const STAGE = process.env.SHOT_STAGE === "before" ? "before" : "after";
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "docs", "design", "assets", "untitled-17");
const SEED_FILE = join(HERE, "seed-review-insights.sql");

const LAPTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

function wrangler(args: readonly string[]): void {
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: "pipe",
  });
}

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
  wrangler(["d1", "execute", "DB", "--local", "--file", SEED_FILE]);
});

/**
 * Land on a surface and wait for something real, so no frame is mid-render.
 *
 * The extra settle is not superstition: every chart on these surfaces is
 * Recharts inside a `ResponsiveContainer`, which measures its own box through a
 * `ResizeObserver` AFTER hydration — so a document that is fully interactive
 * still carries no axes on it for a frame or two, and a capture taken inside
 * that window shows an empty plot under a caption claiming a shape.
 */
async function settle(page: Page, url: string, anchor: string): Promise<void> {
  await gotoFixture(page, url);
  await waitForInteractive(page);
  /*
   * The anchor is matched by ROLE where the surface has a heading for it, and
   * by text otherwise. `getByText` alone resolved to a visually-hidden table
   * caption on the report page — present, zero-sized, and never "visible".
   */
  const heading = page.getByRole("heading", { name: anchor }).first();
  const byText = page.getByText(anchor).first();
  await expect((await heading.count()) > 0 ? heading : byText).toBeVisible();
  await page.waitForTimeout(900);
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: join(OUT, `${STAGE}-${name}.png`),
    fullPage: true,
  });
}

const SURFACES: readonly {
  readonly name: string;
  readonly url: string;
  readonly anchor: string;
}[] = [
  { name: "insight", url: "/analytics?window=12-weeks", anchor: "Insight" },
  { name: "reports", url: "/reports", anchor: "Reports" },
  {
    name: "report",
    url: "/reports/completed-tasks-by-area",
    anchor: "Completed Tasks by Area",
  },
  { name: "reviews", url: "/reviews", anchor: "Reviews" },
  {
    name: "review-record",
    url: "/reviews/ri-review-now?tab=progress",
    anchor: "Evidence for this period",
  },
  {
    name: "review-guide",
    url: "/reviews/ri-review-now/guide?step=reflection",
    anchor: "Reflect",
  },
  { name: "ai", url: "/ai", anchor: "Ask DalyHub" },
];

for (const surface of SURFACES) {
  test(`${surface.name} — laptop, phone and dark`, async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await settle(page, surface.url, surface.anchor);
    await shoot(page, `${surface.name}-laptop`);

    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(400);
    await shoot(page, `${surface.name}-dark`);
    await page.emulateMedia({ colorScheme: "light" });

    await page.setViewportSize(PHONE);
    await page.waitForTimeout(600);
    await shoot(page, `${surface.name}-phone`);
  });
}
