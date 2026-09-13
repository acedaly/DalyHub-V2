import { MemoryRouter } from "react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseActivityType,
  type ActivityActor,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { DrawerProvider, type DrawerRenderResult } from "~/shared/drawer";
import {
  toActivityItems,
  type EntityResolver,
} from "~/shared/activity-feed/model";

import { PersonRecentActivity } from "~/modules/people/PersonRecentActivity";
import {
  buildPersonTimelineDescriptors,
  type PersonActivityPage,
  type SerializedPersonActivityItem,
} from "~/modules/people/person-activity";

/**
 * UNTITLED-13 — the Summary band shows INTERACTIONS, not record maintenance.
 *
 * The endpoint behind it is the Person's whole history: `listForEntities` takes
 * no type predicate and the descriptor map names `person.updated` on purpose, so
 * the Activity TAB can render an edit. That is right for the tab and wrong for a
 * five-row band that promises "meetings, notes, commitments and diary entries you
 * share" — a run of meeting autosaves would push every actual shared moment off
 * the visible rows.
 *
 * These drive the editorial rule and its one consequence: the band keeps only the
 * kernel's `INTERACTION_ACTIVITY_TYPES`, and a page filtered down to nothing is
 * chased rather than reported as "nothing shared yet".
 */

const WS = parseWorkspaceId("ws-person-recent-activity");
const SYSTEM: ActivityActor = { type: "system", id: null };
const PERSON_ID = "person-1";

const DESCRIPTORS = buildPersonTimelineDescriptors([
  { type: "task.completed", label: "Task completed" },
  { type: "meeting.held", label: "Meeting held" },
]);

const resolveEntity: EntityResolver = (entityId) => {
  if (entityId === PERSON_ID) {
    return { entityId, entityType: "person", label: "Ada Lovelace" };
  }
  if (entityId.startsWith("task-")) {
    return { entityId, entityType: "task", label: `Task ${entityId}` };
  }
  return { entityId, entityType: "meeting", label: `Meeting ${entityId}` };
};

function serializedItem(
  type: string,
  id: string,
  entityId: string,
  occurredAt: string,
): SerializedPersonActivityItem {
  const record: ActivityRecord = {
    id,
    workspaceId: WS,
    type: parseActivityType(type),
    actor: SYSTEM,
    occurredAt: new Date(occurredAt),
    payload: {},
    subjects: [{ entityId, role: "subject" }],
  };
  const [item] = toActivityItems([record], {
    descriptors: DESCRIPTORS,
    resolveEntity,
    anchorEntityId: PERSON_ID,
  });
  return { ...item, occurredAt: item.occurredAt.toISOString() };
}

function page(
  items: readonly SerializedPersonActivityItem[],
  nextCursor: string | null,
): PersonActivityPage {
  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    relatedRecordCount: items.length,
    relatedRecordsTruncated: false,
  };
}

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

const MAINTENANCE = (id: string, at: string) =>
  serializedItem("person.updated", id, PERSON_ID, at);
const INTERACTION = (id: string, at: string) =>
  serializedItem("task.completed", id, "task-9", at);

function renderBand() {
  const renderDrawer = (): DrawerRenderResult => ({
    title: "Task",
    children: <div>task drawer</div>,
  });
  return render(
    <MemoryRouter initialEntries={[`/person/${PERSON_ID}`]}>
      <DrawerProvider renderDrawer={renderDrawer}>
        <PersonRecentActivity
          personId={PERSON_ID}
          reloadKey="v1"
          allHref={`/person/${PERSON_ID}?tab=activity`}
        />
      </DrawerProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PersonRecentActivity", () => {
  it("shows interactions and leaves record maintenance to the Activity tab", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        page(
          [
            MAINTENANCE("e-edit", "2026-07-20T10:00:00.000Z"),
            INTERACTION("e-task", "2026-07-19T09:00:00.000Z"),
          ],
          null,
        ),
      ),
    );

    renderBand();

    const band = await screen.findByRole("group", {
      name: "Recent relationship activity",
    });
    await waitFor(() =>
      expect(within(band).getAllByRole("article")).toHaveLength(1),
    );
    expect(screen.getByText(/Task completed/)).toBeInTheDocument();
  });

  it("chases past a page of pure maintenance rather than claiming nothing is shared", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse(
          page([MAINTENANCE("e-edit-1", "2026-07-20T10:00:00.000Z")], "c1"),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          page([INTERACTION("e-task", "2026-07-18T09:00:00.000Z")], null),
        ),
      );

    renderBand();

    expect(await screen.findByText(/Task completed/)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // The endpoint's own cursor is passed through — the band never invents one.
    expect(String(fetchSpy.mock.calls[1]![0])).toContain("cursor=c1");
  });

  it("stops chasing after a bounded number of pages and says so honestly", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        jsonResponse(
          page(
            [MAINTENANCE(`e-${Math.random()}`, "2026-07-20T10:00:00.000Z")],
            "c-next",
          ),
        ),
      // A history that is nothing but maintenance must not turn one band into an
      // unbounded crawl; the empty state still teaches the next action.
    );

    renderBand();

    expect(
      await screen.findByText(/Nothing shared yet/, undefined, {
        timeout: 3000,
      }),
    ).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
