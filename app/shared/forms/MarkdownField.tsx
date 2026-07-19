/**
 * DS-06 Shared Forms — the Markdown source control.
 *
 * Edits Markdown SOURCE (the durable, user-owned representation, FND-08/ADR-015),
 * never HTML, and preserves what the user typed byte-for-byte. It offers a SAFE
 * preview by rendering that source through the ONE shared sanitising pipeline
 * (`renderMarkdownSource` → `<MarkdownContent>`); it introduces no second parser
 * and no raw-HTML sink of its own (the single sanctioned sink stays inside
 * `MarkdownContent`). The heavy `unified` renderer is lazy-loaded only when the
 * preview is opened, so importing this control does not pull the parser bundle
 * into a route.
 *
 * It is deliberately NOT the full Notes editor (that is a later roadmap item) —
 * it is a plain source textarea with a safe preview disclosure.
 */

import { useEffect, useState } from "react";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import { MarkdownContent } from "~/shared/markdown";

import { composeDescribedBy, deriveFieldIds } from "./field-ids";
import type { BaseControlProps } from "./control-props";

type PreviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly html: SanitizedMarkdownHtml }
  | { readonly kind: "error"; readonly message: string };

export interface MarkdownFieldProps extends BaseControlProps<string> {
  /** Rows for the source textarea. */
  readonly rows?: number;
  readonly placeholder?: string;
}

export function MarkdownField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  help,
  required,
  disabled,
  readOnly,
  showOptionalCue = true,
  controlRef,
  className,
  rows = 6,
  placeholder,
}: MarkdownFieldProps) {
  const baseId = id ?? `dh-md-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const { helpId, errorId } = deriveFieldIds(baseId);
  const labelId = `${baseId}-label`;
  const previewId = `${baseId}-preview`;
  const invalid = Boolean(error);
  const describedBy = composeDescribedBy({
    helpId: help ? helpId : null,
    errorId: invalid ? errorId : null,
  });

  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!showPreview) return;
    let cancelled = false;
    setPreview({ kind: "loading" });
    import("../../platform/markdown")
      .then(({ renderMarkdownSource }) => {
        if (cancelled) return;
        try {
          const { html } = renderMarkdownSource(value);
          setPreview({ kind: "ready", html });
        } catch {
          setPreview({
            kind: "error",
            message:
              "This content can't be previewed. Check for unusually long text or unusual characters.",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreview({
            kind: "error",
            message: "Preview is unavailable right now.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showPreview, value]);

  const rootClassName = ["dh-field", "dh-field--markdown", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={rootClassName}
      role="group"
      aria-labelledby={labelId}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
    >
      <div className="dh-field__label-row">
        <span id={labelId} className="dh-field__label-text">
          {label}
        </span>
        {required ? (
          <span className="dh-field__required">
            <span aria-hidden="true">*</span>
            <span className="dh-visually-hidden"> (required)</span>
          </span>
        ) : showOptionalCue ? (
          <span className="dh-field__optional">Optional</span>
        ) : null}
      </div>

      <div className="dh-field__control">
        <textarea
          id={baseId}
          className="dh-input dh-input--multiline dh-input--markdown"
          value={value}
          rows={rows}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          aria-labelledby={labelId}
          aria-invalid={invalid || undefined}
          aria-errormessage={invalid ? errorId : undefined}
          aria-describedby={describedBy}
          spellCheck
          ref={(node) => controlRef?.(node)}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onBlur?.()}
        />

        <div className="dh-markdown-field__toolbar">
          <button
            type="button"
            className="dh-markdown-field__preview-toggle"
            aria-expanded={showPreview}
            aria-controls={previewId}
            onClick={() => setShowPreview((open) => !open)}
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
          <span className="dh-markdown-field__hint">Markdown supported</span>
        </div>

        {showPreview ? (
          <div id={previewId} className="dh-markdown-field__preview">
            {preview?.kind === "ready" ? (
              value.trim().length > 0 ? (
                <MarkdownContent html={preview.html} />
              ) : (
                <p className="dh-markdown-field__preview-empty">
                  Nothing to preview yet.
                </p>
              )
            ) : preview?.kind === "error" ? (
              <p className="dh-markdown-field__preview-error">
                {preview.message}
              </p>
            ) : (
              <p className="dh-markdown-field__preview-loading">
                Rendering preview…
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="dh-field__messages">
        {help ? (
          <p id={helpId} className="dh-field__help">
            {help}
          </p>
        ) : null}
        <div className="dh-field__error-slot" aria-live="polite">
          {invalid ? (
            <p id={errorId} className="dh-field__error">
              <span className="dh-field__error-icon" aria-hidden="true">
                !
              </span>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
