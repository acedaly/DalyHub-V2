/**
 * TASKS-06 — the Tasks multi-selection state model (pure, React-free, testable).
 *
 * Selection looks trivial until it has to be correct, and then it has four rules that
 * are easy to get wrong and impossible to test through a rendered list:
 *
 *   1. **A range needs an anchor.** Shift-clicking extends from the last row the owner
 *      toggled, in the order the rows are ON SCREEN — not id order, not insertion
 *      order. The reducer is therefore given the visible order on every range action
 *      and never remembers a stale one.
 *   2. **Selection must not outlive its query.** When the filter, the view, the sort
 *      or the grouping changes, the rows the owner was looking at are gone; a
 *      selection that survived would act on records they can no longer see. `reset`
 *      exists for exactly that, and the workspace fires it on any configuration
 *      change (brief §20).
 *   3. **A row that disappears takes its selection with it.** After a mutation moves a
 *      task out of the current view, `prune` drops the ids that are no longer visible,
 *      so the count in the action bar always equals the number of rows the owner can
 *      point at. Stale invisible selection is never retained.
 *   4. **Selection mode is explicit and separate from having a selection.** A phone
 *      long-press or the "Select tasks" toggle turns the row checkboxes on with
 *      nothing selected yet; leaving the mode clears both. Without a distinct `mode`
 *      the only way into selection on touch would be a gesture, and the only way out
 *      would be deselecting one row at a time.
 *
 * The reducer holds ids only. It never knows what a task IS, never fetches and never
 * mutates — the workspace passes the resulting id list to `/tasks/bulk`.
 */

import { MAX_PLAN_BATCH_SIZE } from "~/kernel/tasks";

/** The selection state of the Tasks workspace. */
export interface TaskSelectionState {
  /**
   * Whether the row checkboxes are offered. `true` whenever anything is selected;
   * can also be `true` with an empty selection, which is what a phone long-press or
   * the explicit toggle produces.
   */
  readonly mode: boolean;
  readonly ids: ReadonlySet<string>;
  /** The last row the owner toggled — the anchor a Shift-click extends from. */
  readonly anchorId: string | null;
}

export const EMPTY_TASK_SELECTION: TaskSelectionState = {
  mode: false,
  ids: new Set(),
  anchorId: null,
};

export type TaskSelectionAction =
  /** Enter selection mode with nothing selected (a toggle, or a long press). */
  | { readonly type: "enter"; readonly id?: string }
  /** Leave selection mode and drop everything. */
  | { readonly type: "reset" }
  /** Toggle one row. `shift` extends a contiguous range from the anchor. */
  | {
      readonly type: "toggle";
      readonly id: string;
      readonly selected: boolean;
      readonly shift?: boolean;
      /** The ids currently on screen, in display order. Required for a range. */
      readonly visibleIds: readonly string[];
    }
  /** Select every currently-visible row. */
  | { readonly type: "select_visible"; readonly visibleIds: readonly string[] }
  /** Drop every selected id but stay in selection mode. */
  | { readonly type: "clear" }
  /** Drop ids that are no longer on screen (after a mutation re-queried the list). */
  | { readonly type: "prune"; readonly visibleIds: readonly string[] };

export function taskSelectionReducer(
  state: TaskSelectionState,
  action: TaskSelectionAction,
): TaskSelectionState {
  switch (action.type) {
    case "enter": {
      if (action.id === undefined) {
        return state.mode ? state : { ...state, mode: true };
      }
      // A long press both enters the mode AND selects the row that was held, which is
      // what makes the gesture feel like one action rather than two.
      return {
        mode: true,
        ids: new Set([...state.ids, action.id]),
        anchorId: action.id,
      };
    }
    case "reset":
      return EMPTY_TASK_SELECTION;
    case "clear":
      return { mode: state.mode, ids: new Set(), anchorId: null };
    case "select_visible":
      return {
        mode: true,
        ids: new Set(action.visibleIds),
        anchorId: action.visibleIds.at(-1) ?? null,
      };
    case "toggle": {
      const next = new Set(state.ids);
      const range =
        action.shift === true && state.anchorId !== null
          ? rangeBetween(action.visibleIds, state.anchorId, action.id)
          : null;
      if (range !== null) {
        // A Shift extension APPLIES the acting row's new state to the whole range, so
        // shift-clicking an unselected row selects the span and shift-clicking a
        // selected one clears it — the behaviour every file manager has.
        for (const id of range) {
          if (action.selected) next.add(id);
          else next.delete(id);
        }
      } else if (action.selected) {
        next.add(action.id);
      } else {
        next.delete(action.id);
      }
      return { mode: true, ids: next, anchorId: action.id };
    }
    case "prune": {
      const visible = new Set(action.visibleIds);
      const next = new Set([...state.ids].filter((id) => visible.has(id)));
      if (next.size === state.ids.size) return state;
      return {
        mode: state.mode,
        ids: next,
        anchorId:
          state.anchorId !== null && visible.has(state.anchorId)
            ? state.anchorId
            : null,
      };
    }
  }
}

