/**
 * NOTES-02/03/06 — the ONE Markdown *document* analyser.
 *
 * FND-08 already owns Markdown validation (`parseMarkdownSource`) and rendering
 * (`renderMarkdown`). This module owns everything else the knowledge features
 * need to know about a Note's source, in exactly one place (the completion
 * brief's §13): explicit entity references, headings, searchable plain text,
 * backlink context and the export transformation. No route, repository or
 * component may re-declare a Markdown regular expression of its own.
 *
 * It is PURE and DETERMINISTIC — same source in, same result out. It performs no
 * database lookup: resolution is always supplied by the caller as a plain
 * `(title) => target | null` function, so this module stays workspace-blind and
 * unit-testable with no environment.
 *
 * Structural fidelity matters here, because a false relationship is worse than a
 * missing one: analysis walks the real mdast produced by the SAME
 * `remark-parse` + `remark-gfm` stack the renderer uses, and every `[[…]]`
 * occurrence inside a fenced or inline code span, an existing link, or an image
 * is EXCLUDED. Link-like text in a code sample is never a relationship.
 */

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

import { formatRecordLink, parseRecordLink } from "./record-links";
import { matchWikiLinks, type WikiLinkMatch } from "./wikilinks";

/**
 * The shared parser. Frozen and reused (a `unified` processor holds no state
 * between `parse` calls), mirroring `render-markdown.ts`'s processor constant.
 */
const documentParser = unified().use(remarkParse).use(remarkGfm).freeze();

/* -------------------------------------------------------------------------- */
/* Minimal structural mdast view                                              */
/* -------------------------------------------------------------------------- */

interface MdPoint {
  readonly offset?: number;
}
interface MdPosition {
  readonly start?: MdPoint;
  readonly end?: MdPoint;
}
interface MdNode {
  readonly type: string;
  readonly value?: string;
  readonly depth?: number;
  readonly lang?: string | null;
  readonly ordered?: boolean;
  readonly checked?: boolean | null;
  readonly url?: string;
  readonly alt?: string | null;
  readonly children?: readonly MdNode[];
  readonly position?: MdPosition;
}

function parse(source: string): MdNode {
  return documentParser.parse(source) as unknown as MdNode;
}

/**
 * Node types whose SOURCE RANGE is off-limits to reference extraction: a
 * `[[…]]` inside any of them is sample text or an existing destination, never a
 * relationship. `code`/`inlineCode` are the load-bearing pair (§13: "avoid
 * interpreting link-like text inside code blocks as relationships"); `link`,
 * `linkReference`, `definition` and `image` prevent nesting a reference inside
 * something that is already a link; `html` is dropped by the renderer anyway.
 */
const OPAQUE_NODE_TYPES: ReadonlySet<string> = new Set([
  "code",
  "inlineCode",
  "link",
  "linkReference",
  "definition",
  "image",
  "imageReference",
  "html",
]);

interface SourceRange {
  readonly start: number;
  readonly end: number;
}

function collectOpaqueRanges(node: MdNode, out: SourceRange[]): void {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (
    OPAQUE_NODE_TYPES.has(node.type) &&
    typeof start === "number" &&
    typeof end === "number"
  ) {
    out.push({ start, end });
    // Nothing inside an opaque node can be a reference, so stop descending.
    return;
  }
  for (const child of node.children ?? []) {
    collectOpaqueRanges(child, out);
  }
}

function overlapsAny(
  match: WikiLinkMatch,
  ranges: readonly SourceRange[],
): boolean {
  return ranges.some(
    (range) => match.start < range.end && match.end > range.start,
  );
}

/* -------------------------------------------------------------------------- */
/* Headings                                                                   */
/* -------------------------------------------------------------------------- */

/** One heading extracted from a Note's source. */
export interface NoteHeading {
  /** ATX/setext level, 1–6. */
  readonly depth: number;
  /** The heading's plain text — markers and inline syntax already removed. */
  readonly text: string;
}

/** How many headings a single document contributes (bounded, deterministic). */
export const MAX_EXTRACTED_HEADINGS = 200;

/**
 * Every heading in the document, in source order, as plain text. Bounded: a
 * pathological document contributes at most {@link MAX_EXTRACTED_HEADINGS}.
 */
