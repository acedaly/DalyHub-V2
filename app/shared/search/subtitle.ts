/**
 * RECALL-01 — the ONE Search result subtitle grammar (ADR-114 decision 3).
 *
 * Every body-searching provider composes its subtitle here, so the row reads the
 * same sentence whatever module produced it:
 *
 * ```
 * match source · state/metadata · excerpt
 * ```
 *
 * Three rules the grammar exists to keep:
 *
 *   - **The match source is stated first, always.** A body hit is invisible in
 *     the row — the title does not contain the query — so a result that cannot
 *     say WHY it is here is a result the owner has to open to understand. Notes
 *     has said it since NOTES-03; RECALL-01 makes it the product rule.
 *   - **The excerpt is last, and it is plain text.** Providers never emit HTML;
 *     highlighting is presentation-side over match ranges.
 *   - **The line is bounded.** {@link MAX_SUBTITLE_LENGTH} is the existing
 *     display limit and the model clamps to it at the boundary; bounding here as
 *     well means the cut is deterministic and carries an ellipsis rather than
 *     stopping mid-word at the edge. There is no new row shape and no second
 *     excerpt component: at phone width this stays the existing one-line,
 *     truncated subtitle.
 *
 * Pure data in, pure string out — no React, no platform, no module types.
 */

import { MAX_SUBTITLE_LENGTH } from "./limits";

/** The separator the Search row grammar has always used between subtitle parts. */
const SEPARATOR = " · ";

/**
 * Compose a bounded `match source · state · excerpt` subtitle.
 *
 * Empty, blank and absent parts are dropped rather than producing a dangling
 * separator, and an all-empty list yields `undefined` so the row simply has no
 * subtitle. The result never exceeds {@link MAX_SUBTITLE_LENGTH} code points.
 */
export function searchSubtitle(
  parts: readonly (string | null | undefined)[],
): string | undefined {
  const kept = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);
  if (kept.length === 0) return undefined;
  const text = kept.join(SEPARATOR);
  const points = [...text];
  if (points.length <= MAX_SUBTITLE_LENGTH) return text;
  return `${points
    .slice(0, MAX_SUBTITLE_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}
