/**
 * THEME-01 — the colour-scheme preference, end to end.
 *
 * What is proven here is not "an attribute changes". It is that the SERVER
 * decides the scheme and the document arrives already painted in it, that the
 * stored choice survives a navigation and a reload, that the scheme and the
 * appearance are genuinely INDEPENDENT (the combination is what a two-attribute
 * cascade gets wrong), and that a stale or unrecognised stored value lands the
 * owner on Daly Violet rather than on an unstyled page.
 *
 * The assertions read the RESOLVED colour of real surfaces rather than a class or
 * a token name, because that is the thing an owner sees, and it is what a broken
 * cascade would break while the attribute stayed perfectly correct.
 *
 * Deliberately NOT here: a screenshot of every screen in every scheme in both
 * appearances. The scheme system's correctness is a token contract, and that is
 * asserted exhaustively and cheaply in `test/unit/tokens`. This file covers the
 * behaviour only a browser can show.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import { d1Execute } from "./d1";

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

/** Put the owner back on the shipped defaults, so specs cannot leak into each other. */
function resetPreferences(): void {
  d1Execute(
    `UPDATE owner_app_preferences SET color_scheme = 'violet', appearance = 'system' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

/**
 * Write the scheme STRAIGHT TO THE RECORD, bypassing the product.
 *
 * That is the point: it simulates the choice having been made on a DIFFERENT
 * device, which is the only way to reach the state where the record and this
 * browser's cookie disagree.
 */
function setStoredScheme(value: string): void {
  d1Execute(
    `UPDATE owner_app_preferences SET color_scheme = '${value}' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

/**
 * Open Settings, and its General section.
 *
 * Below the `md` breakpoint Settings is a two-level surface: the route renders a
 * LIST of sections, and choosing one opens it. A phone-width spec therefore has
 * to navigate the way an owner does rather than expect a desktop layout to be
 * there; at desktop width the section is already open and the link is the
 * sidebar entry, so one helper covers both.
 */
async function gotoAppearanceSettings(page: Page): Promise<void> {
  await gotoFixture(page, "/settings?section=general");
}

/** A colour-scheme option, inside the Settings scheme group. */
function schemeOption(page: Page, label: string) {
  return page
    .getByRole("group", { name: "Colour scheme" })
    .getByRole("radio", { name: new RegExp(label) });
}

/** The `<html data-color-scheme>` value the server rendered. */
async function storedScheme(page: Page): Promise<string | null> {
  return page.locator("html").getAttribute("data-color-scheme");
}

/** The resolved background of the shell frame, as `rgb(r, g, b)`. */
async function canvasColor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const frame = document.querySelector(".dh-app") ?? document.body;
    return getComputedStyle(frame).backgroundColor;
  });
}

/** The resolved primary role — the one colour a scheme is most recognisable by. */
async function primaryColor(page: Page): Promise<string> {
  return page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--md-sys-color-primary")
      .trim(),
  );
}

/** Whether the page canvas is actually painting DARK. */
async function paintsDark(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const frame = document.querySelector(".dh-app") ?? document.body;
    const background = getComputedStyle(frame).backgroundColor;
    const parts = background.match(/\d+(\.\d+)?/g)?.map(Number) ?? [
      255, 255, 255,
    ];
    const [r, g, b] = parts;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  });
}

/*
 * SERIAL, and deliberately.
 *
 * Every test in this file reads and writes the SAME owner preferences row — that
 * is what a preference is — and several of them write it out of band (through
 * D1) to simulate a choice made on another device. Run in parallel those writes
 * interleave, and a test fails for a reason that has nothing to do with the
 * product. Serial costs a couple of minutes of wall clock and buys assertions
 * that mean what they say.
 */
test.describe.configure({ mode: "serial" });

