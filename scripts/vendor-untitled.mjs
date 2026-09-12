#!/usr/bin/env node
/**
 * UNTITLED-01 — vendor Untitled UI React components into `app/shared/ui/untitled/`.
 *
 * DalyHub adopts Untitled UI as its implementation system by taking its SOURCE,
 * not by depending on a package: the components are React Aria compositions that
 * are meant to be owned and adapted, and Untitled distributes them that way.
 * This script is how they get here, so that "where did this file come from and
 * what did we change?" always has an answer (AGENTS.md §11).
 *
 * What it does, and only this:
 *
 *   1. Reads the MANIFEST below — the components DalyHub actually uses. The
 *      migration brief is explicit that heavy adoption is not the same as
 *      dumping the library, so nothing arrives here without being named.
 *   2. Follows each entry's `@/`-relative imports TRANSITIVELY, so a component's
 *      real dependencies come with it and nothing is half-copied.
 *   3. Rewrites `@/…` to DalyHub's `~/shared/ui/untitled/…` alias.
 *   4. Stamps each file with a provenance header.
 *   5. Reports every bare (npm) import it saw, so a missing dependency is found
 *      here rather than at runtime.
 *
 * Files under `overrides/` are DalyHub's own and are never overwritten.
 *
 * Usage:
 *   node scripts/vendor-untitled.mjs               # copy / refresh
 *   node scripts/vendor-untitled.mjs --check       # fail if output drifted
 *   node scripts/vendor-untitled.mjs --refresh-provenance # update headers only
 *   node scripts/vendor-untitled.mjs --provenance-report # print source identity
 *   UNTITLED_SRC=/path/to/untitled/src node scripts/vendor-untitled.mjs
 *
 * Deliberately NOT part of `pnpm run verify`: the vendored output is committed,
 * so a contributor without a local Untitled checkout is never blocked by it.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC =
  process.env.UNTITLED_SRC ??
  join(process.env.HOME ?? "", "Untitled-UI-Reference", "src");
const DEST = join(ROOT, "app", "shared", "ui", "untitled");
const PROVENANCE = JSON.parse(
  readFileSync(join(ROOT, "scripts", "untitled-provenance.json"), "utf8"),
);

function commandOutput(command, args) {
  try {
    const output = execFileSync(command, args, { encoding: "utf8" }).trim();
    return output || null;
  } catch {
    return null;
  }
}

const REFRESH_ONLY = process.argv.includes("--refresh-provenance");

function sourceSyncMarker() {
  for (const candidate of [
    join(SRC, "..", ".github", "last-sync-commit"),
    join(SRC, ".github", "last-sync-commit"),
  ]) {
    if (existsSync(candidate)) return readFileSync(candidate, "utf8").trim();
  }
  return null;
}

/**
 * The local checkout is the licensed source snapshot used for vendoring. Keep
 * both identifiers: the Git revision is reproducible, while the sync marker
 * is the upstream delivery identifier when the licensed Pro checkout does not
 * expose a public component commit.
 */
const SOURCE_REVISION =
  process.env.UNTITLED_SOURCE_REVISION ??
  (!REFRESH_ONLY
    ? commandOutput("git", ["-C", SRC, "rev-parse", "HEAD"])
    : null) ??
  PROVENANCE.revision ??
  "unavailable";
const SOURCE_SYNC_MARKER =
  process.env.UNTITLED_SOURCE_SYNC_MARKER ??
  (!REFRESH_ONLY ? sourceSyncMarker() : null) ??
  PROVENANCE.syncMarker ??
  "unavailable";
const RETRIEVED = process.env.UNTITLED_RETRIEVED ?? PROVENANCE.retrieved;

/**
 * THE MANIFEST — every Untitled component DalyHub uses, by its path under the
 * Untitled `src/` tree. Transitive dependencies are resolved automatically, so
 * this lists ENTRY POINTS only: the things DalyHub composes directly.
 */
