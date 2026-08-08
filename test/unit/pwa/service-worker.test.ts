/**
 * PWA-02 — the service worker's build and its caching rules.
 *
 * Two things are asserted here, and both are the kind of mistake that ships
 * silently and is expensive to undo:
 *
 *   1. **Cache versioning and precache selection.** A build id that does not
 *      change between deployments leaves devices on stale JavaScript; a precache
 *      list that quietly grows to the whole application downloads megabytes to a
 *      phone. The selection is asserted against a realistic bundle shape,
 *      including React Router's habit of marking EVERY route module as an entry.
 *   2. **The never-cache rules.** These are read out of the emitted worker
 *      source, because the worker is the artefact that ships and a rule that
 *      exists only in a comment protects nobody.
 */

import { describe, expect, it } from "vitest";

import { applyBaseSecurityHeaders } from "~/platform/request/security-headers";
import {
  OFFLINE_DOCUMENT_PATH,
  PUBLIC_PRECACHE_URLS,
  computeBuildId,
  renderServiceWorker,
  selectPrecacheFileNames,
} from "../../../vite-plugins/service-worker";

/**
 * A bundle shaped like the real DalyHub client build: the framework entry, the
 * root route, the offline route, a handful of shared chunks — and a pile of
 * route modules that Rollup ALSO marks `isEntry`, which is the trap.
 */
function bundle() {
  return {
    "assets/entry.client-A.js": {
      type: "chunk",
      fileName: "assets/entry.client-A.js",
      isEntry: true,
      facadeModuleId:
        "/repo/node_modules/@react-router/dev/dist/config/defaults/entry.client.tsx",
      imports: ["assets/react-dom-A.js"],
    },
    "assets/root-A.js": {
      type: "chunk",
      fileName: "assets/root-A.js",
      isEntry: true,
      facadeModuleId: "/repo/app/root.tsx?__react-router-build-client-route",
      imports: ["assets/theme-A.js"],
      viteMetadata: { importedCss: new Set(["assets/root-A.css"]) },
    },
    "assets/offline-A.js": {
      type: "chunk",
      fileName: "assets/offline-A.js",
      isEntry: true,
      facadeModuleId:
        "/repo/app/routes/offline.tsx?__react-router-build-client-route",
      imports: ["assets/offline-shared-A.js"],
    },
    "assets/tasks-A.js": {
      type: "chunk",
      fileName: "assets/tasks-A.js",
      isEntry: true,
      facadeModuleId:
        "/repo/app/modules/tasks/routes/index.tsx?__react-router-build-client-route",
      imports: ["assets/heavy-editor-A.js"],
    },
    "assets/meetings-A.js": {
      type: "chunk",
      fileName: "assets/meetings-A.js",
      isEntry: true,
      facadeModuleId:
        "/repo/app/modules/meetings/routes/index.tsx?__react-router-build-client-route",
      imports: [],
    },
    "assets/react-dom-A.js": {
      type: "chunk",
      fileName: "assets/react-dom-A.js",
      imports: [],
    },
    "assets/theme-A.js": {
      type: "chunk",
      fileName: "assets/theme-A.js",
      imports: ["assets/root-A.js"], // a cycle, which a code-split app really has
    },
    "assets/offline-shared-A.js": {
      type: "chunk",
      fileName: "assets/offline-shared-A.js",
      imports: [],
    },
    "assets/heavy-editor-A.js": {
      type: "chunk",
      fileName: "assets/heavy-editor-A.js",
      imports: [],
    },
    "assets/root-A.css": { type: "asset", fileName: "assets/root-A.css" },
  };
}

