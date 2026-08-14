/**
 * DS-04 — the Tasks convergence shooter.
 *
 * A sibling of `uix-06-shot.mjs`: it points at an ALREADY-RUNNING dev server and
 * captures the Tasks surfaces DS-04 is judged on — the page at five widths in two
 * appearances, the three inline selectors OPEN, quick capture, selection mode and
 * the Drawer. It exists because a convergence pass is driven by looking at the
 * screen, and the interaction states are exactly the ones a route-only shooter
 * cannot reach.
 *
 * Not part of the gate, and not a test: it asserts nothing.
 *
 *   node scripts/ds-04-shot.mjs --out docs/design/assets/ds-04/final --set all
 */
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const OUT = args.get("out") ?? "/tmp/ds-04";
const BASE = args.get("base") ?? "http://localhost:4173";
const SET = args.get("set") ?? "all";
const PREFIX = args.get("prefix") ?? "";

mkdirSync(OUT, { recursive: true });

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

/** Settle: let entry animations finish so a shot is never caught mid-rise. */
async function settle(page) {
  await page
    .evaluate(() =>
      Promise.all(
        document.getAnimations().map((a) => a.finished.catch(() => undefined)),
      ).then(() => undefined),
    )
    .catch(() => undefined);
}

async function shoot(page, name) {
  await settle(page);
  await page.screenshot({ path: `${OUT}/${PREFIX}${name}.png` });
  process.stdout.write(`${PREFIX}${name}\n`);
}

async function openPage(width, height, scheme) {
  const phone = width <= 430;
  const context = await browser.newContext({
    viewport: { width, height },
    colorScheme: scheme,
    ...(phone ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  return { context, page };
}

async function goTasks(page, query = "") {
  await page
    .goto(`${BASE}/tasks${query}`, {
      waitUntil: "networkidle",
      timeout: 30000,
    })
    .catch(() => undefined);
  await page
    .waitForSelector("[data-testid='task-row'], .dh-collection", {
      timeout: 15000,
    })
    .catch(() => undefined);
  await settle(page);
}

/**
 * Open the first task's Drawer. The row's title is a link carrying `?drawer=`,
 * so following it is the ordinary path a person takes and needs no test id that
 * only the shooter would use.
 */
async function openFirstRecord(page) {
  const link = page.locator("a[href*='drawer=task']").first();
  await link.click({ timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  await settle(page);
}

/* -- The page, at every width and appearance ------------------------------- */

if (SET === "all" || SET === "pages") {
  const PAGES = [
    [1440, 950, "light"],
    [1366, 900, "light"],
    [1920, 1080, "light"],
    [390, 844, "light"],
    [320, 720, "light"],
    [1440, 950, "dark"],
    [390, 844, "dark"],
  ];
  for (const [width, height, scheme] of PAGES) {
    const { context, page } = await openPage(width, height, scheme);
    await goTasks(page);
    const label = width === 1920 ? "wide" : String(width);
    await shoot(page, `tasks-${label}-${scheme}`);
    await context.close();
  }
}

/* -- The interaction states ------------------------------------------------ */

if (SET === "all" || SET === "interactions") {
  const { context, page } = await openPage(1440, 950, "light");
  await goTasks(page);

  // Hover, on the first row.
  const firstRow = page.locator("[data-testid='task-row']").first();
  await firstRow.hover().catch(() => undefined);
  await shoot(page, "task-row-hover");

  // Keyboard focus, on the first row's completion control.
  await page
    .locator("[data-testid='task-complete']")
    .first()
    .focus()
    .catch(() => undefined);
  await shoot(page, "task-row-focus");

  for (const [testId, name] of [
    ["task-row-priority", "priority-selector"],
    ["task-row-parent", "project-selector"],
    ["task-row-due-date", "date-selector"],
  ]) {
    await goTasks(page);
    await page
      .locator(`[data-testid='${testId}']`)
      .first()
      .click()
      .catch(() => undefined);
    await page.waitForTimeout(400);
    await shoot(page, name);
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  // Inline title edit.
  await goTasks(page);
  await page
    .locator("[data-testid='task-row-title-edit']")
    .first()
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(300);
  await shoot(page, "title-edit");

  // Quick capture, focused.
  await goTasks(page);
  await page
    .locator("[data-testid='tasks-quickadd-input']")
    .first()
    .click()
    .catch(() => undefined);
  await page.keyboard.type("Draft the DS-04 convergence note").catch(() => {});
  await page.waitForTimeout(200);
  await shoot(page, "quick-capture-desktop");

  // Selection mode.
  await goTasks(page);
  await page
    .getByRole("button", { name: /more actions|options|task actions/i })
    .first()
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(250);
  await page
    .getByRole("menuitem", { name: /select tasks/i })
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(250);
  await page
    .locator("[data-testid='task-select']")
    .first()
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(300);
  await shoot(page, "bulk-selection");

  // Overflow menu on a row.
  await goTasks(page);
  await firstRow.hover().catch(() => undefined);
  await page
    .locator("[data-testid='task-row'] [aria-haspopup='menu']")
    .last()
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(300);
  await shoot(page, "row-overflow");

  await context.close();
}

/* -- The Drawer ------------------------------------------------------------ */

if (SET === "all" || SET === "drawer") {
  for (const scheme of ["light", "dark"]) {
    const { context, page } = await openPage(1440, 950, scheme);
    await goTasks(page);
    await openFirstRecord(page);
    await shoot(page, `task-drawer-${scheme}`);
    await context.close();
  }
}

/* -- Mobile interactions --------------------------------------------------- */

if (SET === "all" || SET === "mobile") {
  for (const width of [320, 375, 390, 430]) {
    const { context, page } = await openPage(width, 844, "light");
    await goTasks(page);
    await shoot(page, `mobile-${width}`);
    if (width === 390) {
      await page
        .locator("[data-testid='task-row-priority']")
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(600);
      await shoot(page, "priority-selector-mobile");
      await page.keyboard.press("Escape").catch(() => undefined);

      await goTasks(page);
      await page
        .locator("[data-testid='tasks-quickadd-input']")
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(400);
      await shoot(page, "quick-capture-mobile");

      await goTasks(page);
      await openFirstRecord(page);
      await shoot(page, "task-drawer-mobile");
    }
    await context.close();
  }
}

await browser.close();
