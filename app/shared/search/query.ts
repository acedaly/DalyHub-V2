/**
 * DS-08 Shared Search — query normalisation and bounds (pure, React-free).
 *
 * The one place a raw query becomes a safe, bounded, deterministic string. Every
 * layer normalises through here so the browser, the orchestrator and the model
 * agree on exactly what "the query" is: Unicode-normalised (NFC), whitespace
 * collapsed, trimmed, case-folded only where compared, and capped in code points
 * (not UTF-16 units, so a surrogate pair is never split).
 */

import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "./limits";

/**
 * Normalise a raw query: NFC-normalise, collapse all Unicode whitespace runs to a
 * single space, trim, and cap length to {@link MAX_QUERY_LENGTH} code points. The
 * result is safe to compare, transport and display. Case is preserved (matching is
 * case-folded at compare time so highlighting keeps the original casing).
 */
export function normaliseQuery(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) {
    return "";
  }
  const collapsed = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (collapsed.length === 0) {
    return "";
  }
  const codePoints = Array.from(collapsed);
  if (codePoints.length <= MAX_QUERY_LENGTH) {
    return collapsed;
  }
  return codePoints.slice(0, MAX_QUERY_LENGTH).join("");
}

/**
 * True when a normalised query is meaningful enough to execute providers. An
 * empty or sub-minimal query must never run a provider (AGENTS.md §16).
 */
export function isExecutableQuery(normalised: string): boolean {
  return Array.from(normalised).length >= MIN_QUERY_LENGTH;
}

/** Case-fold for comparison. Kept in one place so matching stays consistent. */
export function foldCase(value: string): string {
  return value.toLowerCase();
}
