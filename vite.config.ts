import { fileURLToPath } from "node:url";

import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";

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
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
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
    ],
  },
});
