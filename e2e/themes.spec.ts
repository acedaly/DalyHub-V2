/**
 * THEME-01 / THEME-02 — the curated theme system, driven through the real product.
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

/** Every curated theme, with the display name the picker shows. */
const THEMES = [
  { id: "daly-light", name: "Daly Light", appearance: "light" },
  { id: "daly-dark", name: "Daly Dark", appearance: "dark" },
  { id: "modern-light", name: "Modern Light", appearance: "light" },
  { id: "modern-dark", name: "Modern Dark", appearance: "dark" },
  { id: "eucalypt", name: "Eucalypt", appearance: "light" },
  { id: "coastal", name: "Coastal", appearance: "light" },
  { id: "ember", name: "Ember", appearance: "light" },
] as const;

/** THEME-02 — the pair, referenced by name where a test is about the pair. */
const MODERN_LIGHT = THEMES[2];
const MODERN_DARK = THEMES[3];

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
  test("offers every curated theme plus Match system", async ({ page }) => {
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

/* -------------------------------------------------------------------------- */
/* THEME-02 — the Modern pair                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The modules the Modern pair is verified across. The THEME-01 sweep above walks
 * SIX surfaces in EVERY theme; this walks the whole product in the two themes this
 * milestone actually introduced, which is where an unthemed component would show
 * up. Splitting it this way keeps the Playwright budget proportionate to what
 * changed instead of multiplying every module by every theme.
 */
const MODERN_MODULES = [
  { path: "/today", label: "Today" },
  { path: "/tasks", label: "Tasks" },
  { path: "/projects", label: "Projects" },
  { path: "/areas", label: "Areas" },
  { path: "/meetings", label: "Meetings" },
  { path: "/notes", label: "Notes" },
  { path: "/people", label: "People" },
  { path: "/reviews", label: "Reviews" },
  { path: "/settings", label: "Settings" },
];

/** Parse a computed `rgb()` / `rgba()` string into WCAG relative luminance. */
async function surfaceLuminance(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (element === null) {
      return Number.NaN;
    }
    const parsed = /rgba?\(([^)]+)\)/.exec(
      getComputedStyle(element).backgroundColor,
    );
    if (parsed === null) {
      return Number.NaN;
    }
    const [r, g, b] = parsed[1]
      .split(",")
      .slice(0, 3)
      .map((part) => Number(part.trim()) / 255)
      .map((channel) =>
        channel <= 0.03928
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }, selector);
}

