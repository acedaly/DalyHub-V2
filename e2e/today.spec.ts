import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { pickCalendarDate } from "./helpers";

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

    /*
     * TODAY-11 renamed the day's own panel from "Focus" to "Today's plan", which
     * is what MOCKUP 5 calls it and what the owner calls it. The Schedule panel
     * is now permanent — the week strip is a real control over real data — so it
     * is asserted unconditionally rather than only on a day with events.
     */
    await expect(
      page.getByRole("heading", { level: 2, name: "Today’s plan" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Schedule" }),
    ).toBeVisible();
    /*
     * "Needs attention" is drawn only when it HOLDS something (TODAY-11): a
     * panel that exists for what it carries has no business drawing a heading
     * and a green tick when it carries nothing. On a clear day the page ends on
     * one quiet line instead, so exactly one of the two is true.
     */
    const attention = page.getByRole("heading", {
      level: 2,
      name: "Needs attention",
    });
    if ((await attention.count()) > 0) {
      await expect(attention).toBeVisible();
    } else {
      await expect(page.getByText("All clear.")).toBeVisible();
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

    /*
     * CONVERGE-01 §1 A9 — "+ Add task" appears ONCE, at the foot of the plan.
     *
     * TODAY-11 drew it twice: filled in the page header and quiet under the
     * list. Both opened the same shared capture sheet on the same Task panel
     * with the same context, so the header's copy was duplication — and on a
     * phone it was a full-width primary button between the greeting and the
     * first task. The header one is gone from the DOM on every device.
     *
     * Global capture is untouched and is NOT this control: the shell's `+`, the
     * `C` shortcut and the phone bottom bar all still reach the same sheet.
     */
    await expect(page.getByTestId("today-plan-add")).toBeVisible();
    await expect(page.getByTestId("today-add-task")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Plan day" })).toHaveCount(0);

    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("every summary figure states a real count and links to the view holding it", async ({
    page,
  }) => {
    await page.goto("/today");

    /*
     * REDESIGN-03 — one measure row, and it is about the WEEK.
     *
     * The `.dh-stat--interactive` cards this asserted on are gone. Every figure
     * on that row counted something the same page rendered in full a few
     * hundred pixels lower — the Schedule panel names the meeting, Focus's own
     * Overdue band holds the overdue work — so it was a caption printed at
     * headline size, and at 390px it and its sibling row filled the entire
     * first viewport with no task in it.
     *
     * The RULES survive and are asserted here against what replaced them: a
     * figure never states a zero, and a figure the owner can check links to
     * where they can check it. "Tasks captured" deliberately does not link —
     * there is no canonical view of "created in the last seven days", and a
     * link to an approximation of itself is worse than none.
     */
    const stats = page.locator(".dh-stat--interactive");
    expect(await stats.count()).toBe(0);

    const summary = page.getByTestId("today-summary");
    await expect(summary).toBeVisible();
    const measures = summary.locator(".dh-today__measure");
    const count = await measures.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const measure = measures.nth(index);
      const value = (
        await measure.locator(".dh-today__measure-value").innerText()
      ).trim();
      // A figure is a figure, and it is never rendered as an empty slot.
      expect(value).toMatch(/^\d/);

      const link = measure.locator("a.dh-today__measure-link");
      if ((await link.count()) === 1) {
        expect(await link.getAttribute("href")).toMatch(
          /^\/(analytics|goals)$/,
        );
      }
    }

    // At least one measure is checkable, or the row is decoration.
    expect(
      await summary.locator("a.dh-today__measure-link").count(),
    ).toBeGreaterThan(0);

    /*
     * Nothing on this row carries a tone. The `attention` treatment belonged to
     * the overdue FIGURE, and overdue work is now actionable rows in Focus and
     * nothing else — which is the "one fact, one place" rule the page states.
     */
    expect(
      await page.locator('.dh-stat__value[data-tone="attention"]').count(),
    ).toBe(0);
  });

  test("overdue work is actionable in the day, and never in the rail", async ({
    page,
  }) => {
    await page.goto("/today");

    // TODAY-TASK-01 — the overdue band is the shared task list under a band
    // labelled "Overdue"; `.dh-day-list--overdue` went with the private row.
    const overdueRows = page.locator(
      '.dh-day-section[data-tone="overdue"] .dh-taskrow',
    );
    const shown = await overdueRows.count();
    if (shown === 0) {
      test.skip(true, "the shared dev workspace has nothing overdue right now");
    }

    /*
     * At most three OPEN rows, plus an honest remainder row when there are more.
     *
     * The bound counts open work and never bounds away a completion: a slipped
     * task finished this morning is still drawn, dimmed, at the end of the band
     * it was already in (`boundBand` — "a bound counts OPEN rows; a completion
     * is never bounded away"). Counting every row therefore asserted a rule the
     * product does not have, and passed only on a workspace that happened to
     * have completed nothing overdue — measured failing at 5 rows (3 open + 2
     * done) on a workspace that had.
     */
    const taskRows = page.locator(
      '.dh-day-section[data-tone="overdue"] .dh-taskrow',
    );
    const openRows = page.locator(
      '.dh-day-section[data-tone="overdue"] .dh-taskrow:not([data-completed="true"])',
    );
    expect(await openRows.count()).toBeLessThanOrEqual(3);
    const more = page.getByRole("link", { name: /^\+\d+ more overdue$/ });
    if ((await more.count()) === 1) {
      await expect(more).toHaveAttribute("href", "/tasks?system=overdue");
    }

    /*
     * Each overdue row says how long ago it slipped, in words.
     *
     * TODAY-TASK-01 — through the SHARED date cell rather than a Today-only
     * trailing span: the row shows its due date, and `relativeCalendarDate`
     * renders a passed one as "Yesterday" / "3 days ago" / "2 months ago" /
     * "Over a year ago", bounded at every distance and in the overdue colour.
     * The row also states the fact structurally, which is what the colour is
     * never allowed to carry alone.
     */
    await expect(
      taskRows.first().getByTestId(/^task-row-(due|scheduled)-date$/),
    ).toHaveText(/ago$|^Yesterday$/);
    await expect(taskRows.first()).toHaveAttribute("data-overdue", "true");

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
      .getByRole("option", { name: "Priority 1", exact: true })
      .click();
    await dialog.locator("summary", { hasText: "More details" }).click();
    await dialog.getByLabel("Due date").click();
    await pickCalendarDate(
      page.getByRole("dialog", { name: "Choose Due date" }),
      today,
    );
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
    const row = page.locator(".dh-taskrow", { hasText: title }).first();
    await expect(row).toBeVisible();

    await row.getByRole("checkbox", { name: `Complete ${title}` }).check();
    // Optimistic in place, then reconciled by the loader revalidation.
    await expect(
      row.getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeChecked();

    // The SAME task record reads as complete — one completion path, one truth.
    await page.goto("/today");
    await page
      .locator(".dh-taskrow", { hasText: title })
      .first()
      .getByTestId("task-row-open")
      .click();
    const record = page.getByRole("dialog");
    await expect(
      record.getByRole("heading", { name: title }).first(),
    ).toBeVisible();
    /*
     * CONTROL-01 §4 — the record's lifecycle act is a BUTTON, not a checkbox.
     *
     * #189 merged the three Task drawers into `TaskRecordDrawer` and promoted
     * completion out of the summary column into the record header's action, in
     * the same words a Project uses. It updated `task-drawer.spec.ts` and left
     * this one, which had been asserting on a control the record no longer
     * draws — measured failing at `acc5f32`, the commit before this pass.
     *
     * A completed task therefore offers "Reopen task"; the presence of that
     * button IS the statement that the record reads as complete.
     */
    await expect(
      record.getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();
    await expect(
      record.getByRole("button", { name: "Complete task" }),
    ).toHaveCount(0);
  });

  test("a task row opens its record in the Drawer over the page", async ({
    page,
  }) => {
    await page.goto("/today");
    const row = page.locator(".dh-today__timeline .dh-taskrow__title").first();
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
      /*
       * `/assets` (plural) is the AGGREGATE row's destination and belongs in
       * this set: `buildAttention` names a single obligation's own Asset when
       * there is exactly one, and falls back to "N obligations need attention"
       * pointing at the collection when there are several. The pattern only
       * carried the singular `/asset/:id` form, so the assertion passed on a
       * workspace with one obligation and failed on any workspace with two —
       * measured failing at `acc5f32`, the commit before this pass.
       */
      expect(href).toMatch(
        /^\/(tasks\?system=inbox|today\/waiting|assets|asset\/|projects\/|goals\/)/,
      );
    }
  });

  test("the surface offers no search and no customisation", async ({
    page,
  }) => {
    await page.goto("/today");
    const surface = page.locator(".dh-today");

    /*
     * Search still belongs to the SHELL. TODAY-11 did not add one here — the top
     * bar's control sits on the same gutter line one rank above the greeting,
     * and a second implementation to keep in step with the first is what DS-03
     * refused when it settled this control's home.
     */
    await expect(surface.getByRole("searchbox")).toHaveCount(0);
    await expect(surface.getByRole("search")).toHaveCount(0);
    await expect(
      surface.getByRole("button", { name: /customise/i }),
    ).toHaveCount(0);
    await expect(surface.locator("details")).toHaveCount(0);

    const topBar = page.getByRole("banner");
    await expect(
      topBar.getByRole("button", { name: /^Search DalyHub/ }),
    ).toBeVisible();
  });

  /*
   * TODAY-11 — the capture card, and the two chips that are NOT on it.
   *
   * Today gained capture affordances of its own, reversing the rule the test
   * above used to carry. What the removal was protecting is still true and is
   * what this asserts: every control opens the SHARED sheet, the "field" is a
   * button rather than a second form, and no chip offers a capability the
   * product does not have.
   */
  test("captures through the shared sheet, and offers no capability it lacks", async ({
    page,
  }) => {
    await page.goto("/today");
    const card = page.getByTestId("today-capture");
    await expect(card).toBeVisible();

    // A control that LOOKS like a field, not a second capture form.
    const field = page.getByTestId("today-capture-field");
    await expect(field).toHaveJSProperty("tagName", "BUTTON");
    await expect(page.locator(".dh-today").getByRole("textbox")).toHaveCount(0);

    // "Reminder" has no delivery channel (DEBT-57) and "Upload" no attachments
    // (DEBT-35). Neither is drawn, and neither may arrive before the capability.
    await expect(card.getByRole("button", { name: /reminder/i })).toHaveCount(
      0,
    );
    await expect(card.getByRole("button", { name: /upload/i })).toHaveCount(0);

    // The chip opens the SAME sheet the global "+" does, on the Task panel.
    await card.getByRole("button", { name: "Task", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  /*
   * TODAY-11 — the week strip navigates the schedule's day, and says which day.
   */
  test("the week strip selects a day without leaving the page", async ({
    page,
  }) => {
    await page.goto("/today");
    const strip = page.getByTestId("today-week-strip");
    await expect(strip.getByRole("tab")).toHaveCount(7);

    const selected = strip.getByRole("tab", { selected: true });
    await expect(selected).toHaveCount(1);
    const before = await selected.getAttribute("data-date");

    // Arrow-navigable, and only the selected day is in the tab order.
    await selected.focus();
    await page.keyboard.press("ArrowLeft");
    const after = await strip
      .getByRole("tab", { selected: true })
      .getAttribute("data-date");
    expect(after).not.toBe(before);
    // The URL is untouched: this selects a panel, it does not navigate.
    await expect(page).toHaveURL(/\/today$/);

    // ONE schedule link, and it goes to the forward agenda that actually exists.
    const schedule = page.getByTestId("today-schedule");
    await expect(
      schedule.getByRole("link", { name: "View full schedule" }),
    ).toHaveAttribute("href", "/today/upcoming");
    await expect(schedule.getByRole("link", { name: /calendar/i })).toHaveCount(
      0,
    );
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

    // TODAY-11 — "Needs attention" still comes before "Continue working", and
    // the order is now read off the SUPPORT rank that holds both. Nothing on
    // this screen is moved by CSS `order`, so the DOM order is the phone order.
    const headings = await page
      .locator(".dh-today__rank--support .dh-today__panel-title")
      .allInnerTexts();
    if (headings.length > 1) {
      expect(headings[0]).toBe("Needs attention");
    }
  });
});
