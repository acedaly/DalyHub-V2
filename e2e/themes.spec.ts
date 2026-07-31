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

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

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

/**
 * Store the owner's theme WITHOUT touching the browser under test.
 *
 * This posts to the real `/preferences/theme` action, so the owner record is
 * written through the product's own validated path — the same one the picker
 * uses. It deliberately goes through the `request` fixture rather than
 * `page.request`: that is a separate cookie jar, so the browser context the test
 * then opens has never seen the first-paint cookie and the server has to resolve
 * the theme from the stored record. Setting it here therefore proves MORE than a
 * raw `UPDATE` did, not less.
 *
 * It is also roughly two seconds a call cheaper than shelling out to
 * `wrangler d1 execute`, which — across this file's ~44 tests plus their reset —
 * was the single largest consumer of the Playwright shard budget.
 */
async function storeTheme(
  request: APIRequestContext,
  themeId: string,
): Promise<void> {
  const response = await request.post("/preferences/theme", {
    form: { theme: themeId },
    maxRedirects: 0,
  });
  // The action answers with a redirect; anything else means it did not store.
  expect(
    response.status(),
    `storing theme "${themeId}" did not redirect`,
  ).toBeGreaterThanOrEqual(300);
  expect(response.status()).toBeLessThan(400);
}

/** Put the stored preference back to the shipped default. */
async function resetTheme(request: APIRequestContext): Promise<void> {
  await storeTheme(request, "system");
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

test.afterEach(async ({ request }) => {
  await resetTheme(request);
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
    request,
  }) => {
    // Stored from a separate cookie jar, then read in a browser context that has
    // never seen the theme cookie. If the preference only lived in the cookie,
    // this would fall back to the default.
    await storeTheme(request, "eucalypt");
    const context = await browser.newContext();
    const page = await context.newPage();
    await gotoFixture(page, "/today");
    await expect(appliedTheme(page)).toHaveAttribute("data-theme", "eucalypt");
    await context.close();
  });

  test("falls back to the default when the stored theme no longer exists", async ({
    page,
    request,
  }) => {
    // A theme removed by a later release must degrade to a complete, readable
    // theme rather than leaving the document unstyled.
    //
    // This is the ONE case that still needs raw SQL: the value it has to plant is
    // one the product refuses to write, and the column's CHECK constraint refuses
    // to store, so it can only be reached by suspending the constraint. Store a
    // valid theme through the action first, so the owner row is guaranteed to
    // exist for the UPDATE below regardless of which test ran before this one.
    await storeTheme(request, "coastal");
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
    request,
  }) => {
    await storeTheme(request, "daly-dark");

    // Read the RAW server response, before any JavaScript runs. If the theme were
    // applied on the client there would be a light-themed first paint.
    const response = await page.request.get("/today");
    const html = await response.text();
    expect(html).toContain('data-theme="daly-dark"');
    // …and no client bootstrapping script racing to correct it.
    expect(html).not.toContain("prefers-color-scheme");
    expect(html).not.toMatch(/document\.documentElement\.dataset\.theme/);
  });

  test("serves each curated theme in the first byte", async ({
    page,
    request,
  }) => {
    for (const theme of THEMES) {
      await storeTheme(request, theme.id);
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
    // ASSET-02 — the Assets collection carries its own state language (overdue,
    // due soon, reading needed), so it belongs in the five-theme sweep.
    { path: "/assets", label: "Assets" },
    { path: "/settings?section=appearance", label: "Settings" },
    { path: "/help", label: "Help" },
    { path: "/about", label: "About" },
  ];

  for (const theme of THEMES) {
    for (const surface of SURFACES) {
      test(`${surface.label} renders correctly in ${theme.name}`, async ({
        page,
        request,
      }) => {
        await storeTheme(request, theme.id);
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
    request,
  }) => {
    // Priority must never be colour-only. In Daly Dark in particular, the label
    // has to still be there and still be legible.
    await storeTheme(request, "daly-dark");
    await gotoFixture(page, "/tasks");
    const chip = page.locator(".dh-priority").first();
    if ((await chip.count()) > 0) {
      await expect(chip).toContainText(/P[1-4]/);
    }
  });
});

test.describe("THEME-01 on a phone", () => {
  for (const theme of [THEMES[0], THEMES[1]]) {
    test(`phone navigation works in ${theme.name}`, async ({
      page,
      request,
    }) => {
      await storeTheme(request, theme.id);
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
