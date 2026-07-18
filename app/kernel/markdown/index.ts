/**
 * FND-08 Markdown kernel — public surface.
 *
 * Callers import the Markdown *contract* from here: the durable `MarkdownSource`
 * type and its validated constructor, the branded `SanitizedMarkdownHtml` safe
 * output, the `MarkdownRenderer` interface, and the typed errors. This barrel
 * intentionally exposes only the storage- and runtime-independent contract — the
 * concrete `unified` pipeline is constructed from `app/platform/markdown`,
 * keeping the dependency direction pointed at the contract, not the
 * implementation (mirrors the entity/link/activity kernels, ADR-015 §6).
 *
 * The kernel imports no React, no Cloudflare bindings, no D1 and no browser DOM
 * APIs, and no third-party parser/sanitiser type leaks through this surface.
 */

export {
  type MarkdownSource,
  MARKDOWN_SOURCE_MAX_BYTES,
  markdownSourceByteLength,
  parseMarkdownSource,
  isMarkdownSource,
} from "./markdown-source";

export type {
  SanitizedMarkdownHtml,
  MarkdownRenderResult,
  MarkdownRenderer,
} from "./markdown-renderer";

export {
  MarkdownError,
  MarkdownValidationError,
  MarkdownSourceTooLargeError,
  MarkdownRenderError,
  type MarkdownErrorCode,
  type MarkdownValidationField,
} from "./markdown-errors";
