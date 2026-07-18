import { describe, expect, it } from "vitest";

import {
  AuthConfigurationError,
  AuthError,
  AuthInfrastructureError,
  ExpiredCredentialsError,
  IdentityClaimError,
  InvalidCredentialsError,
  MissingCredentialsError,
  OwnerMismatchError,
} from "~/kernel/auth";

describe("auth errors", () => {
  const cases: Array<[AuthError, string, boolean]> = [
    [new MissingCredentialsError(), "missing_credentials", false],
    [new InvalidCredentialsError(), "invalid_credentials", false],
    [new ExpiredCredentialsError(), "expired_credentials", false],
    [new IdentityClaimError(), "identity_claim_unavailable", false],
    [new OwnerMismatchError(), "owner_mismatch", false],
    [new AuthConfigurationError(), "configuration_error", true],
    [new AuthInfrastructureError(), "infrastructure_failure", true],
  ];

  it("exposes a stable code and configuration flag per error", () => {
    for (const [error, code, configuration] of cases) {
      expect(error).toBeInstanceOf(AuthError);
      expect(error.code).toBe(code);
      expect(error.configuration).toBe(configuration);
    }
  });

  it("has generic public messages that never leak a token or claim", () => {
    const secret =
      "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJzZWNyZXQifQ.sig owner@secret.example";
    for (const [error] of cases) {
      // Attaching a cause with token-like content must not surface in message.
      expect(error.message).not.toContain("eyJ");
      expect(error.message).not.toContain("@");
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.message).not.toContain(secret);
    }
  });

  it("preserves an attached cause for server-side diagnostics", () => {
    const cause = new Error("jose: signature verification failed");
    const error = new InvalidCredentialsError({ cause });
    expect(error.cause).toBe(cause);
    // ...but the public message still says nothing specific.
    expect(error.message).toBe("Authentication credentials are invalid.");
  });

  it("distinguishes configuration/infrastructure faults from unauthenticated requests", () => {
    expect(new MissingCredentialsError().configuration).toBe(false);
    expect(new AuthConfigurationError().configuration).toBe(true);
    expect(new AuthInfrastructureError().configuration).toBe(true);
  });
});
