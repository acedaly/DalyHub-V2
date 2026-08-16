/**
 * TODAY-11 — the Daily reflection card's model (pure, React-free, clock-free).
 *
 * `MOCKUP 5.png` closes Today with a small card headed "Daily reflection",
 * carrying the prompt "What went well today?" and, beneath it, two lines of the
 * day's own writing with a link to the rest.
 *
 * DalyHub can back that honestly, because Diary is a real module with real
 * entries and a real capture panel. What it must NOT do is judge: there is no
 * sentiment analysis here, no AI, no "great day!" and no streak. The card is a
 * DOORWAY — it shows the opening of what the owner wrote, or it invites them to
 * write, and either way the destination is the Diary that owns the record.
 *
 * ── Why an excerpt is computed rather than rendered ─────────────────────────
 * A Diary body is Markdown (ADR-006). Rendering it here would put a second
 * Markdown surface on Today — with its own sanitising, its own typography and
 * its own link behaviour — for two lines of preview. So the body is reduced to
 * PLAIN TEXT instead: the same choice Search makes for its result subtitles, and
 * for the same reason. Nothing is rendered as HTML, so nothing here can be an
 * injection surface (AGENTS.md §17).
 */

/** How much of the entry the card shows before it stops. Two comfortable lines. */
export const REFLECTION_EXCERPT_MAX = 180;

/** The day's reflection, as the screen draws it. JSON-safe. */
export interface TodayReflection {
  readonly id: string;
  /** The entry's title — the entity title, always present. */
  readonly title: string;
  /** The opening of the body as plain text, or null when the entry has none. */
  readonly excerpt: string | null;
  /** The owner-facing name of the kind of moment this is, when it has one. */
  readonly entryTypeLabel: string | null;
}

/**
 * Reduce a Markdown source to the plain prose a preview can show.
 *
 * Deliberately a small, total, dependency-free reduction rather than a parse:
 * it removes the constructs that would read as noise in two lines — fences,
 * headings, list bullets, quote marks, emphasis runs, image and link syntax —
 * and leaves everything else exactly as the owner wrote it. It never rewrites
 * words and never re-orders them; a construct it does not know about survives as
 * its own characters, which is the honest failure mode for a preview.
 */
export function reflectionExcerpt(
  body: string | null,
  limit: number = REFLECTION_EXCERPT_MAX,
): string | null {
  if (body === null) return null;
  const plain = body
    // Fenced code is structure, not prose, and a fence marker in a preview is
    // three backticks of nothing.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    // An image contributes no readable text at all; a link contributes its text.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Leading block markers: headings, quotes, bullets, ordered items.
    .replace(/^[ \t]*(?:#{1,6}|>|[-*+]|\d+\.)[ \t]+/gm, "")
    // Horizontal rules, which otherwise survive as a row of dashes.
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, " ")
    // Emphasis runs. The characters go; the words they wrapped stay.
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length === 0) return null;
  if (plain.length <= limit) return plain;
  /*
   * Cut on a WORD boundary, and say that it was cut.
   *
   * A preview that stops mid-word looks like a rendering fault, and one that
   * stops without an ellipsis reads as the whole entry — which would make a
   * long reflection look like a short one.
   */
  const cut = plain.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  const head = (
    lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut
  ).replace(/[\s,;:.!?—–-]+$/, "");
  return `${head}…`;
}
