import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TASKS-01 — the full first-class Tasks journey, driven end to end against the
 * development-auth server over real D1. Unlike the read-only `tasks.spec.ts`, this
 * MUTATES: it creates tasks under a dedicated, isolated seed Project
 * ("Tasks journey project") via the searchable parent selector and exercises the
 * four-question planning model across the real surfaces — the Eisenhower Matrix
 * (server-grouped buckets + counts), the Time Sectors, Someday/Maybe, Waiting-free
 * on-hold/cancel workflow states, delegation, bulk completion and reopen — then
 * confirms Today and Projects project the SAME records. Every task it creates uses
 * the fixed "Journey task …" title prefix, which the seed cleans up on each run, so
 * it never disturbs the other journeys.
 */

/** Open the "New task" quick-capture form and create a task, returning once it opens
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
  await page.getByRole("link", { name: "New task" }).first().click();
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
  await page.getByRole("checkbox", { name: `Select ${title}` }).check();
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

test.describe("TASKS-01 — full journey", () => {
  test("create under a Project via the parent selector, then move across the Matrix and Sectors", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=all");
    await createJourneyTask(page, {
      title: "Journey task Alpha",
      parent: "Tasks journey project",
      priority: "P1 · Do",
      sector: "This Week",
    });

    // Matrix: Alpha lands in the P1 · Do quadrant, and the quadrant heading carries
    // a server-authoritative count (parenthesised).
    await gotoFixture(page, "/tasks?view=matrix");
    const doRegion = page.getByRole("region", { name: "P1 · Do" });
    await expect(
      doRegion.getByRole("link", { name: "Journey task Alpha" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /P1 · Do \(\d+\)/ }).first(),
    ).toBeVisible();

    // Move P1 → P4 via a bulk action; it leaves Do and appears in Delete / Review.
    await gotoFixture(page, "/tasks?view=all");
    await selectTask(page, "Journey task Alpha");
    await runBulk(page, () =>
      page
        .getByLabel("Set priority for selected tasks")
        .selectOption({ label: "P4 · Delete / Review" }),
    );
    await gotoFixture(page, "/tasks?view=matrix");
    await expect(
      page
        .getByRole("region", { name: "P4 · Delete / Review" })
        .getByRole("link", { name: "Journey task Alpha" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "P1 · Do" })
        .getByRole("link", { name: "Journey task Alpha" }),
    ).toHaveCount(0);

    // Move This Week → Next Week via a bulk action; the Sectors view reflects it.
    await gotoFixture(page, "/tasks?view=all");
    await selectTask(page, "Journey task Alpha");
    await runBulk(page, () =>
      page
        .getByLabel("Move selected tasks to a sector")
        .selectOption({ label: "Next Week" }),
    );
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
    await gotoFixture(page, "/tasks?view=all");
    await createJourneyTask(page, {
      title: "Journey task Bravo",
      parent: "Tasks journey project",
      priority: "P2 · Defer",
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
    // Matrix scope. Then reactivate it.
    await selectTask(page, "Journey task Bravo");
    await runBulk(page, () =>
      page.getByRole("button", { name: "Someday / Maybe" }).click(),
    );
    await gotoFixture(page, "/tasks?system=someday");
    await expect(
      page.getByRole("link", { name: "Journey task Bravo" }),
    ).toBeVisible();

    await selectTask(page, "Journey task Bravo");
    await runBulk(page, () =>
      page.getByRole("button", { name: "Activate" }).click(),
    );

    // On hold via bulk → excluded from the active Matrix scope (parked work).
    await gotoFixture(page, "/tasks?view=all");
    await selectTask(page, "Journey task Bravo");
    await runBulk(page, () =>
      page.getByRole("button", { name: "On hold" }).click(),
    );
    await gotoFixture(page, "/tasks?view=matrix");
    await expect(
      page.getByRole("link", { name: "Journey task Bravo" }),
    ).toHaveCount(0);

    // Cancel via bulk → it surfaces in the Cancelled view.
    await gotoFixture(page, "/tasks?view=all");
    await selectTask(page, "Journey task Bravo");
    await runBulk(page, () =>
      page
        .getByRole("group", { name: "Bulk task actions" })
        .getByRole("button", { name: "Cancel" })
        .click(),
    );
    await gotoFixture(page, "/tasks?system=cancelled");
    await expect(
      page.getByRole("link", { name: "Journey task Bravo" }),
    ).toBeVisible();
  });

  test("bulk complete then reopen through the Drawer", async ({ page }) => {
    await gotoFixture(page, "/tasks?view=all");
    await createJourneyTask(page, {
      title: "Journey task Charlie",
      parent: "Tasks journey project",
      priority: "P1 · Do",
    });

    // Bulk complete → it appears in the Completed view and leaves the active Matrix.
    await selectTask(page, "Journey task Charlie");
    await runBulk(page, () =>
      page.getByRole("button", { name: "Complete" }).click(),
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

    // Reopened → back in the active Matrix P1 · Do.
    await gotoFixture(page, "/tasks?view=matrix");
    await expect(
      page
        .getByRole("region", { name: "P1 · Do" })
        .getByRole("link", { name: "Journey task Charlie" }),
    ).toBeVisible();
  });

  test("Today and Projects project the same task", async ({ page }) => {
    const today = new Date().toISOString().slice(0, 10);
    await gotoFixture(page, "/tasks?view=all");
    await createJourneyTask(page, {
      title: "Journey task Delta",
      parent: "Tasks journey project",
      priority: "P1 · Do",
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
    await gotoFixture(page, "/tasks?view=all");
    await selectTask(page, "Journey task Delta");
    await runBulk(page, () =>
      page.getByRole("button", { name: "Clear plan" }).click(),
    );
  });
});

test.describe("TASKS-01 — journey accessibility & responsive", () => {
  test("no horizontal overflow across views after creating a task", async ({
    page,
  }) => {
    await gotoFixture(page, "/tasks?view=all");
    await createJourneyTask(page, {
      title: "Journey task Echo",
      parent: "Tasks journey project",
      priority: "P3 · Delegate",
      sector: "This Month",
    });
    for (const view of ["all", "matrix", "sectors", "focus"]) {
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await gotoFixture(page, `/tasks?view=${view}`);
        await expectNoHorizontalOverflow(page);
      }
    }
  });

  test("Matrix and Sectors are axe-clean in light and dark with real content", async ({
    page,
  }) => {
    for (const view of ["matrix", "sectors"]) {
      await gotoFixture(page, `/tasks?view=${view}`);
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "dark" });
      await expectNoAxeViolations(page);
      await page.emulateMedia({ colorScheme: "light" });
    }
  });
});
