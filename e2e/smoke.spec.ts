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

test.describe("PX-02 authenticated app frame (development auth)", () => {
  test("signs in, navigates every module, switches theme and persists it", async ({
    page,
  }) => {
    await page.goto("/");

    // The sidebar frame appears with the workspace brand (the banner landmark).
    const banner = page.getByRole("banner");
    await expect(banner).toBeVisible();
    await expect(banner.getByText("DalyHub")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeVisible();

    // Registry-driven sidebar navigation reaches every module placeholder.
    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const { label, path } of MODULE_PAGES) {
      await nav.getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole("heading", { level: 1, name: label }),
      ).toBeVisible();
    }

    // Identity, theme and sign-out now live behind the user menu, not the header.
    await expect(page.getByText("owner@example.invalid")).toBeHidden();
    const userMenu = page.getByRole("button", { name: /owner/i });
    await userMenu.click();
    await expect(page.getByText("owner@example.invalid")).toBeVisible();

    // Theme switch (relocated into the user menu) persists across a full reload.
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Sign out is an ordinary link to the Cloudflare-managed endpoint.
    await page.getByRole("button", { name: /owner/i }).click();
    await expect(page.getByRole("link", { name: /sign out/i })).toHaveAttribute(
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
