/**
 * NOTES-05 — the CodeMirror Markdown language for the live writing editor.
 *
 * This wires the standard, MIT-licensed CommonMark + GFM grammar
 * (`@codemirror/lang-markdown` over `@lezer/markdown`) purely so the editor can
 * understand the SOURCE it is styling — headings, emphasis, lists, task items,
 * blockquotes, code, links, images, tables and thematic breaks. It is a
 * *syntax-aware source editor*, NOT a second rendering or storage pipeline:
 *
 *   - the editor document IS the Markdown source string, byte-for-byte;
 *   - the Lezer grammar produces a parse tree used ONLY to decide how to STYLE
 *     the source in place (see `live-decorations.ts`) — it never emits HTML,
 *     never sanitises, and never becomes the stored representation;
 *   - the ONE FND-08 pipeline (`renderMarkdownSource` → `<MarkdownContent>`)
 *     remains the sole renderer and sole sanitiser for any displayed HTML
 *     (the reading mode and every other surface), enforced unchanged by
 *     `test/unit/markdown-boundary.test.ts`.
 *
 * We deliberately do NOT configure embedded code languages (no HTML/CSS/JS
 * syntax highlighting inside fenced code) — FND-08 renders code as inert,
 * un-highlighted text, and the editor matches that so the writing and reading
 * views stay consistent.
 */

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { LanguageSupport } from "@codemirror/language";
import { GFM } from "@lezer/markdown";

/**
 * The Markdown language support instance: CommonMark + the GFM superset
 * (tables, task lists, strikethrough, autolinks) that FND-08 also supports, so
 * the editor's understanding of the source matches what the renderer will do.
 * No `codeLanguages` are supplied on purpose (see the file header).
 */
export function createMarkdownLanguage(): LanguageSupport {
  return markdown({
    base: markdownLanguage,
    extensions: [GFM],
    // No `codeLanguages`: fenced code is styled as a plain monospace block,
    // never syntax-highlighted, matching the FND-08 renderer.
  });
}
