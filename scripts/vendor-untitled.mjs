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
 *
 * UNTITLED-13 added `base/avatar/avatar-profile-photo.tsx` the same way, from
 * the same route (component `avatar`, which serves the whole avatar folder).
 * It is the large identity mark Untitled's own profile pages use — a ringed,
 * padded disc at 72/96/160px — and the Person record's identity band is it.
 */
const API_SOURCED = new Set([
  "application/charts/charts-base.tsx",
  "base/avatar/avatar-profile-photo.tsx",
]);

/**
 * PATCHES — narrow, named edits applied after copying.
 *
 * Each one says why it exists, and there are exactly two admissible reasons.
 *
 * The first is that upstream CANNOT COMPILE as-is inside DalyHub — a language
 * level we do not target, an import path a dependency no longer publishes.
 *
 * The second is that upstream statically imports a DEPENDENCY DALYHUB DOES NOT
 * SHIP, for a sub-component the product never renders. That is not a style
 * preference; it is a bundle the owner downloads and never sees. It is admitted
 * here rather than worked around at the composition layer because a module is
 * the unit of import: a DalyHub component that composes one export of a vendored
 * module still carries every other export's dependency graph, so composing
 * around it cannot remove the bytes. The removal must therefore be in the
 * vendored copy, and recording it here is what makes it survive a re-vendor
 * instead of silently coming back. Such a patch must remove ONLY the dead
 * sub-component and must be justified by a MEASURED cost.
 *
 * This is deliberately not a general escape hatch: anything that is a DESIGN
 * change belongs in a DalyHub component that composes the vendored one, not
 * here. Keeping the list short is the point — a long list means the wrong thing
 * is being vendored.
 */
