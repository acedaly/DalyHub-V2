import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  jwtVerify,
  type JWK,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import {
  AuthInfrastructureError,
  ExpiredCredentialsError,
  IdentityClaimError,
  InvalidCredentialsError,
  MissingCredentialsError,
  OwnerMismatchError,
} from "~/kernel/auth";
import {
  ACCESS_JWT_HEADER,
  CloudflareAccessAuthenticator,
  type AccessTokenVerifier,
} from "~/platform/auth/cloudflare-access-authenticator";
import type { CloudflareAccessConfig } from "~/platform/auth/auth-configuration";

/**
 * Cloudflare Access JWT verification — exercised in the REAL Workers runtime
 * with generated RSA keys and a LOCAL JWKS (no live Access account, no network),
 * running the SAME `jose` verification production uses. Verification is never
 * weakened: the local verifier calls `jwtVerify` with the identical
 * issuer/audience/RS256 options as `createRemoteAccessVerifier` (ADR-016 §8, §23).
 */

const TEAM_DOMAIN = "https://team.cloudflareaccess.com";
const AUD = "aud-tag-under-test";
const OWNER = "owner@example.com";
const KID = "test-key-1";

const CONFIG: CloudflareAccessConfig = {
  mode: "cloudflare-access",
  teamDomain: TEAM_DOMAIN,
  jwksUrl: `${TEAM_DOMAIN}/cdn-cgi/access/certs`,
  audience: AUD,
  ownerEmail: OWNER,
};

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let verifier: AccessTokenVerifier;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = (await exportJWK(pair.publicKey)) as JWK;
  publicJwk.kid = KID;
  publicJwk.alg = "RS256";

  const other = await generateKeyPair("RS256", { extractable: true });
  otherPrivateKey = other.privateKey;

  const jwks = createLocalJWKSet({ keys: [publicJwk] });
  verifier = async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: TEAM_DOMAIN,
      audience: AUD,
      algorithms: ["RS256"],
    });
    return { payload };
  };
});

type SignOptions = {
  privateKey?: CryptoKey;
  alg?: string;
  kid?: string;
  iss?: string;
  aud?: string | string[];
  sub?: string | null;
  email?: string | null;
  exp?: number | string | null;
  nbf?: number;
  extra?: Record<string, unknown>;
};

async function signToken(options: SignOptions = {}): Promise<string> {
  const claims: Record<string, unknown> = { ...(options.extra ?? {}) };
  if (options.email !== null) {
    claims.email = options.email ?? OWNER;
  }
  const jwt = new SignJWT(claims)
    .setProtectedHeader({
      alg: options.alg ?? "RS256",
      kid: options.kid ?? KID,
    })
    .setIssuedAt()
    .setIssuer(options.iss ?? TEAM_DOMAIN)
    .setAudience(options.aud ?? AUD);
  if (options.exp !== null) {
    jwt.setExpirationTime(options.exp ?? "2h");
  }
  if (options.nbf !== undefined) {
    jwt.setNotBefore(options.nbf);
  }
  if (options.sub !== null) {
    jwt.setSubject(options.sub ?? "owner-subject-123");
  }
  return jwt.sign(options.privateKey ?? privateKey);
}

function authenticator(customVerifier: AccessTokenVerifier = verifier) {
  return new CloudflareAccessAuthenticator({
    config: CONFIG,
    verifyToken: customVerifier,
  });
}

function requestWith(token: string): Request {
  return new Request("https://app.example/", {
    headers: { [ACCESS_JWT_HEADER]: token },
  });
}

describe("Cloudflare Access JWT verification", () => {
  it("accepts a valid owner token and returns a minimal session", async () => {
    const token = await signToken();
    const session = await authenticator().authenticate(requestWith(token));
    expect(session.user).toEqual({
      subject: "owner-subject-123",
      email: OWNER,
    });
    expect(session.expiresAt.getTime()).toBeGreaterThan(
      session.issuedAt.getTime(),
    );
  });

  it("accepts an audience array containing the configured AUD", async () => {
    const token = await signToken({ aud: [AUD, "another-aud"] });
    const session = await authenticator().authenticate(requestWith(token));
    expect(session.user.email).toBe(OWNER);
  });

  it("matches the owner case-insensitively", async () => {
    const token = await signToken({ email: "Owner@Example.COM" });
    const session = await authenticator().authenticate(requestWith(token));
    expect(session.user.email).toBe(OWNER);
  });

  it("rejects a wrong signature", async () => {
    const token = await signToken({ privateKey: otherPrivateKey });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a wrong key id", async () => {
    const token = await signToken({ kid: "unknown-kid" });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects an unexpected algorithm", async () => {
    const es = await generateKeyPair("ES256", { extractable: true });
    const token = await signToken({ privateKey: es.privateKey, alg: "ES256" });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a wrong issuer and wrong audience", async () => {
    for (const token of [
      await signToken({ iss: "https://evil.cloudflareaccess.com" }),
      await signToken({ aud: "not-our-aud" }),
    ]) {
      await expect(
        authenticator().authenticate(requestWith(token)),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
  });

  it("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await signToken({ exp: past });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(ExpiredCredentialsError);
  });

  it("rejects a not-yet-valid (future nbf) token", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const token = await signToken({ nbf: future });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a token missing exp", async () => {
    const token = await signToken({ exp: null });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects missing, empty and malformed identity claims", async () => {
    for (const token of [
      await signToken({ sub: null }), // missing sub
      await signToken({ sub: "" }), // empty sub
      await signToken({ email: null }), // missing email
      await signToken({ email: "not-an-email" }), // malformed email
    ]) {
      await expect(
        authenticator().authenticate(requestWith(token)),
      ).rejects.toBeInstanceOf(IdentityClaimError);
    }
  });

  it("rejects a service (non-identity) token bearing common_name", async () => {
    const token = await signToken({
      sub: "",
      email: null,
      extra: { common_name: "client-id.access" },
    });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(IdentityClaimError);
  });

  it("rejects a valid token for a non-owner email", async () => {
    const token = await signToken({ email: "intruder@example.com" });
    await expect(
      authenticator().authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(OwnerMismatchError);
  });

  it("rejects a malformed JWT", async () => {
    await expect(
      authenticator().authenticate(requestWith("not.a.jwt")),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("rejects a missing credential header", async () => {
    await expect(
      authenticator().authenticate(new Request("https://app.example/")),
    ).rejects.toBeInstanceOf(MissingCredentialsError);
  });

  it("rejects ambiguous/duplicate credential values", async () => {
    const token = await signToken();
    await expect(
      authenticator().authenticate(requestWith(`${token}, ${token}`)),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("maps a JWKS/verifier infrastructure failure to a safe infrastructure error", async () => {
    const failing: AccessTokenVerifier = () =>
      Promise.reject(Object.assign(new Error("jwks unreachable"), {}));
    const token = await signToken();
    await expect(
      authenticator(failing).authenticate(requestWith(token)),
    ).rejects.toBeInstanceOf(AuthInfrastructureError);
  });

  it("never leaks the token or claims in the public error message", async () => {
    const token = await signToken({ email: "intruder@example.com" });
    try {
      await authenticator().authenticate(requestWith(token));
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(OwnerMismatchError);
      const message = (error as Error).message;
      expect(message).not.toContain(token);
      expect(message).not.toContain("intruder@example.com");
    }
  });
});
