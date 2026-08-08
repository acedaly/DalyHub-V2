/**
 * TODAY-REDESIGN — the before/after screenshot harness.
 *
 * Drives the REAL dev-auth server (the one `playwright.config.ts` starts) at the
 * contract's first-class widths and writes full-page PNGs. Deliberately a plain
 * script rather than a spec: the evidence pass is opt-in, runs against whichever
 * day fixture is currently seeded, and must never write into the ordinary gate.
 *
 * Usage:
 *   node e2e/today-shots.mjs <out-dir> [label]
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const OUT = process.argv[2];
const LABEL = process.argv[3] ?? "shot";
if (!OUT) {
  console.error("Usage: node e2e/today-shots.mjs <out-dir> [label]");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: "1280x800", width: 1280, height: 800, scheme: "light", full: false },
  {
    name: "1280x800-full",
    width: 1280,
    height: 800,
    scheme: "light",
    full: true,
  },
  { name: "1440x900", width: 1440, height: 900, scheme: "light", full: false },
  {
    name: "1440x900-full",
    width: 1440,
    height: 900,
    scheme: "light",
    full: true,
  },
  {
    name: "1280x800-dark",
    width: 1280,
    height: 800,
    scheme: "dark",
    full: true,
  },
  { name: "1024x768", width: 1024, height: 768, scheme: "light", full: true },
  { name: "phone-390", width: 390, height: 844, scheme: "light", full: true },
  { name: "phone-320", width: 320, height: 720, scheme: "light", full: true },
];

const executablePath = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath });

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    colorScheme: shot.scheme,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:4173/today", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(OUT, `${LABEL}-${shot.name}.png`),
    fullPage: shot.full,
  });
  await context.close();
  console.log(`captured ${LABEL}-${shot.name}.png`);
}

await browser.close();
