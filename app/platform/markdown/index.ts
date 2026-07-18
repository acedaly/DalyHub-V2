/**
 * FND-08 Markdown pipeline — platform public surface.
 *
 * The concrete, runtime-independent implementation of the kernel's
 * `MarkdownRenderer` contract: the shared `unified` pipeline, its URL policy and
 * its sanitisation schema. Server and shared UI code import the renderer from
 * here; the kernel (`~/kernel/markdown`) stays free of the parser/sanitiser
 * dependency (ADR-015 §6).
 *
 * This module is Workers-compatible and deterministic: no Node filesystem, no
 * `window`/`document`, no network, no database, no environment bindings.
 */

export {
  renderMarkdown,
  renderMarkdownSource,
  markdownRenderer,
} from "./render-markdown";

export { MARKDOWN_SANITISATION_SCHEMA } from "./sanitisation-schema";

export { isSafeMarkdownUrl, SAFE_URL_SCHEMES } from "./markdown-url-policy";
