/**
 * DEBT-124 — the attendees of a PAGE of Meetings, in one bounded read.
 *
 * UIX-04 §25 lists "People / Project context" among what a meeting row may
 * show, and the collection could not show it. Not because it was undesirable —
 * the record answers "with whom" properly — but because the kernel published
 * only `listForEntity`, so a page of thirty rows meant thirty queries, and the
 * collection correctly did without rather than write them.
 *
 * `listForEntities` is the batched read that removes the choice. This module is
 * the small projection over it: the ACTIVE `meeting.attendee` links for each
 * meeting on the page, as the counterpart Person's title, bounded per meeting
 * and ordered as the kernel orders them.
 *
 * It stays a module-level projection rather than a repository method for the
 * reason the module boundary exists: "which links are attendees" is Meetings'
 * knowledge, and the batched relationship read is the kernel's.
 */

import { MEETING_ATTENDEE_LINK } from "~/kernel/meetings";
import type { EntityLinkRepository } from "~/kernel/entity-links";

/**
 * How many attendees a ROW names before it says "+N".
 *
 * Three, measured against the row's own metadata line: it is enough to
 * recognise a meeting by who is in it, and few enough that the line still fits
 * the time, the duration and the place at 393px.
 */
export const MEETING_ROW_ATTENDEE_LIMIT = 3;

/** What a row draws: the named attendees, and whether there are more. */
export interface MeetingRowAttendees {
  readonly names: readonly string[];
  /**
   * Whether attendees exist beyond the named ones. NOT a count: the read is
   * bounded at `MEETING_ROW_ATTENDEE_LIMIT + 1`, so a count derived from it
   * would say "+1" for a meeting of ten. See `loadMeetingRowAttendees`.
   */
  readonly hasMore: boolean;
}

/**
 * Resolve every meeting's attendees for one page.
 *
 * ONE read for the page (see `listForEntities`), never one per meeting. A
 * failure is the CALLER's to handle: a collection that cannot resolve context
 * should draw rows without it rather than fail the page, and saying so here
 * would hide the decision inside a helper.
 */
export async function loadMeetingRowAttendees(
  links: EntityLinkRepository,
  meetingIds: readonly string[],
): Promise<ReadonlyMap<string, MeetingRowAttendees>> {
  const byMeeting = await links.listForEntities(meetingIds, {
    type: MEETING_ATTENDEE_LINK,
    direction: "outgoing",
    // One more than the row names, so the row can say THAT there are more
    // without another read — and bounded, so it never becomes one. It cannot
    // say HOW MANY, and the type below is why that is not a temptation.
    limitPerEntity: MEETING_ROW_ATTENDEE_LIMIT + 1,
  });

  const out = new Map<string, MeetingRowAttendees>();
  for (const [meetingId, views] of byMeeting) {
    const names = views
      .map((view) => view.counterpart.title)
      .filter((title) => title.length > 0);
    if (names.length === 0) continue;
    out.set(meetingId, {
      names: names.slice(0, MEETING_ROW_ATTENDEE_LIMIT),
      /*
       * A BOOLEAN, not a count, and the distinction is the whole point.
       *
       * This read is bounded at `MEETING_ROW_ATTENDEE_LIMIT + 1`, so a meeting
       * with ten attendees returns four rows and a count would render "+1" —
       * a number that is simply false. Found by review on PR #226, which is
       * exactly right: the bounded result can say truthfully that there ARE
       * more, and nothing about how many.
       *
       * The honest alternatives were a second aggregate read per page (which
       * is what DEBT-124 exists to avoid) or a `COUNT(*)` window in the same
       * statement. The second is the right answer if a real number is ever
       * wanted; a row that says "and others" is the right answer today.
       */
      hasMore: names.length > MEETING_ROW_ATTENDEE_LIMIT,
    });
  }
  return out;
}
