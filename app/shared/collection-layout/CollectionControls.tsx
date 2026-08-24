/**
 * MOBILE-01 / CONTROL-01 — the shared collection controls, in two presentations.
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
 *
 * ── CONTROL-01: the sheet is the PHONE presentation, not the only one ────────
 * Everything above is right for a phone and wrong for a desktop. On a 1440px
 * window the same button slid a full-width modal up from the bottom edge, with
 * a drag handle and a sticky Apply footer, over the list it was filtering — so
 * adjusting three filters meant three open/choose/apply/close round trips, each
 * of them hiding the result of the last.
 *
 * So the SHEET is now what a compact viewport gets, and a pointer device gets
 * `CollectionControlsPopover`: the same groups, the same applied params, the
 * same `applyDraft`, anchored beside the trigger and live-applying. The split is
 * `useCompactViewport`, the one boolean in the product allowed to change the DOM
 * rather than its presentation, and the same one `InlineSelectField` already
 * uses to choose between a menu and a sheet.
 *
 * There is one model, one set of options and one URL writer. Only the container
 * differs, which is what stops this becoming two filter systems that drift.
 *
 * V2.3-GATE-01 added the one thing live-applying needed to be correct: a single
 * answer to "what is applied right now", which is the committed state EXCEPT
 * while this collection is still waiting on a write these controls just made.
 * Without it a second choice made inside that window was composed over a base
 * that had never heard of the first, and deleted it — see `use-applied-params.ts`.
 */

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";

import { Sheet, SheetOption, SheetOptionList } from "~/shared/sheet";
import { useCompactViewport } from "~/shared/viewport";

import {
  CollectionControlsPopover,
  hasActiveControls,
} from "./CollectionControlsPopover";
import { ControlOptionMark } from "./ControlOptionMark";

import { CollectionFilterChips } from "./CollectionFilterChips";
import { useAppliedParams } from "./use-applied-params";
import {
  activeFilterCount,
  applyDraft,
  currentValue,
  draftFromParams,
  draftIsDirty,
  emptyDraft,
  withDraftValue,
  type CollectionControlGroup,
  type CollectionControlsDraft,
} from "./collection-controls-model";

