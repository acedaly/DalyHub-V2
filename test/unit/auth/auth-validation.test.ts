import { describe, expect, it } from "vitest";

import {
  IdentityClaimError,
  SUBJECT_MAX_LENGTH,
  canonicaliseEmail,
  createAuthenticatedUser,
  emailMatchesOwner,
  isValidEmail,
  normaliseEmailClaim,
  normaliseSubjectClaim,
} from "~/kernel/auth";

describe("auth identity validation", () => {
  it("canonicalises email by trimming and lowercasing", () => {
    expect(canonicaliseEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  it("accepts a well-formed email and normalises it", () => {
    expect(normaliseEmailClaim("Owner@Example.com")).toBe("owner@example.com");
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("rejects malformed or missing emails", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "   ",
      "no-at",
      "no@domain",
      "a b@example.com",
      "two@@example.com",
      42,
    ]) {
      expect(isValidEmail(bad)).toBe(false);
      expect(() => normaliseEmailClaim(bad)).toThrow(IdentityClaimError);
    }
  });

  it("accepts a valid subject and trims it", () => {
    expect(normaliseSubjectClaim("  7335d417-61da  ")).toBe("7335d417-61da");
  });

  it("rejects an empty subject (as a service token carries)", () => {
    expect(() => normaliseSubjectClaim("")).toThrow(IdentityClaimError);
    expect(() => normaliseSubjectClaim("   ")).toThrow(IdentityClaimError);
    expect(() => normaliseSubjectClaim(undefined)).toThrow(IdentityClaimError);
    expect(() => normaliseSubjectClaim(123)).toThrow(IdentityClaimError);
  });

  it("rejects an oversized subject claim", () => {
    const oversized = "x".repeat(SUBJECT_MAX_LENGTH + 1);
    expect(() => normaliseSubjectClaim(oversized)).toThrow(IdentityClaimError);
  });

  it("builds a validated authenticated user from raw claims", () => {
    const user = createAuthenticatedUser({
      subject: "sub-123",
      email: "OWNER@Example.com",
    });
    expect(user).toEqual({ subject: "sub-123", email: "owner@example.com" });
  });

  it("fails to build a user from an invalid claim", () => {
    expect(() =>
      createAuthenticatedUser({ subject: "", email: "owner@example.com" }),
    ).toThrow(IdentityClaimError);
    expect(() =>
      createAuthenticatedUser({ subject: "sub", email: "nope" }),
    ).toThrow(IdentityClaimError);
  });

  it("matches the owner case- and whitespace-insensitively", () => {
    expect(emailMatchesOwner("Owner@Example.com", "owner@example.com")).toBe(
      true,
    );
    expect(emailMatchesOwner(" owner@example.com ", "owner@example.com")).toBe(
      true,
    );
    expect(emailMatchesOwner("intruder@example.com", "owner@example.com")).toBe(
      false,
    );
  });
});
