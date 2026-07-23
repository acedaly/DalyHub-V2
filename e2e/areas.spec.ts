import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

test.describe("AREA-01 — Areas", () => {
  test("collection, creation, record, rename, hierarchy and Project navigation", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.getByRole("link", { name: "Areas", exact: true }).click();
    await expect(page).toHaveURL(/\/areas$/);

    const seededArea = page.getByRole("link", { name: "Open DalyHub V2" });
    await expect(seededArea).toHaveAttribute("href", "/areas/a-dh");
    await expect(page.getByText(/Goals:/).first()).toBeVisible();
    await expect(page.getByText(/Projects:/).first()).toBeVisible();

    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    await seededArea.click();
    await expect(page).toHaveURL(/\/areas\/a-dh/);
    await expect(
      page.getByRole("heading", { name: "DalyHub V2" }),
    ).toBeVisible();
    await expect(page.getByText("Permanent").first()).toBeVisible();
    await expect(page.locator(".dh-area-momentum")).toBeVisible();
    await expect(
      page
        .locator(".dh-area-momentum")
        .getByText(
          /Momentum visible|Worth a look|Needs attention|Blocked work|Mostly paused/,
        ),
    ).toBeVisible();

    await expect(
      page.getByRole("article", { name: "Launch the site" }),
    ).toBeVisible();
    const goalsCard = page.getByRole("article", { name: "Launch the site" });
    await expect(goalsCard.getByRole("link")).toHaveCount(0);

    await page.getByRole("tab", { name: /Projects/ }).click();
    await expect(page).toHaveURL(/\/areas\/a-dh\?tab=projects/);
    await expect(
      page
        .getByRole("article", { name: "Website relaunch" })
        .getByText("Directly in this Area"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("article", { name: "Launch checklist" })
        .getByText("Goal: Launch the site"),
    ).toBeVisible();

    const projectLink = page.getByRole("link", {
      name: "Open Website relaunch",
    });
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\/pr-website/);
    await expect(
      page.getByRole("heading", { name: "Website relaunch" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/areas\/a-dh\?tab=projects/);
    await page.goForward();
    await expect(page).toHaveURL(/\/projects\/pr-website/);
    await page.goBack();
    await expect(page).toHaveURL(/\/areas\/a-dh\?tab=projects/);

    await page.getByRole("link", { name: "Areas" }).click();
    await page.getByRole("link", { name: "New Area" }).first().click();
    const newDialog = page.getByRole("dialog", { name: "New Area" });
    await expect(newDialog).toBeVisible();
    await expectNoAxeViolations(page);
    await newDialog.getByRole("button", { name: "Create Area" }).click();
    await expect(
      newDialog.getByText("A title is required").first(),
    ).toBeVisible();

    const title = `Area overview e2e ${Date.now()}`;
    await newDialog.getByLabel(/Title/).fill(title);
    await newDialog.getByRole("button", { name: "Create Area" }).click();
    await expect(page).toHaveURL(/\/areas\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("No active work")).toBeVisible();
    await expect(page.getByText("No Goals in this Area")).toBeVisible();

    const renameButton = page.getByRole("button", { name: "Rename" });
    await renameButton.focus();
    await renameButton.click();
    const renameDialog = page.getByRole("dialog", { name: "Rename Area" });
    await expect(renameDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(renameButton).toBeFocused();

    await renameButton.click();
    const renamed = `${title} renamed`;
    await page
      .getByRole("dialog", { name: "Rename Area" })
      .getByLabel(/Title/)
      .fill(renamed);
    await page
      .getByRole("dialog", { name: "Rename Area" })
      .getByRole("button", { name: "Save" })
      .click();
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

    await page.getByRole("tab", { name: "Projects" }).click();
    await expect(page.getByText("No Projects in this Area")).toBeVisible();
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Area activity" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("feed", { name: "Area activity" })
        .getByRole("article")
        .first(),
    ).toBeVisible();

    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("collection and record stay overflow-free across representative widths", async ({
    page,
  }) => {
    for (const viewport of [
      RESPONSIVE_VIEWPORTS[0],
      RESPONSIVE_VIEWPORTS[3],
      RESPONSIVE_VIEWPORTS[5],
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/areas");
      await expectNoHorizontalOverflow(page);
      await gotoFixture(page, "/areas/a-dh");
      await expectNoHorizontalOverflow(page);
    }
  });
});
