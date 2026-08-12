/**
 * CAL-01 — the acceptance-evidence harness for the unified Schedule.
 *
 * Drives the REAL dev-auth server at CAL-01's first-class widths (320/375/390/430
 * on a phone, 1440 on a laptop) and writes PNGs. Deliberately a plain script
 * rather than a spec, exactly like `today-shots.mjs`: the evidence pass is opt-in,
 * runs against whichever calendar fixture is currently seeded, and must never
 * write into the ordinary gate.
 *
 * The captured set is bounded on purpose — the repository's screenshot-cleanup
 * rule says evidence is a handful of files that prove specific claims, not a dump.
 *
 * Usage:
 *   pnpm exec vite-node e2e/seed-calendar-evidence.mts   # seed the synthetic day
 *   node e2e/calendar-shots.mjs <out-dir>
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const OUT = process.argv[2];
if (!OUT) {
  console.error("Usage: node e2e/calendar-shots.mjs <out-dir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/**
 * Each capture states the claim it exists to prove.
 *
 * `scheme` covers the two appearances where the surface materially differs;
 * `colorScheme` on the context is what the product's `prefers-color-scheme`
 * resolution reads, so these are real appearance renders rather than a class
 * toggled by the harness.
 */
const SHOTS = [
  // Today, on the four phone widths CAL-01 names as acceptance targets.
  { path: "/today", name: "today-320-light", width: 320, height: 720 },
  { path: "/today", name: "today-375-light", width: 375, height: 812 },
  { path: "/today", name: "today-390-light", width: 390, height: 844 },
  { path: "/today", name: "today-430-light", width: 430, height: 932 },
  {
    path: "/today",
    name: "today-390-dark",
    width: 390,
    height: 844,
    scheme: "dark",
  },
  // The laptop composition: a bounded reading width, not stretched phone rows.
  { path: "/today", name: "today-1440-light", width: 1440, height: 900 },
  {
    path: "/today",
    name: "today-1440-dark",
    width: 1440,
    height: 900,
    scheme: "dark",
  },
  // The event detail, in the shared Drawer, on a phone and on a laptop.
  {
    path: "/today?drawer=event%3Acal-e2e-ev-meeting",
    name: "event-detail-390-light",
    width: 390,
    height: 844,
  },
  {
    path: "/today?drawer=event%3Acal-e2e-ev-meeting",
    name: "event-detail-1440-light",
    width: 1440,
    height: 900,
  },
  // Tomorrow and Next 7 days.
  {
    path: "/today/tomorrow",
    name: "tomorrow-390-light",
    width: 390,
    height: 844,
  },
  {
    path: "/today/tomorrow",
    name: "tomorrow-1440-light",
    width: 1440,
    height: 900,
  },
  {
    path: "/today/upcoming",
    name: "upcoming-390-light",
    width: 390,
    height: 844,
  },
  {
    path: "/today/upcoming",
    name: "upcoming-1440-light",
    width: 1440,
    height: 900,
  },
  // Settings, including the empty and error states.
  {
    path: "/settings?section=calendars",
    name: "settings-390-light",
    width: 390,
    height: 844,
  },
  {
    path: "/settings?section=calendars",
    name: "settings-1440-light",
    width: 1440,
    height: 900,
  },
];

/**
 * A non-default colour scheme, so the source accent ramp is shown to be legible
 * beyond the default palette (CAL-01 §28, §41).
 */
const COLOR_SCHEMES = ["default", "sage"];

const executablePath = "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath });

for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    colorScheme: shot.scheme ?? "light",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:4173${shot.path}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: join(OUT, `${shot.name}.png`),
    fullPage: true,
  });
  await context.close();
  console.log(`captured ${shot.name}.png`);
}

// One non-default colour scheme on the busiest surface, at the narrowest width.
for (const scheme of COLOR_SCHEMES.slice(1)) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:4173/today", { waitUntil: "networkidle" });
  await page.evaluate((value) => {
    document.documentElement.setAttribute("data-color-scheme", value);
  }, scheme);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: join(OUT, `today-390-scheme-${scheme}.png`),
    fullPage: true,
  });
  await context.close();
  console.log(`captured today-390-scheme-${scheme}.png`);
}

await browser.close();
