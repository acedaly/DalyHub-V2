/**
 * CONVERGE-01 §6 — the ONE tag chip.
 *
 * A tag is free text the owner invented. That single fact decides everything
 * about this component and is why it is not the `Badge` next door, whose own
 * header rules itself out in as many words: "a badge is a small, semantic label
 * for a value drawn from a SMALL CLOSED SET the reader is expected to
 * recognise… If the value is free text, or if every row has a different one, it
 * is not a badge." Tags are exactly that excluded case, and painting them in a
 * badge's semantic tones would say a tag has a STATE, which it does not.
 *
 * ── Why it is shared rather than a third copy ────────────────────────────────
 * The product already drew this twice, in two modules, with two radii —
 * `.dh-person-summary__tag` (`corner-extra-small`) and `.dh-asset-summary__tag`
 * (`corner-full`), otherwise identical. AGENTS.md §9.8 calls a bespoke duplicate
 * "Product Debt the moment it's merged", so Notes adopting a THIRD would have
 * been the wrong way to close this item. Both existing copies now render this,
 * which settles the radius question by having one answer to it.
 *
 * The stadium is the survivor: a tag is a label the eye counts rather than
 * reads word by word, and fully-rounded ends are what let a run of them read as
 * a run rather than as a row of small boxes.
 *
 * ── The list bounds itself ───────────────────────────────────────────────────
 * `TagChipList` takes a `max`, because a chip list inside a collection ROW has a
 * width and a note may carry twenty tags. Beyond the bound it draws one more
 * chip saying how many are not shown, and names the rest in that chip's own
 * accessible label — so the count is never a silent truncation, which is the
 * rule every bounded list in this product follows.
 */

import type { ReactNode } from "react";

export interface TagChipProps {
  /** The tag itself. Free text — never re-worded, never title-cased. */
  readonly children: ReactNode;
  /**
   * A fuller name for assistive tech, where the visible text is a shorthand
   * (the overflow chip's "+3" naming the three it stands for).
   */
  readonly label?: string;
  readonly className?: string;
}

export function TagChip({ children, label, className }: TagChipProps) {
  return (
    <span
      className={["dh-tagchip", className].filter(Boolean).join(" ")}
      {...(label ? { "aria-label": label } : {})}
    >
      {children}
    </span>
  );
}

export interface TagChipListProps {
  readonly tags: readonly string[];
  /**
   * Names the list for assistive tech. Required, because a bare run of chips
   * announced with no heading is a list of words with no subject.
   */
  readonly label: string;
  /** How many chips to draw before the overflow chip. Unbounded when absent. */
  readonly max?: number;
  readonly className?: string;
}

/**
 * A run of tags. Renders nothing at all when there are none — an absence is
 * drawn as an absence, never as an empty container that still costs a gap.
 */
export function TagChipList({ tags, label, max, className }: TagChipListProps) {
  if (tags.length === 0) return null;

  const shown = max === undefined ? tags : tags.slice(0, max);
  const hidden = tags.slice(shown.length);

  return (
    <ul
      className={["dh-tagchip-list", className].filter(Boolean).join(" ")}
      aria-label={label}
    >
      {shown.map((tag) => (
        <li key={tag}>
          <TagChip>{tag}</TagChip>
        </li>
      ))}
      {hidden.length > 0 ? (
        <li>
          <TagChip
            className="dh-tagchip--more"
            label={`${hidden.length} more: ${hidden.join(", ")}`}
          >
            {`+${hidden.length}`}
          </TagChip>
        </li>
      ) : null}
    </ul>
  );
}
