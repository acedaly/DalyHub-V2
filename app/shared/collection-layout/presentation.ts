/**
 * REDESIGN-04 — how a collection is DRAWN: a gallery of cards, or a table.
 *
 * `mockup3.png` gives the Projects collection a Grid/Table toggle at the
 * trailing edge of its control row. The choice is a presentation, never a
 * filter: both views show exactly the same records, in the same order, from the
 * same loader — one as cards, one as rows. That is the distinction UIQ-013 draws
 * between a view switcher and a filter, and it is why this lives beside the
 * collection layout rather than in any module.
 *
 * ── Where the choice is kept ────────────────────────────────────────────────
 * In the URL (`?present=table`), which is where every other view state in this
 * product already lives — `?state=`, `?view=`, `?tab=`, the drawer stack. That
 * makes a tabular collection shareable, bookmarkable, Back/Forward-correct and
 * correct on the first server byte, and it means REDESIGN-04 introduces no new
 * persistence mechanism for one toggle (§5.4). Grid is the default, so the
 * collection's canonical URL stays clean.
 */

/** The presentations, in the order the toggle draws them. The first is the default. */
export const COLLECTION_PRESENTATIONS = ["grid", "table"] as const;

export type CollectionPresentation = (typeof COLLECTION_PRESENTATIONS)[number];

/**
 * Read a presentation from untrusted URL text. Anything unrecognised — absent,
 * misspelled, tampered with — is the default gallery, never an error.
 */
export function parseCollectionPresentation(
  value: string | null | undefined,
): CollectionPresentation {
  return value === "table" ? "table" : "grid";
}
