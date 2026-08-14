/**
 * DS-05…DS-08 — the WHOLE-APP convergence shooter.
 *
 * A sibling of `ds-04-shot.mjs` and `uix-06-shot.mjs`, widened from one module to
 * every user-facing surface. It points at an ALREADY-RUNNING dev server
 * (`pnpm exec react-router dev --port 4173`) and writes one screenshot per
 * (surface × width × appearance) into the requested directory.
 *
 * It exists because the whole-app visual pass is judged by looking at the screen,
 * across a dozen modules, at nine widths, in two appearances — a volume that only
 * survives if the capture is one command and reproducible.
 *
 * Not part of the gate, and not a test: it asserts nothing.
 *
 *   node scripts/ds-final-shot.mjs --out docs/design/assets/ds-final/baseline --set core
 *   node scripts/ds-final-shot.mjs --out /tmp/x --routes /today,/goals --widths 1440 --schemes light
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/ds-final";
const BASE = args.get("base") ?? "http://localhost:4173";
const SET = args.get("set") ?? "core";
const PREFIX = args.get("prefix") ?? "";
const FULL = args.get("full") === "1";

mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/**
 * The surfaces. `slug` names the file; `path` is the route; `wait` is a selector
 * that proves the surface actually rendered rather than the shell around it.
 */
const SURFACES = {
  today: { path: "/today", wait: ".dh-today, main" },
  tasks: { path: "/tasks", wait: "[data-testid='task-row'], .dh-collection" },
  projects: { path: "/projects", wait: ".dh-collection, main" },
  areas: { path: "/areas", wait: ".dh-collection, main" },
  goals: { path: "/goals", wait: ".dh-collection, main" },
  notes: { path: "/notes", wait: ".dh-collection, main" },
  diary: { path: "/diary", wait: "main" },
  meetings: { path: "/meetings", wait: ".dh-collection, main" },
  reviews: { path: "/reviews", wait: "main" },
  analytics: { path: "/analytics", wait: "main" },
  people: { path: "/people", wait: ".dh-collection, main" },
  assets: { path: "/assets", wait: ".dh-collection, main" },
  settings: { path: "/settings", wait: "main" },
  ai: { path: "/ai", wait: "main" },
  help: { path: "/help", wait: "main" },
  views: { path: "/views", wait: "main" },
};

/** Widths the pass is judged at, and the label each one is filed under. */
const WIDTH_LABELS = new Map([
  [320, "320"],
  [375, "375"],
  [390, "390"],
  [430, "430"],
  [768, "768"],
  [1024, "1024"],
  [1366, "1366"],
  [1440, "1440"],
  [1920, "wide"],
]);

function heightFor(width) {
  if (width <= 430) return 844;
  if (width <= 768) return 1024;
  return width >= 1920 ? 1080 : 950;
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

async function shoot(page, name) {
  await settle(page);
  await page.screenshot({
    path: `${OUT}/${PREFIX}${name}.png`,
    fullPage: FULL,
  });
  process.stdout.write(`${PREFIX}${name}\n`);
}

async function openPage(width, height, scheme) {
  const phone = width <= 430;
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    ...(phone ? { isMobile: true, hasTouch: true } : {}),
  });
  return { context, page: await context.newPage() };
}

async function go(page, path, wait) {
  await page
    .goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 40000 })
    .catch(() => undefined);
  if (wait)
    await page.waitForSelector(wait, { timeout: 15000 }).catch(() => undefined);
  await settle(page);
}

/** Follow the first record link on a collection, so detail shots need no fixture id. */
async function openFirstRecord(page, hrefPattern) {
  const link = page.locator(`a[href*='${hrefPattern}']`).first();
  const href = await link.getAttribute("href").catch(() => null);
  if (!href) return false;
  await page
    .goto(new URL(href, BASE).toString(), {
      waitUntil: "networkidle",
      timeout: 40000,
    })
    .catch(() => undefined);
  await settle(page);
  return true;
}

/* -- Sets ------------------------------------------------------------------ */

const parsedRoutes = args.get("routes");
const parsedWidths = args.get("widths");
const parsedSchemes = args.get("schemes");

