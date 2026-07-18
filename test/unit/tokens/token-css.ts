/**
 * Test helper: read and parse `app/styles/tokens.css` into token maps.
 *
 * The DS-01 token tests treat the stylesheet as the authoritative source of
 * values and assert structural guarantees against it (required tokens exist,
 * the light/dark maps are complete and in parity, no consumer references an
 * undefined token). Parsing is deliberately simple: the token blocks contain no
 * nested rules, so balanced-brace extraction plus a declaration regex suffices.
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

/** The light token map — the first (base) `:root { … }` block. */
export function lightTokens(): Map<string, string> {
  return parseDeclarations(blockBody(tokensCss, /:root\s*\{/));
}

/** The explicit dark map — `:root[data-theme="dark"] { … }`. */
export function darkExplicitTokens(): Map<string, string> {
  return parseDeclarations(
    blockBody(tokensCss, /:root\[data-theme="dark"\]\s*\{/),
  );
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
