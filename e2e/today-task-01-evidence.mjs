/**
 * TODAY-TASK-01 — the before/after evidence harness for `/today`.
 *
 * One opt-in, local-only script that drives the REAL dev-auth server at the
 * widths the contract names, writes full-page PNGs, and — in the same pass, from
 * the same page — prints the MEASUREMENTS the redesign is judged on. Screenshots
 * and numbers come from one navigation on purpose: a measurement taken in a
 * separate run against a re-seeded fixture is not evidence about the picture
 * beside it.
 *
 * What it measures, and why each one is here:
 *
 *   - `overflow`          document scrollWidth − clientWidth. Must be 0 at every
 *                         supported width; it is the one defect a screenshot of
 *                         a full-page capture actively HIDES.
 *   - `firstTaskTop`      the y of the day's first task row. The phone claim
 *                         ("the first useful Task is comfortably inside the
 *                         first viewport") is this number against the viewport.
 *   - `planWidth` /       the two working columns, so "the plan owns more visual
 *     `scheduleWidth`     weight than the support rail" is a ratio rather than an
 *                         impression.
 *   - `titleWidth`        the width a task TITLE actually gets, which is what the
 *                         metadata-yields-before-the-title rule protects.
 *   - `rowHeight`         the row's own height, for the density claim.
 *   - `touchTargets`      the smallest effective hit box among the row's controls,
 *                         against DalyHub's 44px promise.
 *   - `headerHeight`      greeting + date + day navigation as one block, which is
 *                         the thing §B3 is about.
 *
 * Usage:
 *   node e2e/today-task-01-evidence.mjs <out-dir> [label]
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const OUT = process.argv[2];
const LABEL = process.argv[3] ?? "shot";
if (!OUT) {
  console.error("Usage: node e2e/today-task-01-evidence.mjs <out-dir> [label]");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/** The contract's capture set: every width in both appearances where named. */
const SHOTS = [
  { name: "1440-light", width: 1440, height: 900, scheme: "light" },
  { name: "1440-dark", width: 1440, height: 900, scheme: "dark" },
  { name: "1280-light", width: 1280, height: 800, scheme: "light" },
  { name: "820-light", width: 820, height: 1180, scheme: "light" },
  { name: "393-light", width: 393, height: 852, scheme: "light" },
  { name: "393-dark", width: 393, height: 852, scheme: "dark" },
  { name: "320-light", width: 320, height: 720, scheme: "light" },
];

/** Widths measured but not necessarily captured (the overflow sweep). */
const MEASURE_ONLY = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1100, height: 800 },
  { width: 1728, height: 1080 },
  { width: 2560, height: 1440 },
];

const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium";
const browser = await chromium.launch(
  existsSync(LOCAL_CHROMIUM)
    ? { executablePath: LOCAL_CHROMIUM }
    : { channel: "chromium" },
);

/**
 * Everything read inside the page, in ONE evaluate so every number describes the
 * same layout. Selectors are written to match the private row (`.dh-day-row`)
 * and the shared row (`.dh-taskrow`) alike, so the same harness measures the
 * before and the after.
 */