test.describe("THEME-01 — choosing a colour scheme", () => {
  test.beforeEach(() => resetPreferences());
  test.afterAll(() => resetPreferences());

  test("defaults to Daly Violet, and says so in Settings", async ({ page }) => {
    // §45 — an owner who has never chosen a scheme must see exactly what they saw
    // before this feature existed.
    await gotoFixture(page, "/settings");
    expect(await storedScheme(page)).toBe("violet");
    await expect(schemeOption(page, "Daly Violet")).toBeChecked();
  });

  test("switches scheme immediately, with no reload", async ({ page }) => {
    // §25 — tap Electric, see Electric. The primary is read from the resolved
    // custom property, so this fails if the attribute moves and the cascade does
    // not.
    await gotoFixture(page, "/settings");
    const before = await primaryColor(page);

    await schemeOption(page, "Electric").click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "electric",
    );
    await expect.poll(() => primaryColor(page)).not.toBe(before);

    // …and again, to a scheme with a completely different character.
    const electric = await primaryColor(page);
    await schemeOption(page, "Pulse").click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "pulse",
    );
    await expect.poll(() => primaryColor(page)).not.toBe(electric);
  });

  test("keeps the chosen scheme across a navigation and a reload", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");
    await schemeOption(page, "Ocean").click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "ocean",
    );
    const ocean = await primaryColor(page);

    // The choice is a PREFERENCE, not a page state: another route must arrive
    // already painted, from the server.
    await gotoFixture(page, "/today");
    expect(await storedScheme(page)).toBe("ocean");
    expect(await primaryColor(page)).toBe(ocean);

    await gotoFixture(page, "/tasks");
    expect(await storedScheme(page)).toBe("ocean");

    await page.reload();
    // Arrived Ocean on the FIRST byte: server-rendered, no bootstrapping script.
    expect(await storedScheme(page)).toBe("ocean");
    expect(await primaryColor(page)).toBe(ocean);
  });

  test("is INDEPENDENT of the appearance, in every combination", async ({
    page,
  }) => {
    /*
     * §3, and the assertion this whole file exists for. Two root attributes, four
     * interesting combinations, and a cascade that has to resolve all of them:
     *
     *   Pulse  + explicit Light  on a DARK device   → light Pulse
     *   Pulse  + explicit Dark   on a LIGHT device  → dark Pulse
     *   Pulse  + System          follows the device → both
     *
     * A scheme whose dark block loses to another scheme's light block passes
     * every static check and fails exactly here.
     */
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/settings");
    await schemeOption(page, "Pulse").click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "pulse",
    );
    // System on a dark device: dark Pulse.
    await expect.poll(() => paintsDark(page)).toBe(true);
    const darkPulse = await primaryColor(page);

    // Explicit Light on a dark device: LIGHT Pulse — a different primary, and a
    // light canvas, with the scheme untouched.
    await page
      .getByRole("group", { name: "Appearance" })
      .getByRole("radio", { name: /Light/ })
      .click();
    await expect.poll(() => paintsDark(page)).toBe(false);
    expect(await storedScheme(page)).toBe("pulse");
    const lightPulse = await primaryColor(page);
    expect(lightPulse).not.toBe(darkPulse);

    // Explicit Dark on a LIGHT device: dark Pulse again.
    await page.emulateMedia({ colorScheme: "light" });
    await page
      .getByRole("group", { name: "Appearance" })
      .getByRole("radio", { name: /Dark/ })
      .click();
    await expect.poll(() => paintsDark(page)).toBe(true);
    await expect.poll(() => primaryColor(page)).toBe(darkPulse);
    expect(await storedScheme(page)).toBe("pulse");

    // And changing SCHEME does not disturb the explicit Dark.
    await schemeOption(page, "Graphite").click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "graphite",
    );
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expect.poll(() => paintsDark(page)).toBe(true);
  });

  test("paints every scheme differently, in both appearances", async ({
    page,
  }) => {
    // Five schemes that resolved to the same primary would satisfy every
    // behavioural assertion above and be one scheme wearing five names.
    await gotoFixture(page, "/settings");
    for (const appearance of ["Light", "Dark"] as const) {
      await page
        .getByRole("group", { name: "Appearance" })
        .getByRole("radio", { name: new RegExp(appearance) })
        .click();
      const seen = new Set<string>();
      for (const label of [
        "Daly Violet",
        "Electric",
        "Pulse",
        "Ocean",
        "Graphite",
      ]) {
        await schemeOption(page, label).click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-color-scheme",
          /.+/,
        );
        // Poll, because the repaint is a cascade re-evaluation after an attribute
        // write rather than a navigation.
        await expect
          .poll(async () => {
            const primary = await primaryColor(page);
            return seen.has(primary);
          })
          .toBe(false);
        seen.add(await primaryColor(page));
      }
      expect(seen.size, `${appearance}: ${[...seen].join(" ")}`).toBe(5);
    }
  });

  test("keeps working surfaces NEUTRAL in every scheme", async ({ page }) => {
    /*
     * §11 — the failure mode this whole architecture exists to prevent: "violet
     * theme = everything purple, blue theme = everything blue". The page canvas
     * is measured in every scheme and required to stay within a few points of
     * grey, so a future scheme cannot quietly colour-wash the product.
     *
     * The bar is the saturation of the painted canvas: the largest channel gap on
     * a near-white or near-black surface. The generated app-neutral palettes sit
     * far under it; a scheme that aliased its surfaces onto the system container
     * ramp would not.
     */
    await gotoFixture(page, "/today");
    for (const scheme of ["violet", "electric", "pulse", "ocean", "graphite"]) {
      setStoredScheme(scheme);
      await page.reload();
      expect(await storedScheme(page)).toBe(scheme);
      const spread = await page.evaluate(async () => {
        const frame = document.querySelector(".dh-app") ?? document.body;
        const parts =
          getComputedStyle(frame)
            .backgroundColor.match(/\d+(\.\d+)?/g)
            ?.map(Number) ?? [];
        const [r, g, b] = parts;
        return Math.max(r, g, b) - Math.min(r, g, b);
      });
      expect(
        spread,
        `${scheme}: the page canvas (${await canvasColor(page)}) must stay neutral`,
      ).toBeLessThanOrEqual(12);
    }
  });

  test("falls back to Daly Violet for a tampered first-paint cookie", async ({
    page,
    context,
  }) => {
    /*
     * §30. The storage CHECK constraint and the strict write validator both make
     * an unknown scheme unreachable through the product, so the case is exercised
     * where it IS reachable: the first-paint cookie, which any browser can be made
     * to carry a nonsense value in, and which is the only thing a document outside
     * the shell can read.
     *
     * Both surfaces must survive it — `/offline`, which has nothing else to read,
     * and Settings, which must still render a working picker rather than an
     * unnamed radio group. (The stale-DATABASE-row case is asserted directly over
     * `normaliseStoredPreferences` in the unit suite, where a row can be forged.)
     */
    await context.addCookies([
      {
        name: "dh_color_scheme",
        value: "chartreuse",
        domain:
          new URL(page.url() || "http://localhost").hostname || "localhost",
        path: "/",
      },
    ]);
    await page.goto("/offline");
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "violet",
    );

    await gotoFixture(page, "/settings");
    expect(await storedScheme(page)).toBe("violet");
    await expect(schemeOption(page, "Daly Violet")).toBeChecked();
    // Fully painted, not unstyled: the primary resolves to a real colour.
    expect(await primaryColor(page)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("carries a stored scheme to a NEW device, and mirrors it into the cookie", async ({
    page,
  }) => {
    // The owner chose Electric somewhere else; this browser has never seen it.
    setStoredScheme("electric");
    expect(await page.context().cookies()).toEqual([]);

    await gotoFixture(page, "/today");

    // The shell renders it, because the record is the authority...
    expect(await storedScheme(page)).toBe("electric");

    // ...and the first-paint cookie has been RECONCILED from that record, which
    // is what makes calling it a mirror true. Without this the cookie would stay
    // absent on this device forever, because only the action ever wrote it.
    const cookies = await page.context().cookies();
    expect(
      cookies.find((cookie) => cookie.name === "dh_color_scheme")?.value,
    ).toBe("electric");
  });

  test("gives a document OUTSIDE the shell the right scheme once reconciled", async ({
    page,
  }) => {
    // `/offline` never reaches the app-shell loader, so the cookie is the only
    // thing it can read.
    setStoredScheme("graphite");
    await gotoFixture(page, "/today");

    await page.goto("/offline");
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "graphite",
    );
  });

  test("REFUSES a malformed write instead of resetting the stored scheme", async ({
    page,
  }) => {
    // A stale or tampered submission must not be able to quietly replace an
    // explicit Pulse with the default. Losing a setting silently is worse than
    // refusing to change it.
    setStoredScheme("pulse");
    await gotoFixture(page, "/settings");

    await page.route("**/*", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const isActionPost =
        request.method() === "POST" &&
        /^\/preferences\/color-scheme(\.data)?$/.test(pathname);
      return isActionPost
        ? route.continue({ postData: "colorScheme=chartreuse" })
        : route.fallback();
    });

    const refused = page.waitForResponse(
      (response) =>
        /^\/preferences\/color-scheme(\.data)?$/.test(
          new URL(response.url()).pathname,
        ) && response.request().method() === "POST",
    );
    await schemeOption(page, "Ocean").click();
    expect((await refused).status()).toBe(400);

    // The document reverts to the stored scheme...
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "pulse",
      { timeout: 10_000 },
    );
    // ...the owner is told...
    await expect(
      page.getByText(/Couldn’t save your colour scheme/).first(),
    ).toBeVisible();
    // ...and the page is still usable.
    await expect(schemeOption(page, "Pulse")).toBeChecked();

    // Most importantly: the stored choice is untouched.
    await page.unroute("**/*");
    await page.reload();
    expect(await storedScheme(page)).toBe("pulse");
  });

  test("is reachable and operable by keyboard alone, with visible focus", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");
    const violet = schemeOption(page, "Daly Violet");
    await violet.focus();
    await expect(violet).toBeFocused();

    // A native radio group: arrows move and select within the group, which is
    // the whole reason the control is real radios rather than buttons.
    await page.keyboard.press("ArrowDown");
    await expect(schemeOption(page, "Electric")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "electric",
    );

    await page.keyboard.press("ArrowDown");
    await expect(schemeOption(page, "Pulse")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      "pulse",
    );
  });

  test("meets the touch-target minimum, and fits a 320px viewport", async ({
    page,
  }) => {
    // §40 — the picker is the one new piece of UI, so it owes the same layout
    // guarantees as everything else and must not reintroduce horizontal overflow.
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoAppearanceSettings(page);
    for (const label of ["Daly Violet", "Electric", "Graphite"]) {
      await expectMinTouchTarget(
        page
          .getByRole("group", { name: "Colour scheme" })
          .locator(".dh-appearance__option")
          // Anchored: a row's text is its NAME followed by its description, and
          // a description may legitimately name a colour another scheme is
          // called. Matching the start of the row is matching the scheme.
          .filter({ hasText: new RegExp(`^${label}`) }),
      );
    }
    await expectNoHorizontalOverflow(page);
  });

  test("passes the accessibility scan in every scheme, in both appearances", async ({
    page,
  }) => {
    // §31 — a scheme is not "accessible because its primary button passes".
    // Settings is scanned in each scheme because it is the one surface that
    // renders every control family at once, and axe is run in both appearances.
    await gotoFixture(page, "/settings");
    for (const appearance of ["Light", "Dark"] as const) {
      await page
        .getByRole("group", { name: "Appearance" })
        .getByRole("radio", { name: new RegExp(appearance) })
        .click();
      for (const label of ["Electric", "Pulse", "Ocean", "Graphite"]) {
        await schemeOption(page, label).click();
        await expect(schemeOption(page, label)).toBeChecked();
        await expectNoAxeViolations(page);
      }
    }
  });

  test("shows a preview swatch per scheme, and never relies on it alone", async ({
    page,
  }) => {
    // §24 and §32 — the preview is useful, and it is decoration: the name and the
    // description carry the choice, and the swatches are hidden from assistive
    // technology rather than read out as three circles.
    await gotoFixture(page, "/settings");
    const group = page.getByRole("group", { name: "Colour scheme" });
    await expect(group.locator(".dh-scheme__preview")).toHaveCount(5);
    await expect(group.locator(".dh-scheme__swatch")).toHaveCount(15);
    await expect(
      group.locator(".dh-scheme__preview[aria-hidden='true']"),
    ).toHaveCount(5);
    // Each row previews its OWN scheme: five rows, five different primary dots.
    const swatches = await group
      .locator(".dh-scheme__swatch--primary")
      .evaluateAll((nodes) =>
        nodes.map((node) => getComputedStyle(node).backgroundColor),
      );
    expect(new Set(swatches).size, swatches.join(" ")).toBe(5);
  });
});
