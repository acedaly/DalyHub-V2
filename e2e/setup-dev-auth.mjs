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
  "DEFAULT_WORKSPACE_ID=local-dev-workspace",
  "",
].join("\n");

if (existsSync(target)) {
  console.log(".dev.vars already present — leaving it unchanged.");
} else {
  writeFileSync(target, contents, "utf8");
  console.log("Wrote .dev.vars with the development authentication identity.");
}
