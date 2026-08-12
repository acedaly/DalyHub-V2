/**
 * FND-09 E2E setup — ensure a local `.dev.vars` enabling the development
 * authenticator exists before the dev server starts.
 *
 * `.dev.vars` is git-ignored (never committed). This writes it ONLY when absent,
 * so it never clobbers a developer's real local file; in CI (where it is absent)
 * it provisions the fixed, non-personal development identity the E2E journey
 * signs in as. `react-router dev` reads `.dev.vars`, so the browser journey runs
 * in the safe explicit development auth mode. The production-mode preview server
 * ignores `.dev.vars` and stays fail-closed (see playwright.config.ts).
 */
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../.dev.vars", import.meta.url));

const contents = [
  "ENVIRONMENT=development",
  "AUTH_MODE=development",
  "DEV_AUTH_SUBJECT=local-development-user",
  "DEV_AUTH_EMAIL=owner@example.invalid",
  // IDENT-01: the display name the local identity provider "supplies", so the
  // browser journey exercises the SAME actor-name resolution production uses.
  "DEV_AUTH_NAME=Local Developer",
  "DEFAULT_WORKSPACE_ID=local-dev-workspace",
  // CAL-01: the application encryption key that protects owner-configured
  // third-party credentials (today: external calendar feed URLs). This is a
  // FIXED, OBVIOUSLY NON-PRODUCTION development value -- it is the literal
  // string "dalyhub-e2e-development-key-1234", base64-encoded, and it exists so
  // the E2E fixtures can seal a synthetic feed address the dev server can then
  // open. Production generates a real random key with `openssl rand -base64 32`
  // and supplies it with `wrangler secret put`; see .dev.vars.example.
  "APP_ENCRYPTION_KEY=ZGFseWh1Yi1lMmUtZGV2ZWxvcG1lbnQta2V5LTEyMzQ=",
  "",
].join("\n");

if (existsSync(target)) {
  console.log(".dev.vars already present — leaving it unchanged.");
} else {
  writeFileSync(target, contents, "utf8");
  console.log("Wrote .dev.vars with the development authentication identity.");
}
