/**
 * SET-03 — the pure Account & security model.
 *
 * These are the derivations the surface's honesty rests on. If `describeSessionExpiry`
 * ever answers "active" for a session it knows nothing about, the page starts
 * asserting a security state it did not observe — which is the specific failure
 * this whole surface was written to avoid.
 */

import { describe, expect, it } from "vitest";

import {
  SECURITY_ACTIVITY_TYPES,
  SECURITY_LOCAL_DATA_CLEARED,
  SECURITY_SIGNED_OUT,
  boundedCount,
  describeSessionExpiry,
  formatSessionRemaining,
  isLocalDataClearScope,
  subjectFragment,
} from "~/kernel/account-security";

const NOW = new Date("2026-08-08T12:00:00.000Z");

describe("describeSessionExpiry", () => {
  it("reports unknown — never active — when there is no expiry to read", () => {
    expect(describeSessionExpiry(null, NOW)).toEqual({
      state: "unknown",
      minutesRemaining: null,
    });
    expect(describeSessionExpiry(new Date(Number.NaN), NOW).state).toBe(
      "unknown",
    );
  });

  it("reports expired once the credential's own expiry has passed", () => {
    const expiry = describeSessionExpiry(
      new Date("2026-08-08T11:59:59.000Z"),
      NOW,
    );
    expect(expiry.state).toBe("expired");
    expect(expiry.minutesRemaining).toBe(0);
  });

  it("warns inside the window and stays calm outside it", () => {
    // 29 minutes left — inside the 30-minute window.
    expect(
      describeSessionExpiry(new Date("2026-08-08T12:29:00.000Z"), NOW).state,
    ).toBe("expiring_soon");
    // 31 minutes left — outside it.
    expect(
      describeSessionExpiry(new Date("2026-08-08T12:31:00.000Z"), NOW).state,
    ).toBe("active");
  });
});

describe("formatSessionRemaining", () => {
  it("is deliberately coarse, and says nothing when nothing is known", () => {
    expect(
      formatSessionRemaining({ state: "unknown", minutesRemaining: null }),
    ).toBeNull();
    expect(
      formatSessionRemaining({ state: "expired", minutesRemaining: 0 }),
    ).toBe("Expired");
    expect(
      formatSessionRemaining({ state: "expiring_soon", minutesRemaining: 1 }),
    ).toBe("About 1 minute");
    expect(
      formatSessionRemaining({ state: "active", minutesRemaining: 90 }),
    ).toBe("About 1 hour");
    expect(
      formatSessionRemaining({ state: "active", minutesRemaining: 60 * 50 }),
    ).toBe("About 2 days");
  });
});

describe("subjectFragment", () => {
  it("shows only a trailing fragment, never the whole subject", () => {
    const subject = "0123456789abcdef-the-real-subject-value";
    const fragment = subjectFragment(subject);
    expect(fragment).toBe("ct-value");
    expect(subject.endsWith(fragment ?? "")).toBe(true);
    expect(fragment).not.toBe(subject);
  });

  it("returns null rather than an empty string when there is nothing to show", () => {
    expect(subjectFragment(null)).toBeNull();
    expect(subjectFragment("   ")).toBeNull();
  });
});

describe("the recorded security vocabulary", () => {
  it("covers exactly the two actions DalyHub genuinely observes", () => {
    expect(SECURITY_ACTIVITY_TYPES).toEqual([
      SECURITY_SIGNED_OUT,
      SECURITY_LOCAL_DATA_CLEARED,
    ]);
  });

  // Nothing here is a Cloudflare Access event, because DalyHub receives none.
  it("claims no sign-in, failed sign-in or remote-session event", () => {
    for (const type of SECURITY_ACTIVITY_TYPES) {
      expect(type).not.toContain("signed_in");
      expect(type).not.toContain("login");
      expect(type).not.toContain("mfa");
    }
  });

  it("accepts only the declared clear scopes", () => {
    expect(isLocalDataClearScope("snapshot")).toBe(true);
    expect(isLocalDataClearScope("everything")).toBe(true);
    expect(isLocalDataClearScope("drop table")).toBe(false);
    expect(isLocalDataClearScope(undefined)).toBe(false);
  });

  // A count comes from the browser, so it is clamped rather than trusted: no
  // negative, no fraction, no NaN and no unbounded number reaches a payload.
  it("bounds an untrusted count", () => {
    expect(boundedCount("3")).toBe(3);
    expect(boundedCount(-5)).toBe(0);
    expect(boundedCount("not a number")).toBe(0);
    expect(boundedCount(4.9)).toBe(4);
    expect(boundedCount(9e12)).toBe(100_000);
  });
});