const MANIFEST = [
  /* ── Actions ──────────────────────────────────────────────────────────── */
  "components/base/buttons/button.tsx",
  "components/base/buttons/button-utility.tsx",
  "components/base/buttons/close-button.tsx",
  "components/base/button-group/button-group.tsx",

  /* ── Data entry ───────────────────────────────────────────────────────── */
  "components/base/input/input.tsx",
  "components/base/input/input-group.tsx",
  "components/base/input/label.tsx",
  "components/base/input/hint-text.tsx",
  "components/base/textarea/textarea.tsx",
  "components/base/checkbox/checkbox.tsx",
  "components/base/radio-buttons/radio-buttons.tsx",
  "components/base/toggle/toggle.tsx",
  "components/base/select/select.tsx",
  "components/base/select/combobox.tsx",
  "components/base/select/multi-select.tsx",
  "components/base/form/form.tsx",

  /* ── Display ──────────────────────────────────────────────────────────── */
  "components/base/badges/badges.tsx",
  "components/base/avatar/avatar.tsx",
  "components/base/avatar/avatar-label-group.tsx",
  "components/base/tags/tags.tsx",
  "components/base/tooltip/tooltip.tsx",
  "components/base/progress-indicators/progress-indicators.tsx",
  "components/base/dropdown/dropdown.tsx",
  "components/foundations/featured-icon/featured-icon.tsx",
  "components/foundations/dot-icon.tsx",

  /* ── Application patterns ─────────────────────────────────────────────── */
  "components/application/app-navigation/base-components/nav-item.tsx",
  "components/application/app-navigation/base-components/nav-list.tsx",
  "components/application/app-navigation/base-components/nav-account-card.tsx",
  "components/application/modals/modal.tsx",
  "components/application/slideout-menus/slideout-menu.tsx",
  "components/application/tabs/tabs.tsx",
  "components/application/table/table.tsx",
  "components/application/empty-state/empty-state.tsx",
  "components/application/pagination/pagination.tsx",
  "components/application/loading-indicator/loading-indicator.tsx",
  "components/application/date-picker/date-picker.tsx",
  "components/application/date-picker/calendar.tsx",
  "components/application/command-menus/command-menu.tsx",
  "components/application/section-headers/section-label.tsx",
];

/**
 * API-SOURCED — vendored Untitled files this script does NOT own, because they
 * did not come from a checkout.
 *
 * `app/shared/ui/untitled/application/charts/charts-base.tsx` was retrieved from
 * Untitled's PUBLIC component API (`POST
 * https://www.untitledui.com/react/api/components`, component `charts-base`),
 * which serves the genuine source of every component Untitled publishes openly —
 * exactly what `npx untitledui@latest add charts-base` installs. That route was
 * used because this environment has no licensed Untitled checkout and the CLI
 * cannot be authenticated here: `untitledui login` completes its OAuth callback
 * to a localhost port a headless container cannot reach.
 *
 * Its header therefore names the API and the retrieval date rather than a
 * checkout revision, because that is where it actually came from (AGENTS.md §11).
 * The file is listed here rather than in `MANIFEST` so the checkout walk neither
 * regenerates it nor deletes it as an orphan. Move it into `MANIFEST` — the path
 * is already the one it occupies in the Untitled `src/` tree — the first time
 * this script is run against a real licensed checkout.
 */
const API_SOURCED = new Set(["application/charts/charts-base.tsx"]);

/**
 * PATCHES — narrow, named edits applied after copying.
 *
 * Each one exists because upstream cannot compile as-is inside DalyHub, and each
 * says why. This is deliberately not a general escape hatch: anything that is a
 * DESIGN change belongs in a DalyHub component that composes the vendored one,
 * not here. Keeping the list short is the point — a long list means the wrong
 * thing is being vendored.
 */
