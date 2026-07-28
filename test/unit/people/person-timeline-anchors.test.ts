/**
 * PEOPLE-02 — resolving the Person Timeline's anchor set.
 *
 * The anchor set is what makes the timeline a RELATIONSHIP history rather than a
 * record log, so its rules are asserted directly against the kernel CONTRACT (a
 * fake `EntityLinkRepository`), independently of D1: the Person is always an
 * anchor, a record linked twice counts once, structural spine links never
 * contribute, a soft-deleted Person degrades to their own history instead of
 * failing, and a bounded set is reported as bounded — never silently capped.
 */

import { describe, expect, it } from "vitest";

import {
  EntityLinkEndpointNotFoundError,
  type EntityLinkPage,
  type EntityLinkRepository,
  type EntityLinkView,
} from "~/kernel/entity-links";
import { parseWorkspaceId } from "~/kernel/workspaces";

import {
  MAX_PERSON_TIMELINE_RELATED_RECORDS,
  resolvePersonTimelineAnchors,
} from "~/modules/people/person-timeline-anchors";

const WS = parseWorkspaceId("ws-person-anchors");
const PERSON = "person-1";

function view(counterpartId: string, type: string): EntityLinkView {
  const now = new Date("2026-07-20T10:00:00Z");
  return {
    link: {
      id: `link-${counterpartId}`,
      workspaceId: WS,
      sourceEntityId: counterpartId,
      targetEntityId: PERSON,
      type: type as EntityLinkView["link"]["type"],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
    direction: "incoming",
    counterpart: {
      id: counterpartId,
      workspaceId: WS,
      type: "note",
      title: `Note ${counterpartId}`,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    },
  };
}

/** A fake link repository serving fixed pages; only `listForEntity` is used. */
function fakeLinks(
  pages: readonly EntityLinkPage[] | (() => never),
): EntityLinkRepository {
  let call = 0;
  return {
    listForEntity: async (): Promise<EntityLinkPage> => {
      if (typeof pages === "function") {
        pages();
      }
      const fixed = pages as readonly EntityLinkPage[];
      const next = fixed[Math.min(call, fixed.length - 1)]!;
      call += 1;
      return next;
    },
  } as unknown as EntityLinkRepository;
}

function page(
  items: readonly EntityLinkView[],
  nextCursor: string | null = null,
): EntityLinkPage {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

describe("resolvePersonTimelineAnchors", () => {
  it("always anchors the Person first, even with no relationships", async () => {
    const anchors = await resolvePersonTimelineAnchors(
      fakeLinks([page([])]),
      PERSON,
    );
    expect(anchors.anchorIds).toEqual([PERSON]);
    expect(anchors.relatedIds).toEqual([]);
    expect(anchors.truncated).toBe(false);
  });

  it("adds each linked record once, whatever the relationship type", async () => {
    const anchors = await resolvePersonTimelineAnchors(
      fakeLinks([
        page([
          view("note-a", "link.related"),
          view("meeting-b", "meeting.attendee"),
          // The same record related a second way must not widen the set.
          view("note-a", "task.relates_to"),
        ]),
      ]),
      PERSON,
    );
    expect(anchors.relatedIds).toEqual(["note-a", "meeting-b"]);
    expect(anchors.anchorIds[0]).toBe(PERSON);
  });

  it("never anchors a structural spine link", async () => {
    const anchors = await resolvePersonTimelineAnchors(
      fakeLinks([
        page([
          view("project-1", "task.belongs_to_project"),
          view("note-a", "link.related"),
        ]),
      ]),
      PERSON,
    );
    expect(anchors.relatedIds).toEqual(["note-a"]);
  });

  it("degrades to the Person's own history when their record is deleted", async () => {
    const anchors = await resolvePersonTimelineAnchors(
      fakeLinks(() => {
        throw new EntityLinkEndpointNotFoundError();
      }),
      PERSON,
    );
    expect(anchors.anchorIds).toEqual([PERSON]);
    expect(anchors.truncated).toBe(false);
  });

  it("propagates an unexpected failure rather than showing a half-history", async () => {
    const boom = new Error("storage down");
    await expect(
      resolvePersonTimelineAnchors(
        fakeLinks(() => {
          throw boom;
        }),
        PERSON,
      ),
    ).rejects.toBe(boom);
  });

  it("bounds the set and REPORTS the bound", async () => {
    const many = Array.from(
      { length: MAX_PERSON_TIMELINE_RELATED_RECORDS + 5 },
      (_unused, index) => view(`note-${index}`, "link.related"),
    );
    const anchors = await resolvePersonTimelineAnchors(
      fakeLinks([page(many)]),
      PERSON,
    );
    expect(anchors.relatedIds).toHaveLength(
      MAX_PERSON_TIMELINE_RELATED_RECORDS,
    );
    expect(anchors.truncated).toBe(true);
    // The MOST RECENTLY LINKED records are kept (links arrive oldest-first), so a
    // long-standing relationship never crowds out this month's.
    expect(anchors.relatedIds.at(-1)).toBe(
      `note-${MAX_PERSON_TIMELINE_RELATED_RECORDS + 4}`,
    );
    expect(anchors.relatedIds).not.toContain("note-0");
  });

  it("reports the bound when the underlying scan is exhausted early", async () => {
    // Every page is full and always offers another: the scan bound stops it.
    const anchors = await resolvePersonTimelineAnchors(
      fakeLinks([page([view("note-a", "link.related")], "more")]),
      PERSON,
    );
    expect(anchors.truncated).toBe(true);
    expect(anchors.relatedIds).toEqual(["note-a"]);
  });
});
