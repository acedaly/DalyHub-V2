/**
 * FND-08 Markdown pipeline — inline `[[Wiki Links]]` (NOTES-02 seam).
 *
 * A pure, deterministic remark transform that turns `[[Title]]` and
 * `[[Title|Alias]]` in Markdown source into an ordinary internal link to the
 * shared wiki-link RESOLVER route, which resolves the title to a record at
 * navigation time. This keeps the FND-08 pipeline stateless (ADR-015 §4.7): it
 * performs NO database lookup, mints NO entity id, and produces only a
 * relative-path link the existing URL policy already permits and the strict
 * sanitiser already allows (relative href, no scheme, no class). Resolution — the
 * one workspace-scoped step — happens server-side in the resolver route, never in
 * the renderer.
 *
 * The transform ignores `[[...]]` inside code (inline or fenced) and never
 * descends into an existing link, so it can't nest links or rewrite code samples.
 */

/** The resolver route a wiki link points at; `?title=` carries the raw title. */
export const WIKILINK_RESOLVE_PATH = "/notes/resolve";

/** `[[Target]]` or `[[Target|Alias]]` — target and alias exclude `[`, `]`, `|`. */
const WIKILINK_PATTERN = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

/** Build the internal resolver href for a wiki-link target title. */
export function wikiLinkHref(title: string): string {
  return `${WIKILINK_RESOLVE_PATH}?title=${encodeURIComponent(title.trim())}`;
}

/** Minimal mdast shapes this transform needs (no dependency on full mdast types). */
interface MdText {
  readonly type: "text";
  value: string;
}
interface MdParent {
  type: string;
  children?: MdNode[];
}
type MdNode = MdText | MdParent;

function isParent(node: MdNode): node is MdParent {
  return "children" in node && Array.isArray((node as MdParent).children);
}

/** Types whose text content must NOT be scanned for wiki links. */
const SKIP_TYPES = new Set(["link", "linkReference", "code", "inlineCode"]);

/** Split one text node's value into text + link nodes for each `[[...]]`. */
function splitTextNode(value: string): MdNode[] {
  WIKILINK_PATTERN.lastIndex = 0;
  const out: MdNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_PATTERN.exec(value)) !== null) {
    const [whole, rawTarget, rawAlias] = match;
    const target = rawTarget!.trim();
    if (target === "") continue; // `[[ ]]` is not a link
    if (match.index > lastIndex) {
      out.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    const label = (rawAlias ?? rawTarget)!.trim();
    out.push({
      type: "link",
      url: wikiLinkHref(target),
      children: [{ type: "text", value: label }],
    } as unknown as MdNode);
    lastIndex = match.index + whole.length;
  }
  if (out.length === 0) return [{ type: "text", value }];
  if (lastIndex < value.length) {
    out.push({ type: "text", value: value.slice(lastIndex) });
  }
  return out;
}

function transform(node: MdNode): void {
  if (!isParent(node) || !node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      next.push(...splitTextNode((child as MdText).value));
      continue;
    }
    if (!SKIP_TYPES.has(child.type)) {
      transform(child);
    }
    next.push(child);
  }
  node.children = next;
}

/** The remark plugin: rewrite `[[...]]` in every eligible text node. */
export function remarkWikiLinks() {
  return (tree: MdParent): void => {
    transform(tree);
  };
}
