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

/** What a row draws: the named attendees, and how many more there are. */
export interface MeetingRowAttendees {
  readonly names: readonly string[];
  /** Attendees beyond the named ones, so the row can say "+2" truthfully. */
  readonly more: number;
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
    // One more than the row names, so "+N" can be right about there being
    // more without another read — and bounded, so it never becomes one.
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
      more: Math.max(0, names.length - MEETING_ROW_ATTENDEE_LIMIT),
    });
  }
  return out;
}
