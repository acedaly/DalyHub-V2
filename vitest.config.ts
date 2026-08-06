import path from "node:path";

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit/component tests run in a lightweight DOM (happy-dom) with React Testing
// Library. They intentionally do NOT load the Cloudflare/React Router Vite
// plugins: the pieces exercised here (pure presentational components, the pure
// health handler and the storage-independent module registry kernel) don't need
// the Workers runtime, which keeps the tests fast and deterministic. End-to-end
// coverage of the real runtime lives in the Playwright smoke test.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the `~/* -> ./app/*` path mapping from tsconfig so kernel imports
    // resolve in unit tests, matching the Workers pool config.
    alias: { "~": path.join(import.meta.dirname, "app") },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/unit/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        // `@material/material-color-utilities` publishes ESM with EXTENSIONLESS
        // relative imports, which Node's own loader refuses. The scheme
        // generator works around it with a `register()` resolve hook; the token
        // tests instead have Vite process the package, which resolves them the
        // same way a bundler does. Dev-only: it is a dev dependency read by
        // `test/unit/tokens`, and nothing in `app/` or the Worker imports it.
        inline: ["@material/material-color-utilities"],
      },
    },
  },
});
