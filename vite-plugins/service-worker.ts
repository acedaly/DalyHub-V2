/**
 * PWA-02 — the first-party Vite plugin that builds DalyHub's service worker.
 *
 * Why a plugin and not a dependency: the only thing the service worker needs from
 * the build is (a) a deployment identifier for its cache names and (b) the real
 * hashed filenames of the application-shell bundles. That is roughly fifty lines
 * of bundle inspection. Adding a service-worker framework to obtain it would pull
 * a large dependency and a generated worker nobody reads into the one place in
 * DalyHub where an un-reviewable bug is hardest to roll back
 * (`AGENTS.md §10`, and the milestone's "avoid introducing a large dependency").
 *
 * What it emits:
 *   - production build → `sw.js` at the client root, with the placeholders in
 *     `sw-template.js` replaced by a content-derived build id and a precache list;
 *   - dev server → the SAME template served at `/sw.js` with an empty precache
 *     list (the dev server has no hashed bundles) and a per-boot build id, so the
 *     end-to-end tests exercise the real worker code rather than a stub.
 *
 * The precache list is deliberately NOT "every asset in the build". It is the
 * entry chunk, everything the entry statically imports, their CSS, the offline
 * shell route's chunk and its imports, plus the icon set and manifest. Route
 * chunks the owner has not visited are left to the runtime cache-first handler —
 * caching all of them at install would download the whole application to a device
 * that may only ever open Today.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Plugin } from "vite";

/** The route whose document is the offline navigation fallback. */
export const OFFLINE_DOCUMENT_PATH = "/offline";

/** Static assets copied from `public/` that the shell needs offline. */
export const PUBLIC_PRECACHE_URLS: readonly string[] = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/dalyhub-mark.svg",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon.png",
];

/**
 * Read the worker template. Read per call so a dev edit is picked up, and
 * resolved from `import.meta.dirname` rather than a `file:` URL so this module
 * also loads under a test runner whose module environment does not give it one.
 */
function readTemplate(): string {
  return readFileSync(join(import.meta.dirname, "sw-template.js"), "utf8");
}

/**
 * Substitute the template's placeholders. Exported so a unit test can assert the
 * emitted worker for a known input without running a full Vite build.
 */
export function renderServiceWorker(options: {
  readonly buildId: string;
  readonly precacheUrls: readonly string[];
  readonly offlineDocument?: string;
  readonly template?: string;
}): string {
  const template = options.template ?? readTemplate();
  const rendered = template
    .replaceAll("__DALYHUB_BUILD_ID__", options.buildId)
    .replaceAll(
      "__DALYHUB_OFFLINE_DOCUMENT__",
      options.offlineDocument ?? OFFLINE_DOCUMENT_PATH,
    )
    .replaceAll(
      "__DALYHUB_PRECACHE__",
      JSON.stringify([...options.precacheUrls].sort(), null, 2),
    );
  if (rendered.includes("__DALYHUB_")) {
    throw new Error(
      "Service-worker template still contains an unsubstituted placeholder.",
    );
  }
  return rendered;
}

/**
 * A deployment identifier derived from the application version and the exact set
 * of precached filenames. Content-derived on purpose: two builds of identical
 * source produce the same id (so a redeploy does not needlessly evict a healthy
 * cache), and any change to a shell bundle produces a different one (so a real
 * deployment always supersedes its predecessor).
 */
export function computeBuildId(
  version: string,
  precacheUrls: readonly string[],
): string {
  const digest = createHash("sha256")
    .update([...precacheUrls].sort().join("\n"))
    .digest("hex")
    .slice(0, 12);
  return `${version}-${digest}`;
}

type BundleChunk = {
  type: string;
  fileName: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  imports?: readonly string[];
  viteMetadata?: { importedCss?: Set<string> };
};

/**
 * Collect a chunk and everything it statically imports, plus their CSS. Bounded
 * by the bundle itself and guarded against the import cycles a code-split React
 * application routinely contains.
 */
