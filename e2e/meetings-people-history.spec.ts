import { expect, test, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  postSameOrigin,
} from "./helpers";
import {
  cleanupAllMeetingFixtures,
  cleanupMeetingByTitle,
  uniqueMeetingTitle,
} from "./meetings-fixtures";
import { d1Execute } from "./d1";

/**
 * MEET-03 — Meetings contribute interaction history to the People timeline.
 *
 * A real journey over the seeded Worker/D1 app: two People, one Meeting, ONE of
 * them added as an attendee, the truthful "Mark as held" action, and then the
 * proof that matters — the event lands on the ATTENDEE's existing Activity tab
 * (not a new tab, not a new feed), survives the Conversations filter, navigates
 * back to the canonical Meeting, never reaches the unrelated Person, and cannot
 * be duplicated by a repeated submission.
 *
 * Plus the cross-cutting DS-11 guarantees for the new action: keyboard operation,
 * axe in light AND dark, no horizontal overflow at 390px and 320px, and a 44px
 * touch target.
 *
 * Every record it creates is title-prefixed and cleaned up after each test.
 */

const PERSON_PREFIX = "Meet03 e2e ";
const WS = "local-dev-workspace";

const PERSON_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = '${WS}' AND type = 'person' AND title LIKE '${PERSON_PREFIX}%'
`;
const PERSON_CLEANUP_SQL = [
  `DELETE FROM activity_subjects WHERE workspace_id = '${WS}' AND entity_id IN (${PERSON_QUERY});`,
  `DELETE FROM activities WHERE workspace_id = '${WS}' AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
  `DELETE FROM entity_links WHERE workspace_id = '${WS}' AND (source_entity_id IN (${PERSON_QUERY}) OR target_entity_id IN (${PERSON_QUERY}));`,
  `DELETE FROM person_details WHERE workspace_id = '${WS}' AND entity_id IN (${PERSON_QUERY});`,
  `DELETE FROM entities WHERE workspace_id = '${WS}' AND id IN (${PERSON_QUERY});`,
] as const;

/** This file's cleanup SQL, through the ONE shared D1 helper (see `./d1`). */
async function runD1Command(
  command: string | readonly string[],
): Promise<void> {
  d1Execute(command);
}

async function cleanupPeople(): Promise<void> {
  for (const command of PERSON_CLEANUP_SQL) {
    await runD1Command(command);
  }
}

const ownedMeetings = new Set<string>();

