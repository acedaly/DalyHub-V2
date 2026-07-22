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

import { ProjectActivityTab } from "~/modules/projects/ProjectActivityTab";
import {
  PROJECT_ACTIVITY_DESCRIPTOR_MAP,
  type ProjectActivityPage,
  type SerializedProjectActivityItem,
} from "~/modules/projects/project-activity";

/**
 * PROJ-04 — the project Activity tab as behaviour: it renders the SHARED DS-05
 * Timeline (a `role="feed"`), fetches pages from `/projects/:id/activity`, appends
 * the next page without losing what is loaded, de-duplicates across a page boundary,
 * recovers from a failed load with retry, opens a referenced task through the shared
 * Drawer trigger, and re-reads the first page when `reloadKey` changes (a mutation
 * revalidation) — never a Projects-only event list.
 */

const WS = parseWorkspaceId("ws-proj-activity-tab");
const SYSTEM: ActivityActor = { type: "system", id: null };
const PROJECT_ID = "pr-1";

/** A resolver mirroring the route: tasks open in the Drawer, the project is text. */
const resolveEntity: EntityResolver = (entityId) => {
  if (entityId === PROJECT_ID) {
    return { entityId, entityType: "project", label: "Website relaunch" };
  }
  return {
    entityId,
    entityType: "task",
    label: `Task ${entityId}`,
    drawerKey: `task:${entityId}`,
  };
};

function serializedItem(
  type: string,
  id: string,
  subjects: readonly { entityId: string; role: string }[],
  occurredAt: string,
): SerializedProjectActivityItem {
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
    descriptors: PROJECT_ACTIVITY_DESCRIPTOR_MAP,
    resolveEntity,
    anchorEntityId: PROJECT_ID,
  });
  return { ...item, occurredAt: item.occurredAt.toISOString() };
}

function page(
  items: readonly SerializedProjectActivityItem[],
  nextCursor: string | null,
): ProjectActivityPage {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as unknown as Response;
}

function renderTab(reloadKey?: string) {
  const renderDrawer = (): DrawerRenderResult => ({
    title: "Task",
    children: <div>task drawer</div>,
  });
  return render(
    <MemoryRouter initialEntries={["/projects/pr-1"]}>
      <DrawerProvider renderDrawer={renderDrawer}>
        <ProjectActivityTab projectId={PROJECT_ID} reloadKey={reloadKey} />
      </DrawerProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjectActivityTab", () => {
  it("renders the shared Timeline feed with the project's events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        page(
          [
            serializedItem(
              "project.completed",
              "e1",
              [{ entityId: PROJECT_ID, role: "subject" }],
              "2026-07-20T10:00:00.000Z",
            ),
            serializedItem(
              "entity.created",
              "e2",
              [{ entityId: PROJECT_ID, role: "subject" }],
              "2026-07-19T09:00:00.000Z",
            ),
          ],
          null,
        ),
      ),
    );

    renderTab();

    const feed = await screen.findByRole("feed", { name: "Project activity" });
    expect(feed).toBeInTheDocument();
    // Real event articles (not a bespoke list).
    expect(within(feed).getAllByRole("article").length).toBe(2);
    expect(screen.getByText(/Completed project/)).toBeInTheDocument();
  });

  it("appends the next page and de-duplicates across the boundary", async () => {
    const first = page(
      [
        serializedItem(
          "entity.updated",
          "e1",
          [{ entityId: PROJECT_ID, role: "subject" }],
          "2026-07-20T10:00:00.000Z",
        ),
      ],
      "cursor-2",
    );
    const second = page(
      [
        // e1 repeats (overlap) — it must not be duplicated.
        serializedItem(
          "entity.updated",
          "e1",
          [{ entityId: PROJECT_ID, role: "subject" }],
          "2026-07-20T10:00:00.000Z",
        ),
        serializedItem(
          "entity.created",
          "e2",
          [{ entityId: PROJECT_ID, role: "subject" }],
          "2026-07-19T09:00:00.000Z",
        ),
      ],
      null,
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(first))
      .mockResolvedValueOnce(jsonResponse(second));

    renderTab();

    const feed = await screen.findByRole("feed", { name: "Project activity" });
    expect(within(feed).getAllByRole("article").length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() =>
      expect(within(feed).getAllByRole("article").length).toBe(2),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second fetch carried the opaque cursor.
    const secondUrl = String(fetchMock.mock.calls[1]![0]);
    expect(secondUrl).toContain("cursor=cursor-2");
  });

  it("recovers from a failed initial load with retry", async () => {
    const good = page(
      [
        serializedItem(
          "entity.created",
          "e1",
          [{ entityId: PROJECT_ID, role: "subject" }],
          "2026-07-19T09:00:00.000Z",
        ),
      ],
      null,
    );
    vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(jsonResponse(good));

    renderTab();

    const retry = await screen.findByRole("button", { name: /try again/i });
    fireEvent.click(retry);

    expect(
      await screen.findByRole("feed", { name: "Project activity" }),
    ).toBeInTheDocument();
  });

  it("shows the calm empty state when the project has no events", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(page([], null)),
    );
    renderTab();
    expect(await screen.findByText(/No activity yet/i)).toBeInTheDocument();
  });

  it("renders a referenced task as a shared Drawer trigger, project as text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        page(
          [
            serializedItem(
              "entity_link.created",
              "e1",
              [
                { entityId: "t-9", role: "source" },
                { entityId: PROJECT_ID, role: "target" },
              ],
              "2026-07-20T10:00:00.000Z",
            ),
          ],
          null,
        ),
      ),
    );

    renderTab();

    await screen.findByRole("feed", { name: "Project activity" });
    // The referenced task is a keyboard-focusable Drawer trigger (an anchor deep
    // link that opens the shared Task Drawer on top of the project record).
    const taskLink = screen.getByRole("link", { name: /Task t-9/i });
    expect(taskLink).toBeInTheDocument();
    // The project itself (the anchor) is calm non-link text.
    expect(screen.getByText("Website relaunch")).toBeInTheDocument();
  });

  it("re-reads the first page when reloadKey changes (mutation revalidation)", async () => {
    const before = page(
      [
        serializedItem(
          "entity.created",
          "e1",
          [{ entityId: PROJECT_ID, role: "subject" }],
          "2026-07-19T09:00:00.000Z",
        ),
      ],
      null,
    );
    const after = page(
      [
        serializedItem(
          "project.completed",
          "e2",
          [{ entityId: PROJECT_ID, role: "subject" }],
          "2026-07-20T12:00:00.000Z",
        ),
        serializedItem(
          "entity.created",
          "e1",
          [{ entityId: PROJECT_ID, role: "subject" }],
          "2026-07-19T09:00:00.000Z",
        ),
      ],
      null,
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(before))
      .mockResolvedValueOnce(jsonResponse(after));

    const view = renderTab("2026-07-19T09:00:00.000Z");
    const feed = await screen.findByRole("feed", { name: "Project activity" });
    await waitFor(() =>
      expect(within(feed).getAllByRole("article").length).toBe(1),
    );

    // A mutation bumps the project's updatedAt → the reload key changes.
    view.rerender(
      <MemoryRouter initialEntries={["/projects/pr-1"]}>
        <DrawerProvider renderDrawer={() => null}>
          <ProjectActivityTab
            projectId={PROJECT_ID}
            reloadKey="2026-07-20T12:00:00.000Z"
          />
        </DrawerProvider>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        within(
          screen.getByRole("feed", { name: "Project activity" }),
        ).getAllByRole("article").length,
      ).toBe(2),
    );
    expect(screen.getByText(/Completed project/)).toBeInTheDocument();
  });
});
