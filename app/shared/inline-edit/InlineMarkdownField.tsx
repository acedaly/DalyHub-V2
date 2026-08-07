/**
 * DS-16 — inline LONG-FORM text, on the shared Markdown editor.
 *
 * This is where Part 1 and Part 2 of the upgrade meet: the read state is the
 * content rendered through the ONE FND-08 pipeline, and activating it swaps in
 * the ONE shared writing surface — the same editor, the same toolbar, the same
 * shortcuts as a Note. A record body therefore stops carrying a permanent
 * editor frame around text nobody is editing, which was the single biggest
 * source of "this feels like a form, not a document".
 *
 * ── Why Enter does NOT save ──────────────────────────────────────────────────
 * Because Enter is a paragraph. A multiline field that saves on Enter cannot be
 * used to write anything longer than a sentence, and users discover that by
 * losing a paragraph. The commit affordances here are explicit **Save** and
 * **Cancel** buttons plus ⌘/Ctrl+Enter, which is the convention every comment
 * box in every product this one is measured against already uses.
 *
 * ── Why Escape is conditional ────────────────────────────────────────────────
 * Escape cancels only while the draft still equals the stored value. Once real
 * words have been typed, a stray Escape (a very easy key to hit while reaching
 * for a shortcut) would discard them with no undo — so it does nothing, and the
 * Cancel button, which the user must aim at deliberately, remains the way out.
 */

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
} from "react";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import { MarkdownContent } from "~/shared/markdown";
import { LiveMarkdownEditor } from "~/shared/markdown-editor";

import { InlineEditShell } from "./InlineEditShell";
import { useInlineEdit } from "./use-inline-edit";
import type { InlineSaveOutcome } from "./inline-edit-model";

export interface InlineMarkdownFieldProps {
  readonly label: string;
  /** The Markdown SOURCE — the canonical stored representation (ADR-006). */
  readonly value: string;
  readonly onSave: (next: string) => Promise<InlineSaveOutcome>;
  readonly emptyLabel?: string;
  readonly placeholder?: string;
  readonly readOnly?: boolean;
  readonly className?: string;
  readonly "data-testid"?: string;
}

type RenderState =
  | { readonly kind: "idle" }
  | { readonly kind: "ready"; readonly html: SanitizedMarkdownHtml }
  | { readonly kind: "error" };

export function InlineMarkdownField({
  label,
  value,
  onSave,
  emptyLabel = "Add a description",
  placeholder,
  readOnly = false,
  className,
  "data-testid": testId,
}: InlineMarkdownFieldProps) {
  const field = useInlineEdit<string>({ value, onSave });
  const errorId = `${useId()}-error`;
  const isEmpty = value.trim().length === 0;

  /*
   * The read state renders the stored Markdown through the SAME pipeline the
   * editor's own Read mode uses — one renderer, one sanitiser, one sink. The
   * parser is lazy-imported so a record that merely DISPLAYS a description does
   * not pull `unified` into its route bundle.
   */
  const [rendered, setRendered] = useState<RenderState>({ kind: "idle" });
  useEffect(() => {
    if (isEmpty || field.editing) return;
    let cancelled = false;
    void import("~/platform/markdown")
      .then(({ renderMarkdownSource }) => {
        if (cancelled) return;
        try {
          setRendered({
            kind: "ready",
            html: renderMarkdownSource(value).html,
          });
        } catch {
          setRendered({ kind: "error" });
        }
      })
      .catch(() => {
        if (!cancelled) setRendered({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [value, isEmpty, field.editing]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        field.submit();
        return;
      }
      if (event.key === "Escape") {
        // Only an untouched draft may be dismissed by a key that is this easy to
        // press by accident. With words in it, Cancel is the deliberate way out.
        if (field.draft === value) {
          event.preventDefault();
          event.stopPropagation();
          field.cancel();
        }
      }
    },
    [field, value],
  );

  return (
    <InlineEditShell
      label={label}
      valueText={value}
      isEmpty={isEmpty}
      emptyLabel={emptyLabel}
      editing={field.editing}
      onActivate={field.begin}
      triggerRef={field.triggerRef}
      pending={field.pending}
      error={field.error}
      errorId={errorId}
      readOnly={readOnly}
      variant="block"
      className={className}
      data-testid={testId}
      editor={
        /* The handler is a keyboard SHORTCUT (⌘/Ctrl+Enter, Escape) for the
         * region's OWN Save/Cancel buttons, which remain the operable controls
         * and are reachable by Tab. The group is not itself a control and does
         * not take focus; listening here is how a shortcut reaches whichever
         * descendant currently has the caret. */
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          className="dh-inline-edit__composer"
          role="group"
          aria-label={label}
          onKeyDown={onKeyDown}
        >
          <LiveMarkdownEditor
            value={field.draft}
            onChange={field.change}
            label={label}
            placeholder={placeholder}
            density="compact"
            autoFocusOnMount
            error={field.error}
            rows={6}
          />
          <div className="dh-inline-edit__actions">
            <button
              type="button"
              className="dh-btn dh-btn--primary dh-btn--sm"
              disabled={field.pending}
              onClick={() => field.submit()}
            >
              {field.pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="dh-btn dh-btn--ghost dh-btn--sm"
              disabled={field.pending}
              onClick={field.cancel}
            >
              Cancel
            </button>
            <span className="dh-inline-edit__hint">⌘/Ctrl + Enter to save</span>
          </div>
        </div>
      }
    >
      {rendered.kind === "ready" ? (
        <MarkdownContent html={rendered.html} />
      ) : rendered.kind === "error" ? (
        <span className="dh-inline-edit__render-error">
          This content can’t be displayed right now.
        </span>
      ) : (
        // Pre-render: show the source as plain text rather than nothing, so the
        // content is never briefly missing on a slow chunk load.
        <span className="dh-inline-edit__raw">{value}</span>
      )}
    </InlineEditShell>
  );
}
