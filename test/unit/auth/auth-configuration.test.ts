import { describe, expect, it } from "vitest";

import { AuthConfigurationError } from "~/kernel/auth";
import {
  canonicaliseTeamDomain,
  resolveAuthConfig,
  validateAudience,
} from "~/platform/auth/auth-configuration";

const CLOUDFLARE_ENV = {
  AUTH_MODE: "cloudflare-access",
  ENVIRONMENT: "production",
  ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  ACCESS_AUD: "aud-tag-123",
  OWNER_EMAIL: "Owner@Example.com",
};

const DEV_ENV = {
  AUTH_MODE: "development",
  ENVIRONMENT: "development",
  DEV_AUTH_SUBJECT: "local-user",
  DEV_AUTH_EMAIL: "Dev@Example.invalid",
};

describe("auth configuration", () => {
  it("defaults a missing mode to the secure cloudflare-access mode", () => {
    const config = resolveAuthConfig({ ...CLOUDFLARE_ENV, AUTH_MODE: "" });
    expect(config.mode).toBe("cloudflare-access");
  });

  it("resolves a valid cloudflare-access configuration", () => {
    const config = resolveAuthConfig(CLOUDFLARE_ENV);
    expect(config).toEqual({
      mode: "cloudflare-access",
      teamDomain: "https://team.cloudflareaccess.com",
      jwksUrl: "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
      audience: "aud-tag-123",
      ownerEmail: "owner@example.com",
    });
  });

  it("fails closed on an unknown auth mode", () => {
    expect(() =>
      resolveAuthConfig({ ...CLOUDFLARE_ENV, AUTH_MODE: "magic" }),
    ).toThrow(AuthConfigurationError);
  });

  it("fails closed when required cloudflare-access values are missing", () => {
    for (const key of ["ACCESS_TEAM_DOMAIN", "ACCESS_AUD", "OWNER_EMAIL"]) {
      expect(() => resolveAuthConfig({ ...CLOUDFLARE_ENV, [key]: "" })).toThrow(
        AuthConfigurationError,
      );
    }
  });

  it("rejects a malformed owner email and team domain", () => {
    expect(() =>
      resolveAuthConfig({ ...CLOUDFLARE_ENV, OWNER_EMAIL: "not-an-email" }),
    ).toThrow(AuthConfigurationError);
    expect(() =>
      resolveAuthConfig({ ...CLOUDFLARE_ENV, ACCESS_TEAM_DOMAIN: "notaurl" }),
    ).toThrow(AuthConfigurationError);
  });

  it("resolves a valid development configuration", () => {
    const config = resolveAuthConfig(DEV_ENV);
    expect(config).toEqual({
      mode: "development",
      subject: "local-user",
      email: "dev@example.invalid",
    });
  });

  it("rejects development mode outside a development/test environment", () => {
    for (const environment of ["production", "staging", "preview", ""]) {
      expect(() =>
        resolveAuthConfig({ ...DEV_ENV, ENVIRONMENT: environment }),
      ).toThrow(AuthConfigurationError);
    }
    // ...but accepts it under an explicit development or test environment.
    expect(resolveAuthConfig({ ...DEV_ENV, ENVIRONMENT: "test" }).mode).toBe(
      "development",
    );
  });

  it("fails closed when development identity is incomplete or invalid", () => {
    expect(() =>
      resolveAuthConfig({ ...DEV_ENV, DEV_AUTH_SUBJECT: "" }),
    ).toThrow(AuthConfigurationError);
    expect(() =>
      resolveAuthConfig({ ...DEV_ENV, DEV_AUTH_EMAIL: "nope" }),
    ).toThrow(AuthConfigurationError);
  });
});

describe("team domain canonicalisation", () => {
  it("returns the bare https origin", () => {
    expect(canonicaliseTeamDomain("https://team.cloudflareaccess.com/")).toBe(
      "https://team.cloudflareaccess.com",
    );
  });

  it("rejects non-https, credentials, paths, queries and fragments", () => {
    for (const bad of [
      "http://team.cloudflareaccess.com",
      "https://user:pass@team.cloudflareaccess.com",
      "https://team.cloudflareaccess.com/path",
      "https://team.cloudflareaccess.com/?q=1",
      "https://team.cloudflareaccess.com/#x",
      "not a url",
    ]) {
      expect(() => canonicaliseTeamDomain(bad)).toThrow(AuthConfigurationError);
    }
  });
});

describe("audience validation", () => {
  it("accepts a bounded, whitespace-free tag", () => {
    expect(validateAudience("  aud-123 ")).toBe("aud-123");
  });

  it("rejects empty, whitespace-containing or oversized tags", () => {
    expect(() => validateAudience("")).toThrow(AuthConfigurationError);
    expect(() => validateAudience("has space")).toThrow(AuthConfigurationError);
    expect(() => validateAudience("x".repeat(257))).toThrow(
      AuthConfigurationError,
    );
  });
});
