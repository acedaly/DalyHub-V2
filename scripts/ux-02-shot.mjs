/**
 * UX-02 — the Plan & Habits shooter and MEASURER.
 *
 * A sibling of `redesign-04-shot.mjs`, narrowed to the two surfaces this pass
 * owns (`/plan` and `/habits`) and widened in the one dimension UX-02 turns on:
 * it does not only photograph the screens, it MEASURES them.
 *
 * That matters because UX-02 supersedes a decision PLAN-01 made with a
 * measurement. PLAN-01 rejected a column board on the reading that at 1440 a day
 * column is "roughly 100px — narrower than a task title", and the only honest way
 * to overturn that is to measure the board that actually ships. So every run
 * prints, as JSON on stdout, the width of the week board, the width of one day
 * column, the width of the narrowest planned-Task row inside it, and whether the
 * document scrolls sideways at any width.
 *
 * Appearance is forced through the product's OWN switch (`data-appearance`), for
 * the reason REDESIGN-03 documented: Playwright's `colorScheme` only sets
 * `prefers-color-scheme`, and `tokens.css` keys every dark block on the stored
 * preference the server writes onto `<html>`. A "dark" capture taken any other
 * way is evidence of nothing.
 *
 * Not part of the gate, and not a test: it asserts nothing. The numbers it
 * prints are quoted in `docs/design/UX_02_PLAN_HABITS_2026_08.md`.
 *
 *   node scripts/ux-02-shot.mjs --out docs/design/assets/ux-02/before
 *   node scripts/ux-02-shot.mjs --out docs/design/assets/ux-02/after
 *   node scripts/ux-02-shot.mjs --measure 1        (numbers only, no capture)
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/ux-02";
const BASE = args.get("base") ?? "http://localhost:4173";
const MEASURE_ONLY = args.get("measure") === "1";
const FULL = args.get("full") !== "0";
const ONLY = args.get("only") ?? null;

if (!MEASURE_ONLY) mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/**
 * The review matrix.
 *
 * 1440 and 1280 are the two laptop widths the design system reviews at, 820 is
 * the tablet collapse, 393 is the reference phone and 320 is the narrowest
 * viewport the product supports. Every one of them is measured; only the first
 * four are photographed in both appearances, because 320 is a survival width
 * rather than a design.
 */
const SURFACES = [
  { slug: "plan", path: "/plan", widths: [1440, 1280, 820, 393, 320] },
  { slug: "plan-next", path: "/plan?week=1", widths: [1440, 393] },
  { slug: "habits", path: "/habits", widths: [1440, 1280, 820, 393, 320] },
  { slug: "habits-all", path: "/habits?scope=all", widths: [1440, 393] },
  { slug: "habits-archived", path: "/habits/archived", widths: [1440, 393] },
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

async function applyAppearance(page, scheme) {
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-appearance", value);
  }, scheme);
  await settle(page);
}

/**
 * The numbers UX-02's brief quotes.
 *
 * Every figure is read from the LIVE layout with `getBoundingClientRect`, so it
 * is the width the browser actually resolved rather than the width a stylesheet
 * asked for. `docScrollWidth` above the viewport is a horizontal overflow of the
 * document, which is a defect at every width and a WCAG 1.4.10 failure at 320.
 */
async function measure(page) {
  return page.evaluate(() => {
    const w = (el) =>
      el ? Math.round(el.getBoundingClientRect().width) : null;
    const one = (sel) => w(document.querySelector(sel));
    const all = (sel) => [...document.querySelectorAll(sel)];
    const widths = (sel) => all(sel).map((el) => w(el));
    const min = (list) => (list.length === 0 ? null : Math.min(...list));

    const dayColumns = widths("[data-testid='plan-day']");
    const rows = widths("[data-testid='plan-day'] .dh-taskrow");
    const titles = widths("[data-testid='plan-day'] .dh-taskrow__title");

    return {
      viewport: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      overflows: document.documentElement.scrollWidth > window.innerWidth,
      // /plan
      planBoard: one("[data-testid='plan-board']") ?? one(".dh-plan__week"),
      planSide: one(".dh-plan__side"),
      planDays: dayColumns.length,
      planDayWidth: min(dayColumns),
      planRowWidth: min(rows),
      planTitleWidth: min(titles),
      planQueue: one("[data-testid='plan-queue']"),
      // /habits
      habitsTable: one("[data-testid='habit-list']"),
      habitsRail: one("[data-testid='habits-rail']"),
      habitsStats: one("[data-testid='habits-stats']"),
      habitRowWidth: min(widths("[data-testid='habit-row']")),
    };
  });
}

const readings = [];

for (const surface of SURFACES) {
  if (ONLY && !surface.slug.startsWith(ONLY)) continue;
  for (const width of surface.widths) {
    const phone = width <= 430;
    const schemes = MEASURE_ONLY || width <= 320 ? ["light"] : SCHEMES;
    for (const scheme of schemes) {
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

      if (scheme === "light") {
        readings.push({
          slug: surface.slug,
          width,
          ...(await measure(page)),
        });
      }
      if (!MEASURE_ONLY) {
        await settle(page);
        const name = `${surface.slug}-${width}-${scheme}`;
        await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: FULL });
        process.stderr.write(`${name}\n`);
      }
      await context.close();
    }
  }
}

process.stdout.write(`${JSON.stringify(readings, null, 2)}\n`);

await browser.close();