function readMeasurements(viewportHeight) {
  const doc = document.documentElement;
  const box = (element) =>
    element === null ? null : element.getBoundingClientRect();
  const round = (value) =>
    value === null || value === undefined ? null : Math.round(value * 10) / 10;

  const plan = document.querySelector('[data-testid="today-plan"]');
  const schedule = document.querySelector('[data-testid="today-schedule"]');
  const firstRow =
    plan?.querySelector(".dh-taskrow") ??
    plan?.querySelector(".dh-day-row:not(.dh-day-row--more)") ??
    null;
  const title =
    firstRow?.querySelector(".dh-taskrow__title, .dh-day-row__title") ?? null;
  /*
   * The title CELL, not the title ink.
   *
   * `.dh-taskrow__title` is an `<a>` inside a flex cell with no `flex-grow`, so
   * its box is the width of its own TEXT — which is a fact about the fixture,
   * not about the layout. What the "metadata yields before the title" rule is
   * actually about is how much room the title's track has, and that is the
   * cell. Both are reported: the cell is the claim, the ink is the check that
   * the fixture's longest title still fits inside it.
   */
  const titleCell =
    firstRow?.querySelector(".dh-taskrow__main") ??
    // The PRIVATE row had no title cell: its title link was itself the flex
    // item that took the remaining width, so its own box IS its track. Falling
    // back to it is what makes the before/after column an apples-to-apples
    // comparison of "how much room does the title get?".
    firstRow?.querySelector(".dh-day-row__title") ??
    null;
  const head = document.querySelector(".dh-today__head");
  const nav = document.querySelector(".dh-daynav, .dh-today__daynav");
  const summary = document.querySelector('[data-testid="today-summary"]');

  const headBox = box(head);
  const navBox = box(nav);

  /*
   * The smallest EFFECTIVE touch target among the row's own controls.
   *
   * Deliberately the interactive WRAPPERS rather than every element: the
   * completion control is a 20px `<input>` inside a 44px `<label>`, and the
   * label is the thing a thumb hits — measuring the input reports 19.6px and
   * says nothing true about the target. Same for the inline editors, whose
   * trigger `<button>` is the target and whose value span is not.
   */
  const targets = firstRow
    ? [
        ...firstRow.querySelectorAll(
          "button, a, label.dh-check-circle-target, label.dh-taskrow__select",
        ),
      ]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            what:
              element.getAttribute("data-testid") ??
              element.className?.toString?.().split(" ")[0] ??
              element.tagName,
            width: round(rect.width),
            height: round(rect.height),
          };
        })
        .filter((entry) => entry.width > 0 && entry.height > 0)
    : [];

  const planBox = box(plan);
  const scheduleBox = box(schedule);
  const rowBox = box(firstRow);

  return {
    overflow: doc.scrollWidth - doc.clientWidth,
    docScrollWidth: doc.scrollWidth,
    docClientWidth: doc.clientWidth,
    planWidth: round(planBox?.width ?? null),
    planLeft: round(planBox?.left ?? null),
    scheduleWidth: round(scheduleBox?.width ?? null),
    scheduleLeft: round(scheduleBox?.left ?? null),
    firstTaskTop: round(rowBox?.top ?? null),
    firstTaskAboveFold:
      rowBox === null ? null : rowBox.bottom <= viewportHeight,
    firstTaskText: firstRow
      ? (firstRow.textContent ?? "").trim().slice(0, 48)
      : null,
    rowHeight: round(rowBox?.height ?? null),
    titleCellWidth: round(box(titleCell)?.width ?? null),
    titleWidth: round(box(title)?.width ?? null),
    headerBlockHeight:
      headBox === null
        ? null
        : round((navBox ? navBox.bottom : headBox.bottom) - headBox.top),
    summaryHeight: round(box(summary)?.height ?? null),
    touchTargets: targets,
    rowCount: plan
      ? plan.querySelectorAll(".dh-taskrow, .dh-day-row:not(.dh-day-row--more)")
          .length
      : 0,
  };
}

const measurements = {};

async function visit({ width, height, scheme, capture, name }) {
  /*
   * A phone width is measured as a PHONE.
   *
   * DalyHub's 44px floor on the row's inline editors is delivered by a
   * `@media (pointer: coarse)` rule in `task-list.css` (an expanded ::before
   * hit area, so the visible control keeps its size). A desktop context reports
   * `pointer: fine` whatever its viewport, so measuring a 393px desktop window
   * reports the targets the owner would never actually get.
   */
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme ?? "light",
    deviceScaleFactor: 2,
    ...(width <= 500 ? { hasTouch: true, isMobile: true } : {}),
  });
  const page = await context.newPage();
  await page.goto("http://localhost:4173/today", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const key = name ?? `${width}-${scheme ?? "light"}`;
  measurements[key] = await page.evaluate(readMeasurements, height);
  if (capture) {
    await page.screenshot({
      path: join(OUT, `${LABEL}-${key}.png`),
      fullPage: true,
    });
  }
  await context.close();
}

for (const shot of SHOTS) {
  await visit({ ...shot, capture: true });
}
for (const shot of MEASURE_ONLY) {
  await visit({ ...shot, scheme: "light", capture: false });
}

writeFileSync(
  join(OUT, `${LABEL}-measurements.json`),
  `${JSON.stringify(measurements, null, 2)}\n`,
);

for (const [key, value] of Object.entries(measurements)) {
  const smallest = value.touchTargets.reduce(
    (min, entry) => Math.min(min, entry.height),
    Infinity,
  );
  console.log(
    [
      key.padEnd(12),
      `overflow ${String(value.overflow).padStart(4)}`,
      `plan ${String(value.planWidth).padStart(6)}`,
      `sched ${String(value.scheduleWidth).padStart(6)}`,
      `firstTaskY ${String(value.firstTaskTop).padStart(6)}`,
      `rowH ${String(value.rowHeight).padStart(5)}`,
      `titleCell ${String(value.titleCellWidth).padStart(6)}`,
      `minTarget ${Number.isFinite(smallest) ? smallest : "-"}`,
    ].join("  "),
  );
}

await browser.close();