async function createPerson(page: Page, name: string): Promise<string> {
  await gotoFixture(page, "/people");
  await page.getByRole("link", { name: "New Person" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New Person" });
  await dialog.getByRole("textbox", { name: /^Name/ }).fill(name);
  await dialog.getByRole("button", { name: "Create person" }).click();
  await expect(page).toHaveURL(/\/person\/[^/?#]+$/);
  return page.url();
}

async function createMeeting(page: Page, title: string): Promise<string> {
  ownedMeetings.add(title);
  await gotoFixture(page, "/new/meeting");
  await page
    .getByRole("form", { name: "New meeting" })
    .getByLabel("Title")
    .fill(title);
  await page.getByLabel("Start date and time").fill("2026-07-27T09:00");
  await page.getByRole("button", { name: "Create meeting" }).click();
  await expect(page).toHaveURL(/\/meeting\/[^/?#]+\?tab=meeting$/);
  return page.url();
}

async function addAttendee(page: Page, personName: string): Promise<void> {
  await page.getByRole("tab", { name: "Details" }).click();
  const attendee = page.getByRole("combobox", { name: "Add attendees" });
  await attendee.click();
  await attendee.fill(personName);
  await page.getByRole("option", { name: personName }).click();
  await page.getByRole("button", { name: "Add selected" }).click();
  // Scoped to the Details tab: UIX-04 §27 also names the attendees on the
  // record's context line, so an unscoped link now matches in two places.
  await expect(
    page
      .getByRole("tabpanel", { name: "Details" })
      .getByRole("link", { name: new RegExp(personName) }),
  ).toBeVisible();
}

/** Open the shared DS-12 Record Header overflow for the current record. */
async function openRecordOverflow(page: Page, title: string) {
  const trigger = page.getByRole("button", {
    name: `More actions for ${title}`,
  });
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
  return trigger;
}

/** Perform the truthful domain action and wait on the real server response. */
async function markAsHeld(page: Page, title: string): Promise<void> {
  await openRecordOverflow(page, title);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/meeting\/[^/]+\/mutate$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "POST",
    ),
    page.getByRole("menuitem", { name: "Mark as held" }).click(),
  ]);
  const payload = (await response.json()) as {
    ok?: boolean;
    outcome?: string;
  };
  expect(payload.ok, JSON.stringify(payload)).toBe(true);
  expect(payload.outcome).toBe("recorded");
}

async function openPersonActivity(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(
    page.getByRole("feed", { name: "Person timeline" }),
  ).toBeVisible();
}

/** Narrow the Person timeline to the shared Conversations category (DS-07). */
async function filterToConversations(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /Add filter/ })
    .first()
    .click();
  const editor = page.getByRole("dialog", { name: "Add filter" });
  await editor
    .getByRole("combobox", { name: "Field" })
    .selectOption("personTimelineCategory");
  await editor.getByRole("combobox", { name: "Value" }).selectOption("meeting");
  await editor.getByRole("button", { name: "Add filter" }).click();
  await expect(page).toHaveURL(/personTimelineCategory/);
}

test.describe("MEET-03 — meetings on the People timeline", () => {
  test.beforeAll(async () => {
    await cleanupPeople();
    await cleanupAllMeetingFixtures();
  });
  test.afterEach(async () => {
    await cleanupPeople();
    for (const title of ownedMeetings) await cleanupMeetingByTitle(title);
    ownedMeetings.clear();
  });

  test("a held meeting reaches its attendee’s existing Activity tab, and only theirs", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const attendeeName = `${PERSON_PREFIX}Attendee ${stamp}`;
    const otherName = `${PERSON_PREFIX}Unrelated ${stamp}`;
    const meetingTitle = uniqueMeetingTitle("held");

    // 1–2. Two People and a Meeting.
    const attendeeUrl = await createPerson(page, attendeeName);
    const otherUrl = await createPerson(page, otherName);
    const meetingUrl = await createMeeting(page, meetingTitle);

    // 3. ONE of them attends.
    await addAttendee(page, attendeeName);

    // Before the action, the record says so in words — never colour alone.
    await expect(page.getByText("Not recorded as held yet")).toBeVisible();

    // 4. The truthful domain action.
    await markAsHeld(page, meetingTitle);

    // The outcome is stated in words — in the shared DS-10 feedback (and its
    // polite live region, so it is announced) and durably on the record itself.
    await expect(
      page.getByText("Meeting marked as held.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('.dh-feedback-live[aria-live="polite"]'),
    ).toContainText("Added to the timeline of 1 attendee");
    await expect(page.getByText(/Recorded as held on/)).toBeVisible();

    // 5–6. The attendee's ONE existing Activity tab carries the event. There is
    //      no Meetings tab and no second feed on the Person record.
    await page.goto(attendeeUrl);
    await openPersonActivity(page);
    const feed = page.getByRole("feed", { name: "Person timeline" });
    await expect(feed.getByText("Meeting held").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: "Meetings" })).toHaveCount(0);
    await expect(page.getByRole("feed")).toHaveCount(1);

    // 7. It survives the Conversations filter.
    await filterToConversations(page);
    await expect(feed.getByText("Meeting held").first()).toBeVisible();
    // The filter is URL-backed, so a reload keeps it (DS-07 contract).
    await page.reload();
    await expect(page).toHaveURL(/personTimelineCategory/);
    await expect(feed.getByText("Meeting held").first()).toBeVisible();

    // 8. THIS event navigates to the CANONICAL Meeting record — by reference to
    //    the record, never a copy of its content.
    const heldEvent = feed.getByRole("article", { name: /Meeting held/ });
    await expect(heldEvent).toHaveCount(1);
    await heldEvent
      .getByRole("link", { name: new RegExp(meetingTitle) })
      .click();
    await expect(page).toHaveURL(/\/meeting\/[^/?#]+/);
    await expect(
      page.getByRole("heading", { level: 1, name: meetingTitle }),
    ).toBeVisible();

    // 9. The unrelated Person never receives it.
    await page.goto(otherUrl);
    await openPersonActivity(page);
    await expect(page.getByText("Meeting held")).toHaveCount(0);
    await expect(page.getByText(new RegExp(meetingTitle))).toHaveCount(0);

    // 10. A repeated submission creates no duplicate. The UI shows the completed
    //     state (the item stays visible but disabled, saying when), and a direct
    //     re-submission through the same authenticated route reports
    //     `already_held` while the timeline still shows exactly one event.
    await page.goto(meetingUrl);
    await openRecordOverflow(page, meetingTitle);
    const done = page.getByRole("menuitem", { name: "Marked as held" });
    await expect(done).toBeVisible();
    await expect(done).toHaveAttribute("aria-disabled", "true");
    await page.keyboard.press("Escape");

    const meetingId = new URL(page.url()).pathname.split("/")[2]!;
    const repeat = await postSameOrigin(
      page.request,
      `/meeting/${meetingId}/mutate`,
      {
        form: { intent: "mark_held" },
      },
    );
    expect(repeat.ok()).toBe(true);
    expect((await repeat.json()).outcome).toBe("already_held");

    await page.goto(attendeeUrl);
    await openPersonActivity(page);
    await expect(feed.getByText("Meeting held")).toHaveCount(1);
  });

  test("the action is keyboard-operable and meets the phone target size", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const stamp = Date.now();
    const attendeeName = `${PERSON_PREFIX}Keyboard ${stamp}`;
    const meetingTitle = uniqueMeetingTitle("held-keyboard");

    await createPerson(page, attendeeName);
    await createMeeting(page, meetingTitle);
    await addAttendee(page, attendeeName);

    // The overflow trigger is a real focusable control that names its record,
    // opens from the keyboard, and exposes the held-state action in the current
    // shared menu order.
    const trigger = page.getByRole("button", {
      name: `More actions for ${meetingTitle}`,
    });
    await trigger.focus();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("ArrowDown");
    const item = page.getByRole("menuitem", { name: "Mark as held" });
    await expect(
      page.getByRole("menuitem", { name: "New follow-up task" }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(item).toBeFocused();

    // Escape closes only the menu and returns focus — no keyboard trap.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Enter runs it, from the keyboard alone.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/meeting\/[^/]+\/mutate$/.test(new URL(r.url()).pathname) &&
          r.request().method() === "POST",
      ),
      page.keyboard.press("Enter"),
    ]);
    expect((await response.json()).ok).toBe(true);
    await expect(page.getByText(/Recorded as held on/)).toBeVisible();
  });

  test("no WCAG violations in light or dark, and no overflow at 390px or 320px", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const attendeeName = `${PERSON_PREFIX}A11y ${stamp}`;
    const attendeeUrl = await createPerson(page, attendeeName);
    const meetingTitle = uniqueMeetingTitle("held-a11y");
    const meetingUrl = await createMeeting(page, meetingTitle);
    await addAttendee(page, attendeeName);
    await markAsHeld(page, meetingTitle);

    // The Meeting record, with the completed action open in the shared menu.
    await openRecordOverflow(page, meetingTitle);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectNoAxeViolations(page);
    }
    await page.emulateMedia({ colorScheme: "light" });
    await page.keyboard.press("Escape");

    // The attendee's timeline, now carrying the event.
    await page.goto(attendeeUrl);
    await openPersonActivity(page);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expectNoAxeViolations(page);
    }
    await page.emulateMedia({ colorScheme: "light" });

    // No horizontal overflow across the shared responsive matrix on the Person
    // timeline that now carries the event…
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expectNoHorizontalOverflow(page);
    }

    // …nor on the Meeting record carrying the new action, at the two phone
    // widths the DS-11 baseline names, including with the menu open.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(meetingUrl);
      await expect(
        page.getByRole("heading", { level: 1, name: meetingTitle }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await openRecordOverflow(page, meetingTitle);
      await expectNoHorizontalOverflow(page);
      await page.keyboard.press("Escape");
    }
  });
});

