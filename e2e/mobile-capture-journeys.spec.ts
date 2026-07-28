import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
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

    // The capture panel is the Inspector's modal sheet on a phone; scoping to it
    // keeps the field lookup unambiguous against the timeline behind it.
    const panel = page.getByRole("dialog").last();
    const title = panel.getByLabel("Title");
    await expect(title).toBeVisible({ timeout: 15_000 });

    await title.fill("Phone diary entry one");
    await panel.getByRole("button", { name: "Save and add another" }).click();

    // The panel stays open, cleared and refocused — the next entry is a title
    // and a tap, with no navigation.
    await expect(title).toHaveValue("", { timeout: 15_000 });
    await expect(title).toBeFocused();

    await title.fill("Phone diary entry two");
    await panel.getByRole("button", { name: "Capture", exact: true }).click();

    // The plain Capture still closes, and the day behind it shows both entries.
    await expect(panel).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText("Phone diary entry two")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Phone diary entry one")).toBeVisible();
  });

  test("holds the accessibility baseline with capture open", async ({
    page,
  }) => {
    await gotoFixture(page, "/diary");
    await headerCreate(page).click();
    await expect(
      page.getByRole("dialog").last().getByLabel("Title"),
    ).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
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

    // All three landed in the record.
    await expect(page.getByText("Phone-captured action")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Phone-captured decision")).toBeVisible();
    await expect(page.getByText("Phone-captured meeting note")).toBeVisible();

    // The surface holds the baseline with the bar present.
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
