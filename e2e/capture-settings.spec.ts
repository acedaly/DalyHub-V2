/**
 * CAPTURE-01 — `Settings → Capture`, driven end to end.
 *
 * ONE browser journey, deliberately (CAPTURE-01 §61): the surface where the owner mints and
 * revokes a capture credential is the only part of CAPTURE-01 a browser is the
 * right tool for. Everything else — the endpoint, authentication, idempotency,
 * rate limits, email — is HTTP and is proved against the real Workers runtime
 * and real D1 in `test/kernel/capture-route.test.ts` and its email sibling,
 * where those properties can actually be asserted rather than inferred.
 *
 * What this journey has to prove:
 *   1. the owner can create a capture device without touching developer tools;
 *   2. the token is shown ONCE, with the warning that it will not be shown again;
 *   3. the token is not shown again afterwards, anywhere;
 *   4. revoking is one click and the device visibly stops being active.
 */

import { expect, test } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const CAPTURE = "/settings?section=capture";

/** The token prefix, which is also how the page is checked for leaks. */
const TOKEN_PREFIX = "dhcap_";

test.describe("CAPTURE-01 Settings → Capture", () => {
  test("creates a capture device, shows its token once, then revokes it", async ({
    page,
  }) => {
    await gotoFixture(page, CAPTURE);
    await expect(
      page.getByRole("heading", { name: "Capture", exact: true }),
    ).toBeVisible();

    // The surface explains the capability in the owner's language, and is honest
    // about what a capture device cannot do.
    await expect(
      page.getByText(/cannot read your records/i).first(),
    ).toBeVisible();

    // No token is visible before one is created.
    expect(await page.locator("body").innerText()).not.toContain(TOKEN_PREFIX);

    const name = `Playwright iPhone ${Date.now()}`;
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create token" }).click();

    // The one moment the secret exists, and the warning that says so.
    const tokenPanel = page.getByText(/will not be shown again/i);
    await expect(tokenPanel).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).toContain(TOKEN_PREFIX);

    // The new device appears in the list with its permissions and status.
    const device = page.getByText(name, { exact: true });
    await expect(device).toBeVisible();
    await expect(page.getByText(/Create tasks/).first()).toBeVisible();

    // Reloading must NOT show the token again — only a digest is stored.
    await page.reload();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(TOKEN_PREFIX);

    // Revoke is one control, and the device visibly stops being active.
    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect(page.getByText("Revoked").first()).toBeVisible();
  });

  test("meets the accessibility and narrow-viewport contract", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await gotoFixture(page, CAPTURE);
    await expect(
      page.getByRole("heading", { name: "Capture", exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