const PATCHES = [
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "Upstream's `EmptyState.FileTypeIcon` statically imports `FileIcon` from " +
      "`@untitledui/file-icons`. `FileIcon` is a DISPATCHER — it maps a `type` " +
      "string onto one of ~150 file-type glyphs — so it references the whole set " +
      "and nothing in it can be tree-shaken, `sideEffects: false` " +
      "notwithstanding. DalyHub renders no file-type icon anywhere: the only " +
      "importer of that package in the repository was this sub-component. " +
      "Measured on the V2 production build, it cost 429,066 uncompressed bytes " +
      "(59,321 gzipped) inside the OFFLINE SHELL PRECACHE — `/offline` renders " +
      "an EmptyState, so every DalyHub install downloaded the whole file-icon " +
      "set before it could boot offline. That is 21% of the precache for a " +
      "component the product does not draw. Composing around it is not " +
      "available: a module is the unit of import, so DalyHub's own EmptyState " +
      "carries this graph whichever export it names. Removed here in five " +
      "narrow edits (this one, the component, its type member, its assignment " +
      "and a type import left with nothing to name); `@untitledui/file-icons` " +
      "stays installed and documented, it is simply no longer bundled. " +
      "Re-instating a file-type icon means " +
      "importing the ONE glyph a surface draws, not the dispatcher.",
    from: 'import { FileIcon } from "@untitledui/file-icons";\n',
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…the `FileTypeIcon` component itself, and the props interface that reads " +
      "its two types off `FileIcon` (see the removal note above).",
    from: `interface FileTypeIconProps extends ComponentPropsWithRef<"div"> {
    type?: ComponentProps<typeof FileIcon>["type"];
    theme?: ComponentProps<typeof FileIcon>["variant"];
}

const FileTypeIcon = ({ type = "folder", theme = "solid", ...props }: FileTypeIconProps) => {
    return (
        <div {...props} className={cx("relative z-10 flex rounded-full bg-linear-to-b from-neutral-50 to-neutral-200 p-8", props.className)}>
            <FileIcon type={type} variant={theme} className="size-10 drop-shadow-sm" />
        </div>
    );
};

`,
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…its member on the compound component's type (see the removal note above).",
    from: "    FileTypeIcon: typeof FileTypeIcon;\n",
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…and its assignment onto the compound component, which is the reference " +
      "that kept the whole graph alive (see the removal note above). With this " +
      "gone `ComponentProps` has no remaining use in the file, so the type " +
      "import sheds it.",
    from: `EmptyState.FileTypeIcon = FileTypeIcon;
`,
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…the now-unused `ComponentProps` type import (see the removal note above).",
    from: 'import type { ComponentProps, ComponentPropsWithRef, ReactNode } from "react";',
    to: 'import type { ComponentPropsWithRef, ReactNode } from "react";',
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "Upstream's `EmptyState.Header` draws a decorative BACKGROUND PATTERN " +
      "behind the empty state, defaulting to `circle`, through a dispatcher " +
      "over four artworks — one of which, `grid-check`, is a single 139,635-byte " +
      "SVG. Naming the dispatcher references all four, so the shell carries " +
      "every pattern whichever one is asked for. DalyHub asks for none of them: " +
      'its one shared EmptyState passed `pattern="none"` at the only call ' +
      "site in the product, because `PRODUCT_EXPERIENCE` Part V says an empty " +
      'state is "calm and centred in its content region — never full-screen ' +
      'theatre", and a patterned backdrop is the theatre that rule rejects. ' +
      "So this is not a byte we might spend later: it implements the option the " +
      "product has already decided against. Measured at 120,977 uncompressed " +
      "bytes of the OFFLINE SHELL PRECACHE. The `pattern`/`patternSize` props " +
      'go with the import, and the DalyHub call site drops its `pattern="none"`. ' +
      "`~/shared/ui/untitled/shared-assets/background-patterns` stays vendored " +
      "and one import away for any surface that does want one.",
    from: `import type { BackgroundPatternProps } from "~/shared/ui/untitled/shared-assets/background-patterns";
import { BackgroundPattern } from "~/shared/ui/untitled/shared-assets/background-patterns";
`,
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…the `pattern` and `patternSize` props those two imports existed for, and " +
      "the conditional that drew them (see the background-pattern note above).",
    from: `interface HeaderProps extends ComponentPropsWithRef<"div"> {
    pattern?: "none" | BackgroundPatternProps["pattern"];
    patternSize?: "sm" | "md" | "lg";
}`,
    to: `interface HeaderProps extends ComponentPropsWithRef<"div"> {}`,
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…`Header`'s own signature, now that it has no pattern to place (see the " +
      "background-pattern note above).",
    from: `const Header = ({ pattern = "circle", patternSize = "md", ...props }: HeaderProps) => {`,
    to: `const Header = ({ ...props }: HeaderProps) => {`,
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason: "…and the render itself (see the background-pattern note above).",
    from: `            {pattern !== "none" && (
                <BackgroundPattern size={patternSize} pattern={pattern} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            )}
`,
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "Upstream's `EmptyState.Illustration` renders one of four named Untitled " +
      "artworks, and naming the component references all four. DalyHub does not " +
      "use it and has said so in prose since the component was adopted: its own " +
      "EmptyState takes an `illustration` ReactNode and renders it directly, " +
      "with the comment \"upstream's `Illustration` slot only takes one of its " +
      'own named artworks, so a DalyHub illustration renders directly here". ' +
      "Measured at 76,062 uncompressed bytes of the OFFLINE SHELL PRECACHE for a " +
      "slot the product routes around. `~/shared/ui/untitled/shared-assets/" +
      "illustrations` stays vendored and one import away.",
    from: `import { Illustration as Illustrations } from "~/shared/ui/untitled/shared-assets/illustrations";
`,
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…the `Illustration` component itself (see the illustration note above).",
    from: `const Illustration = ({ type = "cloud", color = "gray", size = "lg", ...props }: ComponentPropsWithRef<typeof Illustrations>) => {
    const { size: rootSize } = useContext(RootContext);

    return (
        <Illustrations
            role="img"
            {...props}
            {...{ type, color }}
            size={rootSize === "sm" ? "sm" : rootSize === "md" ? "md" : size}
            className={cx("z-10", props.className)}
        />
    );
};

`,
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…and `Header`'s detection of it. `hasIllustration` compares a child's " +
      "type against `Illustration`, so in DalyHub it was ALREADY always false — " +
      "removing it changes no rendered margin, and takes `Children` and " +
      "`isValidElement` with it (see the illustration note above).",
    from: `const Header = ({ ...props }: HeaderProps) => {
    const { size } = useContext(RootContext);
    // Whether we are passing \`Illustration\` component as children.
    const hasIllustration = Children.toArray(props.children).some((headerChild) => isValidElement(headerChild) && headerChild.type === Illustration);

    return (
        <header
            {...props}
            className={cx("relative mb-4", (size === "md" || size === "lg") && "mb-5", hasIllustration && size === "lg" && "mb-6!", props.className)}
        >`,
    to: `const Header = ({ ...props }: HeaderProps) => {
    const { size } = useContext(RootContext);

    return (
        <header
            {...props}
            className={cx("relative mb-4", (size === "md" || size === "lg") && "mb-5", props.className)}
        >`,
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…its member on the compound component's type (see the illustration note above).",
    from: "    Illustration: typeof Illustration;\n",
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…its assignment onto the compound component (see the illustration note above).",
    from: "EmptyState.Illustration = Illustration;\n",
    to: "",
  },
  {
    file: "components/application/empty-state/empty-state.tsx",
    reason:
      "…and the two React helpers `hasIllustration` was the only user of (see " +
      "the illustration note above).",
    from: 'import { Children, createContext, isValidElement, useContext } from "react";',
    to: 'import { createContext, useContext } from "react";',
  },
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
