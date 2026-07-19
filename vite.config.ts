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
  // Pre-bundle the FND-08 Markdown `unified` stack at dev-server start. The DS-06
  // Markdown control lazy-imports `~/platform/markdown` only when its preview is
  // opened (keeping the parser out of the initial production bundle via code
  // splitting). Without this, that first runtime import makes Vite discover and
  // optimise the `unified` dependency graph on the fly, triggering a full dev
  // page reload that would reset the just-opened preview. Declaring the deps here
  // optimises them up front, so the lazy import resolves without a reload.
  optimizeDeps: {
    include: [
      "unified",
      "remark-parse",
      "remark-gfm",
      "remark-rehype",
      "rehype-sanitize",
      "rehype-stringify",
    ],
  },
});
