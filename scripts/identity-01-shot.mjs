/**
 * IDENTITY-01 — the identity PICKER shooter.
 *
 * `ds-final-shot.mjs` captures routes; the picker is a sheet behind a button on
 * a settings tab, so it needs a script that can open it. Same shape as its
 * sibling: it points at an already-running dev server, asserts nothing, and is
 * not part of the gate.
 *
 *   node scripts/identity-01-shot.mjs --out docs/design/assets/identity-01/after
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const OUT = args.get("out") ?? "/tmp/identity-01";
const BASE = args.get("base") ?? "http://127.0.0.1:4173";
mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/** Follow the first Area link, land on its Settings tab, open the picker. */
async function shootPicker(width, height, scheme) {
  const phone = width <= 430;
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    ...(phone ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/areas`, { waitUntil: "networkidle", timeout: 40000 });
  const href = await page
    .locator("a[href*='/areas/']")
    .first()
    .getAttribute("href")
    .catch(() => null);
  if (!href) {
    await context.close();
    return;
  }
  const url = new URL(href, BASE);
  url.searchParams.set("tab", "settings");
  await page.goto(url.toString(), {
    waitUntil: "networkidle",
    timeout: 40000,
  });
  const trigger = page.locator(".dh-icon-picker__trigger").first();
  await trigger.waitFor({ timeout: 15000 }).catch(() => undefined);
  await trigger.click().catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/picker-${width}-${scheme}.png` });
  process.stdout.write(`picker-${width}-${scheme}\n`);
  await context.close();
}

for (const scheme of ["light", "dark"]) {
  for (const [width, height] of [
    [1440, 950],
    [390, 844],
  ]) {
    await shootPicker(width, height, scheme);
  }
}
await browser.close();
