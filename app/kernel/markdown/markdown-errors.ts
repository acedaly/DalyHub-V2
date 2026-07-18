/**
 * FND-08 Markdown kernel — domain errors.
 *
 * The Markdown pipeline signals failure with these explicit, typed errors
 * rather than leaking library internals. Messages are SAFE to surface: they
 * never include the user's Markdown source, generated HTML, parser/sanitiser
 * stack traces, dependency internals, environment details or file paths
 * (AGENTS.md §17, ADR-015 §21). The original cause may be attached via `cause`
 * for server-side logging, following the entity/link/activity kernels.
 */

/** Discriminator so callers can branch on error kind without `instanceof`. */
export type MarkdownErrorCode = "validation" | "too_large" | "render";

/** The fields a source-validation failure can point at. */
export type MarkdownValidationField = "source" | "controlCharacter";

/** Base class for every kernel Markdown error. */
export abstract class MarkdownError extends Error {
  abstract readonly code: MarkdownErrorCode;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * A caller-supplied Markdown source failed boundary validation: it was not a
 * string, or it contained a disallowed control character (see
 * `markdown-source.ts`). The message describes the *kind* of problem, never the
 * offending content, and never the whole source.
 */
export class MarkdownValidationError extends MarkdownError {
  readonly code = "validation" as const;
  readonly field: MarkdownValidationField;

  constructor(field: MarkdownValidationField, message: string) {
    super(`Invalid Markdown ${field}: ${message}`);
    this.field = field;
  }
}

/**
 * The Markdown source exceeded the documented maximum size. The limit is
 * measured in UTF-8 bytes, not UTF-16 code units, so the reported figures match
 * what is actually stored/transmitted. Only the byte counts are surfaced —
 * never the source itself.
 */
export class MarkdownSourceTooLargeError extends MarkdownError {
  readonly code = "too_large" as const;
  readonly maxBytes: number;
  readonly actualBytes: number;

  constructor(maxBytes: number, actualBytes: number) {
    super(
      `Markdown source is ${actualBytes} bytes, exceeding the maximum of ${maxBytes} bytes`,
    );
    this.maxBytes = maxBytes;
    this.actualBytes = actualBytes;
  }
}

/**
 * The rendering pipeline failed unexpectedly. The original cause is attached
 * (via `cause`) for server-side logging but is never rendered into the public
 * message, so parser/sanitiser internals do not escape the kernel boundary.
 */
export class MarkdownRenderError extends MarkdownError {
  readonly code = "render" as const;

  constructor(
    message = "The Markdown could not be rendered",
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}
