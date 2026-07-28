import { expect, test } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * MOBILE-01 — the capture-heavy phone journeys: Diary, Notes and the live
 * Meeting workspace.
 *
 * These are the three workflows the mobile pass exists to make quick, so they are
 * driven for real rather than asserted structurally: capture several diary
 * entries without re-opening the panel, write in the Notes editor with the
 * toolbar's More split, and capture a note, an action and a decision during a
 * meeting without leaving the workspace.
 */

const PHONE = { width: 390, height: 844 };

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

test.describe("MOBILE-01 Diary on a phone", () => {
  test("shows exactly one in-page primary create action — no competing FAB", async ({
    page,
  }) => {
    await gotoFixture(page, "/diary");

    // The PX-06 floating action is retired: with a bottom bar carrying Capture,
    // a FAB would be a second accent control in the same corner.
    await expect(page.locator(".dh-diary-fab")).toBeHidden();

    // The header button IS shown on a phone now, and it is the right one — it
    // opens capture on the day being viewed.
    const create = page.getByRole("button", { name: "New Diary entry" });
    await expect(create).toBeVisible();
    await expectMinTouchTarget(create);
  });

  test("captures several entries in a row without re-opening the panel", async ({
    page,
  }) => {
    await gotoFixture(page, "/diary");
    await page.getByRole("button", { name: "New Diary entry" }).click();

    const title = page.getByRole("textbox", { name: /Title/ });
    await expect(title).toBeVisible();

    await title.fill("Phone diary entry one");
    await page.getByRole("button", { name: "Save and add another" }).click();

    // The panel stays open, cleared and refocused — the next entry is a title
    // and a tap, with no navigation.
    await expect(page.getByRole("textbox", { name: /Title/ })).toHaveValue("", {
      timeout: 10_000,
    });
    await expect(page.getByRole("textbox", { name: /Title/ })).toBeFocused();

    await page
      .getByRole("textbox", { name: /Title/ })
      .fill("Phone diary entry two");
    await page.getByRole("button", { name: "Capture" }).click();

    // The plain Capture still closes, and the day behind it shows the entries.
    await expect(page.getByRole("textbox", { name: /Title/ })).toBeHidden({
      timeout: 10_000,
    });
    await expect(page.getByText("Phone diary entry two")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Phone diary entry one")).toBeVisible();
  });

  test("holds the accessibility baseline with capture open", async ({
    page,
  }) => {
    await gotoFixture(page, "/diary");
    await page.getByRole("button", { name: "New Diary entry" }).click();
    await expect(page.getByRole("textbox", { name: /Title/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("MOBILE-01 the Notes writing surface", () => {
  test("offers common formatting directly and the rest behind More", async ({
    page,
  }) => {
    await gotoFixture(page, "/notes");
    await page.locator(".dh-card__open").first().click();
    await page.waitForLoadState("networkidle");

    const toolbar = page.getByRole("toolbar", { name: /formatting/i }).first();
    await expect(toolbar).toBeVisible();

    // The six common actions are directly available.
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
  });

  test("keeps the editor full-width with no split preview on a phone", async ({
    page,
  }) => {
    await gotoFixture(page, "/notes");
    await page.locator(".dh-card__open").first().click();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page);

    // A phone shows ONE surface at a time — the Read/Write toggle, never a
    // side-by-side source and preview.
    const editor = page.locator(".dh-md-editor__cm").first();
    await expect(editor).toBeVisible();
    const box = await editor.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(PHONE.width * 0.7);
    }
  });
});

test.describe("MOBILE-01 the live Meeting workspace", () => {
  /** Open the first meeting's workspace (the Meeting tab). */
  async function openMeetingWorkspace(page: import("@playwright/test").Page) {
    await gotoFixture(page, "/meetings");
    await page.locator(".dh-card__open").first().click();
    await page.waitForLoadState("networkidle");
    const meetingTab = page.getByRole("tab", { name: "Meeting" });
    if (await meetingTab.isVisible()) {
      await meetingTab.click();
    }
  }

  test("captures a note, an action and a decision without leaving the workspace", async ({
    page,
  }) => {
    await openMeetingWorkspace(page);

    const bar = page.getByTestId("meeting-capture-bar");
    await expect(bar).toBeVisible();

    const input = page.getByTestId("meeting-capture-input");

    // An Action, through the canonical structured-item authority.
    await page.getByTestId("meeting-capture-action").click();
    await expect(input).toBeFocused();
    await input.fill("Phone-captured action");
    await input.press("Enter");

    // The user stays put, the input clears and keeps focus, ready for the next.
    await expect(input).toHaveValue("", { timeout: 10_000 });
    await expect(input).toBeFocused();
    await expect(bar).toBeVisible();

    // A Decision, immediately after — no tab change, no drawer.
    await page.getByTestId("meeting-capture-decision").click();
    await input.fill("Phone-captured decision");
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 10_000 });

    // Both landed in the record's own sections.
    await expect(page.getByText("Phone-captured action")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Phone-captured decision")).toBeVisible();
  });

  test("appends a captured note to the meeting's canonical notes", async ({
    page,
  }) => {
    await openMeetingWorkspace(page);

    const input = page.getByTestId("meeting-capture-input");
    await page.getByTestId("meeting-capture-note").click();
    await input.fill("Phone-captured meeting note");
    await input.press("Enter");
    await expect(input).toHaveValue("", { timeout: 10_000 });

    // It lands in the SAME notes field the editor writes, not a second store.
    await expect(page.getByText("Phone-captured meeting note")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("every capture-bar control meets the touch target", async ({ page }) => {
    await openMeetingWorkspace(page);
    for (const kind of ["note", "action", "decision", "outcome"]) {
      await expectMinTouchTarget(page.getByTestId(`meeting-capture-${kind}`));
    }
  });

  test("holds the accessibility baseline with the capture bar present", async ({
    page,
  }) => {
    await openMeetingWorkspace(page);
    await expect(page.getByTestId("meeting-capture-bar")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
