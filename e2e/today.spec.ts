import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * The Today screen, driven end to end against the development-auth server.
 *
 * Today is now the surface the owner WORKS from — a header block, a conditional
 * chip row, a day column and an attention rail. So this spec asserts the things
 * that must be true of the screen regardless of what the shared dev workspace
 * happens to contain that day: the structure, the conditional rules, the one
 * completion path, and the absence of everything the redesign removed.
 *
 * It deliberately does NOT assert particular tasks. The dev database is shared
 * with every other journey in this suite and mutated by several of them; a spec
 * that names a row is a spec that fails for a reason it is not about.
 */

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

/** The screen's own heading — the greeting, not a repeat of the nav item. */
function greeting(page: Page) {
  return page.getByRole("heading", {
    level: 1,
    name: /^Good (morning|afternoon|evening)/,
  });
}

test.describe("Today — the day surface", () => {
  test("is reachable from the sidebar and leads with the greeting", async ({
    page,
  }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Today" }).click();

    await expect(page).toHaveURL(/\/today$/);
    await expect(greeting(page)).toBeVisible();
    // The date is stated once, under the greeting, as page content.
    await expect(page.locator(".dh-today__date")).toHaveCount(1);
  });

  test("renders the day and the rail as two tonal regions", async ({
    page,
  }) => {
    await page.goto("/today");

    await expect(
      page.getByRole("heading", { level: 2, name: "Focus" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Needs attention" }),
    ).toBeVisible();
    const taskStat = page.getByRole("heading", { name: "Tasks for today" });
    if ((await taskStat.count()) > 0) {
      await expect(taskStat).toBeVisible();
    }
    /*
     * TODAY-09 renamed the day's one band from "Due today" to "For today",
     * because the band held due-today AND scheduled-today work and only named
     * half of it. TODAY-10 answered that mismatch the other way round: the band
     * became two bands that each name exactly what they hold, so "Due today"
     * is a legitimate label again — over due-today work alone. What must never
     * come back is the ONE combined band that named half its contents.
     */
    await expect(
      page.locator(".dh-day-section__label", { hasText: "For today" }),
    ).toHaveCount(0);
    // The band labels are upper-cased by `text-transform`, so the rendered text
    // is compared against the source vocabulary case-insensitively.
    const bands = await page
      .locator(".dh-today__timeline .dh-day-section__label")
      .allInnerTexts();
    for (const band of bands) {
      expect(["overdue", "due today", "planned today"]).toContain(
        band.trim().toLowerCase(),
      );
    }

    // "Plan day" is a navigation to the canonical Tasks view of today's work —
    // Today does not own a planning flow.
    await expect(page.getByRole("link", { name: "Plan day" })).toHaveAttribute(
      "href",
      "/tasks?system=today",
    );

    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("every summary figure states a real count and links to the view holding it", async ({
    page,
  }) => {
    await page.goto("/today");

    // M3X: the assist-chip row became the expressive summary's figures. Same
    // three facts, same rules, one surface.
    const stats = page.locator(".dh-stat--interactive");
    const count = await stats.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const stat = stats.nth(index);
      const label = (await stat.innerText()).replace(/\s+/g, " ").trim();
      // A figure never states a zero — that is the whole rule.
      expect(label).not.toMatch(/^0\b/);
      const href = await stat.getAttribute("href");
      expect(href).toMatch(/^\/(tasks\?system=(today|overdue)|meetings)$/);
    }

    // Overdue work is the ONLY toned figure on the page.
    const toned = page.locator('.dh-stat__value[data-tone="attention"]');
    expect(await toned.count()).toBeLessThanOrEqual(1);
    if ((await toned.count()) === 1) {
      await expect(
        page.locator('.dh-stat:has([data-tone="attention"])'),
      ).toContainText(/overdue/i);
    }
  });

  test("overdue work is actionable in the day, and never in the rail", async ({
    page,
  }) => {
    await page.goto("/today");

    const overdueRows = page.locator(".dh-day-list--overdue .dh-day-row");
    const shown = await overdueRows.count();
    if (shown === 0) {
      test.skip(true, "the shared dev workspace has nothing overdue right now");
    }

    // At most three rows, plus an honest remainder row when there are more.
    const taskRows = page.locator(
      ".dh-day-list--overdue .dh-day-row:not(.dh-day-row--more)",
    );
    expect(await taskRows.count()).toBeLessThanOrEqual(3);
    const more = page.getByRole("link", { name: /^\+\d+ more overdue$/ });
    if ((await more.count()) === 1) {
      await expect(more).toHaveAttribute("href", "/tasks?system=overdue");
    }

    // Each overdue row names WHICH date slipped and how long ago.
    await expect(taskRows.first().locator(".dh-day-row__due")).toHaveText(
      /^(Due|Planned) /,
    );

    // The rail holds only what the day does not show.
    const rail = page
      .getByRole("heading", { level: 2, name: "Needs attention" })
      .locator("xpath=ancestor::section[1]");
    await expect(rail.getByText(/overdue/i)).toHaveCount(0);
  });

  test("no task row carries a time, and there is no time-of-day grouping", async ({
    page,
  }) => {
    await page.goto("/today");

    const dayColumn = page.locator(".dh-today__timeline");
    await expect(dayColumn).toBeVisible();
    await expect(
      dayColumn.getByText(/^(Morning|Afternoon|Evening)$/),
    ).toHaveCount(0);

    // A time slot exists only on meeting rows.
    const timed = dayColumn.locator(".dh-day-row:has(.dh-day-row__time)");
    const timedCount = await timed.count();
    for (let index = 0; index < timedCount; index += 1) {
      await expect(timed.nth(index)).toHaveClass(/dh-day-row--meeting/);
    }
  });

  test("ticking a task on Today completes it in Tasks too", async ({
    page,
  }) => {
    // A dedicated task, due today, so this journey never disturbs the rows the
    // other specs assert on. Created through the same URL-backed create drawer
    // the Tasks journeys use.
    const title = `Today completion round trip ${Date.now()}`;
    const today = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Australia/Sydney",
    }).format(new Date());

    await page.goto("/tasks?drawer=new-task");
    const dialog = page.getByRole("dialog", { name: "New task" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Title").fill(title);
    /*
     * P1, so the row is inside Focus's eight-row display bound (TODAY-10)
     * however many other Tasks the shared workspace has dated today by the time
     * this journey runs. The bound is ordered priority-first, so this is the
     * documented way to be certain the row is drawn — not a workaround for it.
     */
    const priority = dialog.getByRole("combobox", { name: "Priority" });
    await priority.click();
    await priority.fill("P1");
    await dialog
      .getByRole("option", { name: "P1 · Urgent", exact: true })
      .click();
    await dialog.locator("summary", { hasText: "More details" }).click();
    await dialog.getByLabel("Due date").fill(today);
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/tasks/new" &&
          r.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Create task" }).click(),
    ]);
    expect((await response.json()).ok).toBe(true);

    await page.goto("/today");
    const row = page.locator(".dh-day-row", { hasText: title }).first();
    await expect(row).toBeVisible();

    await row.getByRole("checkbox", { name: `Complete ${title}` }).check();
    // Optimistic in place, then reconciled by the loader revalidation.
    await expect(
      row.getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeChecked();

    // The SAME task record reads as complete — one completion path, one truth.
    await page.goto("/today");
    await page.locator(".dh-day-row", { hasText: title }).first().click();
    const record = page.getByRole("dialog");
    await expect(
      record.getByRole("heading", { name: title }).first(),
    ).toBeVisible();
    await expect(record.getByRole("checkbox").first()).toBeChecked();
  });

  test("a task row opens its record in the Drawer over the page", async ({
    page,
  }) => {
    await page.goto("/today");
    const row = page.locator(".dh-today__timeline .dh-day-row__title").first();
    if ((await row.count()) === 0) {
      test.skip(true, "nothing on the day in the shared dev workspace");
    }
    const title = (await row.innerText()).trim();
    await row.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: title }).first(),
    ).toBeVisible();
  });

  test("the rail's rows navigate to their subjects", async ({ page }) => {
    await page.goto("/today");
    const rail = page
      .getByRole("heading", { level: 2, name: "Needs attention" })
      .locator("xpath=ancestor::section[1]");

    const links = rail.getByRole("link");
    const count = await links.count();
    if (count === 0) {
      // The quiet empty state: ONE line, never a card, and never beside items.
      await expect(rail.getByText("All clear")).toBeVisible();
      return;
    }
    await expect(rail.getByText("All clear")).toHaveCount(0);
    for (let index = 0; index < count; index += 1) {
      const href = await links.nth(index).getAttribute("href");
      expect(href).toMatch(
        /^\/(tasks\?system=inbox|today\/waiting|asset\/|projects\/|goals\/)/,
      );
    }
  });

  test("the surface offers no search, no customisation and no second capture", async ({
    page,
  }) => {
    await page.goto("/today");
    const surface = page.locator(".dh-today");

    await expect(surface.getByRole("searchbox")).toHaveCount(0);
    await expect(
      surface.getByRole("button", { name: /customise/i }),
    ).toHaveCount(0);
    await expect(surface.locator("details")).toHaveCount(0);
    await expect(surface.getByTestId("today-capture-task")).toHaveCount(0);

    // Search moved to the top app bar as an icon, keeping its name and `/`.
    const topBar = page.getByRole("banner");
    await expect(
      topBar.getByRole("button", { name: /^Search DalyHub/ }),
    ).toBeVisible();
  });
});

test.describe("Today — narrow widths", () => {
  test("stacks the rail under the day with no horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/today");
    await expect(greeting(page)).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    // UIX-01 — "Needs attention" comes before "Continue working" in the day's
    // supporting regions. They were one `__rail` column and are now sibling
    // regions, so the order is read off the body.
    const headings = (
      await page
        .locator(".dh-today__body .dh-today__panel-title")
        .allInnerTexts()
    ).filter((text) => text !== "Focus" && text !== "Schedule");
    if (headings.length > 1) {
      expect(headings[0]).toBe("Needs attention");
    }
  });
});
