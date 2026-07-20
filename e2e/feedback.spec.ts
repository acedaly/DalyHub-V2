import { expect, test, type Page } from "@playwright/test";

const DEMO_PATH = "/design/feedback";

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

test.describe("DS-10 feedback & inspector — desktop", () => {
  test("raises a notification and dismisses it", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Feedback & Inspector" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Success", exact: true }).click();
    const toast = page.getByRole("group", { name: "Task completed" });
    await expect(toast).toBeVisible();
    await page.getByRole("button", { name: "Dismiss: Task completed" }).click();
    await expect(toast).toBeHidden();
  });

  test("coalesces repeated notifications instead of stacking", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);
    const repeat = page.getByTestId("notify-coalesce");
    await repeat.click();
    await repeat.click();
    await repeat.click();
    await expect(
      page.getByRole("group", { name: "Message received" }),
    ).toHaveCount(1);
    await expect(page.getByText("×3")).toBeVisible();
  });

  test("keeps an error notification sticky and announces via live region", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);
    await page.getByRole("button", { name: "Error", exact: true }).click();
    const toast = page.getByRole("group", { name: "Couldn’t save" });
    await expect(toast).toBeVisible();
    // Still present after well past the success/info window (errors are sticky).
    await page.waitForTimeout(1500);
    await expect(toast).toBeVisible();
    await expect(page.locator('[aria-live="assertive"]')).toContainText(
      "Couldn’t save",
    );
  });

  test("undo restores an optimistically deleted record", async ({ page }) => {
    await page.goto(DEMO_PATH);
    const undoPanel = page.getByTestId("undo-panel");
    await undoPanel.getByRole("button", { name: "Delete" }).first().click();
    // Item removed optimistically; an Undo toast appears.
    await expect(page.getByRole("group", { name: /^Deleted/ })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(undoPanel.getByText("Draft launch plan")).toBeVisible();
  });

  test("runs a background operation to success", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await page.getByTestId("op-success").click();
    await expect(page.getByText("Working…")).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Export ready" }),
    ).toBeVisible();
  });

  test("cancels a cancellable operation", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await page.getByTestId("op-cancel").click();
    const op = page.getByRole("group", { name: "Syncing calendar" });
    await expect(op).toBeVisible();
    await op.getByRole("button", { name: "Cancel" }).click();
    await expect(op).toBeHidden();
  });

  test("opens a record in the Inspector and closes it", async ({ page }) => {
    await page.goto(DEMO_PATH);
    await page.getByTestId("inspect-r1").click();
    const panel = page.getByRole("complementary", {
      name: "Draft launch plan",
    });
    await expect(panel).toBeVisible();
    // The URL reflects the open state (deep-linkable).
    await expect(page).toHaveURL(/inspector=edit%3Ar1/);
    await page.getByRole("button", { name: "Close inspector" }).click();
    await expect(panel).toBeHidden();
    await expect(page).not.toHaveURL(/inspector=/);
  });

  test("Inspector is deep-linkable and keyboard-resizable", async ({
    page,
  }) => {
    await page.goto(`${DEMO_PATH}?inspector=edit:r2`);
    await expect(
      page.getByRole("complementary", { name: "Review budget" }),
    ).toBeVisible();
    const separator = page.getByRole("separator", { name: "Resize inspector" });
    const before = Number(await separator.getAttribute("aria-valuenow"));
    // Retry to absorb client-hydration timing (a keydown before the handler
    // attaches is a no-op). Widening is monotonic, so retries stay valid.
    await expect(async () => {
      await separator.focus();
      await page.keyboard.press("ArrowLeft"); // widens the right-anchored panel
      const after = Number(await separator.getAttribute("aria-valuenow"));
      expect(after).toBeGreaterThan(before);
    }).toPass();
  });

  test("no horizontal overflow with the Inspector open", async ({ page }) => {
    await page.goto(`${DEMO_PATH}?inspector=edit:r1`);
    await expect(
      page.getByRole("complementary", { name: "Draft launch plan" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-10 feedback & inspector — mobile", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("Inspector becomes a modal sheet on a phone", async ({ page }) => {
    await page.goto(`${DEMO_PATH}?inspector=edit:r1`);
    // Compact viewport → the panel is a modal dialog (sheet), not a landmark.
    const sheet = page.getByRole("dialog", { name: "Draft launch plan" });
    await expect(sheet).toBeVisible();
    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("notifications remain usable and don't cause overflow", async ({
    page,
  }) => {
    await page.goto(DEMO_PATH);
    await expect(
      page.getByRole("heading", { level: 1, name: "Feedback & Inspector" }),
    ).toBeVisible();
    // The coalescing button is idempotent, so retrying past hydration timing
    // can't stack duplicate toasts.
    await expect(async () => {
      await page.getByTestId("notify-coalesce").click();
      await expect(
        page.getByRole("group", { name: "Message received" }),
      ).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-10 feedback — reduced motion", () => {
  test("notifications and the Inspector still work with reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${DEMO_PATH}?inspector=edit:r1`);
    await expect(
      page.getByRole("complementary", { name: "Draft launch plan" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Info", exact: true }).click();
    await expect(
      page.getByRole("group", { name: "Sync scheduled" }),
    ).toBeVisible();
  });
});
