import { expect, test, type Page } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";
import { gotoFixture, postSameOrigin, todayDayPanel } from "./helpers";

/**
 * ADR-080 / AUDIT-FIX-06 — there is ONE owner day, and it is not the machine's.
 *
 * Every date-sensitive module answers "is this today?" from the owner's timezone
 * preference. That rule has kernel and unit coverage, but nothing proved it end
 * to end ACROSS MODULES: a regression in one loader's date resolution shows up as
 * Today and Tasks disagreeing about the same task, which is exactly the kind of
 * thing a person notices and a green suite does not.
 *
 * ── Why this cannot be fooled by the runner's clock ──────────────────────────
 * The failure being hunted is "the code used the UTC day instead of the owner's",
 * and for most of every UTC day those two are the SAME date — so a run at the
 * wrong hour would pass against the very bug the test exists to catch. The zone
 * is therefore CHOSEN from the current UTC hour so the owner's calendar day is
 * guaranteed to differ from the UTC one right now:
 *
 *   - UTC 10:00–23:59 → UTC+14, where the owner is already on TOMORROW;
 *   - UTC 00:00–09:59 → UTC−11, where the owner is still on YESTERDAY.
 *
 * Between them they cover all 24 hours, so every assertion below is a real
 * assertion at any hour the suite runs. Neither zone is in the Settings
 * vocabulary, deliberately: the point is an extreme offset no fixture uses.
 *
 * The preference is restored in a `finally`, and every record is prefixed `E2E `
 * so the seed clears anything a crashed run leaves behind.
 */

const WORKSPACE_ID = "local-dev-workspace";
const DEFAULT_TIMEZONE = "Australia/Sydney";

/** Titles this spec created, removed in `afterAll`. */
const created = new Set<string>();

/* -------------------------------------------------------------------------- */
/* Choosing a zone that provably is not on the UTC day                         */
/* -------------------------------------------------------------------------- */

/** Which way the owner's calendar day sits relative to UTC's, right now. */
type Relation = "ahead" | "behind";

function farZoneForNow(now: Date): { zone: string; relation: Relation } {
  return now.getUTCHours() >= 10
    ? { zone: "Pacific/Kiritimati", relation: "ahead" } // UTC+14
    : { zone: "Pacific/Niue", relation: "behind" }; // UTC−11
}

function calendarDay(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(now);
}

function longDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(now);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

function removeTask(title: string): void {
  const selection = `
    SELECT id FROM entities
    WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
      AND type = 'task'
      AND title = ${sqlLiteral(title)}
  `;
  d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN (${selection});`,
    `DELETE FROM activities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND (source_entity_id IN (${selection}) OR target_entity_id IN (${selection}));`,
    `DELETE FROM task_details WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN (${selection});`,
    `DELETE FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND id IN (${selection});`,
  ]);
}

/** Set the owner's timezone through the canonical Settings intent. */
async function setTimezone(page: Page, zone: string): Promise<void> {
  const response = await postSameOrigin(page.request, "/settings", {
    form: { intent: "update", field: "timezone", value: zone },
  });
  expect(response.ok(), `setting the owner timezone to ${zone}`).toBe(true);
}

/** Capture a dated Task through the canonical creation route. */
async function captureDueTask(
  page: Page,
  title: string,
  day: string,
): Promise<void> {
  created.add(title);
  const response = await postSameOrigin(page.request, "/tasks/new", {
    form: { title, dueDate: day, scheduledDate: day },
    maxRedirects: 0,
  });
  expect(response.status()).toBeLessThan(400);
}

test.afterAll(() => {
  for (const title of created) removeTask(title);
  created.clear();
});

test("every date-sensitive module names the OWNER's calendar day, not the runner's", async ({
  page,
}) => {
  // Three navigations, two record creations and five assertions across four
  // modules; the 30s default is sized for one interaction, not a journey.
  test.setTimeout(90_000);

  const now = new Date();
  const { zone, relation } = farZoneForNow(now);
  const ownerDay = calendarDay(now, zone);
  const utcDay = calendarDay(now, "UTC");

  // The whole spec rests on this, so it is asserted rather than assumed: if it
  // were ever false, every assertion below would quietly become vacuous.
  expect(ownerDay, `${zone} must not be on the UTC calendar day`).not.toBe(
    utcDay,
  );

  const stamp = Date.now();
  const dueOnOwnerDay = `E2E tz owner day ${stamp}`;
  const dueOnUtcDay = `E2E tz utc day ${stamp}`;

  await gotoFixture(page, "/today");
  await setTimezone(page, zone);
  try {
    await captureDueTask(page, dueOnOwnerDay, ownerDay);
    await captureDueTask(page, dueOnUtcDay, utcDay);

    // 1. TODAY states the owner's day in words — and never the runner's.
    await gotoFixture(page, "/today");
    await expect(page.getByText(longDate(now, zone))).toBeVisible();
    await expect(page.getByText(longDate(now, "UTC"))).toHaveCount(0);

    // 2. …and the task dated for that day is ON the day, actionable.
    await expect(
      todayDayPanel(page).getByRole("checkbox", {
        name: `Complete ${dueOnOwnerDay}`,
      }),
    ).toBeVisible();

    // 3. TASKS agrees: its "today" view holds the same task…
    await gotoFixture(page, "/tasks?view=list&system=today");
    await expect(page.getByText(dueOnOwnerDay).first()).toBeVisible();

    // …and does NOT hold the one dated by the UTC clock, which is a different
    // calendar day for this owner. This is the assertion that fails the moment
    // any loader resolves "today" from the runtime instead of the preference.
    await expect(page.getByText(dueOnUtcDay)).toHaveCount(0);

    // 4. OVERDUE is computed on the same calendar. When the owner is ahead of
    //    UTC the UTC day is their yesterday, so it has slipped; when the owner
    //    is behind, it is their tomorrow and has not.
    await gotoFixture(page, "/tasks?view=list&system=overdue");
    if (relation === "ahead") {
      await expect(page.getByText(dueOnUtcDay).first()).toBeVisible();
    } else {
      await expect(page.getByText(dueOnUtcDay)).toHaveCount(0);
    }

    // 5. DIARY opens on the same day, stated machine-readably by its picker.
    await gotoFixture(page, "/diary");
    await expect(page.getByLabel("Select date")).toHaveValue(ownerDay);
  } finally {
    await setTimezone(page, DEFAULT_TIMEZONE);
  }

  // 6. Restoring the preference restores the day everywhere — the timezone is
  //    the only thing that was deciding it.
  await gotoFixture(page, "/diary");
  await expect(page.getByLabel("Select date")).toHaveValue(
    calendarDay(new Date(), DEFAULT_TIMEZONE),
  );
});
