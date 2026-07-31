/**
 * THEME-01 — the curated theme system, driven through the real product.
 *
 * These are the assertions the milestone's acceptance matrix rests on, and they
 * deliberately check BEHAVIOUR rather than pixels: which theme is applied, that it
 * survives navigation and a reload, that the first paint is already correct, that
 * every major surface renders in every theme without overflow or an axe
 * regression, and that the picker is operable by keyboard.
 *
 * The theme is a persisted OWNER preference now, so every test restores the
 * default afterwards — otherwise one spec would silently change the appearance the
 * rest of the suite runs under.
 */

import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  waitForInteractive,
} from "./helpers";

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

/** The five curated themes, with the display name the picker shows. */
const THEMES = [
  { id: "daly-light", name: "Daly Light", appearance: "light" },
  { id: "daly-dark", name: "Daly Dark", appearance: "dark" },
  { id: "eucalypt", name: "Eucalypt", appearance: "light" },
  { id: "coastal", name: "Coastal", appearance: "light" },
  { id: "ember", name: "Ember", appearance: "light" },
] as const;

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

/** Put the stored preference back to the shipped default. */
function resetTheme(): void {
  d1Execute(
    `UPDATE owner_app_preferences SET theme = 'system' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

/** Write the stored preference directly, without going through the interface. */
function storeTheme(themeId: string): void {
  d1Execute(
    [
      `INSERT OR IGNORE INTO owner_app_preferences (workspace_id, owner_id, created_at, updated_at) VALUES ('${WORKSPACE_ID}', '${OWNER_ID}', '2026-07-19T00:00:00.000Z', '2026-07-19T00:00:00.000Z');`,
      `UPDATE owner_app_preferences SET theme = '${themeId}' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
    ].join(" "),
  );
}

/** The theme currently applied to the document. */
function appliedTheme(page: Page) {
  return page.locator("html");
}

/** Choose a theme through the Settings picker, exactly as an owner would. */
async function chooseTheme(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`Using ${name}`);
}

test.afterEach(() => {
  resetTheme();
});

test.describe("THEME-01 the theme picker", () => {
  test("offers all five curated themes plus Match system", async ({ page }) => {
    await gotoFixture(page, "/settings?section=appearance");

    for (const theme of THEMES) {
      await expect(
        page.getByRole("button", { name: theme.name, exact: true }),
      ).toBeVisible();
    }
    await expect(
      page.getByRole("button", { name: "Match system", exact: true }),
    ).toBeVisible();
  });

  test("describes each theme, so the owner never picks a raw id", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings?section=appearance");

    const body = await page.locator(".dh-theme-picker").innerText();
    for (const theme of THEMES) {
      expect(body).toContain(theme.name);
      // The internal id must never be shown.
      expect(body).not.toContain(theme.id);
    }
  });

  test("shows a visual preview for every option", async ({ page }) => {
    await gotoFixture(page, "/settings?section=appearance");

    const previews = page.locator(".dh-theme-picker .dh-theme-preview");
    await expect(previews).toHaveCount(THEMES.length + 1);
    // The swatch is decoration; the name beside it carries the meaning.
    for (const preview of await previews.all()) {
      await expect(preview).toHaveAttribute("aria-hidden", "true");
    }
  });
});

