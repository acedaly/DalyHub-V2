/**
 * UNTITLED-13 — the ONE way a Person is drawn, on Untitled's own `Avatar`.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * DalyHub had two person marks and they disagreed about almost everything:
 *
 *   - `~/modules/people/PersonAvatar` — a `<span>` sized by INLINE STYLE
 *     (`inlineSize`/`blockSize`/`fontSize` computed from a pixel number), with
 *     its own radius, overflow, object-fit and initials tracking in
 *     `people.css`. Only People could reach it, because it lived in the module;
 *   - `MeetingContextRow`'s `.dh-meeting-context__mark` — a second disc at a
 *     different size, a different ground, a different weight and its own
 *     initials derivation, written in `meetings.css` because the first one was
 *     not reachable from Meetings.
 *
 * So the same person was a 44px tinted disc on `/people` and a 20px grey one on
 * their own meeting, and §34 of the brief is exactly this: one Person
 * representation, no meeting-specific avatar implementation.
 *
 * ── What is Untitled's, and what stays DalyHub's ────────────────────────────
 *
 * Untitled's `base/avatar` owns everything generic: the six-rung size scale,
 * the circle, the image treatment with its inner contrast border and its
 * `onError` fallback to initials, the initials type ramp, the placeholder
 * glyph, the status/badge slots and the focus ring it shows when the link
 * around it is focused. None of that is written here.
 *
 * DalyHub keeps exactly one thing Untitled has no role for: the **circle
 * accent** (UIX-05). A generated initials disc takes the identity tint of the
 * Person's CIRCLE — a pure function of the relationship the owner recorded, per
 * ADR-068 §5 — so a list of twenty People is a legible palette rather than
 * twenty identical discs. It is passed through Untitled's own
 * `contentClassName` API, which exists for precisely this, and it is six
 * `color-mix` rules in `people.css` rather than a parallel avatar.
 *
 * The accent is NEVER the information. The initials are the identity, the name
 * beside the mark is the accessible name, and a Person with no relationship
 * recorded gets the neutral disc because a colour that means nothing is worse
 * than no colour.
 */

import { Avatar } from "~/shared/ui/untitled/base/avatar/avatar";
import { areaAccentForRank } from "~/shared/pill";

import { initialsFromName } from "./person-initials";

/**
 * The sizes a Person mark is drawn at, from Untitled's own scale.
 *
 * Deliberately narrower than Untitled's six rungs, because a Person appears in
 * exactly three kinds of place and a fourth size would be a fourth decision:
 *
 *   - `xs` (24px) — inline beside a name, in a record header's context line or
 *     a participant chip;
 *   - `sm` (32px) — a dense row inside another record (a Meeting's attendee
 *     list, a Person's related records);
 *   - `md` (40px) — the People directory row, which is the size Untitled's own
 *     member tables use;
 *   - `2xl` (64px) — the identity band at the top of a Person record.
 */
export type PersonAvatarSize = "xs" | "sm" | "md" | "2xl";

export interface PersonAvatarProps {
  /**
   * The Person's display name. Used to derive initials when the caller has no
   * better answer, and never rendered as text — the mark is decorative and the
   * name is carried by the link or heading beside it.
   */
  readonly name: string;
  /**
   * Pre-derived initials, where the caller has the Person's stored name parts.
   * `person-view.ts` derives these from preferred/first + last, which is better
   * evidence than a display string; a surface that only holds a display title
   * (a Meeting attendee, an activity row) omits this and the display name is
   * used instead.
   */
  readonly initials?: string | null;
  readonly photoUrl?: string | null;
  readonly size?: PersonAvatarSize;
  /**
   * The Person's circle rank, from `personCircleRank`. `null` — no relationship
   * recorded, or a surface that does not resolve one — renders the neutral
   * disc.
   */
  readonly colourRank?: number | null;
  readonly className?: string;
}

export function PersonAvatar({
  name,
  initials,
  photoUrl,
  size = "md",
  colourRank = null,
  className,
}: PersonAvatarProps) {
  const letters =
    initials && initials.trim().length > 0 ? initials : initialsFromName(name);

  /*
   * A photograph takes no tint. It is the strongest identity a row can carry
   * and a coloured ring around it would only compete with it — the same rule
   * UIX-05 wrote for the original component, carried across unchanged.
   */
  const accent =
    photoUrl || colourRank === null
      ? undefined
      : `dh-person-avatar__accent dh-person-avatar__accent--${areaAccentForRank(colourRank)}`;

  return (
    <Avatar
      // The image is decorative: every caller renders the Person's name beside
      // it as the link text or the heading, so an `alt` here would announce the
      // name twice.
      alt=""
      src={photoUrl ?? undefined}
      initials={letters}
      size={size}
      // Untitled shows the mark's focus ring when an ancestor with `group` is
      // focused, which is how a whole-row link lights its own avatar.
      focusable
      className={
        className ? `dh-person-avatar ${className}` : "dh-person-avatar"
      }
      contentClassName={accent}
    />
  );
}