/**
 * The phone touch pass, in its own context because the shared DS-12 menu sizes its
 * trigger and items to the 44px token behind `hover: none` — a COARSE-POINTER
 * condition, not a viewport width. Emulating a real touch phone is therefore the
 * only way to assert what a phone user actually gets.
 */
test.describe("MEET-03 — the action on a phone", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test.beforeAll(async () => {
    await cleanupPeople();
    await cleanupAllMeetingFixtures();
  });
  test.afterEach(async () => {
    await cleanupPeople();
    for (const title of ownedMeetings) await cleanupMeetingByTitle(title);
    ownedMeetings.clear();
  });

  test("the trigger and the action both meet the 44px minimum", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const attendeeName = `${PERSON_PREFIX}Touch ${Date.now()}`;
    const meetingTitle = uniqueMeetingTitle("held-touch");

    await createPerson(page, attendeeName);
    await createMeeting(page, meetingTitle);
    await addAttendee(page, attendeeName);

    const trigger = page.getByRole("button", {
      name: `More actions for ${meetingTitle}`,
    });
    await expectMinTouchTarget(trigger);

    await trigger.click();
    await expectMinTouchTarget(
      page.getByRole("menuitem", { name: "Mark as held" }),
    );
    await expectNoHorizontalOverflow(page);
  });
});
