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
 * persistence mechanism for one toggle (§5.4). Grid is the Projects default,
 * so that collection's canonical URL stays clean; each caller declares its own
 * default by ordering `allowed`.
 *
 * ── Three presentations, and a collection offers TWO ────────────────────────
 * `list` joined `grid` and `table` when Areas gained a gallery. The three are
 * genuinely different drawings, not synonyms:
 *
 *   `grid`   cards in a wrapping gallery
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
 * misspelled, tampered with — is the collection's declared default, never an
 * error. The first allowed presentation is the default.
 *
 * A caller may narrow the result to the presentations IT draws by passing
 * `allowed`. That is what keeps `?present=table` on Areas (which has no table)
 * from rendering nothing: it lands on that collection's first allowed drawing.
 */
export function parseCollectionPresentation(
  value: string | null | undefined,
  allowed: readonly CollectionPresentation[] = COLLECTION_PRESENTATIONS,
): CollectionPresentation {
  const fallback = allowed[0] ?? "grid";
  if (typeof value !== "string" || !PRESENTATION_SET.has(value)) {
    return fallback;
  }
  const parsed = value as CollectionPresentation;
  return allowed.includes(parsed) ? parsed : fallback;
}

/**
 * ADR-100 / CONVERGE-01 §4 — the size at which a collection stops being a
 * gallery by default.
 *
 * The audit left this as an open question ("does the table become the default at
 * ~40+ projects?"), and it is answered on the record in
 * [ADR-100](../../../docs/decisions/ARCHITECTURE_DECISIONS.md). Forty is a
 * measurement rather than a round number: at the gallery's own
 * `--app-entity-card-min-width`, a 1440px canvas draws three cards a row and a
 * ~200px card, so forty Projects is about fourteen rows and roughly four
 * screens of scrolling — the point at which "look at them" has already become
 * "find one", which is the question a table answers and a gallery does not.
 */
export const COLLECTION_TABLE_DEFAULT_THRESHOLD = 40;

/**
 * Resolve a collection's presentation from the owner's CHOICE first, and only
 * then from its size.
 *
 * ── The choice always wins, and is never overridden ─────────────────────────
 * A `?present=` value the collection actually draws is the owner speaking, and
 * it is honoured whatever the size — including `grid` on a workspace of two
 * hundred Projects, which is the case that makes this rule worth stating. A
 * default that quietly re-asserted itself would be a preference the owner cannot
 * hold, and the URL is the only place this product keeps view state precisely so
 * that a choice survives a reload, a share and a Back.
 *
 * ── An absent or unusable value is NOT a choice ─────────────────────────────
 * Absent, misspelled, tampered with, or naming a presentation this collection
 * does not draw: none of those is the owner saying "gallery". They fall to the
 * size rule, which is the same philosophy `parseCollectionPresentation` already
 * applies one level down.
 *
 * ── An unknown size falls to the gallery ────────────────────────────────────
 * `total` is `null` when the count read FAILED. Guessing "table" from a failed
 * read would let a transient database error silently change what the page looks
 * like, so an unknown size gets the default the collection has always had.
 */
export function resolveCollectionPresentation(input: {
  /** The raw `?present=` value, exactly as it came off the URL. */
  readonly param: string | null | undefined;
  /** The presentations this collection draws. The first is its default. */
  readonly allowed: readonly CollectionPresentation[];
  /** How many records the CURRENT scope holds, or `null` when unknown. */
  readonly total: number | null;
  /** What a large collection falls to. */
  readonly large: CollectionPresentation;
  readonly threshold?: number;
}): CollectionPresentation {
  const { param, allowed, total, large } = input;
  const threshold = input.threshold ?? COLLECTION_TABLE_DEFAULT_THRESHOLD;

  if (
    typeof param === "string" &&
    PRESENTATION_SET.has(param) &&
    allowed.includes(param as CollectionPresentation)
  ) {
    return param as CollectionPresentation;
  }

  if (total !== null && total > threshold && allowed.includes(large)) {
    return large;
  }
  return allowed[0] ?? "grid";
}
