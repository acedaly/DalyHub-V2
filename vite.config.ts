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
});
