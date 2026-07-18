/**
 * FND-09 E2E setup — remove any `.dev.vars` copied into the server build.
 *
 * `react-router build` copies the root `.dev.vars` into `build/server/.dev.vars`,
 * which `vite preview` would then load — silently enabling development auth. The
 * production-mode E2E server must run fail-closed Cloudflare Access mode, so this
 * strips that file after the build and before preview.
 */
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(
  new URL("../build/server/.dev.vars", import.meta.url),
);
rmSync(target, { force: true });
console.log("Stripped build/server/.dev.vars for production-mode preview.");
