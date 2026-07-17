import { expect, test } from "@playwright/test";

test.describe("FND-01 foundation scaffold", () => {
  test("foundation page renders with the correct title and heading", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("DalyHub");
    await expect(
      page.getByRole("heading", { level: 1, name: "DalyHub V2" }),
    ).toBeVisible();
    await expect(
      page.getByText(/repository and toolchain foundation is operational/i),
    ).toBeVisible();
  });

  test("health endpoint returns an ok JSON payload", async ({ request }) => {
    const response = await request.get("/health");
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("application/json");

    const body = await response.json();
    expect(body).toMatchObject({ status: "ok", name: "DalyHub" });
    expect(typeof body.environment).toBe("string");
  });
});
