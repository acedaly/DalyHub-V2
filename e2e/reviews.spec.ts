/**
 * REVIEWS-01 — Reviews end-to-end journey (real Worker + local D1).
 *
 * Exercises the durable Review flow through the browser: create weekly Review,
 * edit Markdown reflection, inspect live task context through the shared Task
 * Drawer, link an Area through shared Linked Items, complete/reopen/archive/restore,
 * duplicate current-week handling, Search/Command navigation, mobile overflow and
 * axe in light/dark.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupAllReviewFixtures,
  cleanupReviewByTitle,
  uniqueReviewTitle,
} from "./reviews-fixtures";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const owned = new Set<string>();

test.beforeAll(async () => {
  await cleanupAllReviewFixtures();
});

test.afterEach(async () => {
  for (const title of owned) await cleanupReviewByTitle(title);
  owned.clear();
});

async function createWeeklyReview(page: Page, title: string) {
  owned.add(title);
  await gotoFixture(page, "/reviews/new");
  await expect(page.getByRole("heading", { name: "New Review" })).toBeVisible();
  await expect(page.getByText(/27 Jul 2026–2 Aug 2026/)).toBeVisible();
  const titleInput = page.getByRole("textbox", { name: "Review title" });
  await expect(titleInput).toHaveValue("Weekly Review — 27 July–2 August 2026");
  await titleInput.fill(title);
  await page.getByRole("button", { name: "Start Review" }).click();
  await expect(page).toHaveURL(/\/reviews\/[^/?#]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  return page.url();
}

async function waitForEditors(page: Page): Promise<void> {
  await expect(page.locator('[data-editor-ready="true"]').first()).toBeVisible({
    timeout: 30_000,
  });
}

function reviewSection(page: Page, sectionHeading: string) {
  return page
    .locator(".dh-review-section")
    .filter({ has: page.getByRole("heading", { name: sectionHeading }) });
}

async function writeSection(
  page: Page,
  sectionHeading: string,
  text: string,
): Promise<void> {
  await waitForEditors(page);
  const section = reviewSection(page, sectionHeading);
  await expect(section.locator('[data-editor-ready="true"]')).toBeVisible();
  await section.getByRole("textbox", { name: sectionHeading }).click();
  await page.keyboard.insertText(text);
  await expect(section.getByRole("button", { name: "Save" })).toBeEnabled();
}

async function sectionText(
  page: Page,
  sectionHeading: string,
): Promise<string> {
  await waitForEditors(page);
  const section = reviewSection(page, sectionHeading);
  await expect(section.locator('[data-editor-ready="true"]')).toBeVisible();
  await section.getByRole("textbox", { name: sectionHeading }).click();
  return section.locator(".cm-content").evaluate((el) =>
    Array.from(el.querySelectorAll(".cm-line"))
      .map((line) => line.textContent ?? "")
      .join("\n"),
  );
}

test("weekly Review creation, editing, linking and lifecycle", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const title = uniqueReviewTitle("weekly");
  const reviewUrl = await createWeeklyReview(page, title);

  await writeSection(
    page,
    "Overall reflection",
    "A focused week with clear decisions.",
  );
  const savedOverall = page.waitForResponse(
    (response) =>
      response.ok() &&
      response.url().includes("/mutate") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("update_section") &&
      (response.request().postData() ?? "").includes("summary.overall"),
  );
  await reviewSection(page, "Overall reflection")
    .getByRole("button", { name: "Save" })
    .click();
  await savedOverall;
  await page.reload();
  await expect
    .poll(() => sectionText(page, "Overall reflection"))
    .toBe("A focused week with clear decisions.");

  await page.getByRole("tab", { name: "Tasks" }).click();
  const taskButton = page
    .getByRole("button", { name: /Review period/ })
    .first();
  if ((await taskButton.count()) > 0) {
    await taskButton.click();
    await expect(page.getByRole("dialog", { name: "Task" })).toBeVisible();
    await page.keyboard.press("Escape");
  }

  await page.getByRole("tab", { name: "Linked" }).click();
  await page
    .getByRole("combobox", { name: "Link a record" })
    .fill("DalyHub V2");
  await page.getByRole("option", { name: "DalyHub V2" }).first().click();
  await expect(
    page.getByRole("link", { name: "Area: DalyHub V2" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Complete" }).click();
  await expect(
    page.locator(".record-status", { hasText: /^Completed$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(
    page.locator(".record-status", { hasText: /^In progress$/ }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Archive review" }).click();
  await expect(page.getByText(/Archived ·/)).toBeVisible();
  await page.getByRole("button", { name: "Restore review" }).click();
  await expect(
    page.getByRole("button", { name: "Archive review" }),
  ).toBeVisible();

  await gotoFixture(page, "/reviews/new");
  await page
    .getByRole("textbox", { name: "Review title" })
    .fill(`${title} duplicate`);
  await page.getByRole("button", { name: "Start Review" }).click();
  await expect(page).toHaveURL(reviewUrl);
});

test("Reviews search, command palette, mobile overflow and axe", async ({
  page,
}) => {
  const title = uniqueReviewTitle("search");
  const reviewUrl = await createWeeklyReview(page, title);

  await gotoFixture(page, "/reviews");
  await page.getByRole("searchbox", { name: "Search reviews" }).fill(title);
  await expect(
    page.getByRole("link", { name: new RegExp(title) }),
  ).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog");
  await palette.getByRole("combobox").fill("New Review");
  await palette
    .getByRole("option", { name: /New Review/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/reviews\/new$/);

  await page.goto(reviewUrl);
  await expectNoAxeViolations(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectNoAxeViolations(page);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 780 });
    await page.goto(reviewUrl);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("tab", { name: "Settings" }).click();
    await expectNoHorizontalOverflow(page);
  }
});
