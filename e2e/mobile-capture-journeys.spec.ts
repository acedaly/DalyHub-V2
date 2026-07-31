import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";
import { cleanupNoteByTitle, uniqueNoteTitle } from "./notes-fixtures";
import { cleanupMeetingByTitle, uniqueMeetingTitle } from "./meetings-fixtures";

/**
 * MOBILE-01 — the capture-heavy phone journeys: Diary, Notes and the live
 * Meeting workspace.
 *
 * These are the three workflows the mobile pass exists to make quick, so each is
 * driven as ONE continuous journey rather than as separate tests sharing fixture
 * data: create the record through the phone path, then keep working in it. That
 * mirrors what a user actually does, removes any dependence on seeded records,
 * and means a failure points at the step that broke rather than at a lookup.
 *
 * Each journey removes its own fixture through the module's existing cleanup
 * helper.
 */

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

const bottomNav = "[data-testid='bottom-nav']";

/**
 * Diary entries are NOT cleaned up between runs (the module has no fixture
 * helper and the timeline is meant to accumulate), so each run writes its own
 * uniquely-titled entries. Without this a second run trips Playwright's strict
 * mode on the entry a previous run left behind — a test-data problem, not a
 * product one.
 */
const RUN = `${Date.now().toString(36)}`;
const DRAWER_URL = "/today?drawer=task%3At-drawer";

/** Open the shared capture sheet on a type from the phone bottom bar. */
async function openCapture(page: Page, type: string) {
  await page
    .locator(bottomNav)
    .getByRole("button", { name: "Capture" })
    .click();
  const sheet = page.getByTestId("capture-sheet");
  await expect(sheet).toBeVisible();
  // The sheet may open on a remembered type; return to the chooser first.
  const changeType = sheet.getByTestId("capture-change-type");
  if (await changeType.isVisible()) {
    await changeType.click();
  }
  await sheet.getByTestId(`capture-choose-${type}`).click();
  return sheet;
}

async function chooseCaptureType(
  sheet: ReturnType<Page["getByTestId"]>,
  type: string,
) {
  await sheet.getByTestId("capture-change-type").click();
  await sheet.getByTestId(`capture-choose-${type}`).click();
}

async function selectTaskParentIfNeeded(
  sheet: ReturnType<Page["getByTestId"]>,
  parentName: string,
) {
  const parent = sheet.getByRole("combobox", { name: /Project or Area/ });
  if ((await parent.count()) === 0 || !(await parent.isVisible())) return;
  await parent.click();
  await parent.fill(parentName);
  await sheet.getByRole("option", { name: parentName }).first().click();
}

async function submitTaskCapture(
  page: Page,
  sheet: ReturnType<Page["getByTestId"]>,
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/tasks/new" &&
        r.request().method() === "POST",
    ),
    sheet.getByRole("button", { name: "Create task" }).click(),
  ]);
  const body = (await response.json()) as { ok?: boolean };
  expect(body.ok, JSON.stringify(body)).toBe(true);
}

