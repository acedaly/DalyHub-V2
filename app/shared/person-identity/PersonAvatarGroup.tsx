/**
 * UNTITLED-13 — a set of People as one mark, from Untitled's own avatar-group
 * grammar.
 *
 * The composition is `informational-02/10`'s event panel, studied from its
 * screenshot: a short run of OVERLAPPING circular marks, each ringed in the
 * page ground so the overlap reads as depth rather than as a smear, an overflow
 * disc carrying "+N", and a quiet caption beneath naming how many there are.
 * That template is Pro and its source is not retrievable in this environment
 * (`get_component` answers with the lock and a CLI command), so what is adopted
 * is the COMPOSITION; every pixel of every mark inside it is the genuine
 * vendored `base/avatar`.
 *
 * ── Why the names are still in the DOM ──────────────────────────────────────
 *
 * A row of discs is a picture of a set, and a picture is not an answer to "who
 * is in this meeting?". So the group is a real labelled list whose items carry
 * each Person's NAME — visually hidden when the group is drawn as marks alone —
 * and the overflow disc states its count in words. A screen reader hears
 * "Attendees, list, 5 items: Alexandra Lee, Priya Raman, …"; a sighted reader
 * sees five faces and a caption. Neither is given the other's version.
 *
 * ── Why this is not Untitled's `AvatarGroup` ────────────────────────────────
 *
 * There isn't one. `avatar-group` is not a component in Untitled's catalogue —
 * the API answers 404 for it — and the templates that show grouped avatars
 * compose `Avatar` with negative margins inline. This is that composition,
 * named once, rather than each surface repeating the margin arithmetic.
 */

import type { ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

import { PersonAvatar, type PersonAvatarSize } from "./PersonAvatar";

/** One Person in a group. Everything except `name` is optional context. */
export interface PersonAvatarGroupMember {
  readonly id: string;
  readonly name: string;
  readonly initials?: string | null;
  readonly photoUrl?: string | null;
  readonly colourRank?: number | null;
  /** Where this Person's record is, when the surface links its marks. */
  readonly href?: string;
}

export interface PersonAvatarGroupProps {
  readonly members: readonly PersonAvatarGroupMember[];
  /** The list's accessible name — "Attendees", "People in this project". */
  readonly label: string;
  /**
   * How many marks are drawn before the group starts counting instead.
   *
   * Four is the default for the same reason `MeetingContextRow` chose it: it
   * covers the great majority of real meetings and still fits one line beside a
   * date at the narrowest desktop width.
   */
  readonly max?: number;
  readonly size?: Extract<PersonAvatarSize, "xs" | "sm" | "md">;
  /**
   * Where "+N" leads. Given a href the overflow disc is a link; without one it
   * is inert text, which is the honest rendering when there is nowhere to send
   * the reader.
   */
  readonly overflowHref?: string;
  /** A quiet line under the marks — "5 attendees", "3 people". */
  readonly caption?: ReactNode;
  readonly className?: string;
}

/**
 * The overlap, per rung.
 *
 * Each mark is pulled back over the one before it by about a quarter of its own
 * width — Untitled's own proportion in every template that groups avatars — and
 * every mark carries a 2px ring in the PAGE ground so the edge reads. The ring
 * is `ring-bg-primary` rather than white, so it is correct in dark appearance
 * without a second rule.
 */
const OVERLAP: Record<"xs" | "sm" | "md", string> = {
  xs: "-ml-1.5",
  sm: "-ml-2",
  md: "-ml-2.5",
};

const OVERFLOW_SIZE: Record<"xs" | "sm" | "md", string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
};

export function PersonAvatarGroup({
  members,
  label,
  max = 4,
  size = "sm",
  overflowHref,
  caption,
  className,
}: PersonAvatarGroupProps) {
  if (members.length === 0) return null;

  const shown = members.slice(0, max);
  const hidden = members.length - shown.length;

  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <ul
        className="m-0 flex list-none items-center p-0"
        aria-label={label}
        data-testid="person-avatar-group"
      >
        {shown.map((member, index) => (
          <li
            key={member.id}
            className={cx(
              "relative",
              // The first mark sits flush; every later one overlaps its
              // predecessor. `z-index` descends so the leftmost face is on top,
              // which is the reading direction.
              index > 0 && OVERLAP[size],
            )}
            style={{ zIndex: shown.length - index }}
          >
            <MemberMark member={member} size={size} />
            <span className="dh-visually-hidden">{member.name}</span>
          </li>
        ))}
        {hidden > 0 ? (
          <li className={cx("relative", OVERLAP[size])} style={{ zIndex: 0 }}>
            <OverflowMark count={hidden} size={size} href={overflowHref} />
          </li>
        ) : null}
      </ul>
      {caption ? <p className="m-0 text-xs text-tertiary">{caption}</p> : null}
    </div>
  );
}

function MemberMark({
  member,
  size,
}: {
  readonly member: PersonAvatarGroupMember;
  readonly size: "xs" | "sm" | "md";
}) {
  const mark = (
    <PersonAvatar
      name={member.name}
      initials={member.initials}
      photoUrl={member.photoUrl}
      colourRank={member.colourRank}
      size={size}
      className="ring-2 ring-bg-primary"
    />
  );
  if (!member.href) return mark;
  return (
    /*
     * A real anchor around the mark, with the NAME as its accessible name —
     * middle-click, ⌘-click and "copy link address" all behave, which a click
     * handler on a `<span>` would not. `group` is what lets Untitled's own
     * `focusable` avatar draw its focus ring from the link's focus.
     */
    <a
      href={member.href}
      className="group block rounded-full outline-hidden"
      aria-label={member.name}
    >
      {mark}
    </a>
  );
}

function OverflowMark({
  count,
  size,
  href,
}: {
  readonly count: number;
  readonly size: "xs" | "sm" | "md";
  readonly href?: string;
}) {
  const body = (
    <>
      <span aria-hidden="true">+{count}</span>
      <span className="dh-visually-hidden">{`${count} more`}</span>
    </>
  );
  const shape = cx(
    "inline-flex shrink-0 items-center justify-center rounded-full bg-tertiary font-semibold text-quaternary ring-2 ring-bg-primary",
    OVERFLOW_SIZE[size],
  );
  return href ? (
    <a
      href={href}
      className={cx(
        shape,
        "outline-focus-ring transition duration-100 ease-linear hover:bg-quaternary focus-visible:outline-2 focus-visible:outline-offset-2",
      )}
    >
      {body}
    </a>
  ) : (
    <span className={shape}>{body}</span>
  );
}