const SET_SURFACES = {
  core: ["today", "tasks", "projects", "areas", "goals"],
  rest: [
    "notes",
    "diary",
    "meetings",
    "reviews",
    "analytics",
    "people",
    "assets",
    "settings",
    "ai",
    "help",
    "views",
  ],
  all: Object.keys(SURFACES),
};

if (parsedRoutes) {
  const widths = (parsedWidths ?? "1440").split(",").map(Number);
  const schemes = (parsedSchemes ?? "light").split(",");
  for (const route of parsedRoutes.split(",")) {
    const slug =
      route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
    for (const width of widths) {
      for (const scheme of schemes) {
        const { context, page } = await openPage(
          width,
          heightFor(width),
          scheme,
        );
        await go(page, route, "main");
        await shoot(
          page,
          `${slug}-${WIDTH_LABELS.get(width) ?? width}-${scheme}`,
        );
        await context.close();
      }
    }
  }
} else if (SET === "details") {
  /* Record screens, reached by following the first link on each collection. */
  const DETAILS = [
    ["project-detail", "/projects", "/projects/"],
    ["area-detail", "/areas", "/areas/"],
    ["goal-detail", "/goals", "/goals/"],
    ["note-detail", "/notes", "/notes/"],
    ["meeting-detail", "/meetings", "/meetings/"],
    ["person-detail", "/people", "/people/"],
    ["asset-detail", "/assets", "/assets/"],
  ];
  const widths = (parsedWidths ?? "1440,390").split(",").map(Number);
  const schemes = (parsedSchemes ?? "light,dark").split(",");
  for (const [slug, collection, hrefPattern] of DETAILS) {
    for (const width of widths) {
      for (const scheme of schemes) {
        const { context, page } = await openPage(
          width,
          heightFor(width),
          scheme,
        );
        await go(page, collection, "main");
        const found = await openFirstRecord(page, hrefPattern);
        if (found) {
          await shoot(
            page,
            `${slug}-${WIDTH_LABELS.get(width) ?? width}-${scheme}`,
          );
        } else {
          process.stdout.write(`SKIP ${slug} (no record link)\n`);
        }
        await context.close();
      }
    }
  }
} else if (SET === "overlays") {
  /* Search, command palette, a record Drawer, a creation dialog. */
  const widths = (parsedWidths ?? "1440,390").split(",").map(Number);
  for (const width of widths) {
    const label = WIDTH_LABELS.get(width) ?? width;
    for (const scheme of (parsedSchemes ?? "light,dark").split(",")) {
      const { context, page } = await openPage(width, heightFor(width), scheme);

      await go(page, "/tasks", ".dh-collection");
      await page.keyboard
        .press(width <= 430 ? "Escape" : "Meta+k")
        .catch(() => undefined);
      if (width > 430) {
        await page.waitForTimeout(600);
        await shoot(page, `command-palette-${label}-${scheme}`);
        await page.keyboard.press("Escape").catch(() => undefined);
      }

      // A record Drawer, opened the ordinary way (the row title is a `?drawer=` link).
      await go(page, "/tasks", ".dh-collection");
      const drawerLink = page.locator("a[href*='drawer=task']").first();
      await drawerLink.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(900);
      await shoot(page, `drawer-${label}-${scheme}`);

      await go(page, "/search?q=task", "main");
      await shoot(page, `search-${label}-${scheme}`);

      await context.close();
    }
  }
} else {
  const surfaces = SET_SURFACES[SET] ?? SET_SURFACES.core;
  const widths = (parsedWidths ?? "1440,390").split(",").map(Number);
  const schemes = (parsedSchemes ?? "light,dark").split(",");
  for (const slug of surfaces) {
    const surface = SURFACES[slug];
    for (const width of widths) {
      for (const scheme of schemes) {
        const { context, page } = await openPage(
          width,
          heightFor(width),
          scheme,
        );
        await go(page, surface.path, surface.wait);
        await shoot(
          page,
          `${slug}-${WIDTH_LABELS.get(width) ?? width}-${scheme}`,
        );
        await context.close();
      }
    }
  }
}

await browser.close();
