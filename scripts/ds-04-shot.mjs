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

/* -- Individual ROW states, clipped to the row -------------------------------- */

/*
 * The row is the component DS-04 is judged on, so its states are captured as the
 * row rather than as a page containing one. Each shot is a real row in the real
 * list, found by the fact that makes it the state under test — an overdue row is
 * one the product itself put in the Overdue bucket, never one posed for the
 * camera.
 */
if (SET === "all" || SET === "rows") {
  const { context, page } = await openPage(1440, 950, "light");

  const clip = async (locator, name) => {
    await settle(page);
    // A scope can legitimately be EMPTY on a given dataset (an Inbox with
    // nothing unfiled is the goal, not a failure), and a shooter that dies on
    // one missing state loses the states after it too.
    if ((await locator.count()) === 0) {
      process.stdout.write(
        `${PREFIX}${name} — skipped (no row in this scope)\n`,
      );
      return;
    }
    await locator.screenshot({ path: `${OUT}/${PREFIX}${name}.png` });
    process.stdout.write(`${PREFIX}${name}\n`);
  };

  const rowIn = async (query, index = 0) => {
    await goTasks(page, query);
    return page.locator("[data-testid='task-row']").nth(index);
  };

  // Normal, and the same row hovered — the two states a pointer moves between.
  let row = await rowIn("?view=list&system=all&group=none");
  await clip(row, "task-row-normal");
  await row.hover();
  await clip(row, "task-row-hover");

  // Keyboard focus, on the completion control.
  row = await rowIn("?view=list&system=all&group=none");
  await row.locator("[data-testid='task-complete']").focus();
  await clip(row, "task-row-focus");

  // Overdue — the product's own Overdue scope, not a posed date.
  row = await rowIn("?view=list&system=overdue");
  await clip(row, "task-row-overdue");

  // Completed — the Completed scope, for the calm finished state.
  row = await rowIn("?view=list&system=completed");
  await clip(row, "task-row-completed");

  // The longest title in the collection, to prove the truncation rule.
  await goTasks(page, "?view=list&system=all&sort=title&dir=desc&group=none");
  const longest = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-testid='task-row']")];
    let best = 0;
    rows.forEach((r, i) => {
      const t = r.querySelector("[data-testid='task-row-open']");
      if (
        (t?.textContent?.length ?? 0) >
        (rows[best]?.querySelector("[data-testid='task-row-open']")?.textContent
          ?.length ?? 0)
      )
        best = i;
    });
    return best;
  });
  await clip(
    page.locator("[data-testid='task-row']").nth(longest),
    "task-row-long-title",
  );

  // Inbox — a task with no project, which must not read as incomplete.
  row = await rowIn("?view=list&system=inbox");
  await clip(row, "task-row-inbox");

  await context.close();
}

/* -- Cross-module regression -------------------------------------------------- */

/*
 * Today and a Project's task list still render the generic Card. They are shot
 * because DS-04 changed three things product-wide — the drawer surface, the
 * phone tab capsule and the bounded past date — and "no regression" is a claim
 * that needs a picture.
 */
if (SET === "all" || SET === "regression") {
  for (const [route, name] of [
    ["/today", "regression-today"],
    ["/projects", "regression-projects"],
  ]) {
    const { context, page } = await openPage(1440, 950, "light");
    await page
      .goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 })
      .catch(() => undefined);
    await settle(page);
    await shoot(page, name);
    await context.close();
  }
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
