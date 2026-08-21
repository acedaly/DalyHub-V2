/**
 * DS-07 — the one reusable Filter Bar for every collection.
 *
 * Contains Add-filter, active chips (edit/remove), Clear-all, an AND/OR mode
 * control (when it is meaningful), an optional result count, and an optional
 * saved-view selector with a modified indicator. It is entity-agnostic and driven
 * by a field registry plus a controlled `expression`/`onChange`; it never persists
 * anything (the URL binding lives in `useFilterUrlState`; saved-view persistence
 * is the consumer's, via `SavedViewAdapter`).
 *
 * Accessibility (DESIGN_SYSTEM.md → Filters, AGENTS.md §15): every control has an
 * accessible name; the editor is a focus-managed popover; Escape dismisses only
 * the editor; AND/OR is a labelled radio group (understandable without colour);
 * result-count changes are announced via a polite live region; long values wrap
 * and never cause page overflow.
 */

import { useCallback, useId, useRef, useState } from "react";

import { Popover } from "~/shared/floating";

import { FilterChip } from "./FilterChip";
import { FilterEditor } from "./FilterEditor";
import { clauseAccessibleName, describeClause } from "./display";
import { findSavedView, isViewModified } from "./saved-views";
import type { SavedViewAdapter } from "./saved-views";
import type {
  FilterClause,
  FilterExpression,
  FilterFieldRegistry,
  FilterMode,
} from "./types";
import type { FilterValueControls } from "./value-controls";
import { findField } from "./validate";

export interface FilterBarProps {
  readonly fields: FilterFieldRegistry;
  readonly expression: FilterExpression;
  readonly onChange: (expression: FilterExpression) => void;
  /** Number of records after filtering (announced + shown when provided). */
  readonly resultCount?: number;
  /** Total records before filtering (for a "N of M" display). */
  readonly totalCount?: number;
  readonly savedViews?: SavedViewAdapter;
  /** Optional UI-only custom value controls (the DS-06 seam), keyed by field id. */
  readonly valueControls?: FilterValueControls;
  readonly label?: string;
  readonly className?: string;
}

type EditorState =
  | { readonly mode: "add" }
  | { readonly mode: "edit"; readonly clause: FilterClause }
  | null;

