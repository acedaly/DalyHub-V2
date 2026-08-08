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

function restoreSeededPreferences(): void {
  d1Execute(
    [
      `INSERT OR IGNORE INTO owner_app_preferences (workspace_id, owner_id, created_at, updated_at) VALUES ('${WORKSPACE_ID}', '${OWNER_ID}', '2026-07-19T00:00:00.000Z', '2026-07-19T00:00:00.000Z');`,
      `UPDATE owner_app_preferences SET default_task_capture_parent_id = 'a-dh', default_task_capture_parent_kind = 'area' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
    ].join(" "),
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
  test.afterEach(() => restoreSeededPreferences());

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
    await choose(page, "Default Tasks view", "Time Sectors");
    await gotoFixture(page, "/tasks");
    await expect(
      page.getByRole("heading", { name: /No sector/ }).first(),
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

  test("offers no appearance section, and keeps navigation recoverable and sections history-backed", async ({
    page,
  }) => {
    // M3-01 — DalyHub ships one generated light/dark pair and follows the
    // operating system, so Settings has no Appearance section and the document
    // carries no `data-theme` at all (ADR-074).
    await gotoFixture(page, "/settings");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /./);
    await expect(
      page
        .getByRole("navigation", { name: "Settings sections" })
        .getByRole("link", { name: "Appearance" }),
    ).toHaveCount(0);

    const sectionNav = page.getByRole("navigation", {
      name: "Settings sections",
    });
    await sectionNav.getByRole("link", { name: "Navigation" }).click();
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

    await sectionNav.getByRole("link", { name: "Privacy & data" }).click();
    await expect(page).toHaveURL(/section=privacy-data/);
    await expect(page.getByText("Deferred data tools")).toBeVisible();
    // Scoped to the Settings section rail: RELEASE-01 added a top-level /about
    // route, so an unscoped "About" link is now ambiguous.
    await sectionNav.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/section=about/);
    // RELEASE-01 — this row used to read "Not configured"; there is now one real
    // version authority behind it.
    await expect(page.getByText(/^\d+\.\d+\.\d+$/)).toBeVisible();
    await expect(page.getByText("Not configured")).toHaveCount(0);
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

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFixture(page, "/settings?section=navigation");
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("link", { name: "General" })).toBeVisible();

    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/settings?section=privacy-data");
    await expectNoHorizontalOverflow(page);
  });
});

/**
 * SETTINGS-LABEL — one setting, one control, one label.
 *
 * "Default task destination" appeared TWICE in its own row: as the row's label
 * on the left and again as the combobox's field label above the input on the
 * right (finding 7 of the August 2026 interaction audit). It is a small defect
 * with a specific cost — a settings list is read item by item by a screen-reader
 * user, and this one said the same thing twice — so the fix has to hold the
 * accessible name as firmly as it removes the duplicate.
 */
test.describe("SETTINGS-LABEL — no setting labels itself twice", () => {
  test("the task-destination row names its control exactly once", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");

    const row = page
      .locator(".dh-settings-row")
      .filter({ hasText: "Default task destination" });
    await expect(row).toHaveCount(1);

    // Visible: the words appear once in the row, in the row's own label.
    await expect(row.getByText("Default task destination")).toHaveCount(1);
    // ...and the field renders no label block of its own beside it.
    await expect(row.locator(".dh-field__label-text")).toHaveCount(0);

    // Programmatic: still exactly one control, still named — by the real,
    // visible text of the row rather than by an invented `aria-label`.
    const control = page.getByRole("combobox", {
      name: "Default task destination",
    });
    await expect(control).toHaveCount(1);
    await expect(control).toHaveAccessibleName("Default task destination");
    await expect(control).not.toHaveAttribute("aria-label", /.*/);
    // The row's supporting copy describes the control, which is what it always
    // meant and never said.
    await expect(control).toHaveAccessibleDescription(
      /Inbox is the fast default/,
    );
  });

  test("no Settings row labels its own field twice", async ({ page }) => {
    // The audit found one. This is the sweep that keeps it at one.
    for (const section of [
      "general",
      "date-time",
      "navigation",
      "ai",
      "privacy-data",
      "offline",
      "about",
    ]) {
      await gotoFixture(page, `/settings?section=${section}`);
      const duplicates = await page.evaluate(() => {
        const found: string[] = [];
        for (const row of document.querySelectorAll(".dh-settings-row")) {
          const name = row
            .querySelector(".dh-settings-row__label")
            ?.textContent?.trim()
            .toLocaleLowerCase();
          if (!name) continue;
          const inner = row.querySelectorAll(
            ".dh-settings-row__control .dh-field__label-text, .dh-settings-row__control label, .dh-settings-row__control legend",
          );
          for (const element of inner) {
            if (element.textContent?.trim().toLocaleLowerCase() === name) {
              found.push(name);
            }
          }
        }
        return found;
      });
      expect(duplicates, `duplicated labels in ${section}`).toEqual([]);
    }
  });

  test("the corrected General section stays axe-clean, in Light and Dark", async ({
    page,
  }) => {
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await gotoFixture(page, "/settings?section=general");
      await expectNoAxeViolations(page);
    }
    await page.emulateMedia({ colorScheme: null });
  });
});