function collectChunkGraph(
  bundle: Record<string, BundleChunk>,
  entryFileNames: readonly string[],
): Set<string> {
  const collected = new Set<string>();
  const queue = [...entryFileNames];
  while (queue.length > 0) {
    const fileName = queue.shift();
    if (!fileName || collected.has(fileName)) continue;
    const chunk = bundle[fileName];
    if (!chunk) continue;
    collected.add(fileName);
    for (const css of chunk.viteMetadata?.importedCss ?? []) {
      collected.add(css);
    }
    for (const imported of chunk.imports ?? []) {
      queue.push(imported);
    }
  }
  return collected;
}

/**
 * The chunks that make up the OFFLINE-BOOTABLE application shell.
 *
 * React Router's client build marks EVERY route module as a Rollup entry chunk,
 * so "precache every entry" would precache the whole application — 188 of 194
 * assets in the DalyHub build, roughly 2.5 MB, downloaded to a device that may
 * only ever open Today. That is exactly what this milestone forbids.
 *
 * So the roots are named explicitly, and there are only three:
 *   1. the framework's browser entry (`entry.client.tsx`), which boots React;
 *   2. the ROOT route module, which every document needs;
 *   3. the `/offline` route module, which is the navigation fallback's page.
 *
 * Everything those three statically import (and their CSS) comes along, because
 * a shell that boots without its own imports is not a shell. Every other route
 * chunk is left to the runtime cache-first handler, which stores it the first
 * time the owner actually visits that surface.
 */
function isPrecacheRoot(chunk: BundleChunk): boolean {
  const id = chunk.facadeModuleId;
  if (chunk.type !== "chunk" || typeof id !== "string") return false;
  // The framework's own browser entry, from inside `@react-router/dev`.
  if (/[\\/]entry\.client\.tsx?(\?|$)/.test(id)) return true;
  // The application's root route and the offline shell route.
  if (/[\\/]app[\\/]root\.tsx(\?|$)/.test(id)) return true;
  if (/[\\/]app[\\/]routes[\\/]offline\.tsx(\?|$)/.test(id)) return true;
  return false;
}

/**
 * Choose the precache set from a finished client bundle: the shell roots' chunk
 * graphs plus the public static assets.
 */
export function selectPrecacheFileNames(
  bundle: Record<string, BundleChunk>,
): string[] {
  const roots = Object.values(bundle)
    .filter(isPrecacheRoot)
    .map((chunk) => chunk.fileName);
  const collected = collectChunkGraph(bundle, roots);
  return [
    ...[...collected].map((fileName) => `/${fileName}`),
    ...PUBLIC_PRECACHE_URLS,
  ].sort();
}

export interface ServiceWorkerPluginOptions {
  /** The application version the build id is prefixed with. */
  readonly version: string;
}

/** The DalyHub service-worker build plugin. */
export function dalyhubServiceWorker(
  options: ServiceWorkerPluginOptions,
): Plugin {
  return {
    name: "dalyhub:service-worker",
    // The dev server has no hashed bundles and no `generateBundle`, so the worker
    // is synthesised on request. It is the SAME code with an empty precache list:
    // the runtime cache-first handler and the navigation fallback — the parts the
    // end-to-end offline tests exercise — behave identically.
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (
          !request.url ||
          new URL(request.url, "http://x").pathname !== "/sw.js"
        ) {
          next();
          return;
        }
        const body = renderServiceWorker({
          buildId: `${options.version}-dev`,
          precacheUrls: PUBLIC_PRECACHE_URLS,
        });
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Service-Worker-Allowed", "/");
        response.end(body);
      });
    },
    generateBundle(_options, bundle) {
      // Only the CLIENT build produces browser assets; the SSR/Worker builds must
      // not emit a service worker into the server bundle.
      if (this.environment?.name !== "client") return;
      const precacheUrls = selectPrecacheFileNames(
        bundle as unknown as Record<string, BundleChunk>,
      );
      const buildId = computeBuildId(options.version, precacheUrls);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: renderServiceWorker({ buildId, precacheUrls }),
      });
    },
  };
}