const PATCHES = [
  {
    file: "components/application/charts/charts-base.tsx",
    reason:
      "Upstream's legend calls `payload.toReversed()`, an ES2023 array method. " +
      'DalyHub\'s application tsconfig declares `lib: ["DOM", "DOM.Iterable", ' +
      '"ES2022"]`, so the call does not typecheck. `[...payload].reverse()` is ' +
      "the same non-mutating reversal at the library level the rest of the " +
      "application compiles against. This file is currently API_SOURCED, so the " +
      "patch is applied by hand in the vendored copy and recorded here for the " +
      "first re-vendor from a licensed checkout.",
    from: "payload = reversed ? payload?.toReversed() : payload;",
    to: "payload = reversed && payload ? [...payload].reverse() : payload;",
  },
  {
    file: "components/application/command-menus/parseHotkeys.ts",
    reason:
      "Upstream imports two types from `react-hotkeys-hook/dist/types`. " +
      "react-hotkeys-hook v5 removed that entry point and does not re-export " +
      "either type from its root, so the import cannot resolve at any version " +
      "we can install. This file is itself a copy of the library's internal " +
      "module, so declaring the two types locally restores exactly what it had " +
      "and drops the coupling to a private path.",
    from: `import type { Hotkey, KeyboardModifiers } from "react-hotkeys-hook/dist/types";`,
    to: `type KeyboardModifiers = {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    mod?: boolean;
    useKey?: boolean;
};

type Hotkey = KeyboardModifiers & {
    keys?: readonly string[];
    scopes?: string | readonly string[];
    description?: string;
    isSequence?: boolean;
    hotkey: string;
    metadata?: Record<string, unknown>;
};`,
  },
  {
    file: "components/shared-assets/illustrations/index.tsx",
    reason:
      "Each illustration module declares its own PRIVATE `IllustrationProps`, " +
      "so the inferred type of the `types` map names interfaces that cannot be " +
      "referenced from outside their module. DalyHub compiles with declaration " +
      "emit (`tsc -b`), which rejects that as TS4023. Annotating the map with " +
      "the exported props type fixes the emit without changing behaviour, and " +
      "keeps the literal key union that `Illustration` depends on.",
    from: `const types = {
    box: BoxIllustration,
    cloud: CloudIllustration,
    documents: DocumentsIllustration,
    "credit-card": CreditCardIllustration,
};`,
    to: `type IllustrationType = "box" | "cloud" | "documents" | "credit-card";

const types: Record<IllustrationType, FC<IllustrationProps>> = {
    box: BoxIllustration,
    cloud: CloudIllustration,
    documents: DocumentsIllustration,
    "credit-card": CreditCardIllustration,
};`,
  },
  {
    file: "components/shared-assets/illustrations/index.tsx",
    reason: "The annotation above needs `FC`, which upstream does not import.",
    from: `import type { HTMLAttributes } from "react";`,
    to: `import type { FC, HTMLAttributes } from "react";`,
  },
];

/* ── Import rewriting ─────────────────────────────────────────────────────── */

const ALIAS = "~/shared/ui/untitled";

/** `@/components/base/x` → `~/shared/ui/untitled/base/x`, and friends. */
function rewriteSpecifier(spec) {
  if (!spec.startsWith("@/")) return null;
  const rest = spec.slice("@/".length);
  const mapped = rest.startsWith("components/")
    ? rest.slice("components/".length)
    : rest;
  return `${ALIAS}/${mapped}`;
}

/** The path under `SRC` that a `@/…` specifier resolves to. */
function resolveSource(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) {
    base = join(SRC, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = resolve(dirname(join(SRC, fromFile)), spec);
  } else {
    return null; // A bare npm import; not ours to copy.
  }

  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(SRC, candidate);
    }
  }
  return null;
}

/** The path under `DEST` a source file is written to. */
function destinationFor(sourcePath) {
  const stripped = sourcePath.startsWith("components/")
    ? sourcePath.slice("components/".length)
    : sourcePath;
  return join(DEST, stripped);
}

const IMPORT_RE = /(?:from|import)\s*["']([^"']+)["']/g;

function importsOf(code) {
  return [...code.matchAll(IMPORT_RE)].map((m) => m[1]);
}

/* ── Walk ─────────────────────────────────────────────────────────────────── */

const visited = new Map(); // sourcePath -> transformed code
const bareImports = new Set();
const missing = [];

