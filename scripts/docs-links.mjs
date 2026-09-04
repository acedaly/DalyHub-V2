#!/usr/bin/env node
/**
 * The documentation link check (V2.9 INS-00, DEBT-241).
 *
 * The rule it makes checkable:
 *
 *   Every local link and anchor in the documentation resolves.
 *
 * The repository is the product's memory by constitution (`AGENTS.md` §0), and
 * its documents are held together by anchors into files thousands of lines
 * long. A heading changes — a debt entry gains its `— **RESOLVED …**` suffix,
 * an ADR title is amended — and every link to it silently lands on the top of
 * the file instead of the entry it named. Measured on 2026-09-04: 6,601 local
 * links, 447 broken. This script fails `Static` on the first one.
 *
 * ── What it scans ───────────────────────────────────────────────────────────
 * Every `docs/**\/*.md`, plus `AGENTS.md` and `README.md` at the root. In each:
 *
 *   - inline links and images — `[text](target)`, `![alt](target)`, with the
 *     CommonMark destination forms (`<…>`, balanced parentheses, an optional
 *     title);
 *   - reference definitions — `[label]: target` — checked at the definition,
 *     which is the one place the target is written.
 *
 * Fenced code blocks, code spans and HTML comments are prose-free: a link
 * quoted inside them is an example, not a reference. Raw HTML (`<a href>`,
 * `<img src>`) is not Markdown and the repository does not write it, so it is
 * not read.
 *
 * ── What "resolves" means ───────────────────────────────────────────────────
 * A target with a URI scheme (`https:`, `mailto:`, `dalyhub:`) is external and
 * out of scope. Everything else is local:
 *
 *   - a path is resolved against the linking file's directory (or the
 *     repository root when it begins with `/`), percent-decoded, its query
 *     string dropped, and must exist — a file or a directory;
 *   - `#anchor` alone, or `path.md#anchor`, must name a heading of that
 *     Markdown file under GitHub's slug rule below;
 *   - an anchor on a non-Markdown file (`file.ts#L12`) is GitHub's line
 *     anchor and is not checked beyond the file existing.
 *
 * ── The slug rule ───────────────────────────────────────────────────────────
 * The one GitHub renders headings with: the heading's rendered text
 * (link text without its URL, image alt, code-span content, emphasis markers
 * dropped), lower-cased; every character that is not a letter, mark, number,
 * connector punctuation (`_`), space or hyphen removed; spaces to hyphens;
 * nothing collapsed — so `☐ DEBT-241 — No …` becomes `-debt-241--no-…`; and a
 * duplicate suffixed `-1`, `-2`, … in document order. `slugify` and
 * `createSlugger` are exported so the unit tests can pin the rule against the
 * repository's own heading forms.
 *
 * ── No allowlist ────────────────────────────────────────────────────────────
 * There is no annotation that excuses a finding. A drifted anchor is repaired
 * at the link (never by renaming a heading back — headings carry their
 * resolution on purpose); a missing file is repaired at whichever end is
 * wrong; a missing screenshot is repaired by committing the image or by
 * replacing the reference with a sentence that says what the image showed.
 *
 * ── Commands ────────────────────────────────────────────────────────────────
 *   check           fail while any local link or anchor does not resolve
 *                   (run by `Static`), naming file, line and target
 *   list            enumerate every local link with its verdict
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The Markdown the check reads: the documentation tree and the two root files. */
export const ROOT_DOCUMENTS = ["AGENTS.md", "README.md"];
export const DOCS_DIR = "docs";

/* -------------------------------------------------------------------------- */
/* The slug rule                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Characters GitHub drops from a heading before it becomes an anchor: anything
 * that is not a letter, a mark, a number, connector punctuation, a space or a
 * hyphen. `\p{N}` rather than `\p{Nd}` and `\p{Pc}` rather than a literal `_`
 * because that is the rule GitHub's own pipeline applies (`[^\p{Word}\- ]`).
 */
const DROPPED = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu;

/** GitHub's slug for one heading, before duplicate numbering. */
export function slugify(text) {
  return text.toLowerCase().replace(DROPPED, "").replace(/ /g, "-");
}

/**
 * A slugger that numbers duplicates the way GitHub does: the second `Foo` is
 * `foo-1`, the third `foo-2`, and a slug that has already been issued — even
 * when the heading that issued it was literally `Foo 1` — is skipped over.
 */
