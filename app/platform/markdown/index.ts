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

export {
  WIKILINK_RESOLVE_PATH,
  matchWikiLinks,
  wikiLinkHref,
  type WikiLinkMatch,
} from "./wikilinks";

export {
  RECORD_LINK_RESOLVE_PATH,
  RECORD_LINK_SCHEME,
  formatRecordLink,
  parseRecordLink,
  recordLinkHref,
  remarkRecordLinks,
  type RecordLinkTarget,
} from "./record-links";

export {
  dalyhubReferenceUrl,
  distinctRecordLinkIds,
  distinctReferenceTitles,
  extractRecordLinks,
  extractRecordLinkOccurrences,
  excerptAroundMatch,
  excerptAtOffset,
  extractHeadings,
  extractReferences,
  headingAtOffset,
  markdownToPlainText,
  offsetIsInHeading,
  transformReferencesForExport,
  MAX_EXCERPT_LENGTH,
  MAX_NOTE_REFERENCES,
  type NoteHeading,
  type NoteRecordLink,
  type NoteRecordLinkOccurrence,
  type NoteReference,
  type ReferenceExportMode,
  type ReferenceResolver,
  type ResolvedReference,
} from "./note-document";
