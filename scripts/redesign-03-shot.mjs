/**
 * REDESIGN-03 — the Today + Core Spine convergence shooter.
 *
 * A sibling of `ds-final-shot.mjs`, narrowed to the four surfaces this pass owns
 * (Today, Projects, Goals, Areas) and their record screens, and widened in the
 * one dimension that pass got wrong: DARK MODE.
 *
 * ── Why this exists rather than another `--routes` run ───────────────────────
 * `ds-final-shot.mjs` selects the appearance with Playwright's `colorScheme`,
 * which only sets `prefers-color-scheme`. DalyHub does not read that alone: the
 * server writes the owner's STORED appearance onto `<html data-appearance>`
 * (see `app/root.tsx`), and `tokens.css` guards every dark block with
 * `:not([data-appearance='light'])`. With the stored preference at its default,
 * a `colorScheme: "dark"` context therefore renders the LIGHT product with a
 * handful of media-driven fragments swapped — which looks like a dark-mode
 * defect and is not one. Every "dark" capture taken that way is evidence of
 * nothing.
 *
 * This script sets the attribute the product itself uses, so a dark capture is
 * the appearance an owner who chose dark actually sees.
 *
 * Not part of the gate, and not a test: it asserts nothing.
 *
 *   node scripts/redesign-03-shot.mjs --out docs/design/assets/redesign-03/before
 *   node scripts/redesign-03-shot.mjs --out docs/design/assets/redesign-03/after
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/redesign-03";
const BASE = args.get("base") ?? "http://localhost:4173";
const FULL = args.get("full") === "1";

mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/**
 * The pass's matrix. Today carries the extra 1280 width because it is the
 * primary target and 1280 is the breakpoint boundary; the record screens carry
 * the three widths the brief names.
 */
const SURFACES = [
  { slug: "today", path: "/today", widths: [1440, 1280, 820, 390] },
  { slug: "projects", path: "/projects", widths: [1440, 820, 390] },
  {
    slug: "project-detail",
    path: "/projects/dsf-proj-dalyhub",
    widths: [1440, 820, 390],
  },
  { slug: "goals", path: "/goals", widths: [1440, 820, 390] },
  {
    slug: "goal-detail",
    path: "/goals/dsf-goal-weight",
    widths: [1440, 820, 390],
  },
  { slug: "areas", path: "/areas", widths: [1440, 820, 390] },
  {
    slug: "area-detail",
    path: "/areas/dsf-area-work",
    widths: [1440, 820, 390],
  },
];

const SCHEMES = ["light", "dark"];

function heightFor(width) {
  if (width <= 430) return 844;
  if (width <= 820) return 1024;
  return 950;
}

async function settle(page) {
  await page
    .evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    )
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

/**
 * Force the product's OWN appearance switch, then let the style recalculation
 * land before the shutter. `data-appearance` is what every dark token in
 * `tokens.css` is keyed on, so this is the same state the appearance setting
 * produces rather than an approximation of it.
 */
async function applyAppearance(page, scheme) {
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-appearance", value);
  }, scheme);
  await settle(page);
}

async function shoot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: FULL });
  process.stdout.write(`${name}\n`);
}

for (const surface of SURFACES) {
  for (const width of surface.widths) {
    for (const scheme of SCHEMES) {
      const phone = width <= 430;
      const context = await browser.newContext({
        viewport: { width, height: heightFor(width) },
        colorScheme: scheme,
        ...(phone ? { isMobile: true, hasTouch: true } : {}),
      });
      const page = await context.newPage();
      await page
        .goto(`${BASE}${surface.path}`, {
          waitUntil: "networkidle",
          timeout: 40000,
        })
        .catch(() => undefined);
      await page
        .waitForSelector("main", { timeout: 15000 })
        .catch(() => undefined);
      await applyAppearance(page, scheme);
      await shoot(page, `${surface.slug}-${width}-${scheme}`);
      await context.close();
    }
  }
}

await browser.close();
