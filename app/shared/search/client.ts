/**
 * DS-08 Shared Search — the browser transport (default search function).
 *
 * The browser sends only the bounded query and receives only the bounded,
 * display-ready {@link SearchOutcome} the server assembled — never a workspace
 * dataset for client-side searching. A non-OK response becomes a thrown error the
 * controller turns into a calm, retryable failure state (no raw detail is shown).
 */

import { decodeSearchOutcome } from "./decode";
import type { SearchOutcome } from "./types";

/** The server search endpoint (a resource route behind the Worker auth boundary). */
export const SEARCH_ENDPOINT = "/search";

/** The query-string parameter carrying the bounded query text. */
export const SEARCH_QUERY_PARAM = "q";

/** A function that resolves a query to an outcome; injectable for tests/demos. */
export type SearchFn = (
  query: string,
  signal: AbortSignal,
) => Promise<SearchOutcome>;

/** Fetch results from the server endpoint. Throws on a non-OK response. */
export async function fetchSearch(
  query: string,
  signal: AbortSignal,
): Promise<SearchOutcome> {
  const url = `${SEARCH_ENDPOINT}?${SEARCH_QUERY_PARAM}=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("search request failed");
  }
  // Treat the response as untrusted: malformed JSON throws, and a structurally
  // invalid outcome becomes a generic failure the controller handles calmly.
  const outcome = decodeSearchOutcome(await response.json());
  if (outcome === null) {
    throw new Error("invalid search response");
  }
  return outcome;
}
