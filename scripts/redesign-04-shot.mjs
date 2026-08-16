/**
 * REDESIGN-04 — the Spine Workspaces shooter.
 *
 * A sibling of `redesign-03-shot.mjs`, narrowed to the three surfaces this pass
 * owns (Projects, Goals, Areas) and widened in the dimensions the brief names:
 * every lifecycle tab of the Projects collection, both the Grid and the Table
 * presentation, a RICH and a SPARSE Goal record, the Goals master–detail with a
 * selection, and a 320px stress width beside 1440 / 1280 / 820 / 390.
 *
 * Appearance is forced through the product's OWN switch (`data-appearance`),
 * for the reason REDESIGN-03 documented: Playwright's `colorScheme` only sets
 * `prefers-color-scheme`, and `tokens.css` keys every dark block on the stored
 * preference the server writes onto `<html>`. A "dark" capture taken any other
 * way is evidence of nothing.
 *
 * Not part of the gate, and not a test: it asserts nothing.
 *
 *   node scripts/redesign-04-shot.mjs --out docs/design/assets/redesign-04/before
 *   node scripts/redesign-04-shot.mjs --out docs/design/assets/redesign-04/after
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/redesign-04";
const BASE = args.get("base") ?? "http://localhost:5173";
const FULL = args.get("full") === "1";
const ONLY = args.get("only") ?? null;

mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/**
 * The pass's matrix.
 *
 * `widths` carries the review widths; `stress` adds 320 for the surfaces the
 * brief asks to survive it. Light and dark are taken at every width, because
 * §8 asks for dark to be reviewed on every changed screen rather than sampled.
 */
const SURFACES = [
  // -- Projects: the collection, every lifecycle tab, both presentations ------
  { slug: "projects", path: "/projects", widths: [1440, 1280, 820, 390, 320] },
  { slug: "projects-open", path: "/projects?state=open", widths: [1440, 390] },
  {
    slug: "projects-archived",
    path: "/projects?state=archived",
    widths: [1440, 390],
  },
  {
    slug: "projects-table",
    path: "/projects?present=table",
    widths: [1440, 820, 390],
  },
  {
    slug: "projects-search",
    path: "/projects?q=kitchen",
    widths: [1440, 390],
  },
  {
    slug: "project-detail",
    path: "/projects/dsf-proj-dalyhub",
    widths: [1440, 820, 390],
  },

  // -- Goals: the workspace, a rich record, two sparse ones -------------------
  { slug: "goals", path: "/goals", widths: [1440, 1280, 820, 390, 320] },
  {
    slug: "goals-selected",
    path: "/goals?goal=dsf-goal-weight",
    widths: [1440, 820, 390],
  },
  {
    slug: "goal-detail-rich",
    path: "/goals/dsf-goal-weight",
    widths: [1440, 820, 390],
  },
  {
    slug: "goal-detail-one-reading",
    path: "/goals/dsf-goal-sleep",
    widths: [1440, 390],
  },
  {
    slug: "goal-detail-unmeasured",
    path: "/goals/dsf-goal-mentor",
    widths: [1440, 390],
  },

  // -- Areas: language convergence only --------------------------------------
  { slug: "areas", path: "/areas", widths: [1440, 820, 390, 320] },
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
 * land before the shutter.
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
  if (ONLY && !surface.slug.startsWith(ONLY)) continue;
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
