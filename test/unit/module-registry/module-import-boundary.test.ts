import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Architecture boundary (ADR-013 §18): a module may import kernel contracts and
 * its OWN internals, but never another module's internal files. This lightweight
 * repository test enforces that convention — it needs no dependency-analysis
 * framework, just import-specifier resolution against the `app/modules` tree.
 *
 * The pure resolver is exercised with synthetic inputs (so the rule itself is
 * tested), then run over every real file under `app/modules` (so a future
 * cross-module import fails CI).
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const appDir = path.join(repoRoot, "app");
const modulesDir = path.join(appDir, "modules");

/** The module directory (direct child of app/modules) an absolute path sits in, or null. */
function containingModule(absTarget: string): string | null {
  const rel = path.relative(modulesDir, absTarget);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return null; // outside app/modules
  }
  const segments = rel.split(path.sep);
  if (segments.length < 2) {
    return null; // a file directly in app/modules (e.g. discover-modules.ts), not a module
  }
  return segments[0];
}

/** The module an import specifier points INTO (from a given file), or null. */
function resolveImportedModule(
  specifier: string,
  fromFileAbs: string,
): string | null {
  let target: string;
  if (specifier.startsWith("~/")) {
    target = path.join(appDir, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    target = path.resolve(path.dirname(fromFileAbs), specifier);
  } else {
    return null; // bare package import
  }
  return containingModule(target);
}

const SPECIFIER_RE =
  /(?:import|export)\b[^'"();]*?\bfrom\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

function extractSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  let match: RegExpExecArray | null;
  SPECIFIER_RE.lastIndex = 0;
  while ((match = SPECIFIER_RE.exec(content)) !== null) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
}

/** The cross-module import specifiers a file contains (empty when clean). */
function crossModuleImports(fromFileAbs: string, content: string): string[] {
  const own = containingModule(fromFileAbs);
  return extractSpecifiers(content).filter((specifier) => {
    const target = resolveImportedModule(specifier, fromFileAbs);
    return target !== null && target !== own;
  });
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("module import boundary", () => {
  const projectsFile = path.join(modulesDir, "projects", "detail.ts");

  it("flags an aliased import into another module's internals", () => {
    expect(
      crossModuleImports(
        projectsFile,
        'import { thing } from "~/modules/notes/internal";',
      ),
    ).toEqual(["~/modules/notes/internal"]);
  });

  it("flags a relative import that climbs into a sibling module", () => {
    expect(
      crossModuleImports(projectsFile, 'import x from "../notes/thing";'),
    ).toEqual(["../notes/thing"]);
  });

  it("allows a module importing its own internals", () => {
    expect(
      crossModuleImports(
        projectsFile,
        'import x from "./card";\nimport y from "~/modules/projects/util";',
      ),
    ).toEqual([]);
  });

  it("allows importing kernel contracts and bare packages", () => {
    expect(
      crossModuleImports(
        projectsFile,
        'import { defineModule } from "~/kernel/modules";\nimport React from "react";',
      ),
    ).toEqual([]);
  });

  it("flags cross-module dynamic imports too", () => {
    expect(
      crossModuleImports(
        projectsFile,
        'const m = await import("~/modules/notes/x");',
      ),
    ).toEqual(["~/modules/notes/x"]);
  });

  it("has no cross-module imports anywhere under app/modules", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(modulesDir)) {
      const content = fs.readFileSync(file, "utf8");
      for (const specifier of crossModuleImports(file, content)) {
        offenders.push(`${path.relative(repoRoot, file)} → ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
