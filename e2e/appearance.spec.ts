/**
 * APPEARANCE-01 — the appearance preference, end to end.
 *
 * What is actually being proven here is not "a class changes". It is that the
 * SERVER decides the appearance and the document arrives already painted, that
 * the stored choice survives a navigation and a reload, that `System` genuinely
 * follows the device, and that an explicit Light or Dark genuinely does not.
 *
 * The device appearance is EMULATED (`colorScheme`), never inferred from the
 * machine running the suite, so every one of those combinations is deterministic
 * — including the two that are easy to get wrong and impossible to notice by
 * hand: an explicit Light on a dark device, and an explicit Dark on a light one.
 *
 * The assertions read the RESOLVED background of the document rather than a class
 * name, because that is the thing an owner sees, and it is what a broken cascade
 * would break while the attribute stayed perfectly correct.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  awaitMutation,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import { d1Execute } from "./d1";

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

/**
 * The route the selector posts to (`APPEARANCE_ACTION_PATH` in
 * `app/shared/shell/AppearanceSelector.tsx`, and `app/routes.ts`).
 *
 * Restated here rather than imported: the E2E suite is a browser client of the
 * product, not a consumer of its modules, and importing the selector would pull
 * React into a Playwright process to read one string. The REFUSES journey below
 * already writes the same path out by hand for the same reason, and the pair is
 * kept honest by the journeys themselves — a path that stopped matching would
 * make every `chooseAppearance` below time out at once, loudly.
 *
 * A REGEX, not a string: React Router's single fetch submits the action as
 * `/preferences/appearance.data`, and matching only the bare path would wait for
 * a request the product never makes. The REFUSES journey below has always
 * written it this way.
 */
const APPEARANCE_ACTION_PATH = /^\/preferences\/appearance(\.data)?$/;

/** Put the owner back on the shipped default, so specs cannot leak into each other. */
function resetAppearance(): void {
  setStoredAppearance("system");
}

/**
 * Write the appearance STRAIGHT TO THE RECORD, bypassing the product.
 *
 * That is the point: it simulates the choice having been made on a DIFFERENT
 * device, which is the only way to reach the state where the record and this
 * browser's cookie disagree.
 */
function setStoredAppearance(value: "system" | "light" | "dark"): void {
  d1Execute(
    `UPDATE owner_app_preferences SET appearance = '${value}' WHERE workspace_id = '${WORKSPACE_ID}' AND owner_id = '${OWNER_ID}';`,
  );
}

/** The account-menu trigger in the desktop top app bar. */
function accountTrigger(page: Page) {
  return page.getByRole("button", { name: /Account/ });
}

/** An appearance option, inside whichever appearance group is on screen. */
function appearanceOption(page: Page, label: string) {
  return page
    .getByRole("group", { name: "Appearance" })
    .getByRole("radio", { name: new RegExp(label) });
}

/**
 * Choose an appearance and wait for the CHOICE TO BE STORED (DEBT-203).
 *
 * `AppearanceSelector` writes `<html data-appearance>` OPTIMISTICALLY and posts
 * to `/preferences/appearance` behind it, so the attribute this file asserts on
 * is true about the browser before it is true about the record. Every journey
 * here then navigates or reloads, and the claim under test is that the STORED
 * choice survives that — so on a slow server the navigation beat the save and
 * the new document was rendered from a cookie not yet written. Measured on the
 * gate as `appearance.spec.ts:92`, on a tree the PR had not touched.
 *
 * The wait is the response, not a duration: the shape `meetings-concurrency`
 * already used, now shared through `awaitMutation`.
 */
async function chooseAppearance(page: Page, label: string): Promise<void> {
  await awaitMutation(page, APPEARANCE_ACTION_PATH, () =>
    appearanceOption(page, label).click(),
  );
}

/** The `<html data-appearance>` value the server rendered. */
async function storedAppearance(page: Page): Promise<string | null> {
  return page.locator("html").getAttribute("data-appearance");
}

