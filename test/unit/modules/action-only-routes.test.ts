/**
 * Every MUTATION endpoint answers a GET properly.
 *
 * DalyHub has thirty-one action-only routes — `POST /tasks/new`,
 * `POST /projects/:id/mutate`, `POST /tasks/bulk` and their siblings. None of
 * them had a loader, because none of them has anything to load, and React
 * Router's answer to a GET on such a route is a 400 carrying its own internal
 * error object: the message, and a full stack trace naming the framework
 * version and absolute filesystem paths.
 *
 * That is reachable by following a shared link, by a browser prefetching a
 * form's action, or by pressing Back onto a POST — so it is a real screen a
 * real person can meet, and it leaks build paths while it is there.
 *
 * `actionOnlyLoader` throws a 405 with an `Allow` header instead. This asserts
 * that every route which declares an `action` and no loader of its own USES it,
 * so the next mutation endpoint cannot ship without one — the check is
 * structural rather than a list of known files, because a list is exactly what
 * the thirty-second route would not be on.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MODULES_DIR = path.join(process.cwd(), "app", "modules");

/** Every route module file across every module. */
function routeFiles(): string[] {
  const files: string[] = [];
  for (const moduleName of readdirSync(MODULES_DIR)) {
    const routes = path.join(MODULES_DIR, moduleName, "routes");
    let entries: string[];
    try {
      if (!statSync(routes).isDirectory()) continue;
      entries = readdirSync(routes);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
        files.push(path.join(routes, entry));
      }
    }
  }
  return files;
}

const DECLARES_ACTION =
  /export\s+(?:async\s+function\s+action|const\s+action|function\s+action)\b/;
const DECLARES_LOADER =
  /export\s+(?:async\s+function\s+loader|const\s+loader|function\s+loader)\b/;

describe("action-only routes", () => {
  const files = routeFiles();

  it("finds the route modules to check", () => {
    // A guard on the guard: a refactor that moves routes elsewhere must fail
    // here rather than silently make this suite assert nothing.
    expect(files.length).toBeGreaterThan(50);
  });

  it("gives every mutation endpoint a loader", () => {
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!DECLARES_ACTION.test(source)) continue;
      if (!DECLARES_LOADER.test(source)) {
        missing.push(path.relative(process.cwd(), file));
      }
    }
    expect(
      missing,
      `these routes answer a GET with React Router's internal error and stack trace: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("uses the SHARED loader rather than a per-route one", () => {
    /*
     * The point is one answer, not thirty-one. A route that hand-rolled its own
     * 405 (or, worse, returned an empty 200) would satisfy the test above and
     * still be a second convention.
     */
    const wrong: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!DECLARES_ACTION.test(source)) continue;
      // A route with a REAL loader (a page that also mutates) is not one of
      // these; only the action-only ones assign the shared function.
      if (/export\s+const\s+loader\s*=\s*actionOnlyLoader/.test(source)) {
        if (!source.includes('from "~/platform/request"')) {
          wrong.push(path.relative(process.cwd(), file));
        }
      }
    }
    expect(wrong).toEqual([]);
  });
});
