/**
 * DHDS-10 — inline RELATIONSHIP, as a searchable contextual choice over a
 * server save.
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 * DHDS-09 built two ways to choose a value contextually and DS-16 wired exactly
 * one of them to a mutation:
 *
 *   - `InlineSelectField` — a `Menu` over a **closed** set (priority, status,
 *     horizon), saving through the module's own action. Complete.
 *   - `Picker` — a searchable listbox over a **potentially large** set
 *     (Projects, Areas, Goals, People). Complete as a surface, and reachable
 *     from a field only as a HAND-OFF: `escapeAction` closes the menu and asks
 *     the caller to open something.
 *
 * So every relationship whose option set is the whole workspace ended in the
 * same place — a Drawer. The Task row's "Search all Projects and Areas…" opened
 * the Task RECORD; a Project's Area lived behind the Settings tab's form. That
 * is the exact interaction DHDS-10 exists to remove: a full record editor for a
 * two-second decision (§7, §11, §32).
 *
 * This is that missing field. It is `InlineSelectField`'s shape — a read
 * affordance that looks like metadata, an immediate save, a refusal that keeps
 * the previous value and states the reason — over `Picker` instead of `Menu`.
 *
 * ── What it does NOT own ────────────────────────────────────────────────────
 * The mutation, and the search. `onSave` must post to the owning module's
 * trusted server action, exactly as every other field in this package does, and
 * `onSearch` drives the caller's own bounded, workspace-scoped endpoint. This
 * component holds no fetch, no cache and no domain rule — the precedent
 * `TaskMetaControls` set and DHDS-09 §36 requires (AGENTS.md §17).
 *
 * ── Choosing does not close the surface; the SAVE does ──────────────────────
 * The same rule `InlineSelectField` documents, for the same reason:
 * `useInlineEdit.submit` is only legal while the field is open, so a picker
 * that closed first would drop the pending state and, worse, the refusal. The
 * field closes when the server says yes and stays open with the server's
 * message when it says no.
 *
 * ── Desktop → phone ─────────────────────────────────────────────────────────
 * Nothing here decides that. `Picker` is anchored on a pointer device and is
 * the shared bottom `Sheet` on a phone (DHDS-09), and this field inherits both
 * along with the placement solver, the dismissal contract and the option row.
 */

import { useCallback, useId } from "react";
import type { ReactNode } from "react";

import { Picker } from "~/shared/floating";
import type { PickerOption } from "~/shared/floating";
import { ChevronDownIcon } from "~/shared/icons";
import { useCompactViewport } from "~/shared/viewport";

import { InlineEditShell } from "./InlineEditShell";
import { useInlineEdit } from "./use-inline-edit";
import type { InlineSaveOutcome } from "./inline-edit-model";

export interface InlinePickerFieldProps {
  /** The field's name — "Project or Area", "Area", "Goal". */
  readonly label: string;
  /** The chosen record's id, or `""` when the relationship is unset. */
  readonly value: string;
  /**
   * The candidates currently offered. Bounded by the caller: a picker that
   * ships every record in a long-lived workspace is the performance defect
   * DHDS-10 §43 names, and the search endpoint exists so it does not have to.
   */
  readonly options: readonly PickerOption[];
  /**
   * Persist. `""` is passed when the clear command is chosen. MUST post through
   * the owning module's canonical intent.
   */
  readonly onSave: (next: string) => Promise<InlineSaveOutcome>;
  /**
   * Run a server search. When given, the CALLER owns filtering and drives
   * `options`; when omitted the picker filters what it was handed, locally.
   */
  readonly onSearch?: (query: string) => void;
  /**
   * The picker was opened.
   *
   * `Picker` asks `onSearch` only when the query CHANGES, which is right for a
   * search field and leaves a caller-owned option set empty on the first open
   * unless something has already fetched a page. A caller whose search hook is
   * lazy asks for that first page here — which is also the whole reason the
   * request is deferred: a collection of forty rows must cost no requests until
   * an owner opens one of them (DHDS-10 §43).
   */
  readonly onOpen?: () => void;
  readonly loading?: boolean;
  /** The invitation shown when nothing is chosen — "No Area", "Inbox". */
  readonly emptyLabel?: string;
  /**
   * The "none of these" command, worded as the DESTINATION rather than as an
   * absence where the domain has one ("Move to Inbox"). Offered only when there
   * is something to clear.
   */
  readonly clearLabel?: string;
  readonly clearable?: boolean;
  readonly readOnly?: boolean;
  /** A leading identity mark for the READ state — the record's accent tile. */
  readonly mark?: ReactNode;
  /** DHDS-10 — how loud the field is at rest. See {@link InlineEditShell}. */
  readonly presentation?: "default" | "meta";
  readonly className?: string;
  readonly "data-testid"?: string;
}

