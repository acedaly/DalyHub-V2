import { describe, expect, it } from "vitest";

import { buildHealthPayload, healthResponse } from "../../app/lib/health";

describe("buildHealthPayload", () => {
  it("reports ok status and the application name", () => {
    const payload = buildHealthPayload({ ENVIRONMENT: "development" });
    expect(payload).toEqual({
      status: "ok",
      name: "DalyHub",
      environment: "development",
    });
  });

  it("falls back to 'unknown' for an unrecognised environment", () => {
    expect(buildHealthPayload({ ENVIRONMENT: "hunter2" }).environment).toBe(
      "unknown",
    );
  });

  it("falls back to 'unknown' when no environment is provided", () => {
    expect(buildHealthPayload().environment).toBe("unknown");
    expect(buildHealthPayload({}).environment).toBe("unknown");
  });
});

describe("healthResponse", () => {
  it("returns a 200 JSON response that is not cached", async () => {
    const response = healthResponse({ ENVIRONMENT: "production" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      name: "DalyHub",
      environment: "production",
    });
  });
});
