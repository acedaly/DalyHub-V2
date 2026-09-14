import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import { dalyhubServiceWorker } from "./vite-plugins/service-worker";

/**
 * The application version, read from `package.json` at config time. The
 * service-worker plugin prefixes its cache-name build id with it, so a release
 * is legible in devtools. Read with `fs` rather than an import attribute so the
 * config compiles under the repository's `module: ES2022` setting.
 */
const APP_VERSION: string = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

/**
 * Resolve the `~/* -> app/*` path mapping in EVERY Vite environment, including the
 * React Router config loader that evaluates `app/routes.ts` (which composes routes
 * from the module registry through `~`-aliased imports). `resolve.tsconfigPaths` /
 * `resolve.alias` are not applied in that lightweight loader environment, but a
 * `resolveId` plugin hook is — so this small, zero-dependency plugin makes the
 * alias work uniformly.
 */
function tildePathAlias(): Plugin {
  const appDir = fileURLToPath(new URL("./app/", import.meta.url));
  return {
    name: "dalyhub:tilde-path-alias",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (source !== "~" && !source.startsWith("~/")) {
        return null;
      }
      const mapped = fileURLToPath(
        new URL(source === "~" ? "." : source.slice(2), `file://${appDir}`),
      );
      const resolved = await this.resolve(mapped, importer, {
        ...options,
        skipSelf: true,
      });
      return resolved?.id ?? null;
    },
  };
}

export default defineConfig({
  plugins: [
    tildePathAlias(),
    // UNTITLED-01 — Tailwind v4, the styling engine behind the Untitled UI
    // component layer (`app/styles/untitled/untitled.css`). Before the other
    // plugins so the CSS entry is transformed in every environment, SSR
    // included; it adds no JavaScript to the client bundle.
    tailwindcss(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
    // PWA-02 — emits `/sw.js` from `vite-plugins/sw-template.js` with a
    // content-derived build id and the real hashed shell bundles.
    dalyhubServiceWorker({ version: APP_VERSION }),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  // Pre-bundle at dev-server start the dependency graphs of the two features
  // that lazy-import a large third-party stack only on first client use — the
  // FND-08 Markdown render (`unified`) and the NOTES-05 writing editor
  // (CodeMirror). Without this, that first runtime import makes Vite discover and
  // optimise the dependency graph on the fly, triggering a full dev page reload
  // that resets the surface being mounted — the just-opened Markdown preview, or
  // (NOTES-05) the CodeMirror editor whose `data-editor-ready` then never settles.
  // Declaring the deps here optimises them up front, so the lazy import resolves
  // without a reload. Keeps the production code-split (ADR-006, ADR-044) intact —
  // this only affects the dev server's on-the-fly optimiser.
  optimizeDeps: {
    include: [
      // FND-08 Markdown render pipeline.
      "unified",
      "remark-parse",
      "remark-gfm",
      "remark-rehype",
      "rehype-sanitize",
      "rehype-stringify",
      // NOTES-05 writing-first CodeMirror editor (`~/shared/markdown-editor`).
      "@codemirror/commands",
      "@codemirror/lang-markdown",
      "@codemirror/language",
      "@codemirror/state",
      "@codemirror/view",
      "@lezer/common",
      "@lezer/markdown",
      /*
       * UNTITLED-04 / PR #286 — the migration's own runtime, for exactly the
       * reason stated above, and MEASURED rather than assumed.
       *
       * The Playwright trace for `account-security.spec.ts:243` on run
       * 34792235989 carries two console errors and nothing else of note:
       *
       *   504 (Outdated Optimize Dep) .vite/deps/tailwind-merge.js?v=19a0b42f
       *   504 (Outdated Optimize Dep) .vite/deps/recharts.js?v=7b7833b2
       *
       * A chunk that 504s is a chunk the client never gets, so React never
       * attaches — and a page that never hydrates fails in whatever way its
       * test happens to press on. That is why five tests failed on all three of
       * runs 1021, 1022 and 1025 while passing locally every time: a plain
       * `<button onClick>` does nothing (`account-security:243`, the account
       * menu never opens), a `<Link>` does not navigate (`assets:66`, "the URL
       * did not change"), a tab never selects (`activity-actor:83`), and a
       * React Router `<Form>` falls back to a NATIVE GET submit — which is
       * precisely the shape of `ai-assistance:243`'s received URL,
       * `/new/meeting?`, trailing question mark and all.
       *
       * These are the deps the Untitled layer and the chart foundation pull in
       * that the optimiser's first crawl does not reach, because they arrive
       * through lazily-loaded route modules. Declaring them means the first
       * crawl is complete and there is no second one to invalidate what has
       * already been served. Every entry is imported by application code; the
       * `@react-types/*` packages are deliberately absent, being types only.
       */
      "recharts",
      "tailwind-merge",
      "react-aria",
      "react-aria-components",
      "@react-stately/utils",
      "@untitledui/icons",
      "@untitledui/file-icons",
      "@internationalized/date",
      "react-hotkeys-hook",
      "ical.js",
    ],
  },
});
