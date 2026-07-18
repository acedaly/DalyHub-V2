/**
 * FND-08 Markdown pipeline — the shared React rendering boundary.
 *
 * This is the ONE supported place in the application that displays rendered
 * Markdown, and the ONE documented use of `dangerouslySetInnerHTML` (ADR-015
 * §4.5, §15). Notes, Diary and entity descriptions must render Markdown through
 * this component — never with their own sink, parser or sanitiser.
 *
 * It accepts only `SanitizedMarkdownHtml`: a branded value that ONLY the shared
 * sanitising pipeline can mint. A plain string — e.g. arbitrary untrusted HTML —
 * cannot be passed without a type error, so the type system, not a convention,
 * guarantees only sanitised output reaches the DOM.
 *
 * The component takes pre-rendered HTML (rather than raw source) on purpose:
 * it stays a tiny, pure presentational sink with no dependency on the parser
 * stack, so importing it never pulls the `unified` bundle into a route. Callers
 * render with `renderMarkdown` (which they can lazy-load) and pass the result.
 *
 * It is deliberately NOT an editor, toolbar, preview pane or Design System
 * typography implementation. Styling is a later concern (DS-01); this uses a
 * single neutral structural class hook and no visual design. It is safe under
 * SSR and client hydration, and renders empty content without error.
 */

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";

export interface MarkdownContentProps {
  /** Sanitised HTML produced by the shared Markdown renderer. */
  readonly html: SanitizedMarkdownHtml;
  /** Optional extra class appended to the structural `markdown-content` hook. */
  readonly className?: string;
}

/**
 * Display sanitised Markdown output inside a neutral semantic wrapper.
 */
export function MarkdownContent({ html, className }: MarkdownContentProps) {
  const wrapperClassName = className
    ? `markdown-content ${className}`
    : "markdown-content";

  return (
    <div
      className={wrapperClassName}
      // Safe by construction: `html` is `SanitizedMarkdownHtml`, a branded value
      // only the shared sanitising pipeline can produce (ADR-015 §4.5). This is
      // the single sanctioned `dangerouslySetInnerHTML` in application source; a
      // repository test fails if another is introduced.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
