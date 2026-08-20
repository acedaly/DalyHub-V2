import { expect, test, type Locator, type Page } from "@playwright/test";

import { DEV_ORIGIN } from "./dev-server";
import { gotoFixture } from "./helpers";
import {
  cleanupAllMeetingFixtures,
  cleanupMeetingByTitle,
  uniqueMeetingTitle,
} from "./meetings-fixtures";

/**
 * HARDEN-06B (F-01) — two writers on one Meeting, in a real browser.
 *
 * The defect this proves closed: a Meeting's agenda and notes are WHOLE
 * documents that the Notebook autosaves in full, and the write had no
 * precondition at all. Two tabs, or a laptop and a phone, and whichever saved
 * second silently replaced the other's paragraphs — with no trace and no
 * recovery, because `meeting.updated` carries an empty payload and there is no
 * revision history.
 *
 * The kernel suite (`test/kernel/meeting-content-concurrency.test.ts`) proves
 * the repository and the route's `409`. This proves the half that lives in the
 * browser and cannot be proved anywhere else: that the EDITOR quotes its base
 * version, that a refusal lands in the shared `RemoteChangeBanner` rather than
 * as a broken save, that the owner's draft is still in front of them, and that
 * both recoveries work. `e2e/notes.spec.ts` has the same pair of journeys for
 * the Note body; these are deliberately their shape, because the whole point of
 * the fix is that there is ONE reconciliation contract rather than two.
 *
 * Every record it creates carries the shared "Meetings e2e " title prefix and is
 * cleaned up after each test.
 */

const owned = new Set<string>();

/** The Notebook has TWO editors (Agenda and Notes), so every locator is scoped
 * to one of them by name. A page-wide `[data-editor-ready]` could be satisfied
 * by the other one — the exact ambiguity HARDEN-06A found in `reviews-guided`. */
function editorGroup(page: Page, label: "Agenda" | "Notes"): Locator {
  return page.getByRole("group", { name: label });
}

async function waitForEditor(
  page: Page,
  label: "Agenda" | "Notes",
): Promise<Locator> {
  const group = editorGroup(page, label);
  await expect(group).toHaveAttribute("data-editor-ready", "true", {
    timeout: 30_000,
  });
  return group;
}

async function openNotebook(page: Page): Promise<void> {
  await page.getByRole("tab", { name: "Notebook" }).click();
  await waitForEditor(page, "Notes");
}

/** Replace the named editor's whole document with `text`. */
async function clearAndType(
  page: Page,
  label: "Agenda" | "Notes",
  text: string,
): Promise<void> {
  const group = await waitForEditor(page, label);
  await group.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text);
}

/** Blur the editor to force an immediate autosave. */
async function blurEditor(
  page: Page,
  label: "Agenda" | "Notes",
): Promise<void> {
  await editorGroup(page, label)
    .locator(".cm-content")
    .evaluate((el) => (el as HTMLElement).blur());
}

/**
 * Read the editor's visible line text WITHOUT focusing it. Focusing would blur
 * on the next click and change what the product does, which matters here: the
 * whole journey is about when a save is attempted.
 */
async function readVisible(
  page: Page,
  label: "Agenda" | "Notes",
): Promise<string> {
  await waitForEditor(page, label);
  return editorGroup(page, label)
    .locator(".cm-content")
    .evaluate((el) =>
      Array.from(el.querySelectorAll(".cm-line"))
        .map((line) => line.textContent ?? "")
        .join("\n"),
    );
}

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

/**
 * The OTHER device: a same-origin POST through the real mutation route, quoting
 * NO base version — which is exactly what a writer that loaded the meeting
 * independently would send if it had never seen ours.
 */
async function saveFromAnotherDevice(
  page: Page,
  meetingUrl: string,
  notes: string,
): Promise<void> {
  const meetingId = new URL(meetingUrl).pathname.split("/").pop()!;
  const status = await page.evaluate(
    async ([id, body]) => {
      const form = new URLSearchParams();
      form.set("intent", "update");
      form.set("notesMarkdown", body!);
      const response = await fetch(
        `/meeting/${encodeURIComponent(id!)}/mutate`,
        {
          method: "POST",
          body: form,
          headers: { "content-type": "application/x-www-form-urlencoded" },
        },
      );
      return response.status;
    },
    [meetingId, notes] as const,
  );
  expect(status).toBe(200);
}

async function storedNotes(page: Page, meetingUrl: string): Promise<string> {
  const meetingId = new URL(meetingUrl).pathname.split("/").pop()!;
  return page.evaluate(async (id) => {
    const response = await fetch(`/meeting/${encodeURIComponent(id)}`, {
      headers: { accept: "text/html" },
    });
    return response.text();
  }, meetingId);
}

test.beforeAll(async () => {
  await cleanupAllMeetingFixtures();
});

test.afterEach(async () => {
  for (const title of owned) await cleanupMeetingByTitle(title);
  owned.clear();
});

