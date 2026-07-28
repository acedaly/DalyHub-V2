import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import {
  parseActivityType,
  type ActivityActor,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { ActivityEventItem } from "~/shared/activity-feed";
import {
  createActivityDescriptorMap,
  defaultActivityDateFormatter,
  selectReferenceSubject,
  toActivityItem,
  type ActivityDescriptorContext,
  type ActivityItemSubject,
  type EntityResolver,
} from "~/shared/activity-feed/model";
import { DrawerProvider } from "~/shared/drawer";
import { entityDestination } from "~/shared/entity/destination";

/**
 * DS-05 — which record a calm, label-only event line REFERS TO, and how that
 * reference is rendered.
 *
 * Both halves were exposed by MEET-03: a Person's unified timeline now carries
 * MULTI-SUBJECT cross-module events (`meeting.held` names the Meeting AND each
 * attendee), and it must both name the right record and offer a real route to it.
 *
 *   - `selectReferenceSubject` prefers the subject that is NOT the anchor, so an
 *     event on Ada's page links the meeting rather than Ada.
 *   - `DefaultEntityLink` renders a Drawer trigger, an ordinary link, or plain
 *     text, driven by the ONE shared destination helper.
 */

const WS = parseWorkspaceId("ws-ds05-reference");
const SYSTEM: ActivityActor = { type: "system", id: null };
const MEETING = "meeting-1";
const PERSON = "person-1";
const TASK = "task-1";
const DIARY = "diary-1";

function subject(
  entityId: string,
  role: string,
  isAnchor: boolean,
): ActivityItemSubject {
  return { entityId, role, isAnchor, entity: null };
}

function context(
  subjects: readonly ActivityItemSubject[],
  primary: ActivityItemSubject | null,
): ActivityDescriptorContext {
  return {
    actorLabel: "Someone",
    primarySubject: primary,
    subjects,
    subjectByRole: (role) => subjects.find((s) => s.role === role) ?? null,
  };
}

describe("selectReferenceSubject", () => {
  it("prefers the non-anchor subject-role record over the anchor", () => {
    const anchor = subject(PERSON, "attendee", true);
    const meeting = subject(MEETING, "subject", false);
    expect(
      selectReferenceSubject(context([anchor, meeting], anchor))?.entityId,
    ).toBe(MEETING);
  });

  it("falls back to any non-anchor subject when none has the subject role", () => {
    const anchor = subject(PERSON, "target", true);
    const other = subject(MEETING, "source", false);
    expect(
      selectReferenceSubject(context([anchor, other], anchor))?.entityId,
    ).toBe(MEETING);
  });

  it("keeps the primary subject when the anchor is the ONLY subject", () => {
    const anchor = subject(PERSON, "subject", true);
    expect(selectReferenceSubject(context([anchor], anchor))?.entityId).toBe(
      PERSON,
    );
  });

  it("is unchanged for an event the anchor is not a subject of", () => {
    const note = subject("note-1", "subject", false);
    expect(selectReferenceSubject(context([note], note))?.entityId).toBe(
      "note-1",
    );
  });

  it("returns null for an event with no subjects at all", () => {
    expect(selectReferenceSubject(context([], null))).toBeNull();
  });
});

const DESCRIPTORS = createActivityDescriptorMap({
  "meeting.held": { label: "Meeting held" },
});

function record(
  subjects: readonly { entityId: string; role: string }[],
): ActivityRecord {
  return {
    id: "evt-1",
    workspaceId: WS,
    type: parseActivityType("meeting.held"),
    actor: SYSTEM,
    occurredAt: new Date("2026-07-27T09:00:00Z"),
    payload: {},
    subjects,
  };
}

const LABELS: Readonly<Record<string, { type: string; label: string }>> = {
  [MEETING]: { type: "meeting", label: "Weekly sync" },
  [PERSON]: { type: "person", label: "Ada" },
  [TASK]: { type: "task", label: "Send the notes" },
  [DIARY]: { type: "diary", label: "Tuesday" },
};

/** Resolve exactly as a product route does — through the shared helper. */
const resolve: EntityResolver = (id) => {
  const known = LABELS[id];
  if (!known) return null;
  const destination = entityDestination(known.type, id);
  return {
    entityId: id,
    entityType: known.type,
    label: known.label,
    ...(destination?.kind === "drawer"
      ? { drawerKey: destination.drawerKey }
      : {}),
    ...(destination?.kind === "route" ? { href: destination.to } : {}),
  };
};

function renderItem(
  subjects: readonly { entityId: string; role: string }[],
  anchorEntityId: string,
) {
  const item = toActivityItem(record(subjects), {
    descriptors: DESCRIPTORS,
    resolveEntity: resolve,
    anchorEntityId,
  });
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        // The shared Drawer provider is present exactly as it is on a real
        // record, so a Task reference resolves its Drawer trigger.
        <DrawerProvider renderDrawer={() => null}>
          <ActivityEventItem
            item={item}
            formatter={defaultActivityDateFormatter}
          />
        </DrawerProvider>
      ),
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("rendering an entity reference", () => {
  it("links a page-backed record to its canonical route", () => {
    renderItem(
      [
        { entityId: MEETING, role: "subject" },
        { entityId: PERSON, role: "attendee" },
      ],
      PERSON,
    );

    const link = screen.getByRole("link", { name: "Weekly sync" });
    expect(link).toHaveAttribute("href", "/meeting/meeting-1");
    // The anchor Person is NOT what the line links back to.
    expect(screen.queryByRole("link", { name: "Ada" })).not.toBeInTheDocument();
  });

  it("keeps a Task on the shared Drawer, not a page route", () => {
    renderItem(
      [
        { entityId: TASK, role: "subject" },
        { entityId: PERSON, role: "attendee" },
      ],
      PERSON,
    );

    // The shared DS-03 Drawer trigger is a real deep-link, not a page route:
    // a Task opens over the current context, per the app-wide convention.
    const trigger = screen.getByRole("link", { name: "Send the notes" });
    expect(trigger).toHaveAttribute("href", "/?drawer=task%3Atask-1");
  });

  it("renders plain text for a type with no genuine destination", () => {
    renderItem([{ entityId: DIARY, role: "subject" }], DIARY);

    expect(screen.getByText("Tuesday")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("degrades calmly when the record cannot be resolved at all", () => {
    renderItem([{ entityId: "vanished", role: "subject" }], "vanished");

    expect(screen.getByText("an unavailable item")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