export function createSlugger() {
  const occurrences = new Map();
  return {
    slug(text) {
      const original = slugify(text);
      let result = original;
      while (occurrences.has(result)) {
        const next = occurrences.get(original) + 1;
        occurrences.set(original, next);
        result = `${original}-${next}`;
      }
      occurrences.set(result, 0);
      return result;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Markdown reading                                                           */
/* -------------------------------------------------------------------------- */

const FENCE = /^\s*(`{3,}|~{3,})/;

/**
 * Walk `source` line by line, yielding `{ line, text, inCode }` where `inCode`
 * is true inside a fenced code block (the fence lines included) or an HTML
 * comment. Line numbers are 1-based.
 */
function* lines(source) {
  let fence = null; // { char, length } while inside a fenced block
  let inComment = false;
  const rows = source.split("\n");
  for (let index = 0; index < rows.length; index += 1) {
    const text = rows[index];
    const line = index + 1;
    if (fence) {
      const close = text.match(FENCE);
      if (
        close &&
        close[1][0] === fence.char &&
        close[1].length >= fence.length &&
        text.trim() === close[1]
      ) {
        fence = null;
      }
      yield { line, text, inCode: true };
      continue;
    }
    if (inComment) {
      const end = text.indexOf("-->");
      if (end === -1) {
        yield { line, text, inCode: true };
        continue;
      }
      inComment = false;
      yield {
        line,
        text: " ".repeat(end + 3) + text.slice(end + 3),
        inCode: false,
      };
      continue;
    }
    const open = text.match(FENCE);
    if (open) {
      fence = { char: open[1][0], length: open[1].length };
      yield { line, text, inCode: true };
      continue;
    }
    // A comment that opens on this line: blank it to its close, or to the
    // end of the line when it runs on.
    let visible = text;
    let start = visible.indexOf("<!--");
    while (start !== -1) {
      const end = visible.indexOf("-->", start + 4);
      if (end === -1) {
        visible = visible.slice(0, start);
        inComment = true;
        break;
      }
      visible =
        visible.slice(0, start) +
        " ".repeat(end + 3 - start) +
        visible.slice(end + 3);
      start = visible.indexOf("<!--", end + 3);
    }
    yield { line, text: visible, inCode: false };
  }
}

/** Replace every code span on one line with spaces, keeping columns. */
export function blankCodeSpans(text) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\\" && index + 1 < text.length) {
      out += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (text[index] !== "`") {
      out += text[index];
      index += 1;
      continue;
    }
    let run = index;
    while (run < text.length && text[run] === "`") run += 1;
    const ticks = text.slice(index, run);
    const close = findClosingTicks(text, run, ticks.length);
    if (close === -1) {
      out += ticks;
      index = run;
      continue;
    }
    out += " ".repeat(close + ticks.length - index);
    index = close + ticks.length;
  }
  return out;
}

function findClosingTicks(text, from, length) {
  let index = from;
  while (index < text.length) {
    if (text[index] !== "`") {
      index += 1;
      continue;
    }
    let run = index;
    while (run < text.length && text[run] === "`") run += 1;
    if (run - index === length) return index;
    index = run;
  }
  return -1;
}

/**
 * The rendered text of a heading line's content — what GitHub slugs. Links
 * keep their text and lose their destination, images keep their alt text,
 * code spans keep their content, emphasis markers and HTML tags go.
 */
export function headingText(content) {
  let text = content;
  // Images before links, so `![alt](src)` is not read as `!` + a link.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/(`+)(.+?)\1/g, "$2");
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return text.trim();
}

/**
 * Every heading in `source` — ATX (`## …`) and setext (`…\n===`) — outside
 * fenced code, as `{ line, text, slug }` with slugs numbered in document
 * order.
 */
export function extractHeadings(source) {
  const slugger = createSlugger();
  const headings = [];
  let previous = null; // the last non-code, non-blank line, for setext
  for (const row of lines(source)) {
    if (row.inCode) {
      previous = null;
      continue;
    }
    const atx = row.text.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/);
    if (atx) {
      const raw = (atx[2] ?? "").replace(/[ \t]+#+$/, "");
      const text = headingText(raw);
      headings.push({ line: row.line, text, slug: slugger.slug(text) });
      previous = null;
      continue;
    }
    const setext = row.text.match(/^ {0,3}(=+|-+)[ \t]*$/);
    if (setext && previous && previous.text.trim() !== "") {
      const text = headingText(previous.text.trim());
      headings.push({ line: previous.line, text, slug: slugger.slug(text) });
      previous = null;
      continue;
    }
    previous = row.text.trim() === "" ? null : row;
  }
  return headings;
}

/**
 * Parse a CommonMark link destination starting at `index` (just after the
 * opening `(`). Returns `{ target, end }` where `end` is the index after the
 * closing `)`, or null when the text is not a link.
 */
function parseDestination(text, index) {
  let at = index;
  while (at < text.length && (text[at] === " " || text[at] === "\t")) at += 1;
  let target;
  if (text[at] === "<") {
    const close = text.indexOf(">", at + 1);
    if (close === -1) return null;
    target = text.slice(at + 1, close);
    at = close + 1;
  } else {
    let depth = 0;
    const start = at;
    while (at < text.length) {
      const char = text[at];
      if (char === "\\" && at + 1 < text.length) {
        at += 2;
        continue;
      }
      if (char === " " || char === "\t") break;
      if (char === "(") depth += 1;
      if (char === ")") {
        if (depth === 0) break;
        depth -= 1;
      }
      at += 1;
    }
    if (depth !== 0) return null;
    target = text.slice(start, at);
  }
  while (at < text.length && (text[at] === " " || text[at] === "\t")) at += 1;
  if (text[at] === '"' || text[at] === "'") {
    const close = text.indexOf(text[at], at + 1);
    if (close === -1) return null;
    at = close + 1;
    while (at < text.length && (text[at] === " " || text[at] === "\t")) at += 1;
  }
  if (text[at] !== ")") return null;
  return { target: target.replace(/\\([\\()])/g, "$1"), end: at + 1 };
}

/** The index of the `]` matching the `[` at `open`, or -1. */
function matchingBracket(text, open) {
  let depth = 0;
  for (let at = open; at < text.length; at += 1) {
    const char = text[at];
    if (char === "\\") {
      at += 1;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/**
 * Every link in `source` outside code and comments, as `{ line, target,
 * kind }` with `kind` one of `link`, `image` or `definition`.
 */
export function extractLinks(source) {
  const links = [];
  for (const row of lines(source)) {
    if (row.inCode) continue;
    const text = blankCodeSpans(row.text);
    const definition = text.match(/^ {0,3}\[[^\]]+\]:[ \t]*(\S+)/);
    if (definition) {
      const target = definition[1].replace(/^<(.*)>$/, "$1");
      links.push({ line: row.line, target, kind: "definition" });
      continue;
    }
    let at = 0;
    while (at < text.length) {
      const open = text.indexOf("[", at);
      if (open === -1) break;
      if (open > 0 && text[open - 1] === "\\") {
        at = open + 1;
        continue;
      }
      const close = matchingBracket(text, open);
      if (close === -1) {
        at = open + 1;
        continue;
      }
      if (text[close + 1] !== "(") {
        at = open + 1;
        continue;
      }
      const destination = parseDestination(text, close + 2);
      if (!destination) {
        at = open + 1;
        continue;
      }
      const image = open > 0 && text[open - 1] === "!";
      links.push({
        line: row.line,
        target: destination.target,
        kind: image ? "image" : "link",
      });
      // Continue INSIDE the link text as well, so `[![img](a)](b)` yields
      // both, then past this destination.
      at = open + 1;
    }
  }
  return links;
}

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** True for a target the check does not own: a URI scheme or a protocol-relative URL. */
export function isExternal(target) {
  return SCHEME.test(target) || target.startsWith("//");
}

function decode(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

/** Split a local target into its path (may be empty) and anchor (may be null). */
export function splitTarget(target) {
  const hash = target.indexOf("#");
  const rawPath = hash === -1 ? target : target.slice(0, hash);
  const anchor = hash === -1 ? null : decode(target.slice(hash + 1));
  const query = rawPath.indexOf("?");
  const path = decode(query === -1 ? rawPath : rawPath.slice(0, query));
  return { path, anchor };
}

/**
 * Check every link in one document. `headingsOf(absolutePath)` returns the
 * heading list of a Markdown file (cached by the caller). Returns
 * `{ links, findings }` where each finding is a link plus a `reason`:
 *
 *   missing-file     the path does not exist
 *   missing-anchor   the file exists and has no heading with that slug
 */
export function checkDocument({ file, source, root, headingsOf }) {
  const absolute = join(root, file);
  const directory = dirname(absolute);
  const links = [];
  const findings = [];
  for (const link of extractLinks(source)) {
    if (isExternal(link.target)) continue;
    const { path, anchor } = splitTarget(link.target);
    const record = { ...link, file, path, anchor };
    links.push(record);
    const targetPath =
      path === ""
        ? absolute
        : path.startsWith("/")
          ? join(root, path)
          : resolve(directory, path);
    if (!existsSync(targetPath)) {
      findings.push({ ...record, reason: "missing-file" });
      continue;
    }
    if (anchor === null || anchor === "") continue;
    if (!targetPath.toLowerCase().endsWith(".md")) continue;
    if (statSync(targetPath).isDirectory()) continue;
    const slugs = headingsOf(targetPath).map((heading) => heading.slug);
    if (!slugs.includes(anchor)) {
      findings.push({ ...record, reason: "missing-anchor" });
    }
  }
  return { links, findings };
}

/** Every Markdown file the check reads, repo-relative and sorted. */
export function listDocumentFiles(root = ROOT) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".md")) files.push(relative(root, path));
    }
  };
  const docs = join(root, DOCS_DIR);
  if (existsSync(docs)) walk(docs);
  for (const name of ROOT_DOCUMENTS) {
    if (existsSync(join(root, name))) files.push(name);
  }
  return files.map((file) => file.split(sep).join("/")).sort();
}