test("refuses the stale save, keeps both versions, and recovers", async ({
  page,
}) => {
  const title = uniqueMeetingTitle("conflict");
  const meetingUrl = await createMeeting(page, title);
  await openNotebook(page);

  await clearAndType(page, "Notes", "Shared opening line.");
  await blurEditor(page, "Notes");
  await expect(page.getByText("Saved").first()).toBeVisible();

  // The other device writes while this editor sits on the version it loaded.
  await saveFromAnotherDevice(
    page,
    meetingUrl,
    "Shared opening line.\n\nAda: the budget is approved.",
  );

  // This browser keeps writing against the version it still holds, and saves.
  await clearAndType(
    page,
    "Notes",
    "Shared opening line.\n\nGrace: we ship on Friday.",
  );
  await blurEditor(page, "Notes");

  // 1. The owner is told, through the shared banner, in plain words.
  const banner = page.getByRole("status", { name: "Changed elsewhere" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("nothing has been overwritten");
  // It is not presented as a broken save there is nothing useful to retry.
  await expect(page.getByText("Couldn’t save")).toBeHidden();

  // 2. This browser's own words are exactly where they were left.
  expect(await readVisible(page, "Notes")).toContain("we ship on Friday");

  // 3. The other device's words are still the stored truth. This is the
  //    assertion the whole finding is about: before the fix they were gone.
  await expect
    .poll(async () => storedNotes(page, meetingUrl))
    .toContain("the budget is approved");

  // Recovery: take the newer version, edit on top of it, and save cleanly.
  await page.getByRole("button", { name: "Load the newer version" }).click();
  await expect
    .poll(async () => readVisible(page, "Notes"))
    .toContain("the budget is approved");

  await clearAndType(
    page,
    "Notes",
    "Shared opening line.\n\nAda: the budget is approved.\n\nGrace: we ship on Friday.",
  );
  await blurEditor(page, "Notes");
  await expect(page.getByText("Saved").first()).toBeVisible();

  await gotoFixture(page, meetingUrl);
  await openNotebook(page);
  const merged = await readVisible(page, "Notes");
  expect(merged).toContain("the budget is approved");
  expect(merged).toContain("we ship on Friday");
});

test("a SECOND real tab is the other writer, and neither loses its words", async ({
  page,
  browser,
}) => {
  // The journey above simulates the other writer with a `fetch`, which proves
  // the endpoint. This one gives the other writer a real browser context with
  // its own cookie jar and its own editor, which is what the owner actually has
  // when they leave DalyHub open on a laptop and a phone.
  const title = uniqueMeetingTitle("two-tabs");
  const meetingUrl = await createMeeting(page, title);
  await openNotebook(page);
  await clearAndType(page, "Notes", "One shared opening line.");
  await blurEditor(page, "Notes");
  await expect(page.getByText("Saved").first()).toBeVisible();

  const second = await browser.newContext({ baseURL: DEV_ORIGIN });
  const other = await second.newPage();
  try {
    // Both tabs are now holding the SAME version.
    await gotoFixture(other, meetingUrl);
    await openNotebook(other);

    // The other tab saves first, cleanly.
    await clearAndType(
      other,
      "Notes",
      "One shared opening line.\n\nFrom the laptop.",
    );
    await blurEditor(other, "Notes");
    await expect(other.getByText("Saved").first()).toBeVisible();

    // This tab saves against the version it still holds. It must be refused.
    await clearAndType(
      page,
      "Notes",
      "One shared opening line.\n\nFrom the phone.",
    );
    await blurEditor(page, "Notes");

    const banner = page.getByRole("status", { name: "Changed elsewhere" });
    await expect(banner).toBeVisible();

    // Neither writer lost anything: this tab still holds its draft…
    expect(await readVisible(page, "Notes")).toContain("From the phone.");
    // …and the other tab's words are still what the meeting actually says.
    await gotoFixture(other, meetingUrl);
    await openNotebook(other);
    const stored = await readVisible(other, "Notes");
    expect(stored).toContain("From the laptop.");
    expect(stored).not.toContain("From the phone.");
  } finally {
    await second.close();
  }
});

test("clearing the notes to empty actually empties them", async ({ page }) => {
  // HARDEN-06B — the route coerced an empty submission to `null`, which the
  // repository's merge reads as "not supplied", so select-all-delete-save
  // reported success and changed nothing: the old text came back on reload.
  const title = uniqueMeetingTitle("clear");
  const meetingUrl = await createMeeting(page, title);
  await openNotebook(page);

  await clearAndType(page, "Notes", "Something written by mistake.");
  await blurEditor(page, "Notes");
  await expect(page.getByText("Saved").first()).toBeVisible();

  const group = await waitForEditor(page, "Notes");
  await group.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await blurEditor(page, "Notes");
  await expect(page.getByText("Saved").first()).toBeVisible();

  await gotoFixture(page, meetingUrl);
  await openNotebook(page);
  expect(await readVisible(page, "Notes")).not.toContain("by mistake");
});
