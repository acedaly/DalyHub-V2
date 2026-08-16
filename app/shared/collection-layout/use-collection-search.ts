/**
 * REDESIGN-04 — the ONE collection search controller.
 *
 * The field is only half of the pattern. The other half — a local draft so
 * typing is instant, a debounce so a keystroke is not a navigation, a
 * `replace`d URL update so Back leaves the collection rather than walking every
 * character the owner typed, and a cursor reset so the next page belongs to the
 * new query — was hand-rolled identically in Meetings, Assets, Notes, People
 * and Reviews. Five copies of one behaviour, each with its own timeout constant
 * and its own set of params to clear.
 *
 * This is that behaviour once. It owns no fetching and no entity knowledge: it
 * reads and writes one search param.
 *
 * Two properties matter and are easy to get wrong:
 *
 *   - **The URL is the source of truth, the draft is a mirror.** Arriving on a
 *     `?q=kitchen` link, or pressing Back, updates the field — the effect that
 *     syncs the draft from the param is what makes that work.
 *   - **The cursor is dropped on every change.** A keyset cursor is bound to
 *     the query scope it was issued for (`PROJECT_CURSOR_VERSION` 4 binds the
 *     search term itself), so carrying one across a search change would ask the
 *     repository to resume an ordering inside a different result set.
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";

/**
 * How long the field waits before it narrows the collection.
 *
 * 250ms — long enough that a word typed at speed is one navigation rather than
 * six, short enough that the list feels like it is responding to the letters
 * rather than to a pause.
 */
export const COLLECTION_SEARCH_DEBOUNCE_MS = 250;

export type CollectionSearchController = {
  /** The committed query, from the URL. Pass this to the loader-driven view. */
  readonly query: string;
  /** The field's live text. Bind this to `CollectionSearchField`. */
  readonly draft: string;
  readonly setDraft: (value: string) => void;
};

export function useCollectionSearch(
  param = "q",
  debounceMs: number = COLLECTION_SEARCH_DEBOUNCE_MS,
): CollectionSearchController {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get(param) ?? "";
  const [draft, setDraft] = useState(query);

  // The URL leads. A `?q=` link, a Back, or a revalidation that changes the
  // param must be reflected in the field the owner is looking at.
  useEffect(() => {
    setDraft(query);
  }, [query]);

  const commit = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value.length === 0) next.delete(param);
          else next.set(param, value);
          // A new query is a new result set, so any accumulated keyset cursor
          // belongs to a scope that no longer exists.
          next.delete("cursor");
          return next;
        },
        // `replace` so Back leaves the collection instead of retyping the query
        // one character at a time; `preventScrollReset` so narrowing a list does
        // not throw the reader back to the top of the page.
        { replace: true, preventScrollReset: true },
      );
    },
    [param, setSearchParams],
  );

  useEffect(() => {
    if (draft === query) return;
    const timeout = setTimeout(() => commit(draft), debounceMs);
    return () => clearTimeout(timeout);
  }, [draft, query, commit, debounceMs]);

  return { query, draft, setDraft };
}
