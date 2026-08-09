/**
 * AUDIT-13 — the meeting item → Task conversion, driven through the real app.
 *
 * The kernel suite proves the transaction (`test/kernel/audit-13-atomic-operations.test.ts`).
 * This proves the thing the owner can actually do to it: a double-submitted or
 * retried conversion must end in ONE Task, and a refused one must leave the item
 * exactly as it was. It drives the real dev-auth server over real D1 and asserts
 * against what the application then shows — the Follow-up tab's own count and the
 * item's own control — rather than against a response body alone.
 *
 * The duplicate submission is made by intercepting the conversion request the UI
 * itself sends and replaying it, so the request under test is genuinely the one
 * the product builds: no test-only attribute, no hand-assembled form, no id
 * scraped out of the DOM.
 */

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";
import {
  cleanupAllMeetingFixtures,
  cleanupMeetingByTitle,
  uniqueMeetingTitle,
} from "./meetings-fixtures";

const owned = new Set<string>();

test.beforeAll(async () => {
  await cleanupAllMeetingFixtures();
});

test.afterEach(async () => {
  for (const title of owned) await cleanupMeetingByTitle(title);
  owned.clear();
});

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
  return new URL(page.url()).pathname.split("/")[2]!;
}

async function addAction(page: Page, body: string): Promise<void> {
  await page.getByRole("tab", { name: "Meeting" }).click();
  await page.getByRole("textbox", { name: "New action item" }).fill(body);
  await page.getByRole("button", { name: "Add action item" }).click();
  await expect(
    page.locator(".dh-meeting-item", { hasText: body }),
  ).toBeVisible();
}

/** Open the item's conversion dialog, fill the required parent, and submit. */
async function convert(
  page: Page,
  body: string,
  parent = "Website relaunch",
): Promise<void> {
  await page.getByRole("tab", { name: "Meeting" }).click();
  const row = page.locator(".dh-meeting-item", { hasText: body });
  await row.getByRole("button", { name: "Create task" }).click();
  const dialog = page.getByRole("dialog", { name: "New follow-up task" });
  await expect(dialog).toBeVisible();
  const picker = dialog.getByRole("combobox", { name: /Project or Area/ });
  await picker.click();
  await picker.fill(parent);
  await dialog.getByRole("option", { name: parent }).click();
  await Promise.all([
    page.waitForResponse(
      (r) =>
        /\/meeting\/[^/]+\/follow-up$/.test(new URL(r.url()).pathname) &&
        r.request().method() === "POST",
    ),
    dialog.getByRole("button", { name: "Create task" }).click(),
  ]);
}

/** Close every open Drawer level, waiting on the real state after each press. */
async function closeDrawers(page: Page): Promise<void> {
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

test("a double-submitted conversion creates exactly one Task", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("double-submit");
  const meetingId = await createMeeting(page, title);
  const body = `${title} — ship the recap`;
  await addAction(page, body);

  // Send the conversion request TWICE, both in flight before either answers —
  // the double click a slow connection produces. The page is answered with the
  // first response; the second is the duplicate the database has to refuse.
  let duplicated = 0;
  await page.route("**/follow-up", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    duplicated += 1;
    const [primary] = await Promise.all([
      route.fetch(),
      route.fetch(), // the duplicate submission
    ]);
    await route.fulfill({ response: primary });
  });

  await convert(page, body);
  await page.unroute("**/follow-up");
  expect(duplicated, "the conversion request was intercepted").toBe(1);
  await closeDrawers(page);

  // What the application now shows, read back from the database.
  await gotoFixture(page, `/meeting/${meetingId}?tab=follow-up`);
  await expect(page.getByRole("heading", { name: /Open \(1\)/ })).toBeVisible();

  await page.getByRole("tab", { name: "Meeting" }).click();
  const row = page.locator(".dh-meeting-item", { hasText: body });
  await expect(row.getByRole("button", { name: "Open task" })).toBeVisible();
  await expect(row.getByRole("button", { name: "Create task" })).toHaveCount(0);
});

test("replaying the conversion request verbatim returns the same Task", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("idempotent");
  const meetingId = await createMeeting(page, title);
  const body = `${title} — book the venue`;
  await addAction(page, body);

  // Capture the EXACT request the product sends, bytes and headers, so the
  // replay below is the same request rather than a hand-built approximation.
  let captured: {
    url: string;
    headers: Record<string, string>;
    body: Buffer;
  } | null = null;
  await page.route("**/follow-up", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    captured = {
      url: route.request().url(),
      headers: route.request().headers(),
      body: route.request().postDataBuffer()!,
    };
    await route.continue();
  });
  await convert(page, body);
  await page.unroute("**/follow-up");
  await closeDrawers(page);
  expect(captured, "the conversion request was captured").not.toBeNull();

  // The retry an owner cannot tell apart from the first attempt.
  const replay = await page.request.post(captured!.url, {
    headers: captured!.headers,
    data: captured!.body,
  });
  const result = (await replay.json()) as { ok: boolean; created: boolean };
  expect(result.ok, JSON.stringify(result)).toBe(true);
  // Idempotent: the SAME conversion is reported, and nothing new was created.
  expect(result.created).toBe(false);

  await gotoFixture(page, `/meeting/${meetingId}?tab=follow-up`);
  await expect(page.getByRole("heading", { name: /Open \(1\)/ })).toBeVisible();
});

test("a refused conversion leaves the item exactly as it was", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("refused");
  const meetingId = await createMeeting(page, title);
  const body = `${title} — chase the invoice`;
  await addAction(page, body);

  // Rewrite the request in flight to name a Project that does not exist. The
  // Task's entity insert is parent-gated, so the whole batch changes nothing.
  await page.route("**/follow-up", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const original = route.request().postData() ?? "";
    await route.continue({
      postData: original.replace(
        /(name="parentId"\r?\n\r?\n)[^\r\n]*/,
        "$100000000-0000-4000-8000-000000000000",
      ),
    });
  });
  await convert(page, body);
  await page.unroute("**/follow-up");

  // The dialog reports the refusal and stays open — nothing was created.
  await expect(
    page.getByRole("dialog", { name: "New follow-up task" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await gotoFixture(page, `/meeting/${meetingId}?tab=follow-up`);
  await expect(page.getByRole("heading", { name: /Open \(1\)/ })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: "Meeting" }).click();
  await expect(
    page
      .locator(".dh-meeting-item", { hasText: body })
      .getByRole("button", { name: "Create task" }),
  ).toBeVisible();
});
