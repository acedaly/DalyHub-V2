/**
 * FND-08 Markdown pipeline — the one shared renderer.
 *
 * Turns validated `MarkdownSource` into `SanitizedMarkdownHtml` through a single
 * `unified` pipeline (ADR-015 §14). The flow is:
 *
 *   remark-parse ─▶ remark-gfm ─▶ strip footnotes ─▶ wiki links ─▶ remark-rehype
 *     ─▶ safe-content transform ─▶ rehype-sanitize ─▶ rehype-stringify
 *
 * Key safety properties, all enforced here and nowhere else:
 *   - `remark-rehype` runs with `allowDangerousHtml: false`, so raw HTML in the
 *     source is DROPPED during mdast→hast — it never becomes DOM (ADR-015 §9).
 *   - a custom transform turns image nodes into safe non-embedded content and
 *     neutralises links whose destination fails the URL policy (§11–12), BEFORE
 *     sanitisation.
 *   - `rehype-sanitize` applies the strict frozen allowlist as defence in depth.
 *   - `rehype-stringify` runs with dangerous HTML disabled (its default).
 *
 * The renderer is DETERMINISTIC and STATELESS: no network, no database, no
 * environment, no request, no global mutation (ADR-015 §4.7). The processor is
 * built once as an immutable constant and reused; it holds no per-render state.
 * There is no option to disable sanitisation and no `allowDangerousHtml`/plugin
 * escape hatch anywhere in the public surface.
 */

import type { Element, ElementContent, Root } from "hast";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import {
  MarkdownRenderError,
  type MarkdownRenderResult,
  type MarkdownRenderer,
  type MarkdownSource,
  parseMarkdownSource,
  type SanitizedMarkdownHtml,
} from "~/kernel/markdown";

import { MARKDOWN_SANITISATION_SCHEMA } from "./sanitisation-schema";
import { isSafeMarkdownUrl } from "./markdown-url-policy";
import { remarkRecordLinks } from "./record-links";
import { remarkWikiLinks } from "./wikilinks";

/**
 * Minimal structural view of an mdast node — enough to strip footnote nodes
 * without depending on the GFM footnote type extensions. Every real mdast node
 * (which has `type: string` and optionally `children`) is assignable to this.
 */
interface MdastLikeNode {
  readonly type: string;
  children?: MdastLikeNode[];
}

/**
 * Remove GFM footnote references and definitions from the mdast tree. Footnotes
 * are intentionally NOT part of the supported profile (ADR-015 §8): supporting
 * them would require pipeline-generated element `id`s, exactly the DOM-clobbering
 * surface FND-08 avoids. Stripping them at the mdast stage keeps output clean and
 * predictable (surrounding text is preserved; the definition block is dropped).
 */
function remarkStripFootnotes() {
  return (tree: MdastLikeNode): void => {
    stripFootnoteNodes(tree);
  };
}

function stripFootnoteNodes(node: MdastLikeNode): void {
  if (!node.children) {
    return;
  }
  node.children = node.children.filter(
    (child) =>
      child.type !== "footnoteReference" && child.type !== "footnoteDefinition",
  );
  for (const child of node.children) {
    stripFootnoteNodes(child);
  }
}

/**
 * Transform image nodes into safe, non-embedded content and neutralise unsafe
 * links, on the hast tree, BEFORE sanitisation. Runs post-order so a link
 * wrapping an image (`[![alt](img)](link)`) is handled inside-out correctly.
 */
function rehypeDalyhubSafeContent() {
  return (tree: Root): void => {
    tree.children = transformNodes(
      tree.children as ElementContent[],
    ) as Root["children"];
  };
}

function transformNodes(nodes: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = [];
  for (const node of nodes) {
    for (const replacement of transformNode(node)) {
      out.push(replacement);
    }
  }
  return out;
}

function transformNode(node: ElementContent): ElementContent[] {
  if (node.type !== "element") {
    return [node];
  }

  // Depth-first: children are transformed before the node itself.
  node.children = transformNodes(node.children);

  if (node.tagName === "img") {
    return [replaceImage(node)];
  }

  if (node.tagName === "li") {
    labelTaskListCheckbox(node);
  }

  if (node.tagName === "a") {
    const href = node.properties?.href;
    if (typeof href !== "string" || !isSafeMarkdownUrl(href)) {
      // Unwrap the link to its (already-safe) contents — the destination is not
      // permitted, so it renders as plain text rather than a clickable link.
      return node.children;
    }
  }

  return [node];
}