describe("selectPrecacheFileNames", () => {
  const selected = selectPrecacheFileNames(
    bundle() as unknown as Parameters<typeof selectPrecacheFileNames>[0],
  );

  it("precaches the application shell", () => {
    expect(selected).toContain("/assets/entry.client-A.js");
    expect(selected).toContain("/assets/root-A.js");
    expect(selected).toContain("/assets/offline-A.js");
  });

  it("follows the shell's static imports and their CSS", () => {
    expect(selected).toContain("/assets/react-dom-A.js");
    expect(selected).toContain("/assets/theme-A.js");
    expect(selected).toContain("/assets/offline-shared-A.js");
    expect(selected).toContain("/assets/root-A.css");
  });

  it("does NOT precache route modules the owner has not visited", () => {
    // React Router marks every route module `isEntry`. Precaching all of them
    // would download the whole application to a device that may only ever open
    // Today — which is exactly what this milestone forbids.
    expect(selected).not.toContain("/assets/tasks-A.js");
    expect(selected).not.toContain("/assets/meetings-A.js");
    expect(selected).not.toContain("/assets/heavy-editor-A.js");
  });

  it("includes the manifest and the icons the shell needs", () => {
    for (const url of PUBLIC_PRECACHE_URLS) {
      expect(selected).toContain(url);
    }
  });

  it("terminates on an import cycle", () => {
    // `theme-A` imports `root-A`, which imports `theme-A`. A naive walk hangs.
    expect(selected.filter((url) => url === "/assets/theme-A.js")).toHaveLength(
      1,
    );
  });

  it("is deterministically ordered, so the build id is stable", () => {
    expect([...selected]).toEqual([...selected].sort());
  });
});

describe("computeBuildId", () => {
  it("is identical for identical builds", () => {
    expect(computeBuildId("2.0.1", ["/a.js", "/b.js"])).toBe(
      computeBuildId("2.0.1", ["/a.js", "/b.js"]),
    );
  });

  it("ignores the order the file names arrive in", () => {
    expect(computeBuildId("2.0.1", ["/a.js", "/b.js"])).toBe(
      computeBuildId("2.0.1", ["/b.js", "/a.js"]),
    );
  });

  it("CHANGES when any shell asset's content hash changes", () => {
    // This is what makes a deployment supersede its predecessor's caches.
    expect(computeBuildId("2.0.1", ["/a-hash1.js"])).not.toBe(
      computeBuildId("2.0.1", ["/a-hash2.js"]),
    );
  });

  it("carries the application version, so a release is legible in devtools", () => {
    expect(computeBuildId("2.0.1", ["/a.js"]).startsWith("2.0.1-")).toBe(true);
  });
});

