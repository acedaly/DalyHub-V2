/**
 * FND-08 Markdown pipeline — the one shared renderer.
 *
 * Turns validated `MarkdownSource` into `SanitizedMarkdownHtml` through a single
 * `unified` pipeline (ADR-015 §14). The flow is:
 *
 *   remark-parse ─▶ remark-gfm ─▶ strip footnotes ─▶ remark-rehype
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
