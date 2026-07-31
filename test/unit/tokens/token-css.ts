/**
 * Test helper: read and parse `app/styles/tokens.css` into per-theme token maps.
 *
 * The DS-01 / THEME-01 token tests treat the stylesheet as the authoritative source
 * of values and assert structural guarantees against it (every theme defines every
 * required token, the two dark blocks stay in parity, the TS data mirrors the CSS,
 * and no consumer references an undefined token). Parsing is deliberately simple:
 * the token blocks contain no nested rules, so balanced-brace extraction plus a
 * declaration regex suffices.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

// Under Vitest `import.meta.url` may not be a `file:` URL, so resolve from the
// repo root (the working directory) instead.
const APP_DIR = path.join(process.cwd(), "app");

/** Read a file under `app/` as text. */
export function readAppFile(relativePath: string): string {
  return readFileSync(path.join(APP_DIR, relativePath), "utf8");
}

/** The full tokens stylesheet text. */
export const tokensCss = readAppFile("styles/tokens.css");

/** Extract the `{ … }` body that follows the first match of `header` in `css`,
 * using balanced-brace matching. Returns the inner text (without the braces). */
export function blockBody(css: string, header: RegExp): string {
  const match = header.exec(css);
  if (match === null) {
    throw new Error(`selector not found: ${header}`);
  }
  const open = css.indexOf("{", match.index + match[0].length - 1);
  if (open === -1) {
    throw new Error(`opening brace not found for: ${header}`);
  }
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") {
      depth += 1;
    } else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        return css.slice(open + 1, i);
      }
    }
  }
  throw new Error(`unbalanced braces for: ${header}`);
}

/** Parse `--name: value;` declarations from a block body into a Map. */
export function parseDeclarations(blockText: string): Map<string, string> {
  const declarations = new Map<string, string>();
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(blockText)) !== null) {
    declarations.set(match[1].trim(), match[2].trim());
  }
  return declarations;
}

/**
 * The base map — the first (root) `:root { … }` block. It carries every structural
 * token AND the Daly Light colour map, which is why an unknown or missing
 * `data-theme` still paints a complete theme.
 */
export function rootTokens(): Map<string, string> {
  return parseDeclarations(blockBody(tokensCss, /:root\s*\{/));
}

/** An explicit `:root[data-theme="<id>"] { … }` block. */
export function themeTokens(themeId: string): Map<string, string> {
  return parseDeclarations(
    blockBody(
      tokensCss,
      new RegExp(`:root\\[data-theme="${themeId}"\\]\\s*\\{`),
    ),
  );
}

/**
 * The EFFECTIVE map for a theme: its own block layered over the `:root` base, which
 * is what the browser actually resolves. Daly Light declares no colours of its own
 * (it IS the base), so this is the only correct way to compare themes.
 */
export function effectiveThemeTokens(themeId: string): Map<string, string> {
  const effective = new Map(rootTokens());
  for (const [name, value] of themeTokens(themeId)) {
    effective.set(name, value);
  }
  return effective;
}

/** The system-dark map — the block inside the prefers-color-scheme media query. */
export function darkSystemTokens(): Map<string, string> {
  const mediaBody = blockBody(
    tokensCss,
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/,
  );
  return parseDeclarations(
    blockBody(
      mediaBody,
      /:root\[data-theme="system"\][\s,]*:root:not\(\[data-theme\]\)\s*\{/,
    ),
  );
}

/** Every `--dh-*` custom property NAME defined anywhere in tokens.css. */
export function allDefinedTokenNames(): Set<string> {
  const names = new Set<string>();
  const re = /--(dh-[\w-]+)\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(tokensCss)) !== null) {
    names.add(match[1]);
  }
  return names;
}