/** Check the whole tree. Returns `{ files, links, findings }`. */
export function checkTree({
  root = ROOT,
  files = listDocumentFiles(root),
} = {}) {
  const headingCache = new Map();
  const headingsOf = (absolutePath) => {
    if (!headingCache.has(absolutePath)) {
      headingCache.set(
        absolutePath,
        extractHeadings(readFileSync(absolutePath, "utf8")),
      );
    }
    return headingCache.get(absolutePath);
  };
  const links = [];
  const findings = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    const result = checkDocument({ file, source, root, headingsOf });
    links.push(...result.links);
    findings.push(...result.findings);
  }
  return { files, links, findings };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

function describe(finding) {
  const why =
    finding.reason === "missing-file"
      ? "file does not exist"
      : `no heading with anchor #${finding.anchor}`;
  return `  ${finding.file}:${finding.line}  ${finding.target}  — ${why}`;
}

function commandCheck() {
  const { files, links, findings } = checkTree();
  if (findings.length === 0) {
    console.log(
      `docs links: ${links.length} local link(s) in ${files.length} file(s), all resolve.`,
    );
    return;
  }
  const missingFiles = findings.filter((f) => f.reason === "missing-file");
  const missingAnchors = findings.filter((f) => f.reason === "missing-anchor");
  console.error(
    `docs links: ${findings.length} of ${links.length} local link(s) do not resolve ` +
      `(${missingFiles.length} missing file(s), ${missingAnchors.length} missing anchor(s)).\n` +
      `Repair the link, never the heading: a heading's anchor is its rendered text under GitHub's slug rule.\n`,
  );
  for (const finding of findings) console.error(describe(finding));
  process.exitCode = 1;
}

function commandList() {
  const { files, links, findings } = checkTree();
  const broken = new Set(
    findings.map((f) => `${f.file}:${f.line}:${f.target}`),
  );
  for (const link of links) {
    const verdict = broken.has(`${link.file}:${link.line}:${link.target}`)
      ? "broken"
      : "ok";
    console.log(
      `${verdict.padEnd(6)} ${link.file}:${link.line}  ${link.target}`,
    );
  }
  console.log(
    `\n${links.length} local link(s) in ${files.length} file(s), ${findings.length} broken`,
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const [command] = invokedDirectly ? process.argv.slice(2) : ["noop"];
switch (command) {
  case "noop":
    break;
  case "check":
  case "--check":
    commandCheck();
    break;
  case "list":
  case "--list":
    commandList();
    break;
  default:
    console.error("usage: docs-links.mjs <check|list>");
    process.exitCode = 2;
}
