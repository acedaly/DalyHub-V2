import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import {
  cleanupAllMeetingFixtures,
  cleanupMeetingByTitle,
  uniqueMeetingTitle,
} from "./meetings-fixtures";

/**
 * MEET-02 — the meeting follow-through and Task-conversion journey, driven end to
 * end against the development-auth server over real D1. It creates a real Meeting
 * with an attendee, agenda item, decision and outcome, converts items into canonical
 * Tasks (opened in the shared Task Drawer), and exercises grouping, duplicate
 * prevention, the archived read-only state, bidirectional navigation, browser
 * history, accessibility and mobile. Every record it creates carries the shared
 * "Meetings e2e " title prefix, cleaned up after each test.
 */

const owned = new Set<string>();

async function createMeeting(page: Page, title: string): Promise<string> {
  owned.add(title);
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

/** Add a structured item via the consolidated Meeting workspace. */
async function addItem(
  page: Page,
  kindLabel: string,
  body: string,
): Promise<void> {
  await page.getByRole("tab", { name: "Notebook" }).click();
  // The field names the noun and the button names the act, so each control can
  // be asked for unambiguously — they used to share one accessible name.
  await page.getByRole("textbox", { name: `New ${kindLabel}` }).fill(body);
  await page.getByRole("button", { name: `Add ${kindLabel}` }).click();
  await expect(page.getByText(body, { exact: false })).toBeVisible();
}

/** Convert the item row containing `body` into a Task, editing planning fields. */
async function convertItem(
  page: Page,
  body: string,
  options: { title?: string; parent: string; priority?: string },
): Promise<void> {
  const row = page.locator(".dh-meeting-item", { hasText: body });
  await row.getByRole("button", { name: "Create task" }).click();
  const dialog = page.getByRole("dialog", { name: "New follow-up task" });
  await expect(dialog).toBeVisible();

  if (options.title) {
    await dialog.getByLabel("Title").fill(options.title);
  }
  const parent = dialog.getByRole("combobox", { name: /Project or Area/ });
  await parent.click();
  await parent.fill(options.parent);
  await dialog.getByRole("option", { name: options.parent }).click();

  if (options.priority) {
    const priority = dialog.getByRole("combobox", { name: "Priority" });
    await priority.click();
    await priority.fill(options.priority.split(" ")[0]!);
    await dialog
      .getByRole("option", { name: options.priority, exact: true })
      .click();
  }

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/meeting\/[^/]+\/follow-up$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "POST",
    ),
    dialog.getByRole("button", { name: "Create task" }).click(),
  ]);
  const payload = (await response.json()) as { ok?: boolean };
  expect(payload.ok, JSON.stringify(payload)).toBe(true);
  // The new task opens in the canonical shared Task Drawer.
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
}

/**
 * Close every open Drawer level with Escape, waiting on the real user-visible
 * state (one fewer dialog) after each press rather than on a fixed delay. A
 * Drawer close is a history navigation, so pressing Escape again before the
 * previous close has landed used to pop past the meeting record entirely — the
 * provider now guards against that, and this helper no longer provokes it.
 */
async function closeDrawer(page: Page): Promise<void> {
  const dialogs = page.getByRole("dialog");
  for (
    let open = await dialogs.count();
    open > 0;
    open = await dialogs.count()
  ) {
    await page.keyboard.press("Escape");
    await expect(dialogs).toHaveCount(open - 1);
  }
}

test.beforeAll(async () => {
  await cleanupAllMeetingFixtures();
});

test.afterEach(async () => {
  for (const title of owned) await cleanupMeetingByTitle(title);
  owned.clear();
});