export function extractHeadings(source: string): readonly NoteHeading[] {
  const out: NoteHeading[] = [];
  const visit = (node: MdNode): void => {
    if (out.length >= MAX_EXTRACTED_HEADINGS) return;
    if (node.type === "heading") {
      const text = inlineText(node).trim();
      if (text !== "") {
        out.push({ depth: node.depth ?? 1, text });
      }
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(parse(source));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Explicit entity references (`[[Wiki Links]]`)                              */
/* -------------------------------------------------------------------------- */

/** One explicit `[[…]]` reference found in a Note's source. */
export interface NoteReference {
  /** The referenced record title exactly as written (trimmed). */
  readonly title: string;
  /** The display label (alias when given). */
  readonly label: string;
  /** Code-unit offsets of the occurrence in the source. */
  readonly start: number;
  readonly end: number;
}

/**
 * The most references one Note contributes. A relationship set has to be
 * bounded — reconciling links is a write per reference — and a note with more
 * than this many distinct targets is not expressing a knowledge relationship.
 */
export const MAX_NOTE_REFERENCES = 100;

/**
 * Every `[[…]]` occurrence that is a genuine reference, in source order.
 * Occurrences inside code, an existing link or an image are excluded; malformed
 * occurrences yield nothing. Duplicates are preserved (the caller decides
 * whether it wants occurrences or distinct targets).
 */
export function extractReferences(source: string): readonly NoteReference[] {
  if (source.indexOf("[[") === -1) return [];
  const ranges: SourceRange[] = [];
  collectOpaqueRanges(parse(source), ranges);
  const out: NoteReference[] = [];
  for (const match of matchWikiLinks(source)) {
    if (overlapsAny(match, ranges)) continue;
    out.push({
      title: match.target,
      label: match.label,
      start: match.start,
      end: match.end,
    });
  }
  return out;
}

/**
 * The DISTINCT titles a Note explicitly references, in first-occurrence order,
 * de-duplicated case-insensitively and bounded by {@link MAX_NOTE_REFERENCES}.
 * This is what relationship reconciliation consumes: writing the same reference
 * twice must never produce two relationships (§14).
 */
export function distinctReferenceTitles(source: string): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const reference of extractReferences(source)) {
    const key = reference.title.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(reference.title);
    if (out.length >= MAX_NOTE_REFERENCES) break;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Explicit record links (`[Label](dalyhub://type/id)`)                       */
/* -------------------------------------------------------------------------- */

/** One `dalyhub://type/id` link found in a Note's source. */
export interface NoteRecordLink {
  /** The referenced entity type slug, e.g. `project`. */
  readonly type: string;
  /** The referenced record's stable id. */
  readonly id: string;
  /** The link's visible label — the author's words, never rewritten. */
  readonly label: string;
}

/**
 * Every genuine `dalyhub://type/id` link in the document, in source order.
 *
 * This is the ID-based half of the reference model, and it is strictly BETTER
 * evidence of intent than a `[[Wiki Link]]`: the author picked a specific record
 * from a picker, so there is no title to resolve and no tie-break to apply. It is
 * what makes a link survive a rename with no ambiguity at all (§4, §23).
 *
 * Structural fidelity comes free here. A record link is an ordinary Markdown
 * link, so it exists in the tree as a `link` NODE — which means a `dalyhub://…`
 * written inside a fenced or inline code span is not a link node at all and is
 * never extracted. There is no range-exclusion pass to get wrong.
 *
 * Malformed destinations yield nothing (see {@link parseRecordLink}), and the
 * result is bounded by {@link MAX_NOTE_REFERENCES} — the same ceiling wiki-link
 * references obey, because both feed the same per-reference relationship writes.
 */
export function extractRecordLinks(source: string): readonly NoteRecordLink[] {
  // A cheap pre-check so an ordinary note never pays for a parse it cannot need.
  if (source.toLowerCase().indexOf("dalyhub:") === -1) return [];
  const out: NoteRecordLink[] = [];
  const visit = (node: MdNode): void => {
    if (out.length >= MAX_NOTE_REFERENCES) return;
    if (node.type === "link") {
      const target = parseRecordLink(node.url);
      if (target) {
        const label = inlineText(node).trim();
        out.push({
          type: target.type,
          id: target.id,
          label: label === "" ? target.type : label,
        });
      }
      // A link cannot nest another link — stop descending either way.
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(parse(source));
  return out;
}

/**
 * The DISTINCT record ids a Note links to by id, in first-occurrence order.
 * Writing the same record link twice must produce exactly ONE relationship,
 * matching {@link distinctReferenceTitles}'s guarantee for wiki links (§14).
 */
export function distinctRecordLinkIds(source: string): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const link of extractRecordLinks(source)) {
    if (seen.has(link.id)) continue;
    seen.add(link.id);
    out.push(link.id);
    if (out.length >= MAX_NOTE_REFERENCES) break;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Plain text                                                                 */
/* -------------------------------------------------------------------------- */

/** Concatenate the inline text of a node (headings, paragraphs, table cells). */
function inlineText(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode") {
    return node.value ?? "";
  }
  if (node.type === "break") return " ";
  if (node.type === "image") {
    const alt = node.alt?.trim();
    return alt ? `Image: ${alt}` : "Image";
  }
  return (node.children ?? []).map(inlineText).join("");
}

/**
 * A readable plain-text rendering of Markdown source — the `.txt` export body
 * and the source of search/backlink excerpts.
 *
 * It is a *reading* projection, not a lossy round-trip: structure survives as
 * layout (headings keep their text on their own line, list items keep a `-`/`1.`
 * marker, table rows become tab-separated, code blocks keep their content
 * verbatim), but no Markdown punctuation is emitted. Deterministic and
 * dependency-free beyond the shared parser.
 */
export function markdownToPlainText(source: string): string {
  const blocks: string[] = [];

  const renderChildren = (node: MdNode): void => {
    for (const child of node.children ?? []) render(child);
  };

  const renderListItems = (list: MdNode, indent: string): void => {
    let index = list.ordered ? 1 : 0;
    for (const item of list.children ?? []) {
      const marker = list.ordered ? `${index++}.` : "-";
      const checkbox =
        item.checked === true ? "[x] " : item.checked === false ? "[ ] " : "";
      const lines: string[] = [];
      for (const child of item.children ?? []) {
        if (child.type === "list") continue;
        lines.push(blockText(child));
      }
      const text = lines.filter((line) => line !== "").join(" ");
      blocks.push(`${indent}${marker} ${checkbox}${text}`.trimEnd());
      for (const child of item.children ?? []) {
        if (child.type === "list") renderListItems(child, `${indent}  `);
      }
    }
  };

  const blockText = (node: MdNode): string => {
    switch (node.type) {
      case "heading":
      case "paragraph":
        return inlineText(node).trim();
      case "code":
        return (node.value ?? "").replace(/\r\n/g, "\n");
      case "blockquote":
        return (node.children ?? [])
          .map(blockText)
          .filter((line) => line !== "")
          .join("\n");
      default:
        return inlineText(node).trim();
    }
  };

  const render = (node: MdNode): void => {
    switch (node.type) {
      case "root":
        renderChildren(node);
        return;
      case "heading":
      case "paragraph":
      case "code": {
        const text = blockText(node);
        if (text !== "") blocks.push(text);
        return;
      }
      case "blockquote": {
        const text = blockText(node);
        if (text !== "") blocks.push(text);
        return;
      }
      case "list":
        renderListItems(node, "");
        return;
      case "thematicBreak":
        blocks.push("---");
        return;
      case "table": {
        for (const row of node.children ?? []) {
          const cells = (row.children ?? []).map((cell) =>
            inlineText(cell).trim(),
          );
          blocks.push(cells.join("\t"));
        }
        return;
      }
      case "html":
        // Raw HTML never becomes DOM (ADR-015 §9) and is not readable prose.
        return;
      default: {
        const text = inlineText(node).trim();
        if (text !== "") blocks.push(text);
      }
    }
  };

  render(parse(source));
  return blocks.join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* Bounded context extraction                                                 */
/* -------------------------------------------------------------------------- */

/** The maximum length of any excerpt this module produces. */
export const MAX_EXCERPT_LENGTH = 180;
/** How much raw source is inspected around a hit before cleaning. */
const RAW_WINDOW = 400;

/** A single-spaced, bounded, syntax-free excerpt with deterministic ellipsis. */
function cleanExcerpt(
  raw: string,
  truncatedStart: boolean,
  truncatedEnd: boolean,
): string {
  const text = markdownToPlainText(raw).replace(/\s+/g, " ").trim();
  if (text === "") return "";
  let out = text;
  let trimmedEnd = truncatedEnd;
  if (out.length > MAX_EXCERPT_LENGTH) {
    out = out.slice(0, MAX_EXCERPT_LENGTH).trimEnd();
    trimmedEnd = true;
  }
  return `${truncatedStart ? "…" : ""}${out}${trimmedEnd ? "…" : ""}`;
}

/**
 * A bounded excerpt of the block containing `offset`, suitable for showing why a
 * record links here. Deterministic: the same source and offset always give the
 * same string; nothing outside the containing block is ever exposed, no partial
 * Markdown construct survives (the window is re-parsed to plain text), and the
 * result never exceeds {@link MAX_EXCERPT_LENGTH} plus its ellipses.
 */
export function excerptAtOffset(source: string, offset: number): string {
  if (source === "") return "";
  const bounded = Math.min(Math.max(offset, 0), source.length);
  const blockStart = blockBoundary(source, bounded, -1);
  const blockEnd = blockBoundary(source, bounded, 1);
  const start = Math.max(blockStart, bounded - RAW_WINDOW / 2);
  const end = Math.min(blockEnd, bounded + RAW_WINDOW / 2);
  return cleanExcerpt(
    source.slice(start, end),
    start > blockStart,
    end < blockEnd,
  );
}

/**
 * Walk out from `offset` to the nearest blank line (a Markdown block boundary)
 * in `direction`, so an excerpt never spans unrelated content.
 */
function blockBoundary(
  source: string,
  offset: number,
  direction: 1 | -1,
): number {
  const blank = /\n[ \t]*\n/g;
  if (direction === -1) {
    let boundary = 0;
    let match: RegExpExecArray | null;
    while ((match = blank.exec(source)) !== null) {
      if (match.index + match[0].length > offset) break;
      boundary = match.index + match[0].length;
    }
    return boundary;
  }
  blank.lastIndex = offset;
  const match = blank.exec(source);
  return match ? match.index : source.length;
}

/**
 * A bounded excerpt around the first case-insensitive occurrence of `needle`,
 * or the document's opening block when the needle is absent. Used for search
 * result excerpts; the ASCII case folding matches the D1 `lower()`/`LIKE`
 * semantics the query itself uses (see `SHARED_SEARCH.md`).
 */
export function excerptAroundMatch(source: string, needle: string): string {
  if (source === "") return "";
  const index =
    needle === ""
      ? -1
      : source.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index === -1) {
    return cleanExcerpt(
      source.slice(0, RAW_WINDOW),
      false,
      source.length > RAW_WINDOW,
    );
  }
  return excerptAtOffset(source, index);
}

/**
 * The heading a source offset sits under, or `null` when it sits above the
 * first heading. Lets a search result honestly report that it matched inside a
 * particular section rather than "somewhere in the body".
 */
export function headingAtOffset(
  source: string,
  offset: number,
): NoteHeading | null {
  let current: NoteHeading | null = null;
  const root = parse(source);
  for (const child of root.children ?? []) {
    const start = child.position?.start?.offset ?? 0;
    if (start > offset) break;
    if (child.type === "heading") {
      const text = inlineText(child).trim();
      current = text === "" ? current : { depth: child.depth ?? 1, text };
    }
  }
  return current;
}

/** True when the given offset falls inside a heading line. */
export function offsetIsInHeading(source: string, offset: number): boolean {
  const root = parse(source);
  for (const child of root.children ?? []) {
    if (child.type !== "heading") continue;
    const start = child.position?.start?.offset;
    const end = child.position?.end?.offset;
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      offset >= start &&
      offset < end
    ) {
      return true;
    }
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Export transformation                                                      */
/* -------------------------------------------------------------------------- */

/** A resolved reference target, as supplied by the caller (never looked up here). */
export interface ResolvedReference {
  readonly id: string;
  readonly type: string;
  readonly title: string;
}

/**
 * The stable, explicit reference DalyHub writes into exported Markdown. It is a
 * real Markdown link (so the file reads correctly in any editor) whose
 * destination is an unambiguous DalyHub record reference rather than a
 * host-specific URL that would rot the moment the deployment moves.
 */
export function dalyhubReferenceUrl(type: string, id: string): string {
  // One authority for the written form — `record-links.ts` also PARSES it, so
  // constructing it anywhere else is how the two halves would drift apart.
  return formatRecordLink(type, id);
}

export type ReferenceResolver = (title: string) => ResolvedReference | null;

/** Which representation an export wants for `[[…]]` references. */
export type ReferenceExportMode = "markdown" | "text";

/**
 * Rewrite every genuine `[[…]]` reference for export, leaving the rest of the
 * source byte-for-byte untouched (§10: the Markdown export is the canonical
 * source, not a re-render).
 *
 *   - `markdown` — a resolvable reference becomes `[Label](dalyhub://type/id)`;
 *     an unresolvable one becomes plain `Label`, never broken internal syntax.
 *   - `text` — every reference becomes its plain `Label`.
 *
 * References inside code blocks are left exactly as written, because there they
 * are sample text, not links.
 */
export function transformReferencesForExport(
  source: string,
  mode: ReferenceExportMode,
  resolve: ReferenceResolver,
): string {
  const references = extractReferences(source);
  if (references.length === 0) return source;
  let out = "";
  let cursor = 0;
  for (const reference of references) {
    out += source.slice(cursor, reference.start);
    const resolved = mode === "markdown" ? resolve(reference.title) : null;
    out += resolved
      ? `[${escapeLinkLabel(reference.label)}](${dalyhubReferenceUrl(resolved.type, resolved.id)})`
      : reference.label;
    cursor = reference.end;
  }
  return out + source.slice(cursor);
}

/** Escape the characters that would break out of a Markdown link label. */
function escapeLinkLabel(label: string): string {
  return label.replace(/([[\]])/g, "\\$1");
}