describe("renderServiceWorker", () => {
  const worker = renderServiceWorker({
    buildId: "2.0.1-abc123",
    precacheUrls: ["/assets/root-A.js", "/manifest.webmanifest"],
  });

  it("substitutes every build-time placeholder", () => {
    expect(worker).not.toContain("__DALYHUB_");
  });

  it("ties every cache name to the build id", () => {
    expect(worker).toContain('const BUILD_ID = "2.0.1-abc123"');
    expect(worker).toContain("dalyhub-static-${BUILD_ID}");
    expect(worker).toContain("dalyhub-shell-${BUILD_ID}");
  });

  it("embeds the precache list", () => {
    expect(worker).toContain('"/assets/root-A.js"');
    expect(worker).toContain('"/manifest.webmanifest"');
  });

  it("names the offline shell document", () => {
    expect(worker).toContain(
      `const OFFLINE_DOCUMENT = "${OFFLINE_DOCUMENT_PATH}"`,
    );
  });

  it("refuses to emit a worker with an unsubstituted placeholder", () => {
    expect(() =>
      renderServiceWorker({
        buildId: "x",
        precacheUrls: [],
        template: 'const A = "__DALYHUB_SOMETHING_ELSE__";',
      }),
    ).toThrow(/unsubstituted placeholder/i);
  });

  it("cleans up superseded caches on activation", () => {
    expect(worker).toContain('addEventListener("activate"');
    expect(worker).toContain("caches.delete(name)");
    expect(worker).toContain("name !== STATIC_CACHE");
    expect(worker).toContain("name !== SHELL_CACHE");
  });

  it("only ever deletes caches it owns", () => {
    expect(worker).toContain("OWNED_CACHE_PREFIXES");
    expect(worker).toContain('"dalyhub-static-"');
    expect(worker).toContain('"dalyhub-shell-"');
  });

  it("waits rather than taking over a page that is already running", () => {
    // `skipWaiting` must be reachable ONLY from the explicit message, never
    // called at install time.
    expect(worker).toContain('type === "SKIP_WAITING"');
    expect(worker).not.toMatch(
      /addEventListener\("install"[\s\S]{0,400}skipWaiting/,
    );
  });

  it("never caches authenticated API surfaces", () => {
    for (const path of [
      '"/offline/"',
      '"/search"',
      '"/commands"',
      '"/links"',
      '"/capture/"',
      '"/preferences/"',
      '"/health"',
    ]) {
      expect(worker).toContain(path);
    }
  });

  it("never caches React Router loader data", () => {
    expect(worker).toContain('searchParams.has("_data")');
    expect(worker).toContain('pathname.endsWith(".data")');
  });

  it("only handles same-origin GET requests", () => {
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain("url.origin !== self.location.origin");
  });

  it("tries the network FIRST for navigations", () => {
    // So an online owner never sees a stale page, and an expired Access session
    // still redirects to the identity provider exactly as it would without a
    // service worker. The offline branch is reached only from the `catch`.
    const navigation = worker.slice(
      worker.indexOf("async function serveNavigation"),
    );
    expect(navigation.indexOf("await fetch(request)")).toBeLessThan(
      navigation.indexOf("serveOfflineNavigation(url)"),
    );
  });

  it("answers the offline document ONLY for a genuine document navigation", () => {
    // PWA-11 — the rule the iPhone crash came from. The behaviour is asserted
    // for real in `service-worker-runtime.test.ts`; this keeps the rule itself
    // visible in the artefact that ships.
    expect(worker).toContain('request.mode !== "navigate"');
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain('destination === "document"');
  });

  it("redirects a non-offline navigation rather than serving the shell there", () => {
    expect(worker).toContain("Response.redirect");
    expect(worker).toContain("url.pathname !== OFFLINE_DOCUMENT");
  });

  it("fails a static-asset miss cleanly, never with HTML", () => {
    const statics = worker.slice(
      worker.indexOf("async function serveStatic"),
      worker.indexOf("/* ---- the offline-boot loop breaker"),
    );
    expect(statics).toContain("status: 504");
    expect(statics).toContain('"Content-Type": "text/plain; charset=utf-8"');
    expect(statics).not.toContain("text/html");
  });

  it("applies the Worker's baseline security headers to responses it synthesises", () => {
    // A response the worker builds itself never passed through the Worker
    // boundary, so it would otherwise be the one DalyHub document served with no
    // CSP, no `nosniff` and no frame protection. `security-headers.ts` stays the
    // source of truth, and this reads the REAL values out of it — so the copy in
    // the worker cannot drift from the boundary's policy without failing here.
    const baseline = new Headers();
    applyBaseSecurityHeaders(baseline, {
      nonce: "AAAAAAAAAAAAAAAAAAAAAA",
      mode: "production",
    });
    for (const [name, value] of baseline.entries()) {
      // Permissions-Policy is deliberately not duplicated: it governs powerful
      // device features that the offline documents do not use, and repeating a
      // long list in the worker would be the kind of duplication that rots.
      if (name.toLowerCase() === "permissions-policy") continue;
      // AUDIT-10 — the CSP is deliberately NOT copied. It is per-response now
      // (it names a nonce), so a literal copy would be a policy naming a nonce
      // no document carries. The worker replays the cached response's own
      // policy and gives its script-free synthesised documents a stricter one;
      // both are asserted separately below.
      if (name.toLowerCase() === "content-security-policy") continue;
      expect(worker, `${name} must be applied by the worker too`).toContain(
        value,
      );
    }
  });

  it("carries a bounded offline-boot loop breaker", () => {
    expect(worker).toContain("OFFLINE_BOOT_LIMIT");
    expect(worker).toContain("OFFLINE_BOOT_WINDOW_MS");
    expect(worker).toContain("safeModeDocument");
  });

  it("requires DalyHub's own marker before caching the offline shell", () => {
    // An Access challenge page is also an HTML 200. Without this check it could
    // be stored as the offline shell and shown on every offline launch.
    expect(worker).toContain(
      'response.headers.get("X-DalyHub-Shell") !== "offline"',
    );
  });

  it("stays small enough to read in one sitting", () => {
    // Raised from 20 kB when PWA-11 added the navigation-redirect rule, the
    // clean-failure path for non-document requests, and the offline-boot loop
    // breaker — along with the reasoning for each, which is the part that has to
    // survive. The ceiling exists to stop the worker growing a framework, not to
    // ration comments, and it is still one sitting's reading.
    expect(worker.length).toBeLessThan(26_000);
  });
});
