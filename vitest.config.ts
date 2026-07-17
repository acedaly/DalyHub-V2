import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit/component tests run in a lightweight DOM (happy-dom) with React Testing
// Library. They intentionally do NOT load the Cloudflare/React Router Vite
// plugins: the pieces exercised here (a pure presentational component and a
// pure health handler) don't need the Workers runtime, which keeps the tests
// fast and deterministic. End-to-end coverage of the real runtime lives in the
// Playwright smoke test.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/unit/**/*.test.{ts,tsx}"],
  },
});
