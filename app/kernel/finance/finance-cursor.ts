/**
 * V2.12 FIN-00 — the transaction keyset cursor.
 *
 * A cursor names the last row of the page it came from — `(occurred_on,
 * entity_id)`, the exact tuple every transaction index is ordered by — so page
 * two is an index seek rather than an `OFFSET` scan the length of the workspace.
 *
 * It is SCOPED. The scope is a deterministic digest of the filters the page was
 * read under, and a cursor presented under different filters is REFUSED rather
 * than silently applied to a different set — the same rule
 * `obligation-cursor.ts` holds, for the same reason: a cursor that survives a
 * filter change produces a page that is neither the old set nor the new one,
 * and looks fine.
 *
 * It carries no amount, no payee and nothing private: two ordering keys and a
 * scope string, so a cursor in a URL or a log says nothing about money.
 *
 * Pure: no storage, no clock, no JSX.
 */

import { FinanceValidationError } from "./finance-errors";
import type { FinanceTransactionFilters } from "./finance-transaction";

/** The decoded cursor. */
export interface FinanceTransactionCursor {
  readonly occurredOn: string;
  readonly entityId: string;
}

/** The separator between a cursor's parts. Never legal inside an id or a date. */
const SEPARATOR = "~";

/**
 * The scope a cursor belongs to: a short, stable rendering of the filters.
 *
 * Deliberately not a hash — a deterministic string of the filter values
 * themselves, so a scope mismatch is debuggable and there is no collision to
 * reason about. `~` is stripped from free text so the scope cannot forge a
 * separator.
 */
export function financeCursorScope(
  filters: FinanceTransactionFilters | undefined,
): string {
  const f = filters ?? {};
  return [
    f.accountId ?? "",
    f.categoryId === null ? "@none" : (f.categoryId ?? ""),
    f.fromDate ?? "",
    f.toDate ?? "",
    (f.query ?? "").trim().toLowerCase().replaceAll(SEPARATOR, ""),
    f.transfersOnly ? "t" : "",
  ].join("|");
}

/** Encode the cursor for the tail of a page. */
export function encodeFinanceCursor(
  cursor: FinanceTransactionCursor,
  scope: string,
): string {
  return [cursor.occurredOn, cursor.entityId, scope].join(SEPARATOR);
}

/**
 * Decode a cursor, refusing one that belongs to a different filter scope.
 *
 * A blank or absent cursor is the first page and is not an error.
 */
export function decodeFinanceCursorForScope(
  value: string | undefined,
  scope: string,
): FinanceTransactionCursor | null {
  if (value === undefined || value.trim() === "") return null;
  const first = value.indexOf(SEPARATOR);
  const second = value.indexOf(SEPARATOR, first + 1);
  if (first <= 0 || second <= first) {
    throw new FinanceValidationError("cursor", "is not a valid page marker");
  }
  const occurredOn = value.slice(0, first);
  const entityId = value.slice(first + 1, second);
  const cursorScope = value.slice(second + 1);
  if (cursorScope !== scope) {
    throw new FinanceValidationError(
      "cursor",
      "belongs to a different set of filters",
    );
  }
  if (occurredOn.length !== 10 || entityId.length === 0) {
    throw new FinanceValidationError("cursor", "is not a valid page marker");
  }
  return { occurredOn, entityId };
}