/**
 * DEBT-26 — a rendered GFM task-list checkbox gets an accessible NAME.
 *
 * `remark-gfm` renders `- [x] Book the venue` as a disabled
 * `<input type="checkbox" checked>` followed by the item's text as a SIBLING.
 * The input therefore has no label of any kind, which axe reports as a critical
 * WCAG 2.2 AA `label` violation wherever Markdown containing a checklist is
 * rendered — a Note preview, a Diary entry, a Task description.
 *
 * ── Why a NAME rather than `aria-hidden` ────────────────────────────────────
 * Hiding it would satisfy the checker and lose the information. The item's text
 * says what the step is; only the checkbox says whether it is DONE, so an input
 * removed from the accessibility tree takes the one fact it carries with it. A
 * screen-reader user would hear "Book the venue" for a ticked step and an
 * unticked one alike.
 *
 * So the input is named with its own item's text, which is what a sighted
 * reader associates with it — and its checked state is announced by the native
 * control, unchanged.
 *
 * ── Why here rather than in each renderer ───────────────────────────────────
 * There is ONE pipeline (ADR-015 §14) and this is a property of the output, not
 * of any consumer. It runs BEFORE `rehype-sanitize`, so the attribute is
 * subject to the same frozen allowlist as everything else; `ariaLabel` is added
 * to the schema's `input` entry for exactly this and nothing else.
 *
 * The text is taken from the item's own already-transformed subtree, so it can
 * only ever contain content the pipeline has already accepted, and it is bounded
 * so a paragraph-long step does not become a paragraph-long accessible name.
 */
const TASK_LIST_LABEL_MAX = 200;

function labelTaskListCheckbox(item: Element): void {
  const checkbox = item.children.find(
    (child): child is Element =>
      child.type === "element" &&
      child.tagName === "input" &&
      child.properties?.type === "checkbox",
  );
  if (!checkbox) {
    return;
  }
  const text = collectText(item.children).replace(/\s+/g, " ").trim();
  if (text.length === 0) {
    /*
     * A checkbox with no text beside it. The state is all there is, so it is
     * named as the state — never left unlabelled, and never hidden, because
     * "checked" is the whole content of the item.
     */
    checkbox.properties = {
      ...checkbox.properties,
      ariaLabel: checkbox.properties?.checked
        ? "Checked item"
        : "Unchecked item",
    };
    return;
  }
  checkbox.properties = {
    ...checkbox.properties,
    ariaLabel:
      text.length > TASK_LIST_LABEL_MAX
        ? `${text.slice(0, TASK_LIST_LABEL_MAX).trimEnd()}…`
        : text,
  };
}

/** The visible text of a subtree, for the label above. */
function collectText(nodes: readonly ElementContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      out += node.value;
    } else if (node.type === "element") {
      out += collectText(node.children);
    }
  }
  return out;
}

/**
 * An image never becomes an `<img>` (ADR-015 §12): no automatic remote request,
 * no tracking pixel, no metadata leak. When the destination is a safe URL the
 * image becomes an ordinary link labelled with its alt text; otherwise it
 * becomes plain alt-text. The result is subject to the same sanitiser as
 * everything else.
 */
function replaceImage(node: Element): ElementContent {
  const alt = node.properties?.alt;
  const altText = typeof alt === "string" && alt.trim() !== "" ? alt : null;
  const label = altText ? `Image: ${altText}` : "Image";

  const src = node.properties?.src;
  if (typeof src === "string" && isSafeMarkdownUrl(src)) {
    return {
      type: "element",
      tagName: "a",
      properties: { href: src },
      children: [{ type: "text", value: label }],
    };
  }

  return { type: "text", value: label };
}

/**
 * The shared, immutable processor. Built once; reused for every render. A
 * `unified` processor is stateless across `processSync` calls, so reuse is safe
 * and avoids rebuilding the pipeline per render (performance, ADR-015 §20).
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStripFootnotes)
  // Inline [[Wiki Links]] → internal resolver links (deterministic; no DB lookup).
  .use(remarkWikiLinks)
  // `dalyhub://type/id` link destinations → the same internal resolver, by
  // stable id. Also deterministic and lookup-free; it runs AFTER the wiki-link
  // transform purely so both operate on a settled tree, and the two cannot
  // interact (one creates link nodes from text, the other only rewrites the
  // destination of link nodes that already exist).
  .use(remarkRecordLinks)
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeDalyhubSafeContent)
  .use(rehypeSanitize, MARKDOWN_SANITISATION_SCHEMA)
  .use(rehypeStringify)
  .freeze();

/**
 * Render already-validated Markdown source to sanitised HTML. Pass a value that
 * has been through {@link parseMarkdownSource} (the branded type enforces this).
 * Deterministic: the same source always yields the same HTML.
 */
export function renderMarkdown(source: MarkdownSource): MarkdownRenderResult {
  try {
    const file = processor.processSync(source);
    const html = String(file) as SanitizedMarkdownHtml;
    return { html };
  } catch (cause) {
    // Never surface parser/sanitiser internals; attach the cause for logging.
    throw new MarkdownRenderError(undefined, { cause });
  }
}

/**
 * Validate an untrusted value AND render it in one step. This preserves the
 * source/render distinction — it calls {@link parseMarkdownSource} first, so an
 * invalid or oversized value throws a typed validation error before any parsing
 * happens.
 */
export function renderMarkdownSource(value: unknown): MarkdownRenderResult {
  return renderMarkdown(parseMarkdownSource(value));
}

/** The one supported renderer instance, satisfying the kernel contract. */
export const markdownRenderer: MarkdownRenderer = { render: renderMarkdown };
