/**
 * MOBILE-01 — the shared phone collection controls and the one collection sheet.
 *
 * The phone collection header is ONE row: a Filter button carrying its active
 * count, and (where the collection has them) a Sort/View menu. Everything richer —
 * filters, sorting, grouping, display density, saved views — lives in one shared
 * sheet consumed by Tasks and every other collection module, so a phone user
 * learns one control surface rather than one per module.
 *
 * The behaviour that makes it trustworthy:
 *   - active filters are VISIBLE before opening: the button shows a count and the
 *     header shows a concise summary, so a short list is never unexplained;
 *   - the sheet edits a DRAFT — tapping options fires no navigation, and closing
 *     without applying discards only the draft, never committed state;
 *   - Apply writes the URL exactly ONCE (and clears pagination);
 *   - Reset is an explicit, complete clear — never a silent partial one;
 *   - Back closes the sheet before it leaves the route, because the sheet is not
 *     a history entry;
 *   - every control is a labelled 44px target, and the sheet body is the only
 *     scroll container (no nested scroll trap).
 *
 * Large data pickers stay SERVER-BACKED: a group here is a small closed set of
 * options. A collection needing to filter by a searched record passes that control
 * through `children`, where it keeps using the shared server-backed picker — the
 * sheet never loads a collection to filter it locally.
 */

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Sheet, SheetOption, SheetOptionList } from "~/shared/sheet";

import {
  activeFilterCount,
  activeSummary,
  applyDraft,
  currentValue,
  draftFromParams,
  draftIsDirty,
  emptyDraft,
  withDraftValue,
  type CollectionControlGroup,
  type CollectionControlsDraft,
} from "./collection-controls-model";

export type CollectionControlsProps = {
  /** The URL-backed control groups this collection exposes. */
  readonly groups: readonly CollectionControlGroup[];
  /**
   * Bespoke controls rendered inside the sheet beneath the groups — e.g. a
   * server-backed record picker. They own their own state and are applied by
   * their own mechanism; the sheet only hosts them.
   */
  readonly children?: ReactNode;
  /** The sheet's accessible name. Defaults to "Filter and sort". */
  readonly label?: string;
  /** Extra params to clear on Apply (pagination is always cleared). */
  readonly resetParams?: readonly string[];
  /**
   * The trigger's visible text. Defaults to "Filter". A collection whose sheet also
   * carries sort and grouping can say so ("Filter & sort") rather than under-selling
   * what the button opens.
   */
  readonly triggerLabel?: string;
  /**
   * The COMMITTED state to read from and apply over, when it is not simply the
   * URL's raw parameters.
   *
   * A collection that validates its URL state (Tasks does) must hand the
   * CANONICAL parameters here. Otherwise a value the query rejected — a stale
   * saved view's removed dimension, a hand-typed nonsense filter — would still
   * count on the Filter badge and still survive an Apply, so the controls would
   * describe a narrower collection than the one on screen. Defaults to the URL.
   */
  readonly params?: URLSearchParams;
};

export function CollectionControls({
  groups,
  children,
  label = "Filter and sort",
  resetParams,
  triggerLabel = "Filter",
  params,
}: CollectionControlsProps) {
  const [urlParams, setSearchParams] = useSearchParams();
  const searchParams = params ?? urlParams;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CollectionControlsDraft>(() =>
    draftFromParams(groups, searchParams),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filterCount = activeFilterCount(groups, searchParams);
  const summary = activeSummary(groups, searchParams);

  const openSheet = useCallback(() => {
    // Seed the draft from what is COMMITTED each time, so a discarded draft never
    // resurfaces on the next open.
    setDraft(draftFromParams(groups, searchParams));
    setOpen(true);
  }, [groups, searchParams]);

  const closeSheet = useCallback(() => setOpen(false), []);

  const apply = useCallback(() => {
    setSearchParams(
      applyDraft(groups, searchParams, draft, {
        ...(resetParams ? { resetParams: ["cursor", ...resetParams] } : {}),
      }),
      { replace: true, preventScrollReset: true },
    );
    setOpen(false);
  }, [groups, searchParams, draft, setSearchParams, resetParams]);

  const reset = useCallback(() => setDraft(emptyDraft(groups)), [groups]);

  const dirty = draftIsDirty(groups, searchParams, draft);

  return (
    <>
      <div className="dh-collection-controls">
        <button
          type="button"
          ref={triggerRef}
          className="dh-collection-controls__trigger"
          aria-expanded={open}
          onClick={openSheet}
          data-testid="collection-filter-trigger"
        >
          {triggerLabel}
          {/* The count is TEXT, so an active filter is legible without colour and
              audible to a screen reader. */}
          {filterCount > 0 ? (
            <span className="dh-collection-controls__count">
              {filterCount}
              <span className="dh-visually-hidden"> active filters</span>
            </span>
          ) : null}
        </button>

        {summary.length > 0 ? (
          <p className="dh-collection-controls__summary">
            {summary.join(" · ")}
          </p>
        ) : null}
      </div>

      {open ? (
        <Sheet
          title={label}
          opener={triggerRef.current}
          onClose={closeSheet}
          data-testid="collection-sheet"
          footer={
            <>
              <button
                type="button"
                className="dh-btn dh-btn--ghost"
                onClick={reset}
                data-testid="collection-sheet-reset"
              >
                Reset
              </button>
              <button
                type="button"
                className="dh-btn dh-btn--primary"
                onClick={apply}
                data-testid="collection-sheet-apply"
              >
                {dirty ? "Apply" : "Done"}
              </button>
            </>
          }
        >
          <div className="dh-collection-sheet">
            {groups.map((group) => {
              const selected = draft[group.param] ?? null;
              return (
                <section
                  key={group.id}
                  className="dh-collection-sheet__group"
                  aria-labelledby={`collection-sheet-${group.id}`}
                >
                  <h3
                    id={`collection-sheet-${group.id}`}
                    className="dh-collection-sheet__label"
                  >
                    {group.label}
                  </h3>
                  <SheetOptionList label={group.label}>
                    {group.options.map((option) => (
                      <SheetOption
                        key={option.value}
                        label={option.label}
                        {...(option.description
                          ? { description: option.description }
                          : {})}
                        selected={
                          selected === option.value ||
                          (selected === null &&
                            option.value === (group.defaultValue ?? ""))
                        }
                        onSelect={() =>
                          setDraft((prev) =>
                            withDraftValue(prev, group, option.value),
                          )
                        }
                        data-testid={`collection-sheet-${group.param}-${option.value || "default"}`}
                      />
                    ))}
                  </SheetOptionList>
                </section>
              );
            })}

            {children}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export { currentValue };
