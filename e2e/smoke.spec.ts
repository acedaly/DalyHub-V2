import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const PROD_BASE = "http://localhost:4174";

const MODULE_PAGES = [
  { label: "Areas", path: "/areas" },
  { label: "Goals", path: "/goals" },
  { label: "Projects", path: "/projects" },
  { label: "Tasks", path: "/tasks" },
];

test.describe("FND-09 authenticated app shell (development auth)", () => {
  test("signs in, navigates every module, switches theme and persists it", async ({
    page,
  }) => {
    await page.goto("/");

    // The shell appears with the authenticated development identity.
    const banner = page.getByRole("banner");
    await expect(banner).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "DalyHub" }),
    ).toBeVisible();
    // The authenticated identity appears in the shell header.
    await expect(banner.getByText("owner@example.invalid")).toBeVisible();

    // Registry-driven navigation reaches every module placeholder.
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const { label, path } of MODULE_PAGES) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: label }),
      ).toBeVisible();
    }

    // Theme switch persists across a full reload (cookie-backed SSR).
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Logout is an ordinary link to the Cloudflare-managed endpoint.
    await expect(page.getByRole("link", { name: /log out/i })).toHaveAttribute(
      "href",
      "/cdn-cgi/access/logout",
    );
  });

  test("health endpoint returns the existing ok JSON contract", async ({
    request,
  }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("application/json");
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", name: "DalyHub" });
    expect(typeof body.environment).toBe("string");
  });
});

test.describe("FND-09 production-mode boundary (no credentials)", () => {
  test("rejects an unauthenticated protected request but keeps /health public", async ({
    request,
  }) => {
    // Cloudflare Access mode with empty config fails closed for protected routes.
    const protectedResponse = await request.get(`${PROD_BASE}/`);
    expect(protectedResponse.status()).toBeGreaterThanOrEqual(400);
    expect(protectedResponse.status()).toBeLessThan(600);
    const body = await protectedResponse.text();
    expect(body).not.toContain("owner@example.invalid");

    // /health remains public and returns its JSON contract.
    const health = await request.get(`${PROD_BASE}/health`);
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).status).toBe("ok");
  });
});

test.describe("FND-09 bundle discipline", () => {
  test("no authentication/JWT code reaches the client bundle", () => {
    const assetsDir = fileURLToPath(
      new URL("../build/client/assets", import.meta.url),
    );
    const files = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
    expect(files.length).toBeGreaterThan(0);

    const forbidden = [
      "createRemoteJWKSet",
      "jwtVerify",
      "Cf-Access-Jwt-Assertion",
      "cloudflareaccess",
    ];
    for (const file of files) {
      const contents = readFileSync(`${assetsDir}/${file}`, "utf8");
      for (const needle of forbidden) {
        expect(
          contents.includes(needle),
          `${file} must not contain "${needle}"`,
        ).toBe(false);
      }
    }
  });
});
