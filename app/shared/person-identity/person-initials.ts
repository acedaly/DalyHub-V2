/**
 * UNTITLED-13 — the ONE derivation of a Person's initials.
 *
 * There were three. `person-view.ts` derived them from the stored name parts
 * (preferred/first + last) for the People projections; `MeetingContextRow`
 * derived its own from the display title because a Meeting's attendee arrives
 * as an EntityLink counterpart and carries no name parts; and the Untitled
 * `Avatar` falls back to a generic person glyph when given neither.
 *
 * Two answers to "what is this person called" is one too many — a Person whose
 * record says Alexandra Lee but whose preferred name is Alex showed AL on
 * `/people` and AL in a meeting header only by coincidence of the words, and a
 * mononym or a hyphenated surname parted company immediately.
 *
 * `personInitials` in `person-view.ts` stays the authority where NAME PARTS
 * exist, because parts are better evidence than a display string. This is the
 * fallback it already contained, lifted out so the surfaces that only ever have
 * a display title share it rather than each writing their own.
 */

/**
 * Up to two initials from a display name.
 *
 * Words without a letter in them are skipped, so "Dr. Alexandra Lee (Acme)"
 * still yields AL rather than D(. A mononym gets one letter. An empty or
 * letterless name gets the middle dot the People projection already uses, which
 * renders as a mark rather than as an absent one.
 */
export function initialsFromName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return "·";
  if (words.length === 1) return firstLetter(words[0]).toLocaleUpperCase();
  return (
    firstLetter(words[0]) + firstLetter(words[words.length - 1])
  ).toLocaleUpperCase();
}

/**
 * The first LETTER of a word, not its first code unit.
 *
 * `[...word][0]` iterates code points, so an accented or non-Latin first
 * character survives; a leading quote or bracket is stepped over rather than
 * printed as an initial.
 */
function firstLetter(word: string): string {
  for (const character of word) {
    if (/\p{L}/u.test(character)) return character;
  }
  return "";
}