/** The sentinel the clear command submits. Never a real record id. */
const CLEAR_VALUE = "";

export function InlinePickerField({
  label,
  value,
  options,
  onSave,
  onSearch,
  onOpen,
  loading = false,
  emptyLabel = "Not set",
  clearLabel,
  clearable = false,
  readOnly = false,
  mark,
  presentation = "default",
  className,
  "data-testid": testId,
}: InlinePickerFieldProps) {
  const field = useInlineEdit<string>({ value, onSave });
  const generatedId = useId();
  const pickerId = `${generatedId}-picker`;
  const errorId = `${generatedId}-error`;
  const compact = useCompactViewport();

  const open = field.editing;
  const selected = options.find((option) => option.id === value) ?? null;

  const toggle = useCallback(() => {
    if (open) {
      field.cancel();
      return;
    }
    field.begin();
    onOpen?.();
  }, [field, onOpen, open]);

  const choose = useCallback(
    (id: string) => {
      field.submit(id);
    },
    [field],
  );

  return (
    <div className="dh-inline-picker">
      <InlineEditShell
        label={label}
        valueText={selected?.label ?? emptyLabel}
        isEmpty={selected === null}
        emptyLabel={emptyLabel}
        editing={false}
        onActivate={toggle}
        triggerRef={field.triggerRef}
        triggerProps={{
          // A `Picker` is a `role="dialog"` containing a combobox, so the
          // trigger declares a dialog — never a menu (DHDS-09).
          "aria-haspopup": "dialog",
          "aria-expanded": open,
          /*
           * Only the ANCHORED picker carries this id. The phone presentation is
           * a `Sheet` with its own generated ids, so pointing at `pickerId`
           * there would be a broken relationship rather than a missing one —
           * the same defect `InlineSelectField` documents for its menu.
           */
          "aria-controls": open && !compact ? pickerId : undefined,
        }}
        pending={field.pending}
        error={field.error}
        errorId={errorId}
        readOnly={readOnly}
        variant="text"
        presentation={presentation}
        className={className}
        data-testid={testId}
      >
        {/* The value truncates; the mark and the caret are `flex: none` beside
            it, so a long record name ellipsises without taking either with it
            (the POLISH-01 rule `InlineSelectField` states at length). */}
        <span className="dh-inline-select__value">
          {mark ? (
            <span className="dh-inline-picker__mark" aria-hidden="true">
              {mark}
            </span>
          ) : null}
          <span className="dh-inline-select__label">
            {selected?.label ?? null}
          </span>
          <ChevronDownIcon
            className={
              presentation === "meta"
                ? "dh-inline-select__caret dh-action-reveal"
                : "dh-inline-select__caret"
            }
          />
        </span>
      </InlineEditShell>

      {open ? (
        <Picker
          anchorRef={field.triggerRef}
          label={label}
          options={options}
          value={value.length === 0 ? null : value}
          onSelect={choose}
          /*
           * Choosing does not close the surface; the SAVE does — the same rule
           * `InlineSelectField` states for its menu, and for the same reason:
           * `useInlineEdit.submit` is only legal while the field is open, so a
           * picker that closed first would drop the pending state and the
           * refusal. The field closes when the server says yes, and stays open
           * with the server's message when it says no.
           */
          keepOpenOnSelect
          {...(onSearch ? { onSearch } : {})}
          loading={loading}
          onClose={field.cancel}
          id={pickerId}
          {...(clearable && value !== CLEAR_VALUE
            ? {
                clear: {
                  label: clearLabel ?? `Clear ${label.toLocaleLowerCase()}`,
                  onSelect: () => choose(CLEAR_VALUE),
                },
              }
            : {})}
          {...(testId ? { "data-testid": `${testId}-picker` } : {})}
        />
      ) : null}
    </div>
  );
}
