/**
 * SET-03 — `Settings → Account & security`, driven end to end.
 *
 * The surface's whole value is that it does not overstate what DalyHub knows or
 * can do, so the journey asserts the ABSENCES as carefully as the presences: no
 * password control, no MFA control, no device list, no "sign out everywhere"
 * button, and no token or claim rendered anywhere. Those are the things a
 * well-meaning future edit adds, and they are the things that would make the
 * page lie.
 *
 * Sign-out itself is exercised up to the point where it hands the browser to
 * Cloudflare Access — that endpoint does not exist on the local dev server, and
 * simulating it would be testing a stub. What IS tested here is the part DalyHub
 * owns: the surface warns correctly about unsynchronised work before anyone
 * clicks, and the local-data controls confirm before they destroy.
 */

import { expect, test } from "@playwright/test";

import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const ACCOUNT_SECURITY = "/settings?section=account-security";

test.describe("SET-03 Account & security", () => {
  test("shows the signed-in identity and the session DalyHub can actually see", async ({
    page,
  }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);

    await expect(
      page.getByRole("heading", { name: "Account & security" }),
    ).toBeVisible();

    // Identity, from the server-validated session. The dev identity is the fixed
    // one `setup-dev-auth.mjs` configures.
    await expect(page.getByText("owner@example.invalid")).toBeVisible();
    await expect(page.getByText("Local Developer")).toBeVisible();
    await expect(page.getByText("Local development identity")).toBeVisible();

    // The session group reports the credential's own time bounds.
    await expect(page.getByText("Signed in at")).toBeVisible();
    await expect(page.getByText("Expires", { exact: true })).toBeVisible();

    // …and states the boundary rather than implying a device list.
    await expect(
      page.getByText(/cannot see your other sessions or devices/i),
    ).toBeVisible();
  });

  test("renders no credential, token or claim", async ({ page }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of [
      "eyj", // a JWT's leading characters
      "cf-access",
      "cf_authorization",
      "cloudflareaccess.com",
      "jwks",
      "bearer ",
      "local-dev-workspace", // the workspace id is server configuration
    ]) {
      expect(text, `"${forbidden}" must not be rendered`).not.toContain(
        forbidden,
      );
    }
  });

  test("offers no password, MFA or global sign-out control", async ({
    page,
  }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);

    // DalyHub does not own authentication, so it offers no control that implies
    // it does.
    for (const name of [
      /change password/i,
      /two-factor/i,
      /multi-factor/i,
      /passkey/i,
      /revoke/i,
    ]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }

    // The most dangerous possible overclaim: a button that ends one browser's
    // session while implying it ended all of them.
    await expect(page.getByRole("button", { name: /everywhere/i })).toHaveCount(
      0,
    );
    await expect(page.getByText(/DalyHub cannot do this/i)).toBeVisible();

    // What it DOES offer says exactly what it does.
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Sign out of this browser")).toBeVisible();
  });

  test("confirms before clearing this device, and says what survives", async ({
    page,
  }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);

    // The reproducible-data control: a plain confirmation, because nothing is
    // lost.
    await page.getByRole("button", { name: /Clear personal data…/ }).click();
    const first = page.getByRole("dialog");
    await expect(first).toBeVisible();
    await expect(
      first.getByText(/anything you captured offline is kept/i),
    ).toBeVisible();
    await first.getByRole("button", { name: /Cancel/ }).click();
    await expect(first).toBeHidden();

    // The destructive control: a TYPED confirmation, because this one can
    // destroy work that exists nowhere else.
    await page.getByRole("button", { name: /Clear everything…/ }).click();
    const second = page.getByRole("dialog");
    await expect(second).toBeVisible();
    const confirm = second.getByRole("button", { name: /^Clear everything$/ });
    await expect(confirm).toBeDisabled();
    await second.getByLabel(/Type clear to confirm/i).fill("clear");
    await expect(confirm).toBeEnabled();
    await second.getByRole("button", { name: /Cancel/ }).click();
    await expect(second).toBeHidden();
  });

  test("records a local-data clear in the owner's own security history", async ({
    page,
  }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);

    await page.getByRole("button", { name: /Clear personal data…/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Clear personal data$/ }).click();
    await expect(dialog).toBeHidden();

    // The history is a SERVER fact, so it survives a reload — which is the whole
    // reason clearing reports itself to the server rather than keeping a log in
    // the storage it just cleared.
    await gotoFixture(page, ACCOUNT_SECURITY);
    await expect(
      page.getByText(/Cleared a device's personal data/i).first(),
    ).toBeVisible();
  });

  test("is reachable from the Settings section navigation", async ({
    page,
  }) => {
    await gotoFixture(page, "/settings");
    await page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("link", { name: "Account & security" })
      .click();
    await expect(page).toHaveURL(/section=account-security/);
  });

  test("meets WCAG 2.2 AA", async ({ page }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);
    await expectNoAxeViolations(page);
  });

  test("keeps every control keyboard-reachable with a visible focus ring", async ({
    page,
  }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);
    const signOut = page.getByRole("button", { name: "Sign out", exact: true });
    await signOut.focus();
    await expect(signOut).toBeFocused();
    // A real focus indicator, not a removed outline.
    const outline = await signOut.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`;
    });
    expect(outline).not.toBe("none 0px none");
  });

  // 320 is the width the page has to survive: the identity values are long,
  // unbroken tokens, and a page that scrolls sideways on a phone because of an
  // email address is the specific failure this asserts against.
  for (const { label, width, height } of [
    { label: "mobile-320", width: 320, height: 720 },
    { label: "mobile-375", width: 375, height: 812 },
    { label: "mobile-390", width: 390, height: 844 },
    { label: "mobile-430", width: 430, height: 932 },
    { label: "tablet-768", width: 768, height: 1024 },
    { label: "desktop-1440", width: 1440, height: 900 },
  ]) {
    test(`fits ${label} with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await gotoFixture(page, ACCOUNT_SECURITY);
      await expect(
        page.getByRole("heading", { name: "Account & security" }),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      // Both danger actions are reachable and readable at this width — they are
      // not pushed off-screen or collapsed to an icon.
      await expect(
        page.getByRole("button", { name: /Clear personal data…/ }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Clear everything…/ }),
      ).toBeVisible();
    });
  }

  /*
   * Target size is asserted under a COARSE POINTER rather than a narrow
   * viewport, matching the convention `touch-targets.spec.ts` already states:
   * `.dh-settings-danger-button` reaches the 44px minimum behind
   * `@media (hover: none), (pointer: coarse)`, so a plain `setViewportSize`
   * measures the 36px desktop control height and would be asserting the wrong
   * thing. Emulating a real touch device measures what a thumb actually gets.
   */
  test.describe("touch targets on a touch device", () => {
    test.use({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });

    test("the destructive controls meet the 44px minimum", async ({ page }) => {
      await gotoFixture(page, ACCOUNT_SECURITY);
      await expectMinTouchTarget(
        page.getByRole("button", { name: /Clear personal data…/ }),
      );
      await expectMinTouchTarget(
        page.getByRole("button", { name: /Clear everything…/ }),
      );
      await expectMinTouchTarget(
        page.getByRole("button", { name: "Sign out", exact: true }),
      );
    });
  });
});

test.describe("SET-03 sign-out", () => {
  test("the account menu's Sign out points at the Cloudflare Access endpoint", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.getByRole("button", { name: /Account —/ }).click();
    // Still an anchor to the real endpoint: with scripting unavailable the plain
    // link signs the owner out, and the click handler adds the device cleanup on
    // top rather than replacing it.
    await expect(page.getByRole("link", { name: /sign out/i })).toHaveAttribute(
      "href",
      "/cdn-cgi/access/logout",
    );
  });

  test("warns about unsynchronised captures before anyone signs out", async ({
    page,
  }) => {
    await gotoFixture(page, ACCOUNT_SECURITY);
    // With nothing queued the copy is the calm case; the warning case is unit
    // tested (`use-sign-out.test.tsx`) because it needs a queue this journey
    // cannot create without a real offline session.
    await expect(
      page.getByText(/Your personal data on this device is removed first/i),
    ).toBeVisible();
  });
});
