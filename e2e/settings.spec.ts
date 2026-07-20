import { expect, test, type Page } from "@playwright/test";

const DEMO_PATH = "/design/settings";

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

/** Navigate and wait for React to hydrate so handlers are attached before we act. */
async function gotoFixture(page: Page) {
  await page.goto(DEMO_PATH);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings layout" }),
  ).toBeVisible();
}

test.describe("DS-10b settings layout — desktop", () => {
  test.beforeEach(async ({ page }) => {
    await gotoFixture(page);
  });

  test("changes an immediate toggle and confirms via a toast", async ({
    page,
  }) => {
    const toggle = page.getByRole("switch", { name: "Compact mode" });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(
      page.getByRole("group", { name: "Preference saved" }),
    ).toBeVisible();
  });

  test("changes an immediate select and confirms via a toast", async ({
    page,
  }) => {
    const select = page.getByRole("combobox", { name: "Default view" });
    await select.selectOption("board");
    await expect(
      page.getByRole("group", { name: "Default view updated" }),
    ).toBeVisible();
    await expect(select).toHaveValue("board");
  });

  test("edits and saves an explicit-save setting", async ({ page }) => {
    const field = page.getByRole("textbox", { name: "Display name" });
    await field.fill("Grace Hopper");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("group", { name: "Display name saved" }),
    ).toBeVisible();
    // Current value reflects the save.
    await expect(page.getByText("Grace Hopper").first()).toBeVisible();
  });

  test("cancels a dirty explicit setting, reverting the value", async ({
    page,
  }) => {
    const field = page.getByRole("textbox", { name: "Display name" });
    await field.fill("Temporary edit");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(field).toHaveValue("Ada Lovelace");
  });

  test("shows a validation error and blocks save", async ({ page }) => {
    const field = page.getByRole("textbox", { name: "Display name" });
    await field.fill("");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Enter a display name.").first()).toBeVisible();
  });

  test("simulates a save failure then retries to success", async ({ page }) => {
    await page.getByTestId("toggle-simulate-failure").click();
    const field = page.getByRole("textbox", { name: "Display name" });
    await field.fill("Katherine Johnson");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByText("The server rejected the change. Please try again."),
    ).toBeVisible();
    // Turn off the simulated failure and retry — the draft is preserved.
    await page.getByTestId("toggle-simulate-failure").click();
    await expect(field).toHaveValue("Katherine Johnson");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(
      page.getByRole("group", { name: "Display name saved" }),
    ).toBeVisible();
  });

  test("completes a dangerous confirmation with typed confirmation and retry", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Delete workspace…" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete workspace?" });
    await expect(dialog).toBeVisible();

    const confirm = dialog.getByRole("button", { name: "Delete workspace" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox").fill("DELETE");
    await expect(confirm).toBeEnabled();

    // First attempt fails (simulated) — an inline alert appears, dialog stays open.
    await confirm.click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).toBeVisible();
    // Retry succeeds — the dialog closes and a success toast appears.
    await dialog.getByRole("button", { name: "Delete workspace" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Workspace deleted" }),
    ).toBeVisible();
  });

  test("cancels a dangerous confirmation without acting", async ({ page }) => {
    await page.getByRole("button", { name: "Reset settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset all settings?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    // No success toast was raised.
    await expect(
      page.getByRole("group", { name: "Settings reset to defaults" }),
    ).toBeHidden();
  });

  test("cancels a dangerous confirmation by clicking outside (the scrim)", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Reset settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset all settings?" });
    await expect(dialog).toBeVisible();
    // Click the scrim away from the centred panel. The scrim must stay
    // interactive (not inerted) for outside-click cancellation to work.
    await page
      .getByRole("button", { name: "Dismiss dialog" })
      .click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Settings reset to defaults" }),
    ).toBeHidden();
  });

  test("is keyboard operable end to end and restores focus on close", async ({
    page,
  }) => {
    const trigger = page.getByRole("button", { name: "Delete workspace…" });
    await trigger.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Delete workspace?" });
    await expect(dialog).toBeVisible();
    // Typed-confirmation input receives initial focus.
    await expect(dialog.getByRole("textbox")).toBeFocused();
    // Escape cancels and focus returns to the trigger.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("has no horizontal overflow with a confirmation open", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Reset settings" }).click();
    await expect(
      page.getByRole("dialog", { name: "Reset all settings?" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-10b settings layout — 320px mobile", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("stacks rows cleanly with no horizontal overflow", async ({ page }) => {
    await gotoFixture(page);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("operates an immediate toggle on a phone", async ({ page }) => {
    await gotoFixture(page);
    const toggle = page.getByRole("switch", { name: "Compact mode" });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(
      page.getByRole("group", { name: "Preference saved" }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("completes a dangerous confirmation on a phone with no overflow", async ({
    page,
  }) => {
    await gotoFixture(page);
    await page.getByRole("button", { name: "Reset settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset all settings?" });
    await expect(dialog).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    await dialog.getByRole("button", { name: "Reset settings" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Settings reset to defaults" }),
    ).toBeVisible();
  });
});

test.describe("DS-10b settings layout — theme & motion", () => {
  test("works in dark theme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page);
    const toggle = page.getByRole("switch", { name: "Compact mode" });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("confirmation works with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoFixture(page);
    await page.getByRole("button", { name: "Reset settings" }).click();
    const dialog = page.getByRole("dialog", { name: "Reset all settings?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Reset settings" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Settings reset to defaults" }),
    ).toBeVisible();
  });
});
