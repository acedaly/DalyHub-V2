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

test("a second save made before the reload lands is not a conflict with itself", async ({
  page,
}) => {
  /*
   * The window this closes is the editor's own: every save quotes the version
   * it was written against, and until this fix the only way to learn the
   * version a save PRODUCED was the revalidation `onSaved()` asks for. Between
   * the save resolving and that reload landing, the editor still held the
   * pre-save version — so a second save started in that window quoted a
   * superseded version and the server refused it, correctly and uselessly: the
   * "changed elsewhere" it reported was the owner's own previous keystrokes.
   *
   * On CI the window opened by itself under load (`:282` timing out in
   * `page.waitForResponse` on runs 32629099619, 32818657005 and 33980952506,
   * all p08). Here it is opened DELIBERATELY, by holding the reload, so the
   * test fails on the defect rather than on the runner's mood — the same shape
   * `tasks-collection.spec.ts` uses to hold a `.data` request.
   */
  const title = uniqueMeetingTitle("own-version");
  const meetingUrl = await createMeeting(page, title);
  await openNotebook(page);

  let releaseReload: (() => void) | undefined;
  const reloadHeld = new Promise<void>((resolve) => {
    releaseReload = resolve;
  });
  let holding = false;
  await page.route(/\.data(\?|$)/, async (route) => {
    // Only the reload that follows the FIRST save is held; everything before
    // and after it answers normally, so nothing else in the journey is slowed.
    if (holding) {
      holding = false;
      await reloadHeld;
    }
    await route.continue();
  });

  await clearAndType(page, "Notes", "First, written and saved.");
  holding = true;
  await blurEditor(page, "Notes");
  await expect(page.getByText("Saved").first()).toBeVisible();

  // The reload is still in flight, so the editor has NOT been told the version
  // its own save produced. This is the exact window.
  const secondSaved = page.waitForResponse(
    (response) =>
      response.url().includes("/mutate") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("Second"),
  );
  await clearAndType(page, "Notes", "Second, written in the window.");
  await blurEditor(page, "Notes");
  // Deliberately NOT filtered on `ok()`: a refusal is the failure this test
  // exists for, and it must be reported as a refusal rather than as a timeout.
  expect((await secondSaved).status()).toBe(200);
  releaseReload?.();

  // No banner, because nothing changed elsewhere — one owner, one editor.
  await expect(
    page.getByRole("status", { name: "Changed elsewhere" }),
  ).toBeHidden();

  // And the second save is what the meeting actually says.
  await gotoFixture(page, meetingUrl);
  await openNotebook(page);
  expect(await readVisible(page, "Notes")).toContain("Second, written");
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

  /*
   * Wait for THIS save, not for the previous one's leftover badge.
   *
   * V2.4-GATE-01 — the line below used to be a second
   * `expect(getByText("Saved")).toBeVisible()`, identical to the one after the
   * first save. `SaveStatusIndicator` leaves "Saved" on screen, so that
   * assertion was already true before the clear was even submitted: it passed
   * instantly, the reload followed, and the test read the notes back before the
   * empty submission had landed. MEASURED on CI run 32629099619 (p08) —
   * `Received "Something written by mistake."` after a reload that was simply
   * too early.
   *
   * Waiting for the status to enter "Saving…" and return to "Saved" is the
   * transition this journey actually depends on, and the indicator publishes
   * both states for exactly this reason. Nothing is weakened: the real
   * assertion is still the reload below, which is what proves the empty
   * submission reached the database rather than being coerced to "not
   * supplied" — the HARDEN-06B regression this test exists for.
   */
  /*
   * Wait for the RESPONSE, and then also for the badge.
   *
   * The indicator wait above was the V2.4-GATE-01 repair and it is still the
   * right assertion about the UI — but it is an assertion about the UI. It
   * says a component rendered "Saved"; it does not say the empty submission
   * reached the server, and this test exists for a defect in which the server
   * accepted a save and stored nothing (HARDEN-06B). MEASURED again on CI run
   * 32818657005 (p08): `Received "Something written by mistake."` after the
   * reload, on a tree where this passed 10/10 locally and passed on the
   * previous CI run — the badge is one render away from the truth, and one
   * render is the whole margin.
   *
   * So the primary wait is now the POST itself, which is the shape
   * `reviews.spec.ts` already uses and the shape DEBT-203 asks for: wait on
   * the transition the product actually publishes, not on a surface that
   * reflects it. NOTHING is weakened — the badge assertions are kept beneath
   * it, so a save that lands without ever reporting itself still fails here.
   */
  const notesSaved = page.waitForResponse(
    (response) =>
      response.ok() &&
      response.url().includes("/mutate") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("notesMarkdown"),
  );
  const savingAgain = expect(page.getByText("Saving…").first()).toBeVisible();
  await blurEditor(page, "Notes");
  await notesSaved;
  await savingAgain;
  await expect(page.getByText("Saved").first()).toBeVisible();

  await gotoFixture(page, meetingUrl);
  await openNotebook(page);
  expect(await readVisible(page, "Notes")).not.toContain("by mistake");
});
