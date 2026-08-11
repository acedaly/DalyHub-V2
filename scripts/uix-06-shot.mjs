/**
 * UIX-06 — the iteration shooter.
 *
 * A tiny wrapper over Playwright's Chromium that points at an ALREADY-RUNNING
 * dev server and writes one screenshot per (route × width × appearance) into the
 * scratch directory. It exists because the evidence spec in
 * `e2e/uix-06-screenshots.spec.ts` starts two servers and captures 146 files,
 * which is the right tool for a BEFORE/AFTER set and the wrong one for "did that
 * CSS change fix the header".
 *
 * Not part of the gate, and not a test: it asserts nothing.
 *
 *   node scripts/uix-06-shot.mjs --out /tmp/x --routes /today,/tasks \
 *     --widths 1280,390 --schemes light,dark
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/uix-06";
const ROUTES = (args.get("routes") ?? "/today").split(",");
const WIDTHS = (args.get("widths") ?? "1280").split(",").map(Number);
const SCHEMES = (args.get("schemes") ?? "light").split(",");
const BASE = args.get("base") ?? "http://localhost:4173";
const FULL = args.get("full") === "1";

const HEIGHTS = {
  320: 720,
  390: 844,
  430: 932,
  1024: 768,
  1280: 900,
  1440: 950,
  1920: 1080,
};

mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

for (const scheme of SCHEMES) {
  for (const width of WIDTHS) {
    const height = HEIGHTS[width] ?? 900;
    const phone = width <= 430;
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: scheme,
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await context.newPage();
    for (const route of ROUTES) {
      const name =
        route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
      try {
        await page.goto(`${BASE}${route}`, {
          waitUntil: "networkidle",
          timeout: 20000,
        });
      } catch {
        // A slow route still gets shot with whatever it has rendered.
      }
      await page.screenshot({
        path: `${OUT}/${name}-${width}-${scheme}.png`,
        fullPage: FULL,
      });
      process.stdout.write(`${name}-${width}-${scheme}\n`);
    }
    await context.close();
  }
}

await browser.close();
