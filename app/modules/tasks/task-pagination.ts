/**
 * TASKS-09 — the `/tasks` keyset-page accumulator (pure, React-free, testable).
 *
 * "Load more" appends pages WITHOUT navigating, so the drawer parameter and the scroll
 * position survive. That part always worked. What did not is what happened next: the
 * reset was keyed on the loader's first page, which is a fresh JSON array on every
 * revalidation — so any mutation at all threw away every accumulated page and dropped
 * the owner back to the first fifty rows they had already scrolled past.
 *
 * The correction is one line of intent, expressed here rather than in an effect's
 * dependency array so it can be asserted directly:
 *
 *   - the accumulation RESETS when the CONFIGURATION changes (`resetKey`), because
 *     that is the one fact that means the rows the owner accumulated are not the rows
 *     this query returns;
 *   - a re-run of the SAME query keeps every page. The refreshed first page is merged
 *     into the accumulator BY ID by {@link mergeTaskPages}, so a row the server just
 *     re-sorted onto page one appears once, in its new place, and the pages beneath it
 *     are still there.
 *
 * **`initialCursor` SEEDS the accumulation and deliberately does not reset it.** It
 * looked like the natural second half of the key, and it is not: a keyset cursor is
 * derived from page one's tail, so under any recency-ordered list it moves every time
 * a task is captured or completed — which is exactly the ordinary case this change
 * exists to stop collapsing. Keying the reset on it reintroduced the defect in a
 * quieter form (proved in the browser: 92 accumulated rows fell back to 50 after one
 * capture). The overlap that cursor movement produces is handled where it belongs, in
 * the id merge below.
 *
 * The React binding in `TasksWorkspace.tsx` owns the fetcher and nothing else.
 */

import type { SerializedTaskListItem } from "~/shared/task-record/task-view";

export interface TaskPaginationState {
  /** The configuration identity these pages belong to. */
  readonly resetKey: string;
  /** The cursor the loader's own first page ended on. */
  readonly initialCursor: string | null;
  /** Every page after the first, in the order they were loaded. */
  readonly appended: readonly SerializedTaskListItem[];
  /** The cursor the next "Load more" would use, or null when exhausted. */
  readonly cursor: string | null;
  /** True when the last "Load more" failed — the affordance offers a retry. */
  readonly loadFailed: boolean;
}

export type TaskPaginationAction =
  /**
   * The loader reported (possibly new) page-one facts. Resets only when the
   * CONFIGURATION actually changed; `initialCursor` re-seeds the reset and is never
   * itself a reason for one (see the note at the top of this file).
   */
  | {
      readonly type: "sync";
      readonly resetKey: string;
      readonly initialCursor: string | null;
    }
  /** A "Load more" page arrived. */
  | {
      readonly type: "page";
      readonly items: readonly SerializedTaskListItem[];
      readonly nextCursor: string | null;
    }
  /** A "Load more" failed; the cursor is untouched so a retry is possible. */
  | { readonly type: "page_failed" }
  /** A retry is starting — clear the failure before the request goes out. */
  | { readonly type: "retry" };

export function initialTaskPagination(
  resetKey: string,
  initialCursor: string | null,
): TaskPaginationState {
  return {
    resetKey,
    initialCursor,
    appended: [],
    cursor: initialCursor,
    loadFailed: false,
  };
}

export function taskPaginationReducer(
  state: TaskPaginationState,
  action: TaskPaginationAction,
): TaskPaginationState {
  switch (action.type) {
    case "sync": {
      if (state.resetKey === action.resetKey) {
        // The SAME query, re-read. Every accumulated page survives — this is the
        // whole of the fix, and the regression test asserts exactly it. The first
        // page's own cursor is recorded so a later reset seeds from it, but a moved
        // cursor is not itself a reset.
        return state.initialCursor === action.initialCursor
          ? state
          : { ...state, initialCursor: action.initialCursor };
      }
      return initialTaskPagination(action.resetKey, action.initialCursor);
    }
    case "page":
      return {
        ...state,
        appended: [...state.appended, ...action.items],
        cursor: action.nextCursor,
        loadFailed: false,
      };
    case "page_failed":
      return state.loadFailed ? state : { ...state, loadFailed: true };
    case "retry":
      return state.loadFailed ? { ...state, loadFailed: false } : state;
  }
}

/**
 * The rows on screen: the loader's first page followed by every appended page, with
 * duplicate ids collapsed to their FIRST appearance.
 *
 * First-appearance wins because the first page is the freshest read of the query: a
 * task that was on page two and has just been re-sorted onto page one must render in
 * its new position with its new values, not twice and not in its old place.
 */
export function mergeTaskPages(
  firstPage: readonly SerializedTaskListItem[],
  appended: readonly SerializedTaskListItem[],
): readonly SerializedTaskListItem[] {
  if (appended.length === 0) return firstPage;
  const seen = new Set<string>();
  const out: SerializedTaskListItem[] = [];
  for (const item of firstPage) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  for (const item of appended) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