test("converts meeting items into linked Tasks and groups the follow-up work", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("journey");
  await createMeeting(page, title);

  // Attendee (seeded person).
  await page.getByRole("tab", { name: "Details" }).click();
  const attendee = page.getByRole("combobox", { name: "Add attendees" });
  await attendee.click();
  await attendee.fill("Sarah Chen");
  await page.getByRole("option", { name: "Sarah Chen" }).click();
  await page.getByRole("button", { name: "Add selected" }).click();
  // Scoped to the tab that was just used: UIX-04 §27 put the attendees on the
  // record's context line as well, so an unscoped attendee link now matches
  // twice. Adding one is a Details-tab act, and this asserts it landed there.
  await expect(
    page
      .getByRole("tabpanel", { name: "Details" })
      .getByRole("link", { name: /Sarah Chen/ }),
  ).toBeVisible();

  await addItem(page, "agenda item", "Agenda: confirm the budget");
  await addItem(page, "decision", "Decision: proceed with vendor A");
  await addItem(page, "outcome", "Outcome: publish the recap");

  // Convert the agenda item, editing title + priority.
  await page.getByRole("tab", { name: "Notebook" }).click();
  await convertItem(page, "Agenda: confirm the budget", {
    title: "Confirm the FY budget",
    parent: "Website relaunch",
    priority: "P1 · Urgent",
  });
  await closeDrawer(page);

  // The item now offers "Open task"; opening restores focus to that control.
  await page.getByRole("tab", { name: "Notebook" }).click();
  const openButton = page
    .locator(".dh-meeting-item", { hasText: "Agenda: confirm the budget" })
    .getByRole("button", { name: "Open task" });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(openButton).toBeFocused();

  // Convert the decision and outcome too.
  await page.getByRole("tab", { name: "Notebook" }).click();
  await convertItem(page, "Decision: proceed with vendor A", {
    parent: "Website relaunch",
  });
  await closeDrawer(page);
  await page.getByRole("tab", { name: "Notebook" }).click();
  await convertItem(page, "Outcome: publish the recap", {
    parent: "Launch checklist",
  });
  await closeDrawer(page);

  // A direct follow-up (not tied to an item).
  await page.getByRole("tab", { name: "Follow-up" }).click();
  await page.getByRole("button", { name: "Add follow-up task" }).click();
  const directDialog = page.getByRole("dialog", { name: "New follow-up task" });
  await directDialog.getByLabel("Title").fill("Circulate meeting notes");
  const directParent = directDialog.getByRole("combobox", {
    name: /Project or Area/,
  });
  await directParent.click();
  await directParent.fill("Website relaunch");
  await directDialog.getByRole("option", { name: "Website relaunch" }).click();
  await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/meeting\/[^/]+\/follow-up$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "POST",
    ),
    directDialog.getByRole("button", { name: "Create task" }).click(),
  ]);
  await closeDrawer(page);

  // The Follow-up tab groups the four Tasks under Open.
  await page.getByRole("tab", { name: "Follow-up" }).click();
  await expect(page.getByRole("heading", { name: /Open \(4\)/ })).toBeVisible();

  // Duplicate conversion is prevented: the agenda item shows Open task, not Create.
  await page.getByRole("tab", { name: "Notebook" }).click();
  await expect(openButton).toBeVisible();
  await expect(
    page
      .locator(".dh-meeting-item", { hasText: "Agenda: confirm the budget" })
      .getByRole("button", { name: "Create task" }),
  ).toHaveCount(0);

  // Task → Meeting navigation: open a task, follow its linked meeting back.
  await openButton.click();
  const taskDrawer = page.getByRole("dialog", { name: "Task" });
  await expect(taskDrawer).toBeVisible();
  await taskDrawer.getByRole("tab", { name: /Link/ }).click();
  await taskDrawer.getByRole("link", { name: new RegExp(title) }).click();
  await expect(page).toHaveURL(/\/meeting\/[^/?#]+/);
});