export function FilterBar({
  fields,
  expression,
  onChange,
  resultCount,
  totalCount,
  savedViews,
  valueControls,
  label = "Filters",
  className,
}: FilterBarProps) {
  const [editor, setEditor] = useState<EditorState>(null);
  const [savingView, setSavingView] = useState(false);
  const editorLabelId = useId();
  const triggerRef = useRef<HTMLElement | null>(null);
  const saveNameRef = useRef<HTMLInputElement>(null);

  const { clauses, mode } = expression;

  const closeEditor = useCallback(() => {
    setEditor(null);
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, []);

  /*
   * DHDS-09 — Escape, the outside press, the focus return and the phone sheet
   * all belong to the shared {@link Popover} now.
   *
   * They were a document-level `keydown` and `pointerdown` pair written here,
   * one of four private copies of the same contract, and the copies disagreed:
   * this one dismissed on an outside press ANYWHERE including inside its own
   * portalled children, and it was the only one whose Escape listener was
   * global rather than scoped to the surface — so an Escape pressed while a
   * SELECT inside the editor was open closed the whole editor rather than the
   * select.
   */

  const openAdd = (event: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget;
    setEditor({ mode: "add" });
  };

  const openEdit = (clause: FilterClause, trigger: HTMLElement) => {
    // Capture the chip's edit button so focus returns to it after the editor
    // closes (Update/Cancel/Escape/outside-click), keeping the flow keyboard-complete.
    triggerRef.current = trigger;
    setEditor({ mode: "edit", clause });
  };

  const applyClause = (clause: FilterClause) => {
    if (editor?.mode === "edit") {
      onChange({
        mode,
        clauses: clauses.map((existing) =>
          existing.id === clause.id ? clause : existing,
        ),
      });
    } else {
      const definition = findField(fields, clause.field);
      const allowsMultiple = definition?.allowMultipleClauses ?? false;
      // Defined behaviour for a single-valued field: replace its existing clause
      // rather than stacking a duplicate.
      const withoutConflict = allowsMultiple
        ? clauses
        : clauses.filter((existing) => existing.field !== clause.field);
      onChange({ mode, clauses: [...withoutConflict, clause] });
    }
    closeEditor();
  };

  const removeClause = (clauseId: string) => {
    onChange({ mode, clauses: clauses.filter((c) => c.id !== clauseId) });
  };

  const clearAll = () => {
    onChange({ mode: "and", clauses: [] });
  };

  const setMode = (nextMode: FilterMode) => {
    onChange({ mode: nextMode, clauses });
  };

  const activeView = findSavedView(
    savedViews?.views ?? [],
    savedViews?.activeViewId,
  );
  const viewModified = isViewModified(activeView, expression);

  const rootClasses = ["dh-filter-bar", className].filter(Boolean).join(" ");

  return (
    <section className={rootClasses} aria-label={label}>
      <div className="dh-filter-bar__row">
        <div className="dh-filter-bar__add">
          <button
            type="button"
            className="dh-filter-btn dh-filter-btn--secondary"
            aria-haspopup="dialog"
            aria-expanded={editor?.mode === "add"}
            onClick={openAdd}
          >
            <span aria-hidden="true">＋</span> Add filter
          </button>

          {editor !== null ? (
            <Popover
              anchorRef={triggerRef}
              label={editor.mode === "edit" ? "Edit filter" : "Add filter"}
              onClose={closeEditor}
              className="dh-filter-popover"
            >
              <p id={editorLabelId} className="dh-visually-hidden">
                {editor.mode === "edit" ? "Edit filter" : "Add filter"}
              </p>
              <FilterEditor
                fields={fields}
                initialClause={
                  editor.mode === "edit" ? editor.clause : undefined
                }
                onApply={applyClause}
                onCancel={closeEditor}
                labelId={editorLabelId}
                valueControls={valueControls}
              />
            </Popover>
          ) : null}
        </div>

        {clauses.length > 1 ? (
          <fieldset className="dh-filter-mode">
            <legend className="dh-visually-hidden">Combine filters with</legend>
            <label className="dh-filter-mode__option">
              <input
                type="radio"
                name={`${editorLabelId}-mode`}
                checked={mode === "and"}
                onChange={() => setMode("and")}
              />
              <span>All (AND)</span>
            </label>
            <label className="dh-filter-mode__option">
              <input
                type="radio"
                name={`${editorLabelId}-mode`}
                checked={mode === "or"}
                onChange={() => setMode("or")}
              />
              <span>Any (OR)</span>
            </label>
          </fieldset>
        ) : null}

        {clauses.length > 0 ? (
          <ul className="dh-filter-bar__chips" aria-label="Active filters">
            {clauses.map((clause) => (
              <li key={clause.id}>
                <FilterChip
                  description={describeClause(fields, clause)}
                  accessibleName={clauseAccessibleName(fields, clause)}
                  onEdit={(event) => openEdit(clause, event.currentTarget)}
                  onRemove={() => removeClause(clause.id)}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {clauses.length > 0 ? (
          <button
            type="button"
            className="dh-filter-btn dh-filter-btn--ghost"
            onClick={clearAll}
          >
            Clear all
          </button>
        ) : null}

        <div className="dh-filter-bar__end">
          {resultCount !== undefined ? (
            <p
              className="dh-filter-bar__count"
              role="status"
              aria-live="polite"
            >
              {totalCount !== undefined
                ? `${resultCount} of ${totalCount}`
                : `${resultCount}`}{" "}
              {resultCount === 1 ? "result" : "results"}
            </p>
          ) : null}

          {savedViews ? (
            <div className="dh-filter-views">
              <label className="dh-filter-views__select">
                <span className="dh-visually-hidden">Saved view</span>
                <select
                  value={savedViews.activeViewId ?? ""}
                  onChange={(event) =>
                    savedViews.onSelect?.(
                      event.target.value === "" ? null : event.target.value,
                    )
                  }
                >
                  <option value="">No saved view</option>
                  {savedViews.views.map((view) => (
                    <option key={view.id} value={view.id}>
                      {view.name}
                    </option>
                  ))}
                </select>
              </label>

              {activeView && viewModified ? (
                <span className="dh-filter-views__modified" role="status">
                  Modified
                </span>
              ) : null}

              {activeView && viewModified && savedViews.onUpdateRequested ? (
                <button
                  type="button"
                  className="dh-filter-btn dh-filter-btn--ghost"
                  onClick={() => savedViews.onUpdateRequested?.(activeView.id)}
                >
                  Update view
                </button>
              ) : null}

              {savedViews.onSaveRequested ? (
                savingView ? (
                  <form
                    className="dh-filter-views__save"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const name = saveNameRef.current?.value.trim() ?? "";
                      if (name.length > 0) {
                        savedViews.onSaveRequested?.(name);
                        setSavingView(false);
                      }
                    }}
                  >
                    <label className="dh-filter-views__save-field">
                      <span className="dh-visually-hidden">New view name</span>
                      <input
                        ref={saveNameRef}
                        type="text"
                        placeholder="View name"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus
                      />
                    </label>
                    <button
                      type="submit"
                      className="dh-filter-btn dh-filter-btn--primary"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="dh-filter-btn dh-filter-btn--ghost"
                      onClick={() => setSavingView(false)}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="dh-filter-btn dh-filter-btn--ghost"
                    onClick={() => setSavingView(true)}
                  >
                    Save as view
                  </button>
                )
              ) : null}

              {activeView && savedViews.onDeleteRequested ? (
                <button
                  type="button"
                  className="dh-filter-btn dh-filter-btn--ghost"
                  aria-label={`Delete view ${activeView.name}`}
                  onClick={() => savedViews.onDeleteRequested?.(activeView.id)}
                >
                  Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
