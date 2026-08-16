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
 *
 * ── Three presentations, and a collection offers TWO ────────────────────────
 * `list` joined `grid` and `table` when Areas gained a gallery. The three are
 * genuinely different drawings, not synonyms:
 *
 *   `grid`   cards in a wrapping gallery — the default everywhere
 *   `table`  a real table with sortable-shaped COLUMNS (Projects)
 *   `list`   full-width rows separated by hairlines, one identity mark per row
 *            down the left edge (Areas)
 *
 * A collection declares which two it draws; nothing here says every collection
 * has all three, and a value a collection does not offer falls to its own
 * default rather than rendering an empty region.
 */

/** The presentations, in the order a toggle draws them. The first is the default. */
export const COLLECTION_PRESENTATIONS = ["grid", "table", "list"] as const;

export type CollectionPresentation = (typeof COLLECTION_PRESENTATIONS)[number];

const PRESENTATION_SET: ReadonlySet<string> = new Set(COLLECTION_PRESENTATIONS);

/**
 * Read a presentation from untrusted URL text. Anything unrecognised — absent,
 * misspelled, tampered with — is the default gallery, never an error.
 *
 * A caller may narrow the result to the presentations IT draws by passing
 * `allowed`. That is what keeps `?present=table` on Areas (which has no table)
 * from rendering nothing: it lands on the gallery, which is what the owner of a
 * mistyped URL wanted.
 */
export function parseCollectionPresentation(
  value: string | null | undefined,
  allowed: readonly CollectionPresentation[] = COLLECTION_PRESENTATIONS,
): CollectionPresentation {
  if (typeof value !== "string" || !PRESENTATION_SET.has(value)) {
    return "grid";
  }
  const parsed = value as CollectionPresentation;
  return allowed.includes(parsed) ? parsed : "grid";
}
