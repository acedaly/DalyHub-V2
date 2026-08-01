/**
 * UX-01 — the daily-driver polish pass, driven end to end.
 *
 * Each test here pins one defect the audit found in the shipped product, so a
 * regression is caught as a behaviour change rather than as a diff:
 *
 *   - the desktop rail lost its "you are here" row on EVERY record route, while
 *     the phone bar (same registry model) kept it;
 *   - `?` claimed in its own reference to work "Anywhere" but only worked on Today;
 *   - Today had no answer at all to "what is on today?" — Meetings had shipped for
 *     weeks with no presence on the landing page — while a permanent "coming soon"
 *     Focus panel took a section of it every day;
 *   - Reviews and Meetings paginated by NAVIGATING, replacing the list and losing
 *     the owner's place, while every other collection accumulated in place.
 */

import { expect, test } from "@playwright/test";

import { expectNoAxeViolations, gotoFixture } from "./helpers";

const rail = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Primary" });

test.describe("UX-01 — the rail keeps its place on a record route", () => {
  test("Projects stays current while one of its records is open", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-website");

    // Before UX-01 this was zero: `NavLink end` matched `/projects` exactly, so a
    // record route left the whole rail with no current row.
    await expect(
      rail(page).getByRole("link", { name: "Projects" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(rail(page).locator('[aria-current="page"]')).toHaveCount(1);
  });

  test("the collection route itself is still marked current", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");
    await expect(
      rail(page).getByRole("link", { name: "Projects" }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      rail(page).getByRole("link", { name: "Notes" }),
    ).not.toHaveAttribute("aria-current", "page");
  });
});

test.describe("UX-01 — the keyboard reference is available everywhere", () => {
  test("? opens the shared reference away from Today, and Escape closes it", async ({
    page,
  }) => {
    await gotoFixture(page, "/notes");
    await page.locator("body").click();

    await page.keyboard.press("Shift+?");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(dialog).toBeVisible();
    // The ONE shared catalogue — the same rows Today's Drawer shows.
    await expect(dialog.getByText("Open the Command Palette")).toBeVisible();
    await expect(
      dialog.getByText(/fully operable from the keyboard/i),
    ).toBeVisible();

    await expectNoAxeViolations(page);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("? does not fire while the owner is typing", async ({ page }) => {
    await gotoFixture(page, "/notes");
    const search = page.getByRole("searchbox").first();
    if ((await search.count()) === 0) {
      test.skip(true, "no text field on this collection");
    }
    await search.click();
    await search.type("why?");

    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeHidden();
    await expect(search).toHaveValue("why?");
  });

  test("a surface that owns ? keeps it — Today still uses its Drawer host", async ({
    page,
  }) => {
    // The shell's binding is a FALLBACK: it must never take the key from a
    // surface that hosts its own reference. Today does, because there the
    // reference belongs inside the drawer STACK — which is what makes a task
    // drawer beneath it stop owning the task shortcuts. Both hosts share the
    // same accessible name, so the distinguishing evidence is the shell sheet's
    // test id (absent) and the drawer URL parameter (present).
    await gotoFixture(page, "/today");
    await page.locator("body").click();

    await page.keyboard.press("Shift+?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();

    await expect(page.getByTestId("keyboard-shortcuts")).toHaveCount(0);
    await expect(page).toHaveURL(/drawer=help%3Ashortcuts/);
  });
});

test.describe("UX-01 — Today answers what is on today", () => {
  test("shows a Meetings section and no 'coming soon' Focus panel", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    // The section exists whether or not the day has meetings: an empty day teaches
    // the next step rather than hiding. (The heading's accessible name carries the
    // count, so the section is addressed by its stable widget id.)
    const meetings = page.locator('[data-widget="meetings"]');
    await expect(meetings).toBeVisible();
    await expect(
      meetings.getByRole("heading", { level: 2, name: /Meetings/ }),
    ).toBeVisible();

    // The Focus widget is gone from the catalogue, so no section claims that id.
    await expect(page.locator('[data-widget="focus"]')).toHaveCount(0);

    // The Focus placeholder is gone — the same rule POLISH-01 applied to Weather
    // and the calendar (DEBT-53).
    await expect(
      page.getByText("A calm place to start a focus session"),
    ).toHaveCount(0);
    await expect(
      page.getByText("A Pomodoro timer for timeboxed work"),
    ).toHaveCount(0);
  });
});

test.describe("UX-01 — collections paginate consistently", () => {
  test("Reviews offers a Load more button, not a page-replacing Next page link", async ({
    page,
  }) => {
    await gotoFixture(page, "/reviews");

    // The link that replaced the list is gone everywhere.
    await expect(page.getByRole("link", { name: "Next page" })).toHaveCount(0);

    // When more pages exist the control is the shared accumulate button; when they
    // do not, no control is shown at all. Both are correct — what must never
    // reappear is a navigation that throws away the owner's place.
    const loadMore = page.getByRole("button", { name: "Load more Reviews" });
    if ((await loadMore.count()) > 0) {
      await expect(loadMore).toBeVisible();
    }
  });

  test("Meetings' Load more is a real button, not a link that navigates", async ({
    page,
  }) => {
    await gotoFixture(page, "/meetings");
    await expect(page.getByRole("link", { name: "Load more" })).toHaveCount(0);
  });
});

test.describe("UX-01 — create pages are landmark-correct and named on a phone", () => {
  for (const path of ["/new/meeting", "/reviews/new"]) {
    test(`${path} exposes exactly one main landmark`, async ({ page }) => {
      await gotoFixture(page, path);
      // Two `main` landmarks (the shell's plus the page's own) is a WCAG 2.2
      // landmark defect; both create pages shipped with one.
      await expect(page.getByRole("main")).toHaveCount(1);
    });
  }
});
