/**
 * FND-08 Markdown kernel — the rendering contract.
 *
 * This is the ONLY supported way to turn Markdown into displayable output
 * (ADR-015 §4.3). It defines a branded safe-output type and a small renderer
 * interface; the concrete implementation lives in the platform layer
 * (`app/platform/markdown`) and is the only code permitted to produce the
 * branded value. The kernel deliberately exposes only this contract — no
 * `unified`/`remark`/`rehype` type ever appears here, so the parser/sanitiser
 * stack can change without touching the public surface (ADR-015 §14).
 */

import type { MarkdownSource } from "./markdown-source";

declare const sanitizedMarkdownHtmlBrand: unique symbol;

/**
 * HTML that has been produced by the shared, sanitising Markdown pipeline and is
 * therefore safe to insert into the DOM. The brand is load-bearing: a plain
 * `string` — for example arbitrary untrusted HTML — cannot be used where a
 * `SanitizedMarkdownHtml` is required. Only the shared renderer mints this type,
 * and only the shared React boundary (`MarkdownContent`) consumes it, so there
 * is exactly one path from Markdown to rendered DOM (ADR-015 §4.5).
 */
export type SanitizedMarkdownHtml = string & {
  readonly [sanitizedMarkdownHtmlBrand]: true;
};

/**
 * The result of rendering a `MarkdownSource`. Kept as a small object (rather than
 * a bare string) so additional derived, non-persisted outputs could be added
 * later without breaking callers — but it never carries the source, which the
 * caller already owns.
 */
export interface MarkdownRenderResult {
  /** Sanitised HTML, safe to hand to the shared rendering boundary. */
  readonly html: SanitizedMarkdownHtml;
}

/**
 * The one supported rendering API. Implementations must be DETERMINISTIC and
 * STATELESS (ADR-015 §4.7): the same source always yields the same result, with
 * no network, database, environment, workspace or request dependency, and no
 * global mutation. There is deliberately NO option to disable sanitisation, no
 * "trusted"/`allowDangerousHtml` escape hatch and no caller-provided plugin
 * array — callers cannot weaken the safety guarantees.
 */
export interface MarkdownRenderer {
  /** Render already-validated Markdown source to sanitised HTML. */
  render(source: MarkdownSource): MarkdownRenderResult;
}
