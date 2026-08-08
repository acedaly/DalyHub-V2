/**
 * TODAY-REDESIGN — the fold-anchor and overflow measurements, as numbers.
 *
 * The contract makes two claims that a screenshot can only suggest: the day's
 * first actionable row is above the fold at laptop size, and nothing overflows
 * horizontally at any supported width. This prints both, so the evidence in the
 * report is a measurement rather than an impression.
 *
 * Local-only, opt-in, and never part of the ordinary gate.
 *
 * Usage: node e2e/today-measure.mjs
 */

import { chromium } from "@playwright/test";

const WIDTHS = [320, 390, 700, 1024, 1280, 1440];
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});

for (const width of WIDTHS) {
  const height = width >= 1440 ? 900 : width >= 1024 ? 800 : 844;
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto("http://localhost:4173/today", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const result = await page.evaluate((viewportHeight) => {
    const doc = document.documentElement;
    const firstRow = document.querySelector(".dh-today__timeline .dh-day-row");
    const rowTop = firstRow ? firstRow.getBoundingClientRect().top : null;
    const rowBottom = firstRow ? firstRow.getBoundingClientRect().bottom : null;
    return {
      overflow: doc.scrollWidth - doc.clientWidth,
      rowText: firstRow
        ? (firstRow.textContent ?? "").trim().slice(0, 40)
        : null,
      rowTop,
      aboveFold: rowBottom !== null && rowBottom <= viewportHeight,
    };
  }, height);

  console.log(
    `${String(width).padStart(4)}x${height}  overflow=${result.overflow}px  ` +
      `firstRow="${result.rowText ?? "—"}" top=${
        result.rowTop === null ? "—" : Math.round(result.rowTop)
      }  aboveFold=${result.aboveFold}`,
  );
  await context.close();
}

await browser.close();