/**
 * The contiguous slice of `visibleIds` between two ids, inclusive, in display order.
 * `null` when either id is not on screen — a range with a missing endpoint is not a
 * range, and guessing one would select rows the owner never pointed at.
 */
function rangeBetween(
  visibleIds: readonly string[],
  anchorId: string,
  targetId: string,
): readonly string[] | null {
  const from = visibleIds.indexOf(anchorId);
  const to = visibleIds.indexOf(targetId);
  if (from === -1 || to === -1) return null;
  const [start, end] = from <= to ? [from, to] : [to, from];
  return visibleIds.slice(start, end + 1);
}

/**
 * The MIXED-VALUE summary of a field across the selection (brief §17).
 *
 * A bulk field control must not pretend there is one current value when there is not:
 * choosing P2 for a selection of P1s, P2s and untriaged tasks sets all of them to P2,
 * and the control has to say so beforehand. `value` is the shared value when every
 * selected task agrees (`null` counts as a real agreed value — "none"), and `mixed`
 * is true otherwise. An empty selection is neither.
 */
export interface BulkFieldSummary<T> {
  readonly value: T | null;
  readonly mixed: boolean;
}

export function summariseBulkField<TItem, TValue>(
  items: readonly TItem[],
  read: (item: TItem) => TValue | null,
): BulkFieldSummary<TValue> {
  if (items.length === 0) return { value: null, mixed: false };
  const first = read(items[0]!);
  for (let index = 1; index < items.length; index += 1) {
    if (read(items[index]!) !== first) return { value: null, mixed: true };
  }
  return { value: first, mixed: false };
}

/**
 * TASKS-06 / DEBT-110 — the SELECTION BOUND, stated before the action.
 *
 * Every bulk mutation is validated against `MAX_PLAN_BATCH_SIZE` server-side,
 * deliberately: one bulk change is one bounded atomic transaction, and an unbounded
 * "act on everything" is neither fast nor safely rollback-able. `/tasks` pages at 50,
 * so two presses of "Load more" put more rows on screen than one mutation may touch —
 * and until this rule existed, "Select all 150" built a selection whose every action
 * ended in the same typed validation error, with nothing on the surface having said
 * so beforehand.
 *
 * The rule is pure and lives here rather than in the bar's JSX because it is the part
 * worth asserting: what may be selected, whether that was capped, and how many must
 * be deselected before the selection can be acted on at all.
 */
export interface BulkSelectionBound {
  /** The ids "Select all" may take — never more than the bound. */
  readonly selectableIds: readonly string[];
  /** True when more rows are loaded than one bulk mutation may touch. */
  readonly capped: boolean;
}

export function boundBulkSelection(
  visibleIds: readonly string[],
  max: number = MAX_PLAN_BATCH_SIZE,
): BulkSelectionBound {
  return {
    selectableIds:
      visibleIds.length <= max ? visibleIds : visibleIds.slice(0, max),
    capped: visibleIds.length > max,
  };
}

/**
 * How many must be deselected before a selection can be acted on at all. Zero
 * whenever it is within the bound. Only a Shift-range across more than one loaded
 * page can make it positive, because {@link boundBulkSelection} caps "Select all".
 */
export function bulkSelectionOverBy(
  selectedCount: number,
  max: number = MAX_PLAN_BATCH_SIZE,
): number {
  return Math.max(0, selectedCount - max);
}

/** The plain-English current value of a bulk field: a label, "Mixed", or "None". */
export function bulkFieldLabel<T>(
  summary: BulkFieldSummary<T>,
  label: (value: T) => string,
  noneLabel = "None",
): string {
  if (summary.mixed) return "Mixed";
  return summary.value === null ? noneLabel : label(summary.value);
}
