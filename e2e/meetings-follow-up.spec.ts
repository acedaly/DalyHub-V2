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
  await page.getByLabel("Starts").fill("2026-07-27T09:00");
  await page.getByRole("button", { name: "Create meeting" }).click();
  await expect(page).toHaveURL(/\/meeting\/[^/?#]+$/);
  return page.url();
}

/** Add a structured item of a kind via its tab's add form. */
async function addItem(
  page: Page,
  tab: string,
  addLabel: string,
  body: string,
): Promise<void> {
  await page.getByRole("tab", { name: tab }).click();
  await page.getByLabel(addLabel).fill(body);
  await page.getByRole("button", { name: addLabel }).click();
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

async function closeDrawer(page: Page): Promise<void> {
  for (let i = 0; i < 4 && (await page.getByRole("dialog").count()) > 0; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
  await page.getByRole("tab", { name: "Summary" }).click();
  await page.getByLabel("Add attendee").selectOption({ label: "Sarah Chen" });
  await page.getByRole("button", { name: "Add attendee" }).click();
  await expect(page.getByRole("link", { name: /Sarah Chen/ })).toBeVisible();

  await addItem(
    page,
    "Agenda",
    "Add agenda item",
    "Agenda: confirm the budget",
  );
  await addItem(
    page,
    "Decisions",
    "Add decision",
    "Decision: proceed with vendor A",
  );
  await addItem(page, "Outcomes", "Add outcome", "Outcome: publish the recap");

  // Convert the agenda item, editing title + priority.
  await page.getByRole("tab", { name: "Agenda" }).click();
  await convertItem(page, "Agenda: confirm the budget", {
    title: "Confirm the FY budget",
    parent: "Website relaunch",
    priority: "P1 · Do",
  });
  await closeDrawer(page);

  // The item now offers "Open task"; opening restores focus to that control.
  await page.getByRole("tab", { name: "Agenda" }).click();
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
  await page.getByRole("tab", { name: "Decisions" }).click();
  await convertItem(page, "Decision: proceed with vendor A", {
    parent: "Website relaunch",
  });
  await closeDrawer(page);
  await page.getByRole("tab", { name: "Outcomes" }).click();
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
  await page.getByRole("tab", { name: "Agenda" }).click();
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
  await addItem(page, "Decisions", "Add decision", "Decision: keep the venue");
  await page.getByRole("tab", { name: "Decisions" }).click();
  await convertItem(page, "Decision: keep the venue", {
    parent: "Website relaunch",
  });
  await closeDrawer(page);

  // Archive from Settings.
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Archive meeting" }).click();
  await expect(page.getByText("Archived")).toBeVisible();

  // Creation controls are gone; the linked Task is still openable.
  await page.getByRole("tab", { name: "Follow-up" }).click();
  await expect(
    page.getByRole("button", { name: "Add follow-up task" }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Decisions" }).click();
  await expect(
    page
      .locator(".dh-meeting-item", { hasText: "Decision: keep the venue" })
      .getByRole("button", { name: "Create task" }),
  ).toHaveCount(0);
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
  await addItem(
    page,
    "Decisions",
    "Add decision",
    "Decision: schedule the review",
  );
  await page.getByRole("tab", { name: "Decisions" }).click();
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

for (const scheme of ["light", "dark"] as const) {
  test(`follow-up surface passes axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const title = uniqueMeetingTitle(`axe-${scheme}`);
    await createMeeting(page, title);
    await addItem(page, "Decisions", "Add decision", "Decision: axe check");
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
      "Decisions",
      "Add decision",
      "Decision: a deliberately long decision line that must wrap without widening the page on a narrow phone viewport",
    );
    await page.getByRole("tab", { name: "Follow-up" }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("tab", { name: "Decisions" }).click();
    await expectNoHorizontalOverflow(page);
  });
}
