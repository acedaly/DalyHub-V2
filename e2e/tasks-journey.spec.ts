import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  ownerToday,
} from "./helpers";

/**
 * TASKS-01 — the full first-class Tasks journey, driven end to end against the
 * development-auth server over real D1. Unlike the read-only `tasks.spec.ts`, this
 * MUTATES: it creates tasks under a dedicated, isolated seed Project
 * ("Tasks journey project") via the searchable parent selector and exercises the
 * four-question planning model across the real surfaces — the priority-grouped list
 * (server-grouped buckets + counts), the Time Sectors, Someday/Maybe, Waiting-free
 * on-hold/cancel workflow states, delegation, bulk completion and reopen — then
 * confirms Today and Projects project the SAME records. Every task it creates uses
 * the fixed "Journey task …" title prefix, which the seed cleans up on each run, so
 * it never disturbs the other journeys.
 */

/** Open the "New Task" quick-capture form and create a task, returning once it opens
 *  in the canonical Drawer. Uses the server-backed searchable parent selector. */
async function createJourneyTask(
  page: Page,
  options: {
    readonly title: string;
    readonly parent: string;
    readonly priority?: string;
    readonly sector?: string;
    readonly scheduledDate?: string;
  },
): Promise<void> {
  // Fixture setup, not a UI assertion: the Tasks header's duplicate "New task"
  // button was removed by the shell cleanup, so this opens the SAME (untouched,
  // URL-backed) create drawer by its canonical URL — the one the empty state's
  // trigger and a deep link both produce.
  await page.goto("/tasks?drawer=new-task");
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Title").fill(options.title);

  // The parent selector searches the WHOLE workspace collection server-side.
  const parent = dialog.getByRole("combobox", { name: /Project or Area/ });
  await parent.click();
  await parent.fill(options.parent);
  const option = dialog.getByRole("option", { name: options.parent });
  await expect(option).toBeVisible();
  await option.click();

  if (options.priority) {
    // Priority is a DS-06 searchable SelectField; type the ASCII prefix (e.g. "P1")
    // to reveal the option, then pick it.
    const priorityCombo = dialog.getByRole("combobox", { name: "Priority" });
    await priorityCombo.click();
    await priorityCombo.fill(options.priority.split(" ")[0]!);
    await dialog
      .getByRole("option", { name: options.priority, exact: true })
      .click();
  }
  if (options.sector || options.scheduledDate) {
    await dialog.locator("summary", { hasText: "More details" }).click();
  }
  if (options.sector) {
    const sectorCombo = dialog.getByRole("combobox", { name: "Time sector" });
    await sectorCombo.click();
    await sectorCombo.fill(options.sector);
    await dialog
      .getByRole("option", { name: options.sector, exact: true })
      .click();
  }
  if (options.scheduledDate) {
    await dialog.getByLabel("Scheduled date").fill(options.scheduledDate);
  }

  // Submit and assert the create POST actually succeeded (robust against the
  // Drawer's post-create transition timing). The response body carries any
  // field/form error, surfaced in the assertion message when it fails.
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/tasks/new" &&
        r.request().method() === "POST",
    ),
    dialog.getByRole("button", { name: "Create task" }).click(),
  ]);
  const body = (await response.json()) as { ok?: boolean };
  expect(body.ok, JSON.stringify(body)).toBe(true);

  // Close whatever Drawer is open (the created task's, or the lingering form) so the
  // caller starts from the collection.
  for (let i = 0; i < 3 && (await page.getByRole("dialog").count()) > 0; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

/** Select a task's card checkbox in the current collection view. */
async function selectTask(page: Page, title: string): Promise<void> {
  await page
    .getByRole("checkbox", { name: `Select ${title}` })
    .first()
    .check();
}

/** Run a bulk-bar action and wait until the mutation commits (the bar clears). */
async function runBulk(
  page: Page,
  action: () => Promise<unknown>,
): Promise<void> {
  const bar = page.getByRole("group", { name: "Bulk task actions" });
  await expect(bar).toBeVisible();
  await action();
  // On success the selection clears and the bar detaches — a reliable "committed".
  await expect(bar).toHaveCount(0);
}

/**
 * TASKS-06 — the bulk bar's LONG TAIL sits behind "More" (the phone keeps five
 * controls visible). Reveal it before reaching for a status, a sector, Someday or
 * Delete.
 */
async function openBulkMore(page: Page): Promise<void> {
  const bar = page.getByRole("group", { name: "Bulk task actions" });
  await bar.getByRole("button", { name: "More", exact: true }).click();
}

/** Choose a value from one of the bulk bar's mixed-value field menus. */
async function chooseBulk(
  page: Page,
  field: string,
  option: string,
): Promise<void> {
  await page
    .getByRole("group", { name: "Bulk task actions" })
    .getByRole("combobox", { name: field })
    .selectOption({ label: option });
}

/**
 * The journey's own working list: the complete collection, MOST RECENTLY CREATED
 * FIRST.
 *
 * TASKS-03 added a realistic 80-task collection dataset to the seed, so a journey
 * that assumed its freshly-created task would appear on the first page of the
 * default smart order no longer holds — and should not: relying on that was always
 * a property of a small seed, not of the product. Sorting by creation makes the
 * journey assert on the record it actually created.
 */
const JOURNEY_LIST = "/tasks?view=list&system=all&sort=created&dir=desc";

/** The banded triage surface V2.2 kept when the Eisenhower Matrix was removed. */
const PRIORITY_GROUPS = "/tasks?view=list&system=active&group=priority";

test.describe("TASKS-01 — full journey", () => {
  /*
   * These are multi-step STATEFUL journeys — create, open the Drawer, edit details,
   * delegate, Someday, reactivate, On hold, Cancel — and they were left on the 30s
   * default while the accessibility block below (same file, same suite) had already
   * been given 90s and 120s for exactly this reason.
   *
   * MEASURED on an idle machine: 22.5s and 27.2s for two of the four, i.e. 75-90% of
   * the default consumed before any CI load. They live on the heaviest shard
   * (tasks.spec 1.9m + tasks-collection 1.8m + themes 1.7m alongside them, ~10.4min
   * total), and they duly tipped over there — twice, on DIFFERENT steps of different
   * journeys (`:187` waiting for a task link, `:253` in `selectTask`), which is what
   * budget exhaustion looks like rather than a defect in any one step.
   *
   * Sizing the budget to the work is the remedy this repository already chose for the
   * sibling block, with the reason stated. It is NOT the "raise the ceiling" move
   * rejected for the shard matrix: that pins the worst SHARD against a moving line
   * and hides a growing suite, whereas this sizes ONE test's budget to what that test
   * genuinely does. No assertion changes.
   *
   * Splitting — the fix used for `people.spec.ts` — is deliberately NOT used here.
   * There each viewport was independent, so nine small tests were strictly better.
   * A journey's steps depend on the state the previous step left, so splitting would
   * mean re-creating that state per test and would test something weaker.
   */
  test.describe.configure({ timeout: 90_000 });

  test("create under a Project via the parent selector, then move across the priority groups and Sectors", async ({
    page,
  }) => {
    await gotoFixture(page, JOURNEY_LIST);
    await createJourneyTask(page, {
      title: "Journey task Alpha",
      parent: "Tasks journey project",
      priority: "P1 · Urgent",
      sector: "This Week",
    });

    // V2.2 removed the Matrix; the priority-GROUPED list is where banded triage now
    // happens, and it is the same server grouping with the same authoritative counts.
    await gotoFixture(page, PRIORITY_GROUPS);
    const p1Region = page.getByRole("region", { name: "P1 · Urgent" });
    await expect(
      p1Region.getByRole("link", { name: "Journey task Alpha" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /P1 · Urgent \(\d+\)/ }).first(),
    ).toBeVisible();

    // Move P1 → P4 via a bulk action; it leaves the P1 band and joins P4.
    await gotoFixture(page, JOURNEY_LIST);
    await selectTask(page, "Journey task Alpha");
    await runBulk(page, () => chooseBulk(page, "Priority", "P4 · Low"));
    await gotoFixture(page, PRIORITY_GROUPS);
    await expect(
      page
        .getByRole("region", { name: "P4 · Low" })
        .getByRole("link", { name: "Journey task Alpha" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "P1 · Urgent" })
        .getByRole("link", { name: "Journey task Alpha" }),
    ).toHaveCount(0);

    // Move This Week → Next Week via a bulk action; the Sectors view reflects it.
    await gotoFixture(page, JOURNEY_LIST);
    await selectTask(page, "Journey task Alpha");
    await runBulk(page, async () => {
      await openBulkMore(page);
      await chooseBulk(page, "Sector", "Next Week");
    });
    await gotoFixture(page, "/tasks?view=sectors");
    await expect(
      page
        .getByRole("region", { name: "Next Week" })
        .getByRole("link", { name: "Journey task Alpha" }),
    ).toBeVisible();
  });

  test("delegate via the Drawer; Someday and reactivate, On hold and Cancel", async ({
    page,
  }) => {
    await gotoFixture(page, JOURNEY_LIST);
    await createJourneyTask(page, {
      title: "Journey task Bravo",
      parent: "Tasks journey project",
      priority: "P2 · High",
    });

    // Delegate through the canonical Drawer's Details editor.
    await page
      .getByRole("link", { name: "Journey task Bravo" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Edit details" }).click();
    await dialog.getByLabel("Delegated to").fill("Sam Rivera");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog.getByText("Sam Rivera")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Someday/Maybe via bulk → it appears in the Someday view and leaves the active
    // planning scope. Then reactivate it.
    await selectTask(page, "Journey task Bravo");
    await runBulk(page, async () => {
      await openBulkMore(page);
      await page
        .getByRole("group", { name: "Bulk task actions" })
        .getByRole("button", { name: "Someday / Maybe" })
        .click();
    });
    await gotoFixture(page, "/tasks?system=someday");
    await expect(
      page.getByRole("link", { name: "Journey task Bravo" }),
    ).toBeVisible();

    await selectTask(page, "Journey task Bravo");
    await runBulk(page, async () => {
      await openBulkMore(page);
      await page
        .getByRole("group", { name: "Bulk task actions" })
        .getByRole("button", { name: "Make active" })
        .click();
    });

    // On hold via bulk → excluded from the active planning scope (parked work).
    await gotoFixture(page, JOURNEY_LIST);
    await selectTask(page, "Journey task Bravo");
    await runBulk(page, async () => {
      await openBulkMore(page);
      await chooseBulk(page, "Status", "On hold");
    });
    await gotoFixture(page, PRIORITY_GROUPS);
    await expect(
      page.getByRole("link", { name: "Journey task Bravo" }),
    ).toHaveCount(0);

    // Cancel via bulk → it surfaces in the Cancelled view.
    await gotoFixture(page, JOURNEY_LIST);
    await selectTask(page, "Journey task Bravo");
    await runBulk(page, async () => {
      await openBulkMore(page);
      await chooseBulk(page, "Status", "Cancelled");
    });
    await gotoFixture(page, "/tasks?system=cancelled");
    await expect(
      page.getByRole("link", { name: "Journey task Bravo" }),
    ).toBeVisible();
  });

  test("bulk complete then reopen through the Drawer", async ({ page }) => {
    await gotoFixture(page, JOURNEY_LIST);
    await createJourneyTask(page, {
      title: "Journey task Charlie",
      parent: "Tasks journey project",
      priority: "P1 · Urgent",
    });

    // Bulk complete → it appears in the Completed view and leaves the active list.
    await selectTask(page, "Journey task Charlie");
    // Scoped to the bulk bar and matched EXACTLY: Playwright matches an
    // accessible name as a case-insensitive substring by default, and MOBILE-01
    // gave every task card a one-tap "Complete <title>" action — so an unscoped
    // { name: "Complete" } now resolves to the bar's button AND every row's.
    await runBulk(page, () =>
      page
        .getByRole("group", { name: "Bulk task actions" })
        .getByRole("button", { name: "Complete", exact: true })
        .click(),
    );
    await gotoFixture(page, "/tasks?system=completed");
    await page
      .getByRole("link", { name: "Journey task Charlie" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Reopen via the canonical completion toggle.
    await dialog.getByRole("checkbox", { name: "Completed" }).uncheck();
    await expect(
      dialog.getByRole("checkbox", { name: "Mark complete" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // Reopened → back in the active P1 band.
    await gotoFixture(page, PRIORITY_GROUPS);
    await expect(
      page
        .getByRole("region", { name: "P1 · Urgent" })
        .getByRole("link", { name: "Journey task Charlie" }),
    ).toBeVisible();
  });

  test("Today and Projects project the same task", async ({ page }) => {
    // The owner's calendar day, not the UTC one: Today is an owner-timezone surface
    // (ADR-022), so a UTC date silently plans this task for YESTERDAY whenever the
    // suite runs late in the owner's day, and Today then correctly omits it.
    const today = ownerToday();
    await gotoFixture(page, JOURNEY_LIST);
    await createJourneyTask(page, {
      title: "Journey task Delta",
      parent: "Tasks journey project",
      priority: "P1 · Urgent",
      scheduledDate: today,
    });

    // Today projects the scheduled-today task (the same canonical record).
    await gotoFixture(page, "/today");
    await expect(
      page.getByRole("link", { name: "Journey task Delta" }).first(),
    ).toBeVisible();

    // The Project record projects it under its Tasks tab.
    await gotoFixture(page, "/projects/pr-tasksjourney");
    const tasksTab = page.getByRole("tab", { name: /Tasks/ });
    if (await tasksTab.count()) {
      await tasksTab.first().click();
    }
    await expect(
      page.getByRole("link", { name: "Journey task Delta" }).first(),
    ).toBeVisible();

    // Clear Delta's plan so it no longer occupies Today's "Today" band — a lingering
    // scheduled-today task would otherwise leak a "Today" section into the shared
    // Today dashboard (and its command palette) for subsequent specs in this run.
    // (It moves to the always-present "Anytime" backlog, so the Today surface stays
    // consistent with the seed baseline.) `runBulk` confirms the clear committed.
    await gotoFixture(page, JOURNEY_LIST);
    await selectTask(page, "Journey task Delta");
    await runBulk(page, () => chooseBulk(page, "Date", "Clear planned date"));
  });
});

test.describe("TASKS-01 — journey accessibility & responsive", () => {
  test("no horizontal overflow across views after creating a task", async ({
    page,
  }) => {
    // This test creates a task and then performs SIXTEEN full navigations (four
    // views × four widths), each a real server render followed by hydration. On a
    // green local run it measures 31.7s — past the 30s default, which was sized
    // when the shell was lighter. The budget is raised to match the measured work;
    // not one assertion is relaxed and no wait is inserted, so a genuine overflow
    // still fails the poll exactly as before.
    test.setTimeout(90_000);

    await gotoFixture(page, JOURNEY_LIST);
    await createJourneyTask(page, {
      title: "Journey task Echo",
      parent: "Tasks journey project",
      priority: "P3 · Normal",
      sector: "This Month",
    });
    // TASKS-03 replaced the four "primary views" with presentations plus
    // grouping; the legacy `focus`/`all` links redirect into the new vocabulary,
    // and both forms are checked so an existing bookmark is proven too.
    for (const query of [
      "view=list&system=all",
      "view=list&group=parent",
      "view=board&group=priority",
      "view=list&group=priority",
      "view=sectors",
      "view=focus",
      // V2.2 removed the Matrix. A LEGACY bookmark must still render calmly at every
      // width — it redirects into the priority-grouped list rather than 404ing.
      "view=matrix",
    ]) {
      for (const width of [320, 375, 390, 430, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await gotoFixture(page, `/tasks?${query}`);
        await expectNoHorizontalOverflow(page);
      }
    }
  });

  test("the grouped and Sectors views are axe-clean in light and dark with real content", async ({
    page,
  }) => {
    // Four full axe passes over the 80-task collection dataset.
    test.setTimeout(120_000);
    for (const query of ["view=list&group=priority", "view=sectors"]) {
      await gotoFixture(page, `/tasks?${query}`);
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "light" });
    }
  });
});
