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
