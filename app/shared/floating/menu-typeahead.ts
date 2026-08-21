/**
 * DHDS-09 — printable-character typeahead inside a menu, as pure logic.
 *
 * The WAI-ARIA menu pattern says typing a character moves focus to the next
 * item starting with it. Two implementations of that existed (the inline select
 * and the collection controls popover) and they disagreed about the two cases
 * that matter: what a repeated character does, and where the search starts.
 *
 * The rules, in one place:
 *
 *   1. search starts AFTER the currently focused item and wraps, so pressing
 *      `p` repeatedly walks P1 → P2 → P3 → P4 → P1 rather than sticking on the
 *      first match;
 *   2. a buffer of one repeated character is treated as that single character,
 *      which is what makes rule 1 true — otherwise "pp" would match nothing;
 *   3. disabled items are skipped: focusing something that cannot be chosen is
 *      a dead end the keyboard cannot see.
 */

/** An item typeahead can land on. */
export interface TypeaheadCandidate {
  readonly label: string;
  readonly disabled?: boolean;
}

/** How long a buffer survives before the next key starts a new search. */
export const TYPEAHEAD_RESET_MS = 700;

/**
 * The index typeahead should move to, or `-1` when nothing matches.
 *
 * @param items the full list, in the order the reader sees it
 * @param buffer the accumulated characters, already lower-cased by the caller
 * @param from the currently focused index (`-1` when nothing is focused)
 */
export function matchTypeahead(
  items: readonly TypeaheadCandidate[],
  buffer: string,
  from: number,
): number {
  if (buffer.length === 0 || items.length === 0) return -1;

  // Rule 2 — "ppp" is a request to cycle through the `p`s, not to find an item
  // literally called "ppp".
  const repeated = [...buffer].every((character) => character === buffer[0]);
  const query = repeated ? buffer[0]! : buffer;

  // Rule 1 — start one past the current item so a repeated key advances. A
  // multi-character buffer re-searches from the same start, which is what makes
  // "pr" refine "p" rather than skipping past the item "p" just found.
  const start = repeated ? from + 1 : from;
  for (let step = 0; step < items.length; step += 1) {
    const index = (start + step + items.length) % items.length;
    const item = items[index]!;
    if (item.disabled === true) continue;
    if (item.label.toLocaleLowerCase().startsWith(query)) return index;
  }
  return -1;
}

/**
 * Whether a key event is a typeahead character rather than a command.
 *
 * A single printable character with no modifier. `Ctrl`/`Meta` are excluded
 * because they are how the browser's own shortcuts arrive, and `Alt` because a
 * composed character on a Mac keyboard is not a search.
 */
export function isTypeaheadKey(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}): boolean {
  return (
    event.key.length === 1 &&
    event.key !== " " &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  );
}