test("an archived meeting is read-only but its Tasks stay navigable", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("archived");
  await createMeeting(page, title);
  await addItem(page, "decision", "Decision: keep the venue");
  await page.getByRole("tab", { name: "Notebook" }).click();
  await convertItem(page, "Decision: keep the venue", {
    parent: "Website relaunch",
  });
  await closeDrawer(page);

  // Archive from Settings (the button flips to Restore once archived).
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Archive Meeting/i }).click();
  await expect(
    page.getByRole("button", { name: /Restore Meeting/i }),
  ).toBeVisible();

  // Creation controls are gone; the linked Task is still openable.
  await page.getByRole("tab", { name: "Follow-up" }).click();
  await expect(
    page.getByRole("button", { name: "Add follow-up task" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Notebook" }).click();
  await expect(
    page
      .locator(".dh-meeting-item", { hasText: "Decision: keep the venue" })
      .getByRole("button", { name: "Create task" }),
  ).toHaveCount(0);
  // UIX-04 — and the prose bodies with them. The repository refuses every write
  // to an archived meeting, so an autosaving editor on the tab this record now
  // OPENS on would be an invitation to type and then be told no. Both bodies are
  // still there, still named, and no longer writable.
  for (const body of ["Agenda", "Notes"]) {
    const region = page.getByRole("group", { name: body, exact: true });
    await expect(region).toBeVisible();
    await expect(region.getByRole("textbox")).toHaveCount(0);
    await expect(region.getByRole("toolbar")).toHaveCount(0);
  }
  await page
    .locator(".dh-meeting-item", { hasText: "Decision: keep the venue" })
    .getByRole("button", { name: "Open task" })
    .click();
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
});

test("browser Back/Forward and refresh preserve the tab and Drawer", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("history");
  const url = await createMeeting(page, title);
  await addItem(page, "decision", "Decision: schedule the review");
  await page.getByRole("tab", { name: "Notebook" }).click();
  await convertItem(page, "Decision: schedule the review", {
    parent: "Website relaunch",
  });
  // The Task Drawer is open and encoded in the URL.
  await expect(page).toHaveURL(/drawer=task%3A/);
  // Refresh restores the drawer from the URL.
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  // Back closes the drawer; Forward restores it.
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
  void url;
});

/**
 * AUDIT-FIX-02 — the browser half of the meeting-item positioning regression.
 *
 * The kernel suite (`test/kernel/meeting-item-positioning.test.ts`) owns the
 * allocation invariants; this covers only what a browser can: that the ordinary
 * edit sequence a user performs — add several items, remove one that is not last,
 * add another of the same kind — completes on the real screen, persists, and
 * leaves the surviving items in the right order.
 */
test("an item of the same kind can still be added after removing a non-last one", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("item-positions");
  await createMeeting(page, title);
  await addItem(page, "agenda item", "Agenda: confirm the budget");
  await addItem(page, "agenda item", "Agenda: approve the hires");
  await addItem(page, "agenda item", "Agenda: review the roadmap");

  // Remove the FIRST of three — the sequence that used to leave the agenda kind
  // permanently un-addable.
  await page.getByRole("tab", { name: "Notebook" }).click();
  const removed = page.locator(".dh-meeting-item", {
    hasText: "Agenda: confirm the budget",
  });
  await removed.getByRole("button", { name: "Remove agenda item" }).click();
  await expect(removed).toHaveCount(0);

  // `addItem` fails the test if the item does not appear, so this IS the assertion
  // that the previously-failing save now succeeds.
  await addItem(page, "agenda item", "Agenda: name the risks");

  // The survivors are untouched and the new item sorts last — after a reload, so
  // this is the persisted order and not an optimistic client render.
  await page.reload();
  await page.getByRole("tab", { name: "Notebook" }).click();
  await expect(
    page.locator(".dh-meeting-item", { hasText: "Agenda: " }),
  ).toHaveText([
    /Agenda: approve the hires/,
    /Agenda: review the roadmap/,
    /Agenda: name the risks/,
  ]);
});

for (const scheme of ["light", "dark"] as const) {
  test(`follow-up surface passes axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const title = uniqueMeetingTitle(`axe-${scheme}`);
    await createMeeting(page, title);
    await addItem(page, "action item", "Action: axe check");
    await page.getByRole("tab", { name: "Follow-up" }).click();
    await expect(
      page.getByRole("button", { name: "Add follow-up task" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
}

for (const width of [390, 320]) {
  test(`follow-up surface has no horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    const title = uniqueMeetingTitle(`mobile-${width}`);
    await createMeeting(page, title);
    await addItem(
      page,
      "action item",
      "Action: a deliberately long action line that must wrap without widening the page on a narrow phone viewport",
    );
    await page.getByRole("tab", { name: "Follow-up" }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("tab", { name: "Notebook" }).click();
    await expectNoHorizontalOverflow(page);
  });
}
