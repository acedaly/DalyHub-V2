import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

function d1Execute(command: string): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "pipe",
    },
  );
}

function resetPreferences(): void {
  d1Execute(
    `DELETE FROM owner_app_preferences WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

function forceInvalidLandingDestination(): void {
  d1Execute(
    [
      "PRAGMA ignore_check_constraints = ON;",
      `UPDATE owner_app_preferences SET default_landing_destination = 'assets', version = version + 1, updated_at = '2026-07-27T00:00:00.000Z' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
      "PRAGMA ignore_check_constraints = OFF;",
    ].join(" "),
  );
}

async function choose(page: Page, label: string, value: string): Promise<void> {
  await page.getByLabel(label).selectOption(value);
  await expect(page.getByText("Saved").first()).toBeVisible();
}

test.describe("SETTINGS-01A — application settings", () => {
  test.beforeEach(() => resetPreferences());
  test.afterEach(() => resetPreferences());

  test("opens from navigation and persists owner/workspace preferences", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeVisible();

    await page.getByRole("link", { name: "Date & time" }).click();
    await expect(page).toHaveURL(/section=date-time/);
    await choose(page, "Owner timezone", "Europe/London");
    await page.reload();
    await expect(page.getByLabel("Owner timezone")).toHaveValue(
      "Europe/London",
    );
    await expect(
      page.getByText(/Timezone affects date grouping, Today, due-date/),
    ).toBeVisible();

    await choose(page, "Date display", "dmy_slash");
    await page.reload();
    await expect(page.getByText("Example: 27/07/2026")).toBeVisible();

    await choose(page, "First day of week", "sunday");
    await page.reload();
    await expect(page.getByText("Week views start on Sunday.")).toBeVisible();

    await page.getByRole("link", { name: "General" }).click();
    await choose(page, "Default landing page", "tasks");
    await page.goto("/");
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();

    forceInvalidLandingDestination();
    await page.goto("/");
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();

    await gotoFixture(page, "/settings");
    await choose(page, "Default Tasks view", "matrix");
    await gotoFixture(page, "/tasks");
    await expect(
      page.getByRole("heading", { name: "P1 · Do" }).first(),
    ).toBeVisible();

    await gotoFixture(page, "/settings");
    await choose(page, "Default Diary mode", "timeline");
    await gotoFixture(page, "/diary");
    await expect(page.getByRole("link", { name: "Timeline" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await gotoFixture(page, "/diary?mode=day");
    await expect(
      page
        .getByRole("group", { name: "Diary view" })
        .getByRole("link", { name: "Day", exact: true }),
    ).toHaveAttribute("aria-current", "true");
  });

  test("keeps appearance device-local, navigation recoverable and sections history-backed", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings?section=appearance");

    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "System" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");

    await page.getByRole("link", { name: "Navigation" }).click();
    await expect(page).toHaveURL(/section=navigation/);
    const helpToggle = page.getByRole("checkbox", { name: "Help" });
    await expect(helpToggle).toBeChecked();
    await helpToggle.uncheck();
    await expect(page.getByText("Saved").first()).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "Help" }),
    ).not.toBeChecked();
    await expect(
      page
        .getByRole("navigation", { name: "Primary" })
        .getByRole("link", { name: "Help" }),
    ).toHaveCount(0);
    await gotoFixture(page, "/help");
    await expect(
      page.getByRole("heading", { level: 1, name: "Help" }),
    ).toBeVisible();

    await gotoFixture(page, "/settings?section=navigation");
    await expect(page.getByRole("checkbox", { name: "Today" })).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Settings" }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Reset navigation" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Help" })).toBeChecked();

    await page.getByRole("link", { name: "Privacy & data" }).click();
    await expect(page).toHaveURL(/section=privacy-data/);
    await expect(page.getByText("Deferred data tools")).toBeVisible();
    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/section=about/);
    await expect(page.getByText("Not configured")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/section=privacy-data/);
    await page.goForward();
    await expect(page).toHaveURL(/section=about/);
  });

  test("is accessible and responsive from 320px through wide desktop", async ({
    page,
  }) => {
    for (const width of [320, 375, 390, 768, 1440, 2560]) {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 820 });
      await gotoFixture(page, "/settings?section=date-time");
      await expectNoHorizontalOverflow(page);
    }

    await gotoFixture(page, "/settings");
    await expectNoAxeViolations(page);
    await gotoFixture(page, "/settings?section=appearance");
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, "/settings?section=navigation");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("link", { name: "General" })).toBeVisible();

    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/settings?section=privacy-data");
    await expectNoHorizontalOverflow(page);
  });
});