test.describe("THEME-01 selecting each theme", () => {
  for (const theme of THEMES) {
    test(`applies ${theme.name} immediately, without a reload`, async ({
      page,
    }) => {
      await gotoFixture(page, "/settings?section=appearance");

      // Prove there is no full document load: mark the window, then assert the
      // marker survives the change. A reload would clear it.
      await page.evaluate(() => {
        (window as unknown as { __themeProbe?: boolean }).__themeProbe = true;
      });

      await chooseTheme(page, theme.name);

      await expect(appliedTheme(page)).toHaveAttribute("data-theme", theme.id);
      expect(
        await page.evaluate(
          () => (window as unknown as { __themeProbe?: boolean }).__themeProbe,
        ),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: theme.name, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  }
});

test.describe("THEME-01 persistence", () => {
  test("survives navigation across the application", async ({ page }) => {
    await gotoFixture(page, "/settings?section=appearance");
    await chooseTheme(page, "Ember");

    for (const path of ["/today", "/tasks", "/help", "/about"]) {
      await gotoFixture(page, path);
      await expect(appliedTheme(page)).toHaveAttribute("data-theme", "ember");
    }
  });

  test("survives a full browser reload", async ({ page }) => {
    await gotoFixture(page, "/settings?section=appearance");
    await chooseTheme(page, "Coastal");

    await page.reload();
    await waitForInteractive(page);
    await expect(appliedTheme(page)).toHaveAttribute("data-theme", "coastal");
    await expect(
      page.getByRole("button", { name: "Coastal", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("is stored on the owner record, not only in this browser", async ({
    browser,
  }) => {
    // Written straight to the database, then read in a browser context that has
    // never seen the theme cookie. If the preference only lived in the cookie,
    // this would fall back to the default.
    storeTheme("eucalypt");
    const context = await browser.newContext();
    const page = await context.newPage();
    await gotoFixture(page, "/today");
    await expect(appliedTheme(page)).toHaveAttribute("data-theme", "eucalypt");
    await context.close();
  });

  test("falls back to the default when the stored theme no longer exists", async ({
    page,
  }) => {
    // A theme removed by a later release must degrade to a complete, readable
    // theme rather than leaving the document unstyled.
    d1Execute(
      [
        "PRAGMA ignore_check_constraints = ON;",
        `UPDATE owner_app_preferences SET theme = 'retired-theme' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
        "PRAGMA ignore_check_constraints = OFF;",
      ].join(" "),
    );
    await gotoFixture(page, "/today");
    await expect(appliedTheme(page)).toHaveAttribute("data-theme", "system");
  });
});

test.describe("THEME-01 first paint", () => {
  test("serves Daly Dark in the very first byte, with no light flash", async ({
    page,
  }) => {
    storeTheme("daly-dark");

    // Read the RAW server response, before any JavaScript runs. If the theme were
    // applied on the client there would be a light-themed first paint.
    const response = await page.request.get("/today");
    const html = await response.text();
    expect(html).toContain('data-theme="daly-dark"');
    // …and no client bootstrapping script racing to correct it.
    expect(html).not.toContain("prefers-color-scheme");
    expect(html).not.toMatch(/document\.documentElement\.dataset\.theme/);
  });

  test("serves each curated theme in the first byte", async ({ page }) => {
    for (const theme of THEMES) {
      storeTheme(theme.id);
      const response = await page.request.get("/today");
      expect(await response.text()).toContain(`data-theme="${theme.id}"`);
    }
  });
});

test.describe("THEME-01 every surface in every theme", () => {
  // The acceptance matrix: each major surface rendered under each theme, checked
  // for the failures a theme change can actually cause — a broken layout, an
  // unreadable region, or an accessibility regression.
  const SURFACES = [
    { path: "/today", label: "Today" },
    { path: "/tasks", label: "Tasks" },
    { path: "/settings?section=appearance", label: "Settings" },
    { path: "/help", label: "Help" },
    { path: "/about", label: "About" },
  ];

  for (const theme of THEMES) {
    for (const surface of SURFACES) {
      test(`${surface.label} renders correctly in ${theme.name}`, async ({
        page,
      }) => {
        storeTheme(theme.id);
        await gotoFixture(page, surface.path);

        await expect(appliedTheme(page)).toHaveAttribute(
          "data-theme",
          theme.id,
        );
        await expectNoHorizontalOverflow(page);
        await expectNoAxeViolations(page);
      });
    }
  }
});

test.describe("THEME-01 accessibility of the picker", () => {
  test("is fully operable from the keyboard, with a visible focus ring", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings?section=appearance");

    const option = page.getByRole("button", { name: "Eucalypt", exact: true });
    await option.focus();
    await expect(option).toBeFocused();

    // The focus ring must be a real, visible outline — not `outline: none` with
    // nothing in its place.
    const outline = await option.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: style.outlineWidth,
        style: style.outlineStyle,
        shadow: style.boxShadow,
      };
    });
    const hasRing =
      (outline.style !== "none" && parseFloat(outline.width) > 0) ||
      (outline.shadow !== "none" && outline.shadow !== "");
    expect(
      hasRing,
      `no visible focus indicator: ${JSON.stringify(outline)}`,
    ).toBe(true);

    await page.keyboard.press("Enter");
    await expect(appliedTheme(page)).toHaveAttribute("data-theme", "eucalypt");
  });

  test("announces the applied theme rather than changing silently", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings?section=appearance");
    await expect(page.getByRole("status")).toBeVisible();
    await chooseTheme(page, "Coastal");
    await expect(page.getByRole("status")).toContainText("Using Coastal");
  });

  test("keeps the priority chips readable as text in the dark theme", async ({
    page,
  }) => {
    // Priority must never be colour-only. In Daly Dark in particular, the label
    // has to still be there and still be legible.
    storeTheme("daly-dark");
    await gotoFixture(page, "/tasks");
    const chip = page.locator(".dh-priority").first();
    if ((await chip.count()) > 0) {
      await expect(chip).toContainText(/P[1-4]/);
    }
  });
});

test.describe("THEME-01 on a phone", () => {
  for (const theme of [THEMES[0], THEMES[1]]) {
    test(`phone navigation works in ${theme.name}`, async ({ page }) => {
      storeTheme(theme.id);
      await page.setViewportSize({ width: 375, height: 812 });
      await gotoFixture(page, "/today");

      await expect(appliedTheme(page)).toHaveAttribute("data-theme", theme.id);
      await expect(page.locator("[data-testid='bottom-nav']")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("the theme picker is usable at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/settings?section=appearance");

    for (const theme of THEMES) {
      await expect(
        page.getByRole("button", { name: theme.name, exact: true }),
      ).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
  });
});

test.describe("THEME-01 reduced motion", () => {
  test("switches theme with motion disabled", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoFixture(page, "/settings?section=appearance");
    await chooseTheme(page, "Ember");
    await expect(appliedTheme(page)).toHaveAttribute("data-theme", "ember");

    // Transitions collapse to the instant duration under reduced motion.
    const duration = await page
      .locator(".dh-theme-picker__option")
      .first()
      .evaluate((element) => getComputedStyle(element).transitionDuration);
    expect(duration.split(",").every((value) => parseFloat(value) === 0)).toBe(
      true,
    );
  });
});