test.describe("MOBILE-01 Diary on a phone", () => {
  /** The pane header's create action (the empty state offers its own copy). */
  const headerCreate = (page: Page) =>
    page.locator(".dh-pane-header").getByRole("button", {
      name: "New Diary entry",
    });

  test("shows exactly one in-page primary create action — no competing FAB", async ({
    page,
  }) => {
    await gotoFixture(page, "/diary");

    // The PX-06 floating action is retired: with a bottom bar carrying Capture,
    // a FAB would be a second accent control in the same corner.
    await expect(page.locator(".dh-diary-fab")).toHaveCount(0);

    // The header button IS shown on a phone now, and it is the right one to
    // keep — it opens capture on the day being viewed.
    const create = headerCreate(page);
    await expect(create).toBeVisible();
    await expectMinTouchTarget(create);
  });

  test("captures several entries in a row without re-opening the panel", async ({
    page,
  }) => {
    await gotoFixture(page, "/diary");
    await headerCreate(page).click();

    // Scoped to the capture FORM itself (`aria-label="Quick capture"`), not to
    // the Inspector around it: the Inspector is a docked panel or a modal sheet
    // depending on width, so its role is not a stable anchor — whereas the form
    // is the same element either way. Scoping also disambiguates "Capture", which
    // is now also the phone bottom bar's control.
    const panel = page.locator(".dh-diary-capture");
    const title = panel.getByLabel("Title");
    await expect(title).toBeVisible({ timeout: 15_000 });

    await title.fill(`Phone diary entry one ${RUN}`);
    await panel.getByRole("button", { name: "Save and add another" }).click();

    // The panel stays open, cleared and refocused — the next entry is a title
    // and a tap, with no navigation.
    await expect(title).toHaveValue("", { timeout: 15_000 });
    await expect(title).toBeFocused();

    await title.fill(`Phone diary entry two ${RUN}`);
    await panel.getByRole("button", { name: "Capture", exact: true }).click();

    // The plain Capture still closes, and the day behind it shows both entries.
    await expect(panel).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(`Phone diary entry two ${RUN}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(`Phone diary entry one ${RUN}`)).toBeVisible();
  });

  test("holds the accessibility baseline with capture open", async ({
    page,
  }) => {
    await gotoFixture(page, "/diary");
    await headerCreate(page).click();
    await expect(
      page.locator(".dh-diary-capture").getByLabel("Title"),
    ).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("ADR-060 contextual capture on a phone", () => {
  test("clears Task context when switching to unsupported Task capture", async ({
    page,
  }) => {
    await gotoFixture(page, DRAWER_URL);
    const drawer = page.getByRole("dialog").first();
    await expect(
      drawer.getByRole("heading", { level: 3, name: "Draft the proposal" }),
    ).toBeVisible({ timeout: 15_000 });
    await drawer.getByRole("tab", { name: "Linked" }).click();
    await drawer.getByRole("button", { name: "New linked note" }).click();

    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("capture-context-chip")).toContainText(
      "Related to Draft the proposal",
    );

    await chooseCaptureType(sheet, "meeting");
    await expect(sheet.getByTestId("capture-context-chip")).toContainText(
      "Linked to Draft the proposal",
    );

    await chooseCaptureType(sheet, "task");
    await expect(sheet.getByTestId("capture-context-chip")).toHaveCount(0);

    await sheet
      .getByLabel("Title")
      .fill(`Phone task after unsupported switch ${RUN}`);
    await selectTaskParentIfNeeded(sheet, "DalyHub V2");
    await submitTaskCapture(page, sheet);
    await expect(sheet.getByTestId("capture-result")).toBeVisible();
  });

  test("captures a Project-context Task without choosing another parent", async ({
    page,
  }) => {
    const title = `Phone project contextual task ${RUN}`;

    await gotoFixture(page, "/projects");
    // Read the Project's title from the CARD's own open control before navigating.
    // Reading it from the record's `h1` afterwards raced the collection heading
    // ("Projects") still being mounted mid-transition, which made the assertion
    // compare against the wrong string rather than against the real title.
    const openLink = page.getByRole("link", { name: /^Open / }).first();
    const projectTitle = (await openLink.getAttribute("aria-label"))
      ?.replace(/^Open /, "")
      .trim();
    expect(projectTitle).toBeTruthy();
    await openLink.click();
    await expect(page).toHaveURL(/\/projects\/[^/?#]+$/);
    await expect(
      page.getByRole("heading", { level: 1, name: projectTitle! }),
    ).toBeVisible();

    await page.getByRole("button", { name: /^More actions for / }).click();
    await page.getByRole("menuitem", { name: "New task" }).click();

    const sheet = page.getByTestId("capture-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("capture-context-chip")).toContainText(
      `In ${projectTitle}`,
    );
    await expect(sheet.getByText(`Filing under ${projectTitle}`)).toBeVisible();
    await expect(
      sheet.getByRole("combobox", { name: /Project or Area/ }),
    ).toHaveCount(0);

    await sheet.getByLabel("Title").fill(title);
    await submitTaskCapture(page, sheet);
    await sheet.getByTestId("capture-done").click();

    await page.getByRole("tab", { name: "Tasks" }).click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("MOBILE-01 the Notes writing surface", () => {
  const title = uniqueNoteTitle("mobile writing");

  test.afterAll(async () => {
    await cleanupNoteByTitle(title);
  });

  test("captures a Note on a phone, then writes in the canonical editor", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const sheet = await openCapture(page, "note");

    await sheet.getByLabel("Title").fill(title);
    await sheet.getByRole("button", { name: "Create and write" }).click();

    // Capture hands off to the canonical NOTES-05 editor — never a second one.
    await expect(page).toHaveURL(/\/notes\//, { timeout: 15_000 });
    // Same as the Meeting journey: arrived through the product, so gate on the
    // editor being interactive before driving its toolbar.
    await waitForInteractive(page);

    const toolbar = page.getByRole("toolbar", { name: /formatting/i }).first();
    await expect(toolbar).toBeVisible({ timeout: 15_000 });

    // The common actions are directly available.
    for (const label of ["Bold", "Italic", "Link"]) {
      await expect(toolbar.getByRole("button", { name: label })).toBeVisible();
    }
    // The low-frequency ones are not permanent chrome…
    await expect(toolbar.getByRole("button", { name: "Table" })).toBeHidden();

    // …but are one tap away, inside the SAME toolbar (so it stays one Tab stop).
    await toolbar.getByRole("button", { name: "More" }).click();
    await expect(toolbar.getByRole("button", { name: "Table" })).toBeVisible();

    const tabStops = await toolbar.evaluate(
      (element) =>
        element.querySelectorAll('button[tabindex="0"]:not([disabled])').length,
    );
    expect(tabStops).toBe(1);

    // The writing region owns the phone width — no split preview.
    await expectNoHorizontalOverflow(page);
    const editor = page.locator(".dh-md-editor__cm").first();
    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(PHONE.width * 0.7);
    }
  });
});

test.describe("MOBILE-01 the live Meeting workspace", () => {
  const meetingTitle = uniqueMeetingTitle("mobile capture bar");

  test.afterAll(async () => {
    await cleanupMeetingByTitle(meetingTitle);
  });

  test("creates a Meeting from the phone sheet, then captures during it", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    const sheet = await openCapture(page, "meeting");

    await sheet.getByLabel("Title").fill(meetingTitle);
    // The start defaults to the next quarter hour in the OWNER's timezone.
    await expect(sheet.getByLabel("Start")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await sheet.getByRole("button", { name: "Create meeting" }).click();

    // A captured meeting opens its workspace — the next thing you do is run it.
    await expect(page).toHaveURL(/\/meeting\//, { timeout: 15_000 });
    // Arriving through the product, not through `goto`: wait for the workspace to
    // be interactive before driving it, or the first chip tap lands on markup that
    // has no handler attached yet and is dropped.
    await waitForInteractive(page);
    // This journey asserts FOCUS, and Playwright reports an element as `inactive`
    // — not focused — when it is the document's active element but the page itself
    // is not the browser's active one. Earlier tests in this file open and close
    // their own contexts, which can leave this page inactive even though nothing
    // about the workspace is wrong. Make it the active page so the assertions
    // below are about the capture bar rather than about window activation.
    await page.bringToFront();

    const bar = page.getByTestId("meeting-capture-bar");
    await expect(bar).toBeVisible({ timeout: 15_000 });
    const input = page.getByTestId("meeting-capture-input");

    // Every control on the bar is a comfortable thumb target.
    for (const kind of ["note", "action", "decision", "outcome"]) {
      await expectMinTouchTarget(page.getByTestId(`meeting-capture-${kind}`));
    }

    // An Action, through the canonical structured-item authority.
    await page.getByTestId("meeting-capture-action").click();
    await expect(input).toBeFocused();
    await input.fill("Phone-captured action");
    await input.press("Enter");

    // The user stays put, the input clears and keeps focus, ready for the next.
    await expect(input).toHaveValue("", { timeout: 15_000 });
    await expect(input).toBeFocused();
    await expect(bar).toBeVisible();

    // A Decision, immediately after — no tab change, no drawer.
    await page.getByTestId("meeting-capture-decision").click();
    await input.fill("Phone-captured decision");
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 15_000 });

    // A Note, which lands in the SAME notes field the editor writes.
    await page.getByTestId("meeting-capture-note").click();
    await input.fill("Phone-captured meeting note");
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 15_000 });

    // The two structured items appear in their sections immediately.
    await expect(page.getByText("Phone-captured action")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Phone-captured decision")).toBeVisible();

    // The surface holds the baseline with the bar present.
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    // The NOTE goes to the meeting's `notesMarkdown` through the same authority
    // the Notes editor autosaves through — so it is asserted where that can
    // actually be observed: after a reload. The open editor is an autosave field
    // that owns its own draft and deliberately does NOT adopt server changes
    // underneath a writer, so a note captured while it is mounted does not appear
    // in it until the record is loaded again (DEBT-47). This asserts what is
    // genuinely true today — the note was persisted to the canonical field —
    // rather than a live update the product does not yet make.
    await page.reload();
    await waitForInteractive(page);
    await expect(page.getByText("Phone-captured meeting note")).toBeVisible({
      timeout: 15_000,
    });
  });
});