function visit(sourcePath) {
  if (visited.has(sourcePath)) return;

  const abs = join(SRC, sourcePath);
  if (!existsSync(abs)) {
    missing.push(sourcePath);
    return;
  }

  const original = readFileSync(abs, "utf8");
  visited.set(sourcePath, null); // Mark before recursing, so cycles terminate.

  let code = original;

  for (const spec of importsOf(original)) {
    if (!spec.startsWith("@/") && !spec.startsWith(".")) {
      bareImports.add(spec);
      continue;
    }

    const target = resolveSource(spec, sourcePath);
    if (!target) {
      missing.push(`${spec} (from ${sourcePath})`);
      continue;
    }

    // Relative imports stay relative — the tree shape is preserved — so only
    // the `@/` alias needs rewriting.
    if (spec.startsWith("@/")) {
      const rewritten = rewriteSpecifier(spec);
      code = code.split(`"${spec}"`).join(`"${rewritten}"`);
      code = code.split(`'${spec}'`).join(`'${rewritten}'`);
    }

    visit(target);
  }

  let patchNote = "";
  for (const patch of PATCHES) {
    if (patch.file !== sourcePath) continue;
    if (!code.includes(patch.from)) {
      missing.push(`patch no longer applies to ${sourcePath}: ${patch.reason}`);
      continue;
    }
    code = code.replace(patch.from, patch.to);
    patchNote += `//\n// PATCHED by the vendoring script: ${patch.reason.replace(/(.{72,}?) /g, "$1\n// ")}\n`;
  }

  const header = `// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: \`src/${sourcePath}\`, retrieved ${RETRIEVED}.
// Source revision: \`${SOURCE_REVISION}\`; sync marker: \`${SOURCE_SYNC_MARKER}\`.
// Source licence: ${PROVENANCE.license}.
// Written by \`scripts/vendor-untitled.mjs\`; edit the manifest or the override
// layer in \`~/shared/ui/untitled/overrides/\` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream${patchNote ? ", plus:" : "."}
${patchNote}`;

  visited.set(sourcePath, header + code);
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

/** Refresh headers without requiring a local source tree or rewriting code. */
function refreshProvenance() {
  let changed = 0;

  function visitDirectory(dir) {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name === "overrides") continue;
        visitDirectory(path);
        continue;
      }
      if (!path.endsWith(".tsx") && !path.endsWith(".ts")) continue;

      const existing = readFileSync(path, "utf8");
      const source = existing.match(
        /^\/\/ Source: `([^`]+)`, retrieved [^\n]+\.\n(?:(?:\/\/ Source revision:|\/\/ Source licence:)[^\n]+\n)*/m,
      );
      if (!source) continue;

      const next = existing.replace(
        source[0],
        `// Source: \`${source[1]}\`, retrieved ${RETRIEVED}.\n// Source revision: \`${SOURCE_REVISION}\`; sync marker: \`${SOURCE_SYNC_MARKER}\`.\n// Source licence: ${PROVENANCE.license}.\n`,
      );
      if (next !== existing) {
        writeFileSync(path, next);
        changed += 1;
      }
    }
  }

  visitDirectory(DEST);
  console.log(`Refreshed provenance in ${changed} vendored file(s).`);
}

if (process.argv.includes("--refresh-provenance")) {
  refreshProvenance();
  process.exit(0);
}

if (process.argv.includes("--provenance-report")) {
  console.log(
    JSON.stringify(
      {
        source: SRC,
        revision: SOURCE_REVISION,
        syncMarker: SOURCE_SYNC_MARKER,
        retrieved: RETRIEVED,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (!existsSync(SRC)) {
  console.error(
    `Untitled source tree not found at ${SRC}.\n` +
      "Set UNTITLED_SRC, or check out the Untitled UI starter kit.\n" +
      "The vendored output is committed, so this is only needed to re-vendor.",
  );
  process.exit(1);
}

for (const entry of MANIFEST) visit(entry);

if (missing.length) {
  console.error("Could not resolve:\n  " + missing.join("\n  "));
  process.exit(1);
}

const check = process.argv.includes("--check");
let drifted = 0;

/** Everything the vendoring owns, so a removed manifest entry leaves no orphan. */
const written = new Set();

for (const [sourcePath, code] of visited) {
  const dest = destinationFor(sourcePath);
  written.add(dest);

  const existing = existsSync(dest) ? readFileSync(dest, "utf8") : null;
  if (existing === code) continue;

  drifted += 1;
  if (check) {
    console.error(`drift: ${relative(ROOT, dest)}`);
    continue;
  }

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, code);
}

/** Sweep vendored files no longer reachable from the manifest. */
function sweep(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "overrides" || name === "utils" || name === "hooks")
        continue;
      sweep(path);
      if (readdirSync(path).length === 0) rmSync(path, { recursive: true });
      continue;
    }
    if (!path.endsWith(".tsx") && !path.endsWith(".ts")) continue;
    if (written.has(path)) continue;
    // Vendored, but not from the checkout this script walks. See `API_SOURCED`.
    if (API_SOURCED.has(relative(DEST, path).split(sep).join("/"))) continue;
    if (
      !readFileSync(path, "utf8").startsWith("// Vendored from Untitled UI")
    ) {
      continue; // A DalyHub file living alongside; not ours to remove.
    }
    drifted += 1;
    if (check) console.error(`orphan: ${relative(ROOT, path)}`);
    else rmSync(path);
  }
}

sweep(DEST);

if (check) {
  if (drifted) {
    console.error(
      `\n${drifted} vendored file(s) drifted. Run \`node scripts/vendor-untitled.mjs\`.`,
    );
    process.exit(1);
  }
  console.log(`Vendored tree is up to date (${visited.size} files).`);
} else {
  console.log(
    `Vendored ${visited.size} file(s) from ${MANIFEST.length} manifest entries.`,
  );
  console.log("\nnpm imports used by the vendored set:");
  for (const spec of [...bareImports].sort()) console.log(`  ${spec}`);
}