import { Button } from "~/shared/ui";

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
  /** Route the chips link within. Defaults to a parameter-only relative link. */
  readonly basePath?: string;
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
  basePath,
  params,
}: CollectionControlsProps) {
  const [urlParams, setSearchParams] = useSearchParams();
  const committedParams = params ?? urlParams;
  /**
   * V2.3-GATE-01 — the ONE thing every surface below reads as "what is applied".
   *
   * The committed parameters, except while this collection is still waiting on a
   * write these controls just made — see `use-applied-params.ts` for the lost
   * update that closes. Everything downstream (the badge, the chips, the
   * popover's checkmarks, the draft the sheet seeds, and the base every write is
   * composed over) reads THIS, so there is exactly one answer on screen.
   */
  const {
    applied: searchParams,
    current: currentParams,
    record,
  } = useAppliedParams(committedParams);
  const compact = useCompactViewport();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CollectionControlsDraft>(() =>
    draftFromParams(groups, searchParams),
  );
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filterCount = activeFilterCount(groups, searchParams);

  const openSheet = useCallback(() => {
    // Seed the draft from what is COMMITTED each time, so a discarded draft never
    // resurfaces on the next open. The popover has no draft to seed, and doing
    // it anyway costs nothing and keeps one open path.
    setDraft(draftFromParams(groups, searchParams));
    setOpen(true);
  }, [groups, searchParams]);

  const closeSheet = useCallback(() => setOpen(false), []);

  /**
   * CONTROL-01 — close the popover and put focus back where it came from.
   *
   * The Sheet restores focus itself (it is a modal and owns the trap). The
   * popover is not modal, so the host does it: without this, dismissing with
   * Escape drops focus onto `<body>` and a keyboard user is returned to the top
   * of the document.
   */
  const closePopover = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  /**
   * The ONE place collection controls turn a draft into a URL — the sheet's
   * Apply, the popover's live commit and Reset all leave through here.
   *
   * It RECORDS what it wrote before writing it, so a second choice made while
   * this one is still in flight composes over it rather than over the committed
   * state the loader has not replaced yet (`use-applied-params.ts`).
   *
   * V2.4-GATE-01 — the base comes from `currentParams()` rather than from the
   * `searchParams` this callback would otherwise close over. A captured value is
   * only as fresh as the last RENDER, and two choices can land before any render
   * happens: `record` writes a ref by design, and React Router does not report
   * `loading` synchronously, so the second handler would still be holding the
   * pre-first-choice parameters and would delete the first choice. Asking at
   * write time closes that; nothing else about the composition changes.
   */
  const write = useCallback(
    (next: CollectionControlsDraft) => {
      const written = applyDraft(groups, currentParams(), next, {
        ...(resetParams ? { resetParams: ["cursor", ...resetParams] } : {}),
      });
      record(written);
      setSearchParams(written, { replace: true, preventScrollReset: true });
    },
    [groups, currentParams, setSearchParams, resetParams, record],
  );

  /**
   * Commit ONE control immediately — the popover's whole behavioural difference.
   *
   * The draft it composes over is derived from what is APPLIED **at this
   * moment** — `currentParams()`, for the reason `write` states — which is what
   * makes two quick choices combine instead of the second erasing the first.
   */
  const commit = useCallback(
    (group: CollectionControlGroup, value: string) => {
      write(
        withDraftValue(draftFromParams(groups, currentParams()), group, value),
      );
    },
    [groups, currentParams, write],
  );

  const clearAll = useCallback(() => {
    write(emptyDraft(groups));
  }, [groups, write]);

  const apply = useCallback(() => {
    write(draft);
    setOpen(false);
  }, [draft, write]);

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
          aria-haspopup={compact ? "dialog" : "menu"}
          onClick={() => (open ? closePopover() : openSheet())}
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

        {/* What is applied, as REMOVABLE chips rather than a read-only sentence.
            It answers the same question the old plain-text summary answered — a
            phone user must never wonder why a list looks short — and answers the
            obvious follow-up too, without reopening the sheet. Shaping controls
            (sort, layout, grouping) stay OUT of the chips: they narrow nothing,
            so offering to "remove" one would be meaningless. */}
        <CollectionFilterChips
          groups={groups}
          params={searchParams}
          basePath={basePath}
          {...(resetParams ? { resetParams } : {})}
        />
      </div>

      {open && !compact ? (
        <CollectionControlsPopover
          groups={groups}
          params={searchParams}
          anchorRef={triggerRef}
          label={label}
          onSelect={commit}
          onReset={
            hasActiveControls(groups, searchParams) ? clearAll : undefined
          }
          onClose={closePopover}
        >
          {children}
        </CollectionControlsPopover>
      ) : null}

      {open && compact ? (
        <Sheet
          title={label}
          opener={triggerRef.current}
          onClose={closeSheet}
          data-testid="collection-sheet"
          footer={
            <>
              <Button
                variant="subtle"
                onClick={reset}
                data-testid="collection-sheet-reset"
              >
                Reset
              </Button>
              <Button
                variant="primary"
                onClick={apply}
                data-testid="collection-sheet-apply"
              >
                {dirty ? "Apply" : "Done"}
              </Button>
            </>
          }
        >
          <div className="dh-collection-sheet">
            {groups.map((group) => {
              const committed = draft[group.param] ?? null;
              /*
               * SMART-01 — a multi-select group's draft value is a comma list, so
               * "is this option chosen?" is a membership test rather than an
               * equality one. `SheetOption` already announces itself with
               * `aria-pressed`, which is toggle semantics: a multi-select group
               * needs no second control type, only the right answer here.
               */
              const selected =
                committed === null
                  ? []
                  : group.multiple === true
                    ? committed.split(",")
                    : [committed];
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
                        {...(option.mark
                          ? { icon: <ControlOptionMark mark={option.mark} /> }
                          : {})}
                        selected={
                          selected.includes(option.value) ||
                          (selected.length === 0 &&
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
