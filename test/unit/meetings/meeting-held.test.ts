/**
 * MEET-03 — the pure, React-free half of the meeting-held integration.
 *
 * Three things must be true before anything renders, and none of them needs a
 * database:
 *
 *   1. the Meetings manifest DECLARES `meeting.held` with a calm human label —
 *      that declaration alone is the whole People-side integration;
 *   2. the People timeline picks that label up from the FND-06 registry, with NO
 *      `describe` (so no payload metadata is ever rendered) and with no People
 *      code that knows anything about Meetings;
 *   3. `meeting.held` classifies as **Conversations** automatically, so it is
 *      filterable on arrival.
 *
 * It also guards the boundary itself: the People timeline module must not import
 * Meetings code, and no Meetings-specific branch may appear in it.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseActivityType,
  type ActivityActor,
  type ActivityRecord,
} from "~/kernel/activity";
import { MEETING_HELD, MEETING_ATTENDEE_SUBJECT_ROLE } from "~/kernel/meetings";
import { parseWorkspaceId } from "~/kernel/workspaces";
import meetingsModule from "~/modules/meetings/module";
import { MEETING_ACTIVITY_DESCRIPTORS } from "~/modules/meetings/meeting-activity";
import { buildPersonTimelineDescriptors } from "~/modules/people/person-activity";
import {
  PERSON_TIMELINE_CATEGORY_OPTIONS,
  personTimelineCategory,
} from "~/modules/people/person-timeline";
import {
  resolveActivityDescriptor,
  toActivityItem,
  type EntityResolver,
} from "~/shared/activity-feed/model";

const WS = parseWorkspaceId("ws-meeting-held");
const SYSTEM: ActivityActor = { type: "system", id: null };
const MEETING = "meeting-1";
const PERSON = "person-1";

function heldRecord(
  subjects: readonly { entityId: string; role: string }[] = [
    { entityId: MEETING, role: "subject" },
    { entityId: PERSON, role: MEETING_ATTENDEE_SUBJECT_ROLE },
  ],
): ActivityRecord {
  return {
    id: "evt-held",
    workspaceId: WS,
    type: parseActivityType(MEETING_HELD),
    actor: SYSTEM,
    occurredAt: new Date("2026-07-27T09:00:00Z"),
    payload: {
      source: "mark_held",
      startsAt: "2026-07-27T09:00:00.000Z",
      timezone: "Australia/Brisbane",
      attendeeCount: 1,
      attendeesRecorded: 1,
    },
    subjects,
  };
}

const resolve: EntityResolver = (id) =>
  id === MEETING
    ? { entityId: id, entityType: "meeting", label: "Weekly sync" }
    : { entityId: id, entityType: "person", label: "Ada" };

describe("the Meetings manifest declares the event", () => {
  it("registers meeting.held with a calm human label", () => {
    const declared = meetingsModule.activityTypes?.find(
      (t) => t.type === MEETING_HELD,
    );
    expect(declared).toBeDefined();
    expect(declared?.label).toBe("Meeting held");
    // The label is the only thing the People timeline consumes, so it must read
    // as product language, not a machine identifier.
    expect(declared?.label).not.toContain(".");
  });

  it("keeps every declared Meetings activity type in the meeting.* domain", () => {
    for (const type of meetingsModule.activityTypes ?? []) {
      expect(type.type.startsWith("meeting.")).toBe(true);
    }
  });
});

describe("the Meeting record's own Timeline line", () => {
  it("describes the event warmly, without any payload content", () => {
    const item = toActivityItem(heldRecord(), {
      descriptors: MEETING_ACTIVITY_DESCRIPTORS,
      resolveEntity: resolve,
      anchorEntityId: MEETING,
    });

    expect(item.isKnownType).toBe(true);
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("recorded this meeting as held");
    expect(item.presentation.metadata ?? []).toEqual([]);
    for (const key of ["mark_held", "attendeeCount", "Brisbane", "startsAt"]) {
      expect(text).not.toContain(key);
    }
  });
});

describe("the Person Timeline line comes from the registry", () => {
  const descriptors = buildPersonTimelineDescriptors(
    (meetingsModule.activityTypes ?? []).map((t) => ({
      type: t.type,
      label: t.label,
    })),
  );

  it("uses the manifest label and registers NO describe (the privacy boundary)", () => {
    const descriptor = descriptors[MEETING_HELD];
    expect(descriptor?.label).toBe("Meeting held");
    expect(descriptor?.describe).toBeUndefined();
  });

  it("renders a payload-free line naming the meeting, from the attendee's anchor", () => {
    const item = toActivityItem(heldRecord(), {
      descriptors,
      resolveEntity: resolve,
      anchorEntityId: PERSON,
    });

    expect(item.isKnownType).toBe(true);
    expect(item.presentation.metadata ?? []).toEqual([]);
    const text = item.presentation.segments
      .map((s) => ("text" in s ? s.text : ""))
      .join("");
    expect(text).toContain("Meeting held");
    for (const key of [
      "mark_held",
      "attendeeCount",
      "attendeesRecorded",
      "Brisbane",
    ]) {
      expect(text).not.toContain(key);
    }
    // The canonical Meeting record is referenced as a navigable entity segment,
    // never as copied content.
    expect(
      item.presentation.segments.some(
        (s) => s.kind === "entity" && s.entityId === MEETING,
      ),
    ).toBe(true);
  });

  it("still renders safely if the type were ever undeclared", () => {
    // DS-05's conservative fallback keeps the surface total even if a manifest
    // entry is removed — it must never throw and never dump the payload.
    const fallback = resolveActivityDescriptor(
      buildPersonTimelineDescriptors([]),
      MEETING_HELD,
    );
    expect(fallback.isKnown).toBe(false);
    expect(() =>
      toActivityItem(heldRecord(), {
        descriptors: buildPersonTimelineDescriptors([]),
        resolveEntity: resolve,
        anchorEntityId: PERSON,
      }),
    ).not.toThrow();
  });
});

describe("classification into the existing Conversations category", () => {
  const item = toActivityItem(heldRecord(), {
    descriptors: buildPersonTimelineDescriptors([
      { type: MEETING_HELD, label: "Meeting held" },
    ]),
    resolveEntity: resolve,
    anchorEntityId: PERSON,
  });

  it("classifies meeting.held as Conversations, automatically", () => {
    expect(personTimelineCategory(item)).toBe("meeting");
    expect(
      PERSON_TIMELINE_CATEGORY_OPTIONS.find((o) => o.value === "meeting")
        ?.label,
    ).toBe("Conversations");
  });

  it("classifies it by event-type DOMAIN, so it holds even unresolved", () => {
    const unresolved = toActivityItem(heldRecord(), {
      descriptors: {},
      resolveEntity: () => null,
      anchorEntityId: PERSON,
    });
    expect(personTimelineCategory(unresolved)).toBe("meeting");
  });

  it("classifies a meeting-only event (no attendees) as Conversations too", () => {
    const meetingOnly = toActivityItem(
      heldRecord([{ entityId: MEETING, role: "subject" }]),
      {
        descriptors: {},
        resolveEntity: resolve,
        anchorEntityId: MEETING,
      },
    );
    expect(personTimelineCategory(meetingOnly)).toBe("meeting");
  });
});

describe("the People module stayed free of Meetings knowledge", () => {
  const peopleTimelineSources = [
    "app/modules/people/person-timeline.ts",
    "app/modules/people/person-activity.ts",
    "app/modules/people/person-timeline-anchors.ts",
    "app/modules/people/PersonTimelineTab.tsx",
    "app/modules/people/routes/activity.tsx",
  ];

  /** Strip comments so the check is about CODE, not the prose that explains it. */
  function code(path: string): string {
    return readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it("imports no Meetings code and hard-codes no meeting identifier", () => {
    for (const path of peopleTimelineSources) {
      const source = code(path);
      expect(source, path).not.toContain("~/kernel/meetings");
      expect(source, path).not.toContain("~/modules/meetings");
      expect(source, path).not.toContain("meeting.held");
      expect(source, path).not.toContain("meeting.attendee");
    }
  });

  it("adds no Meetings-specific branch to the timeline classifier", () => {
    // The classifier keys on the event-type DOMAIN and the resolved entity type,
    // both of which are generic. `meeting` appears only as a category id/label —
    // never as a `meeting.*` event type or a Meetings module concept.
    const source = code("app/modules/people/person-timeline.ts");
    expect(source).not.toMatch(/meeting\.[a-z_]+/);
    expect(source).not.toContain("held");
  });
});
