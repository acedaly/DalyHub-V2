/**
 * DS-07 — bind a filter expression to the URL (React Router).
 *
 * The single hook a consumer uses to make filters URL-backed: it reads the
 * expression from the current search params (sanitised against the field
 * registry) and writes changes back as real navigations, so active filters
 * survive refresh, restore from a copied link, and move with Back/Forward. It
 * PRESERVES unrelated params (including DS-03's repeated `drawer` params) and does
 * not reset scroll. Filter state is therefore never held only in component state.
 */

import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { readFilterExpression, writeFilterExpression } from "./url";
import type { FilterExpression, FilterFieldRegistry } from "./types";

export interface FilterUrlState {
  readonly expression: FilterExpression;
  readonly setExpression: (next: FilterExpression) => void;
}

export function useFilterUrlState(fields: FilterFieldRegistry): FilterUrlState {
  const [searchParams, setSearchParams] = useSearchParams();

  const expression = useMemo(
    () => readFilterExpression(searchParams, fields),
    [searchParams, fields],
  );

  const setExpression = useCallback(
    (next: FilterExpression) => {
      setSearchParams(
        (prev) => writeFilterExpression(prev, next),
        // A discrete filter change pushes a history entry (so Back restores the
        // prior filter state) but never resets the page scroll.
        { preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  return { expression, setExpression };
}
