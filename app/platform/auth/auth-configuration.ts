/**
 * FND-09 Authentication platform — server-side configuration.
 *
 * Turns trusted, server-side environment values into a validated, immutable
 * `AuthConfig` ONCE at the composition boundary (ADR-016 §5.8, §9). None of these
 * values is ever request-derived. Validation fails CLOSED: a missing or malformed
 * required value raises a typed `AuthConfigurationError` rather than silently
 * degrading. The dangerous `development` mode is gated behind BOTH an explicit
 * `AUTH_MODE=development` AND an explicit development/test `ENVIRONMENT`, so it can
 * never activate in production and never via a request header, cookie, query
 * parameter or hostname.
 *
 * These values (team domain, AUD, owner email) are private operational details,
 * not passwords — but they are never dumped into responses or logs.
 */

import {
  AuthConfigurationError,
  canonicaliseEmail,
  isValidEmail,
} from "~/kernel/auth";

/** The two supported authentication modes. */
export type AuthMode = "cloudflare-access" | "development";

/** Environments in which the development authenticator may run. */
const DEVELOPMENT_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "development",
  "test",
]);

/** Maximum accepted length of the Access AUD tag. */
export const ACCESS_AUD_MAX_LENGTH = 256;

/** Validated Cloudflare Access configuration. */
export type CloudflareAccessConfig = {
  readonly mode: "cloudflare-access";
  /** Canonical team-domain origin, e.g. `https://team.cloudflareaccess.com`. Also
   * the expected token issuer. */
  readonly teamDomain: string;
  /** The team's Access JWKS endpoint (team domain + `/cdn-cgi/access/certs`). */
  readonly jwksUrl: string;
  /** The Access application Audience (AUD) tag the token must carry. */
  readonly audience: string;
  /** The configured owner email (canonicalised). */
  readonly ownerEmail: string;
};

/** Validated development configuration (fixed local identity). */
export type DevelopmentAuthConfig = {
  readonly mode: "development";
  /** The fixed, server-configured subject (stable actor id). */
  readonly subject: string;
  /** The fixed, server-configured email (canonicalised). */
  readonly email: string;
};

/** The validated authentication configuration. */
export type AuthConfig = CloudflareAccessConfig | DevelopmentAuthConfig;

/** The trusted server-side values authentication configuration reads. */
export interface AuthConfigEnv {
  readonly AUTH_MODE?: string;
  readonly ENVIRONMENT?: string;
  readonly ACCESS_TEAM_DOMAIN?: string;
  readonly ACCESS_AUD?: string;
  readonly OWNER_EMAIL?: string;
  readonly DEV_AUTH_SUBJECT?: string;
  readonly DEV_AUTH_EMAIL?: string;
}

function required(value: string | undefined, name: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    throw new AuthConfigurationError(`${name} is not configured.`);
  }
  return trimmed;
}

/**
 * Canonicalise and validate the Access team domain: it must be an absolute HTTPS
 * origin with no embedded credentials, no path, query or fragment. Returns the
 * bare origin (no trailing slash) so it matches the token `iss` exactly.
 */
export function canonicaliseTeamDomain(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AuthConfigurationError("ACCESS_TEAM_DOMAIN is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new AuthConfigurationError("ACCESS_TEAM_DOMAIN must use https.");
  }
  if (url.username !== "" || url.password !== "") {
    throw new AuthConfigurationError(
      "ACCESS_TEAM_DOMAIN must not contain credentials.",
    );
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new AuthConfigurationError(
      "ACCESS_TEAM_DOMAIN must not contain a path.",
    );
  }
  if (url.search !== "" || url.hash !== "") {
    throw new AuthConfigurationError(
      "ACCESS_TEAM_DOMAIN must not contain a query or fragment.",
    );
  }
  return url.origin;
}

/** Validate the Access AUD tag: a non-empty, bounded, whitespace-free identifier. */
export function validateAudience(raw: string): string {
  const value = raw.trim();
  if (value.length === 0) {
    throw new AuthConfigurationError("ACCESS_AUD is not configured.");
  }
  if (value.length > ACCESS_AUD_MAX_LENGTH) {
    throw new AuthConfigurationError("ACCESS_AUD is too long.");
  }
  if (/\s/.test(value)) {
    throw new AuthConfigurationError("ACCESS_AUD must not contain whitespace.");
  }
  return value;
}

function validateOwnerEmail(raw: string): string {
  if (!isValidEmail(raw)) {
    throw new AuthConfigurationError("OWNER_EMAIL is not a valid email.");
  }
  return canonicaliseEmail(raw);
}

/**
 * Resolve the validated authentication configuration from the environment. This
 * is the single place `AUTH_MODE` is interpreted:
 *   - a missing mode defaults to the secure `cloudflare-access` mode;
 *   - an unknown mode fails closed;
 *   - `development` is rejected unless `ENVIRONMENT` is explicitly development/test.
 */
export function resolveAuthConfig(env: AuthConfigEnv): AuthConfig {
  const environment = (env.ENVIRONMENT ?? "").trim().toLowerCase();
  const rawMode = (env.AUTH_MODE ?? "").trim().toLowerCase();
  const mode: string = rawMode === "" ? "cloudflare-access" : rawMode;

  if (mode !== "cloudflare-access" && mode !== "development") {
    throw new AuthConfigurationError(`Unknown AUTH_MODE "${rawMode}".`);
  }

  if (mode === "development") {
    if (!DEVELOPMENT_ENVIRONMENTS.has(environment)) {
      throw new AuthConfigurationError(
        "Development authentication requires a development or test ENVIRONMENT.",
      );
    }
    const subject = required(env.DEV_AUTH_SUBJECT, "DEV_AUTH_SUBJECT");
    const rawEmail = required(env.DEV_AUTH_EMAIL, "DEV_AUTH_EMAIL");
    if (!isValidEmail(rawEmail)) {
      throw new AuthConfigurationError("DEV_AUTH_EMAIL is not a valid email.");
    }
    return {
      mode: "development",
      subject,
      email: canonicaliseEmail(rawEmail),
    };
  }

  const teamDomain = canonicaliseTeamDomain(
    required(env.ACCESS_TEAM_DOMAIN, "ACCESS_TEAM_DOMAIN"),
  );
  return {
    mode: "cloudflare-access",
    teamDomain,
    jwksUrl: `${teamDomain}/cdn-cgi/access/certs`,
    audience: validateAudience(required(env.ACCESS_AUD, "ACCESS_AUD")),
    ownerEmail: validateOwnerEmail(required(env.OWNER_EMAIL, "OWNER_EMAIL")),
  };
}
