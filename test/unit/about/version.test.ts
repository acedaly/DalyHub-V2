/**
 * RELEASE-01 — the single version authority.
 *
 * The point of this module is that nothing else may hold a version string, and that
 * it can never become a channel for arbitrary environment values. These tests cover
 * both: the shape of what it publishes, and what it refuses to publish.
 */

import { describe, expect, it } from "vitest";

import { buildHealthPayload } from "~/lib/health";
import {
  APPLICATION_NAME,
  APP_RELEASE_NAME,
  APP_VERSION,
  buildInfo,
} from "~/lib/version";

describe("RELEASE-01 version authority", () => {
  it("publishes a real semantic version, not a placeholder", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_VERSION).not.toBe("0.0.0");
  });

  it("names the application and the release", () => {
    expect(APPLICATION_NAME).toBe("DalyHub");
    expect(APP_RELEASE_NAME.length).toBeGreaterThan(0);
  });

  it("is the SAME authority the health endpoint reports", () => {
    // The failure this prevents: About saying 2.0.0 while /health says something
    // else, so a production incident cannot be tied to a build.
    expect(buildHealthPayload({ ENVIRONMENT: "production" }).version).toBe(
      APP_VERSION,
    );
    expect(buildHealthPayload({ ENVIRONMENT: "production" }).name).toBe(
      buildInfo({ ENVIRONMENT: "production" }).name,
    );
  });
});

describe("RELEASE-01 environment reporting", () => {
  it("reports the recognised environments", () => {
    for (const environment of [
      "development",
      "preview",
      "staging",
      "production",
    ]) {
      expect(buildInfo({ ENVIRONMENT: environment }).environment).toBe(
        environment,
      );
    }
  });

  it("never reflects an unrecognised environment value", () => {
    expect(buildInfo({ ENVIRONMENT: "hunter2" }).environment).toBe("unknown");
    expect(buildInfo({ ENVIRONMENT: "" }).environment).toBe("unknown");
    expect(buildInfo({}).environment).toBe("unknown");
    expect(buildInfo(undefined).environment).toBe("unknown");
  });
});

describe("RELEASE-01 build identifier", () => {
  it("shortens a real commit to a short hash", () => {
    expect(
      buildInfo({ BUILD_COMMIT: "9f2c1b7a4e5d6c8b0a1f2e3d4c5b6a7980abcdef" })
        .commit,
    ).toBe("9f2c1b7");
  });

  it("reports none when the deployment supplied none", () => {
    expect(buildInfo({}).commit).toBeNull();
    expect(buildInfo({ BUILD_COMMIT: "" }).commit).toBeNull();
  });

  it("refuses anything that is not a commit hash", () => {
    // A build identifier is the one free-text-ish value here, so it is the one
    // that must not become a way to put arbitrary content on an authenticated page.
    for (const hostile of [
      "not-a-hash",
      "<script>alert(1)</script>",
      "../../etc/passwd",
      "9f2c1b",
      "zzzzzzz",
      "9f2c1b7 extra",
    ]) {
      expect(buildInfo({ BUILD_COMMIT: hostile }).commit, hostile).toBeNull();
    }
  });
});
