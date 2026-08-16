/**
 * UIX-06 — the ONE collection count line.
 *
 * Every collection's subtitle answers the same question ("how many of these are
 * there, and am I looking at all of them?"), and before this every collection
 * answered it in its own words. The August 2026 convergence pass found five
 * conventions across nine screens:
 *
 *     Tasks     "92 tasks"                 Projects  "50 projects loaded"
 *     Areas     "11 Areas"                 Reviews   "0 current Reviews"
 *     Assets    "All"            ← the VIEW's name, not a count at all
 *
 * Three of those differ only in the case of the noun, one leaks the word
 * "loaded" into product copy without the other four doing so, and one answers a
 * different question entirely. None of it was a decision; it was nine
 * independent implementations of one line.
 *
 * ── The rules ───────────────────────────────────────────────────────────────
 *
 * **The noun is CAPITALISED**, because these are the product's own nouns
 * (AGENTS.md §7 — "speak in the user's nouns… consistently, everywhere"), and
 * both design documents capitalise Area, Goal, Project, Task, Note, Meeting,
 * Person, Asset and Review throughout. "6 Goals" is the product's vocabulary;
 * "6 goals" is a word that happens to appear in it.
 *
 * **A bounded page says so**, and says it the same way everywhere. "50 Projects
 * loaded" is not a technical leak — it is the difference between "there are 50"
 * and "you can see 50 of an unknown number", and a count that quietly means the
 * second is a count that lies.
 *
 * **A scope qualifies the noun, it does not replace the count.** Reviews says
 * "3 current Reviews"; Assets used to say "All" and now says how many.
 */

export type CountLabelOptions = {
  /**
   * True when the collection is showing a bounded page of a longer list, so the
   * figure describes what is LOADED rather than what exists.
   */
  readonly hasMore?: boolean;
  /**
   * An adjective placed between the count and the noun — a view's own scope
   * ("current", "in progress"). Lower-case: it qualifies the noun, it is not
   * one.
   */
  readonly scope?: string;
};

/**
 * "3 Goals" · "1 Goal" · "50 Projects loaded" · "3 current Reviews".
 *
 * @param count    how many records the collection is showing
 * @param singular the product's noun for one of them, capitalised ("Goal")
 * @param plural   its plural, where adding "s" is wrong ("People")
 */
export function collectionCountLabel(
  count: number,
  singular: string,
  plural: string = `${singular}s`,
  options: CountLabelOptions = {},
): string {
  const noun = count === 1 ? singular : plural;
  const scope = options.scope ? `${options.scope} ` : "";
  return options.hasMore
    ? `${count} ${scope}${noun} loaded`
    : `${count} ${scope}${noun}`;
}

/**
 * UIX-06 / CONVERGE-01 — the collection STATE BREAKDOWN.
 *
 * The count line's better form, and the one the audit asks every collection to
 * move towards: not "154 Tasks" under a page titled Tasks (which repeats the
 * page's own noun and says nothing), but "120 active · 26 overdue · 8 waiting"
 * — the same figures the module already has, saying what state the work is in.
 * Projects has drawn its line this way since REDESIGN-04; this is that
 * implementation promoted so every collection joins its segments identically.
 *
 * Two rules, both learned from the Projects line:
 *
 * **A zero segment is dropped, not printed.** "8 active · 0 overdue" reads as a
 * warning about the zero; "8 active" reads as the fact. Callers pass the whole
 * set and the empty ones fall away.
 *
 * **The separator never starts a line.** The join uses a NO-BREAK SPACE before
 * the middle dot, so a narrow phone breaks after "· " and never leaves "· 1
 * archived" orphaned at the start of the second line — measured at 393px on
 * `/projects`, where it did exactly that.
 *
 * Returns `null` when nothing survives, so the caller falls back to whatever
 * plain count it has rather than rendering an empty band.
 */
export function collectionStateBreakdown(
  segments: readonly (string | null | undefined | false)[],
): string | null {
  const parts = segments.filter(
    (segment): segment is string =>
      typeof segment === "string" && segment.length > 0,
  );
  return parts.length > 0 ? parts.join("\u00a0· ") : null;
}

/**
 * One segment of a {@link collectionStateBreakdown}, or `null` when the count
 * is zero. The count and its word are joined with a NO-BREAK SPACE so a segment
 * never breaks between the number and what it counts.
 */
export function collectionStateSegment(
  count: number,
  label: string,
): string | null {
  return count > 0 ? `${count}\u00a0${label}` : null;
}