/** WCAG relative luminance of a computed `rgb()` / `rgba()` colour string. */
function computedLuminance(colour: string): number {
  const parsed = /rgba?\(([^)]+)\)/.exec(colour);
  if (parsed === null) {
    return Number.NaN;
  }
  const [r, g, b] = parsed[1]
    .split(",")
    .slice(0, 3)
    .map((part) => Number(part.trim()) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two computed colour strings. */
function contrastRatio(a: string, b: string): number {
  const la = computedLuminance(a);
  const lb = computedLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test.describe("THEME-02 the Modern pair across the product", () => {
  for (const theme of [MODERN_LIGHT, MODERN_DARK]) {
    for (const module of MODERN_MODULES) {
      test(`${module.label} renders correctly in ${theme.name}`, async ({
        page,
        request,
      }) => {
        await storeTheme(request, theme.id);
        await gotoFixture(page, module.path);

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

test.describe("THEME-02 no light surface leaks into Modern Dark", () => {
  /**
   * The failure a dark theme actually ships with is not a wrong hex in the token
   * file — the unit tests catch that — it is a component that never consumed a
   * token and stays light. So this measures the RENDERED background of the shell,
   * the rail, the pane and a real card, and fails if any of them is light.
   */
  const DARK_SURFACES = [
    { selector: ".dh-app", label: "application frame" },
    { selector: ".dh-sidebar", label: "navigation rail" },
    { selector: ".dh-pane", label: "content pane" },
  ];

  for (const surface of DARK_SURFACES) {
    test(`the ${surface.label} is painted dark`, async ({ page, request }) => {
      await storeTheme(request, MODERN_DARK.id);
      await gotoFixture(page, "/today");
      const luminance = await surfaceLuminance(page, surface.selector);
      // Not NaN: a missing element would silently pass a "< 0.1" assertion.
      expect(Number.isNaN(luminance), `${surface.selector} not found`).toBe(
        false,
      );
      expect(
        luminance,
        `${surface.label} luminance ${luminance.toFixed(3)} is a light surface`,
      ).toBeLessThan(0.1);
    });
  }

  test("the whole page paints dark, with no light block left behind", async ({
    page,
    request,
  }) => {
    await storeTheme(request, MODERN_DARK.id);
    await gotoFixture(page, "/today");

    // Every element with its OWN (non-transparent) background must be dark. This
    // catches an unthemed panel that inherits nothing and paints white.
    const lightElements = await page.evaluate(() => {
      const relativeLuminance = (colour: string): number | null => {
        const parsed = /rgba?\(([^)]+)\)/.exec(colour);
        if (parsed === null) return null;
        const parts = parsed[1].split(",").map((part) => Number(part.trim()));
        // Fully transparent backgrounds paint nothing.
        if (parts.length > 3 && parts[3] === 0) return null;
        const [r, g, b] = parts
          .slice(0, 3)
          .map((value) => value / 255)
          .map((channel) =>
            channel <= 0.03928
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4,
          );
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };

      const offenders: string[] = [];
      for (const element of Array.from(document.querySelectorAll("*"))) {
        const rect = element.getBoundingClientRect();
        // Only surfaces big enough to be a panel — a small light chip is a
        // legitimate status tint, not a leak.
        if (rect.width < 160 || rect.height < 60) continue;
        const luminance = relativeLuminance(
          getComputedStyle(element).backgroundColor,
        );
        if (luminance !== null && luminance > 0.3) {
          offenders.push(
            `${element.tagName.toLowerCase()}.${element.className.toString().slice(0, 60)}`,
          );
        }
      }
      return offenders;
    });

    expect(lightElements).toEqual([]);
  });
});

test.describe("THEME-02 the pair changes treatment, not structure", () => {
  /** Measure the geometry a theme must NOT be able to change. */
  async function geometry(page: Page) {
    return page.evaluate(() => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (element === null) return null;
        const style = getComputedStyle(element);
        return {
          radius: style.borderRadius,
          padding: style.padding,
          fontSize: style.fontSize,
          minHeight: style.minHeight,
        };
      };
      return {
        rail: read(".dh-sidebar"),
        navLink: read(".dh-nav__link"),
        pane: read(".dh-pane"),
      };
    });
  }

  test("keeps identical geometry, spacing and type between the two", async ({
    page,
    request,
  }) => {
    await storeTheme(request, MODERN_LIGHT.id);
    await gotoFixture(page, "/today");
    const light = await geometry(page);

    await storeTheme(request, MODERN_DARK.id);
    await gotoFixture(page, "/today");
    const dark = await geometry(page);

    expect(light.rail).not.toBeNull();
    expect(light.navLink).not.toBeNull();
    expect(dark).toEqual(light);
  });
});

test.describe("THEME-02 selected navigation", () => {
  for (const theme of [MODERN_LIGHT, MODERN_DARK]) {
    test(`marks the current module with more than colour in ${theme.name}`, async ({
      page,
      request,
    }) => {
      await storeTheme(request, theme.id);
      await gotoFixture(page, "/tasks");

      const current = page.locator('.dh-nav__link[aria-current="page"]');
      await expect(current).toHaveCount(1);
      // Semantics first: `aria-current` is what a screen reader announces.
      await expect(current).toHaveAttribute("aria-current", "page");
      // Then the non-colour reinforcement: a heavier weight and a real tint that
      // is not simply the rail's own background.
      const treatment = await current.evaluate((element) => {
        const style = getComputedStyle(element);
        const rail = document.querySelector(".dh-sidebar");
        return {
          weight: Number(style.fontWeight),
          background: style.backgroundColor,
          railBackground:
            rail === null ? "" : getComputedStyle(rail).backgroundColor,
          indicator: getComputedStyle(element, "::before").backgroundColor,
        };
      });
      expect(treatment.weight).toBeGreaterThanOrEqual(600);
      expect(treatment.background).not.toBe(treatment.railBackground);
      expect(treatment.indicator).not.toBe("rgba(0, 0, 0, 0)");

      // The bar is a non-text cue carrying state, so it owes 3:1 against the
      // surface it is actually painted on (AGENTS.md §15). Measured on the
      // RENDERED colours rather than on a token pair, because the token test can
      // only check the pair it is told about — it cannot notice the bar being
      // repainted with a different token. This caught a real regression: the bar
      // first used `accent`, whose contrast is guaranteed against the PAGE
      // surfaces, and on the darker selected tint it fell to 2.96:1 in Daly Dark
      // and 2.73:1 in Modern Dark.
      const ratio = contrastRatio(treatment.indicator, treatment.background);
      expect(
        ratio,
        `indicator ${treatment.indicator} on ${treatment.background} = ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    });
  }
});

test.describe("THEME-02 the pair on a phone", () => {
  for (const theme of [MODERN_LIGHT, MODERN_DARK]) {
    test(`Today and Tasks stay usable at 375px in ${theme.name}`, async ({
      page,
      request,
    }) => {
      await storeTheme(request, theme.id);
      await page.setViewportSize({ width: 375, height: 812 });

      for (const path of ["/today", "/tasks"]) {
        await gotoFixture(page, path);
        await expect(appliedTheme(page)).toHaveAttribute(
          "data-theme",
          theme.id,
        );
        await expect(page.locator("[data-testid='bottom-nav']")).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectNoAxeViolations(page);
      }
    });
  }
});