/**
 * Whether the page canvas is actually painting DARK.
 *
 * Read from the computed background of the shell frame rather than from a token
 * name or a class, because the token is what a broken cascade leaves correct
 * while the paint goes wrong. The luminance test is deliberately coarse: the two
 * appearances are nowhere near each other, so the exact hex does not need pinning
 * here (the token tests do that).
 */
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

test.describe("APPEARANCE-01 — choosing an appearance", () => {
  test.beforeEach(() => resetAppearance());
  test.afterAll(() => resetAppearance());

  test("selects Light from the account menu, and it survives a navigation", async ({
    page,
  }) => {
    // A DARK device throughout, so "Light won" is a real assertion rather than a
    // coincidence of whatever the runner is set to.
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/today");
    expect(await storedAppearance(page)).toBe("system");
    expect(await paintsDark(page)).toBe(true);

    await accountTrigger(page).click();
    await chooseAppearance(page, "Light");

    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "light",
    );
    await expect.poll(() => paintsDark(page)).toBe(false);

    // The choice is a PREFERENCE, not a page state: another route must arrive
    // already light, from the server.
    await gotoFixture(page, "/notes");
    expect(await storedAppearance(page)).toBe("light");
    expect(await paintsDark(page)).toBe(false);
  });

  test("selects Dark from Settings, and it survives a reload", async ({
    page,
  }) => {
    // A LIGHT device throughout, so "Dark won" is likewise a real assertion.
    await page.emulateMedia({ colorScheme: "light" });
    await gotoFixture(page, "/settings");

    await chooseAppearance(page, "Dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expect.poll(() => paintsDark(page)).toBe(true);

    await page.reload();
    // Arrived dark on the FIRST byte: server-rendered, no bootstrapping script.
    expect(await storedAppearance(page)).toBe("dark");
    expect(await paintsDark(page)).toBe(true);
  });

  test("keeps the account menu and Settings showing the same current value", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");
    await chooseAppearance(page, "Dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );

    // Same preference, other surface — including on a different route.
    await gotoFixture(page, "/today");
    await accountTrigger(page).click();
    await expect(appearanceOption(page, "Dark")).toBeChecked();
    await expect(appearanceOption(page, "Light")).not.toBeChecked();
  });

  test("honours the device under System, and ignores it under an explicit choice", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/today");
    expect(await storedAppearance(page)).toBe("system");
    expect(await paintsDark(page)).toBe(true);

    // System keeps up with the device WHILE the page is open — no reload, no
    // listener: the stylesheet's media query re-evaluates itself.
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => paintsDark(page)).toBe(false);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => paintsDark(page)).toBe(true);

    // An explicit Light must then IGNORE the same device changes.
    await accountTrigger(page).click();
    await chooseAppearance(page, "Light");
    await expect.poll(() => paintsDark(page)).toBe(false);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => paintsDark(page)).toBe(false);

    // ...and going back to System hands the decision back to the device.
    await chooseAppearance(page, "System");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "system",
    );
    await expect.poll(() => paintsDark(page)).toBe(true);
  });

  test("pins color-scheme so native controls follow the chosen appearance", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/settings");
    const colorScheme = () =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).colorScheme,
      );
    expect(await colorScheme()).toBe("light dark");

    await chooseAppearance(page, "Light");
    await expect.poll(colorScheme).toBe("light");

    await chooseAppearance(page, "Dark");
    await expect.poll(colorScheme).toBe("dark");
  });

  /**
   * Hold (and optionally fail) ONLY the appearance action's POST.
   *
   * The matcher is deliberately narrow. The dev server also serves the module
   * `/app/kernel/preferences/appearance.ts`, and a glob like
   * `**\/preferences/appearance*` swallows that request too — which breaks the
   * page's module graph and produces a green-looking test that proved nothing.
   * React Router's single fetch posts to `<path>.data`, so both forms are named.
   */
  async function holdAppearanceWrite(
    page: Page,
    options: { readonly delayMs: number; readonly fail?: boolean },
  ) {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const isActionPost =
        request.method() === "POST" &&
        /^\/preferences\/appearance(\.data)?$/.test(pathname);
      if (!isActionPost) {
        return route.fallback();
      }
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      return options.fail
        ? route.fulfill({ status: 500, contentType: "text/x-script", body: "" })
        : route.continue();
    });
  }

  test("repaints the document OPTIMISTICALLY, without waiting for the write", async ({
    page,
  }) => {
    // The control moving while the page keeps its old colour is an interaction
    // that reports itself as done and is not. With the write held for three
    // seconds, the repaint has to come from the optimistic path or not at all.
    await gotoFixture(page, "/settings");
    await holdAppearanceWrite(page, { delayMs: 3000 });

    await chooseAppearance(page, "Dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
      { timeout: 1500 },
    );
    await expect.poll(() => paintsDark(page)).toBe(true);

    // ...and it is still dark once the slow write lands and revalidation runs.
    await expect
      .poll(() => storedAppearance(page), { timeout: 10_000 })
      .toBe("dark");
  });

  test("rolls the document back, and writes no cookie, when the save FAILS", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");
    await holdAppearanceWrite(page, { delayMs: 1500, fail: true });

    /*
     * NOT `chooseAppearance` — this is the one journey whose subject is the
     * window between the click and the answer.
     *
     * Everywhere else in this file the wait belongs on the POST, because the
     * claim is that the STORED choice survives a navigation. Here the claim is
     * that the optimistic paint is reversible, so waiting for the response
     * before asserting the optimistic state would assert it after the rollback
     * it is meant to precede. Measured: with the wait in place the "Optimistic
     * first" assertion below failed, on a product doing exactly what it should.
     */
    await appearanceOption(page, "Dark").click();
    // Optimistic first...
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
      { timeout: 1500 },
    );
    // ...then REVERSIBLE: a rejected write must not leave the document painted
    // in an appearance the server never stored.
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "system",
      { timeout: 10_000 },
    );

    // And the first-paint cookie is not written on a failed save — otherwise the
    // shell (which prefers the record) and `/offline` (which reads the cookie)
    // would show the same browser two different appearances for up to a year.
    const cookies = await page.context().cookies();
    expect(cookies.filter((cookie) => cookie.name === "dh_appearance")).toEqual(
      [],
    );
  });

  test("carries a stored appearance to a NEW device, and mirrors it into the cookie", async ({
    page,
  }) => {
    // The owner chose Dark somewhere else; this browser has never seen it.
    setStoredAppearance("dark");
    await page.emulateMedia({ colorScheme: "light" });
    expect(await page.context().cookies()).toEqual([]);

    await gotoFixture(page, "/today");

    // The shell renders it, because the record is the authority...
    expect(await storedAppearance(page)).toBe("dark");
    await expect.poll(() => paintsDark(page)).toBe(true);

    // ...and the first-paint cookie has been RECONCILED from that record, which
    // is what makes calling it a mirror true. Without this the cookie would stay
    // absent on this device forever, because only the action ever wrote it.
    const cookies = await page.context().cookies();
    expect(
      cookies.find((cookie) => cookie.name === "dh_appearance")?.value,
    ).toBe("dark");
  });

  test("gives a document OUTSIDE the shell the right appearance once reconciled", async ({
    page,
  }) => {
    // `/offline` never reaches the app-shell loader, so the cookie is the only
    // thing it can read. This is the case the reconciliation exists for: before
    // it, a second device painted `/offline` as `system` indefinitely.
    setStoredAppearance("dark");
    await page.emulateMedia({ colorScheme: "light" });

    // Visiting the shell once is what mirrors the record into the cookie.
    await gotoFixture(page, "/today");

    await page.goto("/offline");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
  });

  test("REFUSES a malformed write instead of resetting the stored preference", async ({
    page,
  }) => {
    // A stale or tampered submission must not be able to quietly replace an
    // explicit Dark with `system`. Losing a setting silently is worse than
    // refusing to change it.
    setStoredAppearance("dark");
    await gotoFixture(page, "/settings");

    await page.route("**/*", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      const isActionPost =
        request.method() === "POST" &&
        /^\/preferences\/appearance(\.data)?$/.test(pathname);
      return isActionPost
        ? route.continue({ postData: "appearance=eucalypt" })
        : route.fallback();
    });

    const refused = page.waitForResponse(
      (response) =>
        /^\/preferences\/appearance(\.data)?$/.test(
          new URL(response.url()).pathname,
        ) && response.request().method() === "POST",
    );
    await appearanceOption(page, "Light").click();
    expect((await refused).status()).toBe(400);

    // The document reverts to the stored appearance...
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
      { timeout: 10_000 },
    );
    // ...the owner is told...
    await expect(
      page.getByText(/Couldn’t save your appearance/).first(),
    ).toBeVisible();
    // ...and the page is still usable — a refused preference write is not an
    // error-boundary event. Asserted on the control itself rather than on the
    // "Appearance" group, which on Settings legitimately matches three nested
    // elements (the section, the settings group and the fieldset).
    await expect(appearanceOption(page, "Dark")).toBeChecked();

    // Most importantly: the stored choice is untouched. A reload proves it came
    // back from the record rather than from client state.
    await page.reload();
    expect(await storedAppearance(page)).toBe("dark");
  });

  test("is reachable and operable by keyboard alone, with visible focus", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");
    const system = appearanceOption(page, "System");
    await system.focus();
    await expect(system).toBeFocused();

    // A native radio group: arrows move and select within the group, which is
    // the whole reason the control is real radios rather than buttons.
    await page.keyboard.press("ArrowDown");
    await expect(appearanceOption(page, "Light")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "light",
    );

    await page.keyboard.press("ArrowDown");
    await expect(appearanceOption(page, "Dark")).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
  });

  test("meets the touch-target minimum, and fits a 320px viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    // `?section=general`, not bare `/settings`. On a phone the Settings route is
    // an INDEX of sections — the controls themselves live one level down, which
    // is the whole point of that layout — so a bare `/settings` at 320px renders
    // a list of links and no Appearance group at all. The desktop tests above
    // keep the bare URL because both panes are on screen there. This test was
    // asserting the desktop composition at a phone width and had been failing
    // since Settings gained the index (one of DEBT-125's undiagnosed failures).
    await gotoFixture(page, "/settings?section=general");
    for (const label of ["System", "Light", "Dark"]) {
      // The measurable target is the row, not the 16px radio inside it.
      await expectMinTouchTarget(
        page
          .getByRole("group", { name: "Appearance" })
          .locator(".dh-appearance__option")
          .filter({ hasText: label }),
      );
    }
    await expectNoHorizontalOverflow(page);
  });

  test("passes the accessibility scan in BOTH appearances", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");

    await chooseAppearance(page, "Light");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "light",
    );
    await expectNoAxeViolations(page);

    await chooseAppearance(page, "Dark");
    await expect(page.locator("html")).toHaveAttribute(
      "data-appearance",
      "dark",
    );
    await expectNoAxeViolations(page);
  });

  test("keeps the account menu usable and inside the viewport at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/today");

    // At phone width the account menu lives at the bottom of the complete
    // navigation sheet, which "More" opens.
    await page
      .locator("[data-testid='bottom-nav']")
      .getByRole("button", { name: "More" })
      .click();
    // In the phone sheet the account trigger shows the owner's NAME rather than
    // the compact top-bar "Account" label, so it is located by its component
    // class — the one thing both placements share. The desktop bar's own trigger
    // is in the DOM too (it is `display: none` at this width), so the visible one
    // is selected explicitly rather than by index.
    await page
      .locator(".dh-user-menu__trigger")
      .filter({ visible: true })
      .click();

    const group = page.getByRole("group", { name: "Appearance" });
    await expect(group).toBeVisible();
    const box = await group.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(320.5);
    await expectNoHorizontalOverflow(page);
  });
});
