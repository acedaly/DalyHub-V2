import { MemoryRouter } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

import { PersonTimelineTab } from "~/modules/people/PersonTimelineTab";
import {
  buildPersonTimelineDescriptors,
  type PersonActivityPage,
  type SerializedPersonActivityItem,
} from "~/modules/people/person-activity";

/**
 * PEOPLE-02 — the Person Timeline tab as BEHAVIOUR.
 *
 * It must be the ONE shared DS-05 Timeline (a `role="feed"`, real event
 * `article`s) reading the ONE `/person/:id/activity` endpoint, now carrying a
 * linked record's events alongside the Person's own; it must filter by
 * relationship category through the shared DS-07 bar with an honest
 * filtered-empty recovery; it must page, retry, teach the next action when empty,
 * and disclose a bounded relationship set rather than hiding it.
 */

const WS = parseWorkspaceId("ws-person-timeline-tab");
const SYSTEM: ActivityActor = { type: "system", id: null };
const PERSON_ID = "person-1";

const DESCRIPTORS = buildPersonTimelineDescriptors([
  { type: "task.completed", label: "Task completed" },
]);

const resolveEntity: EntityResolver = (entityId) => {
  if (entityId === PERSON_ID) {
    return { entityId, entityType: "person", label: "Ada Lovelace" };
  }
  if (entityId.startsWith("task-")) {
    return {
      entityId,
      entityType: "task",
      label: `Task ${entityId}`,
      drawerKey: `task:${entityId}`,
    };
  }
  return { entityId, entityType: "note", label: `Note ${entityId}` };
};

function serializedItem(
  type: string,
  id: string,
  subjects: readonly { entityId: string; role: string }[],
  occurredAt: string,
): SerializedPersonActivityItem {
  const record: ActivityRecord = {
    id,
    workspaceId: WS,
    type: parseActivityType(type),
    actor: SYSTEM,
    occurredAt: new Date(occurredAt),
    payload: {},
    subjects,
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
  extra: Partial<PersonActivityPage> = {},
): PersonActivityPage {
  return {
    items,
    nextCursor,
    hasMore: nextCursor !== null,
    relatedRecordCount: extra.relatedRecordCount ?? items.length,
    relatedRecordsTruncated: extra.relatedRecordsTruncated ?? false,
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response;
}

const PERSON_EVENT = () =>
  serializedItem(
    "person.updated",
    "e-person",
    [{ entityId: PERSON_ID, role: "subject" }],
    "2026-07-20T10:00:00.000Z",
  );

const TASK_EVENT = () =>
  serializedItem(
    "task.completed",
    "e-task",
    [{ entityId: "task-9", role: "subject" }],
    "2026-07-19T09:00:00.000Z",
  );

function renderTab(initialEntry = `/person/${PERSON_ID}?tab=activity`) {
  const renderDrawer = (): DrawerRenderResult => ({
    title: "Task",
    children: <div>task drawer</div>,
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DrawerProvider renderDrawer={renderDrawer}>
        <PersonTimelineTab personId={PERSON_ID} reloadKey="v1" />
      </DrawerProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PersonTimelineTab", () => {
  it("renders one shared Timeline feed carrying the Person’s AND a linked record’s events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(page([PERSON_EVENT(), TASK_EVENT()], null)),
    );

    renderTab();

    const feed = await screen.findByRole("feed", { name: "Person timeline" });
    expect(within(feed).getAllByRole("article")).toHaveLength(2);
    // There is exactly ONE history surface on the tab.
    expect(screen.getAllByRole("feed")).toHaveLength(1);
    expect(screen.getByText(/Task completed/)).toBeInTheDocument();
    // The linked record is referenced by identity, not copied.
    expect(screen.getByText(/Task task-9/)).toBeInTheDocument();
  });

  it("groups events under accessible day headings, newest first", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(page([PERSON_EVENT(), TASK_EVENT()], null)),
    );

    renderTab();
    await screen.findByRole("feed", { name: "Person timeline" });

    const headings = screen.getAllByRole("heading", { level: 3 });
    const dayHeadings = headings.map((heading) => heading.textContent);
    expect(dayHeadings).toEqual([
      "Monday, 20 July 2026",
      "Sunday, 19 July 2026",
    ]);
  });

  it("filters by relationship category and offers a clear-filters recovery", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(page([PERSON_EVENT(), TASK_EVENT()], null)),
    );

    renderTab(
      // The DS-07 URL contract: a category clause restricting to Commitments.
      `/person/${PERSON_ID}?tab=activity&fv=1&f=${encodeURIComponent('personTimelineCategory:is:"task"')}`,
    );

    const feed = await screen.findByRole("feed", { name: "Person timeline" });
    await waitFor(() =>
      expect(within(feed).getAllByRole("article")).toHaveLength(1),
    );
    expect(screen.getByText(/Task completed/)).toBeInTheDocument();
    expect(screen.queryByText(/updated the details for/)).toBeNull();
  });

  it("shows the filtered-empty recovery when nothing matches", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(page([PERSON_EVENT()], null)),
    );

    renderTab(
      `/person/${PERSON_ID}?tab=activity&fv=1&f=${encodeURIComponent('personTimelineCategory:is:"meeting"')}`,
    );

    expect(
      await screen.findByText(/No activity matches your filters/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear all filters/i }),
    ).toBeInTheDocument();
  });

  it("teaches the next action when there is no shared history yet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(page([], null, { relatedRecordCount: 0 })),
    );

    renderTab();

    expect(
      await screen.findByText(/No shared history yet/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Linked tab/)).toBeInTheDocument();
  });

  it("pages with an opaque cursor and de-duplicates across the boundary", async () => {
    const first = page([PERSON_EVENT()], "cursor-2");
    const second = page([PERSON_EVENT(), TASK_EVENT()], null);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second));

    renderTab();

    const feed = await screen.findByRole("feed", { name: "Person timeline" });
    expect(within(feed).getAllByRole("article")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() =>
      expect(within(feed).getAllByRole("article")).toHaveLength(2),
    );
    expect(String(fetchMock.mock.calls[1]![0])).toContain("cursor=cursor-2");
  });

  it("recovers from a failed load with a retry", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, false))
      .mockResolvedValueOnce(jsonResponse(page([PERSON_EVENT()], null)));

    renderTab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Couldn’t load activity/,
    );
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await screen.findByRole("feed", { name: "Person timeline" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("discloses a bounded relationship set instead of silently capping it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        page([PERSON_EVENT()], null, {
          relatedRecordCount: 40,
          relatedRecordsTruncated: true,
        }),
      ),
    );

    renderTab();

    expect(
      await screen.findByText(/more linked records than one timeline reads/),
    ).toBeInTheDocument();
    expect(screen.getByText(/covers 40 of them/)).toBeInTheDocument();
  });

  it("does not claim a bound when the whole history is shown", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(page([PERSON_EVENT()], null)),
    );

    renderTab();
    await screen.findByRole("feed", { name: "Person timeline" });
    expect(screen.queryByText(/more linked records/)).toBeNull();
  });
});
