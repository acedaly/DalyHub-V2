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
// V2.3-GATE-01 — the shared D1 helper. This fixture used to spawn wrangler from
// its own closure, so it carried no `SQLITE_BUSY` retry: the suite drives one dev
// server against one local SQLite file while a fixture opens it from a second
// process (see `e2e/d1.ts`). Its inserts are `OR IGNORE` so re-running the whole
// command after transient contention is safe, which the helper requires.
import { d1Execute } from "./d1";

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
  // Assert the SHAPE of the computed weekly period, not a specific week: the
  // original assertions pinned the then-current calendar week ("27 Jul 2026–
  // 2 Aug 2026"), which made the whole suite go red on the next Monday
  // rollover with nothing broken (found during the V2.0.1 closure). The
  // period arithmetic itself is covered by the kernel tests.
  await expect(
    page.getByText(/\d{1,2} \w{3} \d{4}–\d{1,2} \w{3} \d{4}/),
  ).toBeVisible();
  const titleInput = page.getByRole("textbox", { name: "Review title" });
  await expect(titleInput).toHaveValue(/^Weekly Review — .+\d{4}$/);
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

/**
 * V2.0.1 — the Review period context must deep-link a Diary entry with the
 * CANONICAL Diary URL (`?mode=day&date=…&inspector=view:<id>`), not the dead
 * `/diary?entry=<id>` shape the Diary route never read: the click must land on
 * the entry's own day with its details panel open, and Back must return to the
 * Review.
 */
test("Review period context opens the correct Diary entry (V2.0.1)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const WS = "local-dev-workspace";
  const entryId = `reviews-e2e-diary-${Date.now()}`;
  const entryTitle = `Reviews e2e diary link target ${Date.now()}`;
  const occurred = new Date().toISOString();
  const expectedDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(occurred));

  d1Execute(
    [
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES ('${entryId}', '${WS}', 'diary', '${entryTitle}', '${occurred}', '${occurred}', NULL);`,
      `INSERT OR IGNORE INTO diary_entry_details (workspace_id, entity_id, entry_type, body, occurred_at, timezone, source_channel, source_reference, updated_at) VALUES ('${WS}', '${entryId}', 'note', NULL, '${occurred}', 'Australia/Sydney', 'manual', NULL, '${occurred}');`,
    ].join("\n"),
  );

  try {
    const title = uniqueReviewTitle("diary-link");
    const reviewUrl = await createWeeklyReview(page, title);

    await page.getByRole("tab", { name: "Diary" }).click();
    const entryLink = page.getByRole("link", { name: entryTitle });
    await expect(entryLink).toBeVisible();
    await entryLink.click();

    // The canonical Diary deep link: the entry's own day, panel open.
    await expect(page).toHaveURL(/\/diary\?/);
    await expect(page).toHaveURL(new RegExp(`date=${expectedDay}`));
    await expect(page).toHaveURL(/inspector=view/);
    await expect(
      page.getByRole("button", { name: "Edit entry" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: entryTitle }).first(),
    ).toBeVisible();

    // Back returns to the Review — the deep link is ONE navigation.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${reviewUrl.split("/").pop()}`));
  } finally {
    d1Execute(
      [
        `DELETE FROM diary_entry_details WHERE workspace_id = '${WS}' AND entity_id = '${entryId}';`,
        `DELETE FROM entities WHERE workspace_id = '${WS}' AND id = '${entryId}';`,
      ].join("\n"),
    );
  }
});

/*
 * RECALL-00-G (DEBT-228) — the collection offers Start/Continue ONLY for the
 * Review type that has a guide.
 *
 * The guide route redirects every non-weekly type straight back to the record,
 * so a "Start monthly review" control announced a guided flow to a screen
 * reader and silently bounced — a live dead-end (AGENTS.md §6). The collection
 * now uses the SAME `type === "weekly"` predicate the record page's guided
 * entry uses; non-weekly rows keep their ordinary open-record affordance. When
 * a monthly guide ships, its button returns with it — nothing is foreclosed.
 *
 * Falsification: remove the type predicate from `ReviewsCollection.tsx` and
 * the monthly assertions fail at both widths.
 */
test("the guide affordance appears for a weekly Review and never for a monthly one (RECALL-00-G)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const weeklyTitle = uniqueReviewTitle("guide-weekly");
  const monthlyTitle = uniqueReviewTitle("guide-monthly");

  await createWeeklyReview(page, weeklyTitle);

  // A monthly Review, created through the product's own form.
  owned.add(monthlyTitle);
  await gotoFixture(page, "/reviews/new");
  await page.getByRole("radio", { name: "Monthly" }).click();
  await page.getByRole("textbox", { name: "Review title" }).fill(monthlyTitle);
  await page.getByRole("button", { name: "Start Review" }).click();
  await expect(page).toHaveURL(/\/reviews\/[^/?#]+$/);
  // The record page itself offers no guided entry for a monthly Review —
  // the rule the collection now shares.
  await expect(page.getByRole("link", { name: /guided review/i })).toHaveCount(
    0,
  );

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 393, height: 851 },
  ]) {
    await page.setViewportSize(viewport);
    await gotoFixture(page, "/reviews");

    const weeklyCard = page
      .getByRole("article")
      .filter({ hasText: weeklyTitle });
    const monthlyCard = page
      .getByRole("article")
      .filter({ hasText: monthlyTitle });
    await expect(weeklyCard).toBeVisible();
    await expect(monthlyCard).toBeVisible();

    // The weekly card offers the guide; the monthly card does NOT — it keeps
    // only its ordinary open-record affordance.
    await expect(
      weeklyCard.getByRole("link", { name: /^Start Weekly review/ }),
    ).toBeVisible();
    await expect(
      monthlyCard.getByRole("link", { name: /^(Start|Continue)/ }),
    ).toHaveCount(0);
    await expect(
      monthlyCard.getByRole("link", { name: new RegExp(monthlyTitle) }),
    ).toBeVisible();
  }

  // The touched surface stays axe-clean at the phone width too.
  await expectNoAxeViolations(page);
});
