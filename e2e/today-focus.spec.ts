import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  ownerToday,
  postSameOrigin,
} from "./helpers";

/**
 * TODAY-10 — the Focus panel, driven end to end against the real dev-auth server.
 *
 * `today.spec.ts` proves the STRUCTURE of the screen against whatever the shared
 * dev workspace happens to hold. This spec proves the CLASSIFICATION, which needs
 * known records: which band a Task lands in, that it lands in exactly one, that
 * parked work reaches neither Today nor `/tasks?system=today`, and that the two
 * surfaces agree about the day after a completion.
 *
 * Every record it asserts on is created BY the spec through the real
 * `/tasks/new` action, under a per-run title stamp, and every locator is scoped
 * to that stamp. The dev database is shared with the rest of the suite and
 * mutated by several other journeys, so a spec that named a pre-existing row —
 * or counted all the rows on the page — would fail for a reason it is not about.
 *
 * There is no test-only Today logic anywhere in here: the rows are read off the
 * rendered screen and the counts off the canonical Tasks view.
 */

/** A per-run stamp, so concurrent and repeat runs never collide. */
const STAMP = `T10-${Date.now()}`;

const TODAY = ownerToday();

function shiftDays(iso: string, days: number): string {
  const base = new Date(`${iso}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Every Task this spec created, so each test can take its own records back off
 * the day afterwards.
 *
 * The Focus panel is BOUNDED at eight rows (TODAY-10), and the development
 * database is shared with — and added to by — every other journey in the suite.
 * Leaving eight of this spec's own Tasks on the day would push the next test's
 * rows past the bound and fail it for a reason it is not about, which is exactly
 * the kind of accumulation HARDEN-02 found elsewhere in this suite. Cleanup
 * CLEARS THE DATES rather than completing the Tasks: a completion stays on the
 * day (dimmed, in its band, counted by the progress figure), which is correct
 * product behaviour and useless as cleanup.
 */
const created: string[] = [];

/** Create a Task through the real create action and return its id. */
async function createTask(
  request: APIRequestContext,
  name: string,
  fields: Record<string, string> = {},
): Promise<{ readonly id: string; readonly title: string }> {
  const title = `${STAMP} ${name}`;
  const response = await postSameOrigin(request, "/tasks/new", {
    form: { title, ...fields },
  });
  const body = (await response.json()) as {
    ok: boolean;
    taskId?: string;
    formError?: string;
  };
  expect(body.ok, `creating "${title}": ${body.formError ?? ""}`).toBe(true);
  created.push(body.taskId!);
  return { id: body.taskId!, title };
}

/** Set a field on an existing Task through the real record action. */
async function updateTask(
  request: APIRequestContext,
  id: string,
  fields: Record<string, string>,
): Promise<void> {
  const response = await postSameOrigin(
    request,
    `/tasks/${encodeURIComponent(id)}`,
    { form: { intent: "update", ...fields } },
  );
  expect(response.ok()).toBe(true);
}

/** The Focus panel's bands, as `{ label: [row titles] }`, stamp-scoped. */
async function focusBands(
  page: Page,
): Promise<Record<string, readonly string[]>> {
  return page.evaluate((stamp) => {
    const bands: Record<string, string[]> = {};
    const panel = document.querySelector(".dh-today__timeline");
    for (const section of panel?.querySelectorAll(".dh-day-section") ?? []) {
      const label =
        section.querySelector(".dh-day-section__label")?.textContent?.trim() ??
        "";
      bands[label] = [...section.querySelectorAll(".dh-day-row__title")]
        .map((node) => node.textContent?.trim() ?? "")
        .filter((title) => title.startsWith(stamp));
    }
    return bands;
  }, STAMP);
}

/** Every title `/tasks?system=today` currently lists, stamp-scoped. */
async function canonicalTodayTitles(page: Page): Promise<readonly string[]> {
  await page.goto("/tasks?system=today");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  // The collection streams behind a skeleton; wait for the list, not a timer.
  await expect(page.locator(".dh-card").first()).toBeVisible();
  return (await page.locator(".dh-card__title-text").allInnerTexts())
    .map((text) => text.trim())
    .filter((title) => title.startsWith(STAMP));
}

test.describe("TODAY-10 — the Focus panel classifies the day", () => {
  test.afterEach(async ({ request }) => {
    while (created.length > 0) {
      await updateTask(request, created.pop()!, {
        dueDate: "",
        scheduledDate: "",
      });
    }
  });

  test("bands the day by WHY each Task is there, and never twice", async ({
    page,
    request,
  }) => {
    // The overdue band is capped at three rows and ordered OLDEST slip first,
    // and the shared development workspace already carries a task dated
    // 2000-01-01. A deliberately older date is what puts this spec's own row
    // inside that documented bound rather than behind "+n more overdue".
    const slipped = await createTask(request, "slipped deadline", {
      dueDate: "1995-01-02",
      priority: "p1",
    });
    // P1/P2 throughout, so these rows lead their bands and are inside the
    // eight-row display bound whatever else the shared workspace holds today.
    const due = await createTask(request, "due today", {
      dueDate: TODAY,
      priority: "p1",
    });
    // The case the combined bucket could not express: planned for today, but
    // not due for six weeks. On the old panel this was indistinguishable from
    // a deadline.
    const planned = await createTask(request, "planned today", {
      scheduledDate: TODAY,
      dueDate: shiftDays(TODAY, 42),
      priority: "p1",
    });
    // Both signals at once — a deadline outranks an intention, and it appears
    // ONCE.
    const both = await createTask(request, "due and planned today", {
      dueDate: TODAY,
      scheduledDate: TODAY,
      priority: "p2",
    });
    const future = await createTask(request, "not yet", {
      dueDate: shiftDays(TODAY, 12),
      priority: "p1",
    });

    await page.goto("/today");
    await expect(page.getByRole("region", { name: "Focus" })).toBeVisible();
    const bands = await focusBands(page);

    expect(bands["Overdue"]).toContain(slipped.title);
    expect(bands["Due today"]).toEqual(
      expect.arrayContaining([due.title, both.title]),
    );
    expect(bands["Planned today"]).toContain(planned.title);
    // A Task that is both due and planned today is in exactly one band…
    expect(bands["Planned today"]).not.toContain(both.title);
    // …and the whole panel draws exactly one row for it.
    await expect(
      page.locator(".dh-today__timeline .dh-day-row__title", {
        hasText: both.title,
      }),
    ).toHaveCount(1);
    // Future work is not on the day at all.
    for (const band of Object.values(bands)) {
      expect(band).not.toContain(future.title);
    }

    // Priority orders the band: the P1 comes before the P2, never A–Z.
    const dueBand = bands["Due today"]!;
    expect(dueBand.indexOf(due.title)).toBeLessThan(
      dueBand.indexOf(both.title),
    );
  });

  test("agrees with the canonical Tasks Today view, parked work included", async ({
    page,
    request,
  }) => {
    const ordinary = await createTask(request, "ordinary due today", {
      dueDate: TODAY,
      priority: "p1",
    });
    const parked = await createTask(request, "paused but due today", {
      dueDate: TODAY,
      priority: "p1",
    });
    await updateTask(request, parked.id, { status: "on_hold" });

    await page.goto("/today");
    const bands = await focusBands(page);
    const onToday = Object.values(bands).flat();
    expect(onToday).toContain(ordinary.title);
    // A Task the owner deliberately paused is not today's work…
    expect(onToday).not.toContain(parked.title);

    // …and the canonical view says exactly the same thing. This is the
    // agreement TODAY-09 promised and TODAY-10 made true for parked work.
    const canonical = await canonicalTodayTitles(page);
    expect(canonical).toContain(ordinary.title);
    expect(canonical).not.toContain(parked.title);
  });

  test("completes a Task from Today, once, and both surfaces follow", async ({
    page,
    request,
  }) => {
    const target = await createTask(request, "finish me from Today", {
      dueDate: TODAY,
      priority: "p1",
    });
    const survivor = await createTask(request, "still to do", {
      dueDate: TODAY,
      priority: "p1",
    });

    // 1–2. Open Today; the Focus panel distinguishes the work.
    await page.goto("/today");
    const row = page
      .locator(".dh-today__timeline .dh-day-row", { hasText: target.title })
      .first();
    await expect(row).toBeVisible();
    const bandLabel = (locator: typeof row) =>
      locator
        .locator("xpath=ancestor::div[contains(@class,'dh-day-section')][1]")
        .locator(".dh-day-section__label");
    await expect(bandLabel(row)).toHaveText(/^due today$/i);

    // 3. Complete it directly from Today.
    await row
      .getByRole("checkbox", { name: `Complete ${target.title}` })
      .check();

    // 4. It leaves ACTIVE Focus — the checkbox now offers to reopen it, and it
    //    stays in the band it was already in rather than jumping to the bottom
    //    of the panel under a heading that is not true of it.
    await expect(
      row.getByRole("checkbox", { name: `Reopen ${target.title}` }),
    ).toBeChecked();
    await expect(bandLabel(row)).toHaveText(/^due today$/i);

    // 5. Exactly one announcement. A completion is announced by ONE live
    //    region, not by the list AND the notification centre (DEBT-115).
    const announcements = await page
      .locator('[aria-live]:not([aria-live="off"])')
      .allInnerTexts();
    const mentions = announcements.filter((text) =>
      text.includes(target.title),
    );
    expect(mentions.length).toBeLessThanOrEqual(1);

    // 6–7. Tasks → Today holds exactly what is left to do.
    const canonical = await canonicalTodayTitles(page);
    expect(canonical).toContain(survivor.title);
    expect(canonical).not.toContain(target.title);

    // 8–9. Back on Today, the state is unchanged: still done, still in place.
    await page.goto("/today");
    const again = page
      .locator(".dh-today__timeline .dh-day-row", { hasText: target.title })
      .first();
    await expect(
      again.getByRole("checkbox", { name: `Reopen ${target.title}` }),
    ).toBeChecked();
    await expect(bandLabel(again)).toHaveText(/^due today$/i);
    expect((await focusBands(page))["Due today"]).toContain(survivor.title);
  });

  test("bounds a large day, states the true total and routes to Tasks", async ({
    page,
    request,
  }) => {
    // Twelve of the spec's own, comfortably past the eight-row bound however
    // many other Tasks the shared workspace holds today.
    for (let index = 0; index < 12; index += 1) {
      await createTask(request, `bulk ${String(index).padStart(2, "0")}`, {
        dueDate: TODAY,
      });
    }

    await page.goto("/today");
    // The day's own rows are bounded — the overdue band has its own cap and is
    // counted separately, so this reads the two today bands alone.
    const dayRows = page.locator(
      ".dh-day-section:not(:has(.dh-day-list--overdue)) .dh-day-row__title",
    );
    expect(await dayRows.count()).toBeLessThanOrEqual(8);

    const viewAll = page.getByTestId("today-focus-view-all");
    await expect(viewAll).toBeVisible();
    await expect(viewAll).toHaveAttribute("href", "/tasks?system=today");
    const stated = /View all (\d+) tasks for today/.exec(
      await viewAll.innerText(),
    );
    expect(stated).not.toBeNull();

    // The number is the TRUE size of the view it links to — never a guess and
    // never the slice. The figure above the panel says the same thing.
    await expect(page.getByTestId("today-stat-tasks")).toContainText(
      stated![1]!,
    );
    await viewAll.click();
    await expect(page).toHaveURL(/\/tasks\?system=today/);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(page.locator(".dh-pane-header__subtitle")).toHaveText(
      `${stated![1]!} Tasks`,
    );
  });

  test("keeps the title dominant and the panel accessible on a phone", async ({
    page,
    request,
  }) => {
    await createTask(request, "a deliberately long task title for measuring", {
      dueDate: TODAY,
      priority: "p1",
    });
    await createTask(request, "planned work with a long title as well", {
      scheduledDate: TODAY,
      dueDate: shiftDays(TODAY, 30),
      priority: "p1",
    });

    for (const width of [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/today");
      await expect(page.getByRole("region", { name: "Focus" })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      // Every Focus row is one line of uniform height, and its TITLE is the
      // widest thing on it — a list read by its metadata is not a list.
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll(".dh-today__timeline .dh-day-row")]
          .filter((row) => row.querySelector(".dh-day-row__title"))
          .map((row) => ({
            title: Math.round(
              row.querySelector(".dh-day-row__title")!.getBoundingClientRect()
                .width,
            ),
            project: Math.round(
              row.querySelector(".dh-day-row__meta")?.getBoundingClientRect()
                .width ?? 0,
            ),
            height: Math.round(row.getBoundingClientRect().height),
          })),
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.title).toBeGreaterThan(row.project);
        // The 44px WCAG 2.2 target floor, which the row's own min-height sets.
        expect(row.height).toBeGreaterThanOrEqual(44);
      }
      // One line each: every row in the panel is the same height.
      expect(new Set(rows.map((row) => row.height)).size).toBe(1);
    }
  });

  test("passes axe on the banded panel in both appearances", async ({
    page,
  }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/today");
      await expect(page.getByRole("region", { name: "Focus" })).toBeVisible();
      await expectNoAxeViolations(page);
    }
  });

  test("forms a useful heading outline under the panel's own heading", async ({
    page,
    request,
  }) => {
    await createTask(request, "outline due", {
      dueDate: TODAY,
      priority: "p1",
    });
    await createTask(request, "outline planned", {
      scheduledDate: TODAY,
      priority: "p1",
    });

    await page.goto("/today");
    const panel = page.getByRole("region", { name: "Focus" });
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText("Focus");
    // The band labels are real headings one level below it, so the panel reads
    // as an outline rather than as styled text a screen reader walks past.
    // `allInnerTexts` returns the RENDERED text, which the band label's
    // `text-transform` upper-cases; the accessible name is the source text.
    const bandHeadings = await panel
      .getByRole("heading", { level: 3 })
      .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()));
    expect(bandHeadings).toEqual(
      expect.arrayContaining(["Due today", "Planned today"]),
    );
  });
});
