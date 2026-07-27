/**
 * PX-03 — Complete Application Navigation & Module Shells, driven end to end
 * against the development-auth server.
 *
 * Covers what PX-02/DS-11's existing suites don't: the `/` → `/today` redirect,
 * every new Coming Soon placeholder route resolving with real content (not lorem
 * ipsum, not a dead end), sidebar active-state on the new rows, keyboard
 * reachability of a new row, and the mobile overlay reaching a new module —
 * reusing the SAME shell/navigation/overlay machinery PX-02 already proved, never
 * a bespoke check.
 *
 * NOTES-01B replaced the `/notes` "Coming Soon" placeholder with a real
 * collection (`app/modules/notes/routes/index.tsx`), DIARY-01 replaced the
 * `/diary` placeholder with the real Timeline, PEOPLE-01 replaced `/people` with
 * the real People collection, MEET-01 replaced `/meetings` with the real Meetings
 * collection, ASSET-01 replaced `/assets` with the real Assets collection,
 * REVIEWS-01 replaced `/reviews` with the real Reviews collection, and SET-01
 * replaced `/settings` with the real Settings route — so those routes are
 * EXCLUDED from `SHELL_MODULES` below. Their full journeys live in their own
 * specs; sidebar reachability stays here, checked against real headings rather
 * than a placeholder.
 */

import { expect, test } from "@playwright/test";

const SHELL_MODULES = [
  { label: "AI", path: "/ai" },
  { label: "Help", path: "/help" },
] as const;

test.describe("PX-03 — `/` redirects to `/today`", () => {
  test("a direct visit to / lands on /today, not a standalone Home page", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/today$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Today" }),
    ).toBeVisible();
  });

  test("a deep link to another route is unaffected by the redirect", async ({
    page,
  }) => {
    await page.goto("/areas");
    await expect(page).toHaveURL(/\/areas$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Areas" }),
    ).toBeVisible();
  });
});

test.describe("PX-03 — every module shell route resolves with real content", () => {
  for (const { label, path } of SHELL_MODULES) {
    test(`${path} renders the ${label} Coming Soon placeholder`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: label }),
      ).toBeVisible();
      // A real "Coming Soon" section — never a blank or dead-end page.
      await expect(
        page.getByRole("heading", { level: 2, name: "Coming Soon" }),
      ).toBeVisible();
      // At least one planned-capability bullet is real prose (not lorem ipsum).
      const list = page.getByRole("list").last();
      await expect(list.getByRole("listitem").first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/lorem ipsum/i);
    });
  }

  test("the sidebar reaches every module shell route", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const { label, path } of SHELL_MODULES) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: label }),
      ).toBeVisible();
    }
  });

  // NOTES-01B: Notes has real content now, so it is checked separately from
  // the Coming Soon loop above — the sidebar link still reaches a real,
  // non-blank `/notes` heading (the collection Pane Header, not a placeholder).
  test("the sidebar reaches the real Notes collection", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Notes" }).click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
  });

  // DIARY-01: Diary has the real Timeline now — the sidebar link reaches a real,
  // non-blank `/diary` heading (the Timeline Pane Header, not a placeholder).
  test("the sidebar reaches the real Diary Timeline", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Diary" }).click();
    await expect(page).toHaveURL(/\/diary$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Diary" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
  });

  // PEOPLE-01: People has the real collection now — the sidebar link reaches a
  // real, non-blank `/people` heading (the collection Pane Header, not a
  // placeholder).
  test("the sidebar reaches the real People collection", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "People", exact: true }).click();
    await expect(page).toHaveURL(/\/people$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "People" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
  });

  // MEET-01: Meetings has the real collection now — the sidebar link reaches a
  // real, non-blank `/meetings` heading (the collection Pane Header, not a
  // placeholder).
  test("the sidebar reaches the real Meetings collection", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Meetings" }).click();
    await expect(page).toHaveURL(/\/meetings$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Meetings" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
  });

  test("the sidebar reaches the real Assets collection", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Assets" }).click();
    await expect(page).toHaveURL(/\/assets$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Assets" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
  });

  // REVIEWS-01: Reviews has the real collection now — the sidebar link reaches a
  // real, non-blank `/reviews` heading, not a placeholder.
  test("the sidebar reaches the real Reviews collection", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Reviews" }).click();
    await expect(page).toHaveURL(/\/reviews$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Reviews" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
  });

  test("the sidebar reaches the real Settings route", async ({ page }) => {
    await page.goto("/today");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).not.toBeVisible();
  });
});

test.describe("PX-03 — sidebar active state on the new rows", () => {
  test("Notes is marked aria-current when active; other rows are not", async ({
    page,
  }) => {
    await page.goto("/notes");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Notes" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      nav.getByRole("link", { name: "Settings" }),
    ).not.toHaveAttribute("aria-current");
  });
});

test.describe("PX-03 — keyboard reachability", () => {
  test("a new sidebar row is keyboard-reachable and Enter activates it", async ({
    page,
  }) => {
    await page.goto("/today");
    const link = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Reviews" });
    await link.focus();
    await expect(link).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/reviews$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Reviews" }),
    ).toBeVisible();
  });
});

test.describe("PX-03 — mobile overlay reaches a shell module", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("the mobile navigation overlay opens Help and closes after navigating", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.getByRole("button", { name: /open navigation/i }).click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("link", { name: "Help" }).click();
    await expect(page).toHaveURL(/\/help$/);
    // Choosing a destination closes the overlay sheet (PX-02 `onNavigate`).
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Help" }),
    ).toBeVisible();
  });
});
