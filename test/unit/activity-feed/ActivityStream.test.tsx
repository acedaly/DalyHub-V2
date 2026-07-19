/**
 * DS-05 — the shared renderer's behaviour & accessibility.
 *
 * Proves: Timeline and Activity Feed are the SAME renderer; accessible feed
 * semantics; day headings; actor/subject presentation; semantic timestamps; entity
 * links open the DS-03 Drawer; DS-07 filtering; empty vs filtered-empty; loading /
 * error+retry / end states; unknown event type; unresolved subject; keyboard access;
 * and no unsafe payload dump.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import {
  parseActivityType,
  type ActivityActor,
  type ActivityPayload,
  type ActivityRecord,
} from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  ActivityDayHeading,
  ActivityFeed,
  ActivityStream,
  Timeline,
  createActivityDescriptorMap,
  createActivityFilterFields,
  toActivityItems,
  type ActivityStreamPage,
  type ActivityStreamProps,
  type ActivityTypeDescriptor,
  type EntityResolver,
} from "~/shared/activity-feed";
import { DrawerProvider } from "~/shared/drawer";
import type { DrawerEntry, DrawerRenderResult } from "~/shared/drawer";

const WS = parseWorkspaceId("ws-test");
const SYSTEM: ActivityActor = { type: "system", id: null };
const USER: ActivityActor = { type: "user", id: "u-1" };

const resolveEntity: EntityResolver = (entityId) => {
  if (entityId === "ghost") {
    return null;
  }
  return {
    entityId,
    entityType: "project",
    label: `Entity ${entityId}`,
    drawerKey: `project:${entityId}`,
  };
};

const DESCRIPTORS = createActivityDescriptorMap({
  "task.completed": {
    label: "Task completed",
    describe: (_b, ctx) => ({
      segments: [
        { kind: "actor" },
        { kind: "text", text: " completed " },
        ctx.primarySubject
          ? { kind: "entity", entityId: ctx.primarySubject.entityId }
          : { kind: "emphasis", text: "a task" },
      ],
    }),
  } as ActivityTypeDescriptor,
});

function rec(
  overrides: Partial<Omit<ActivityRecord, "type" | "workspaceId">> & {
    type?: string;
  },
): ActivityRecord {
  return {
    id: overrides.id ?? "evt-1",
    workspaceId: WS,
    type: parseActivityType(overrides.type ?? "entity.created"),
    actor: overrides.actor ?? SYSTEM,
    occurredAt: overrides.occurredAt ?? new Date("2026-07-19T10:00:00Z"),
    payload: overrides.payload ?? {},
    subjects: overrides.subjects ?? [{ entityId: "p1", role: "subject" }],
  };
}

function pageLoaderFor(
  records: readonly ActivityRecord[],
  anchorEntityId?: string,
) {
  const items = toActivityItems(records, {
    descriptors: DESCRIPTORS,
    resolveEntity,
    anchorEntityId,
  });
  return async (): Promise<ActivityStreamPage> => ({
    items,
    nextCursor: null,
    hasMore: false,
  });
}

function renderStream(
  props: Partial<ActivityStreamProps> & Pick<ActivityStreamProps, "loadPage">,
  options: {
    renderDrawer?: (entry: DrawerEntry) => DrawerRenderResult | null;
  } = {},
) {
  const renderDrawer =
    options.renderDrawer ??
    ((entry: DrawerEntry): DrawerRenderResult | null => ({
      title: `Drawer ${entry.key}`,
      children: <p>drawer body for {entry.key}</p>,
    }));
  return render(
    <MemoryRouter initialEntries={["/host"]}>
      <DrawerProvider renderDrawer={renderDrawer}>
        <ActivityStream ariaLabel="Activity" virtualization="off" {...props} />
      </DrawerProvider>
    </MemoryRouter>,
  );
}

describe("Timeline and Activity Feed are the same renderer", () => {
  it("renders events through the one shared item in both configurations", async () => {
    const records = [rec({ id: "a", type: "entity.created" })];
    const loadPage = pageLoaderFor(records);

    const feed = render(
      <MemoryRouter>
        <DrawerProvider renderDrawer={() => null}>
          <ActivityFeed loadPage={loadPage} virtualization="off" />
        </DrawerProvider>
      </MemoryRouter>,
    );
    await within(feed.container).findByRole("feed");
    expect(feed.container.querySelectorAll(".dh-activity-item")).toHaveLength(
      1,
    );
    feed.unmount();

    const timeline = render(
      <MemoryRouter>
        <DrawerProvider renderDrawer={() => null}>
          <Timeline loadPage={loadPage} virtualization="off" />
        </DrawerProvider>
      </MemoryRouter>,
    );
    await within(timeline.container).findByRole("feed");
    expect(
      timeline.container.querySelectorAll(".dh-activity-item"),
    ).toHaveLength(1);
  });
});

describe("ActivityDayHeading — accessible day-group heading", () => {
  it("renders a real heading at the requested level, in the a11y tree", () => {
    const view = render(<ActivityDayHeading label="Today" level={2} />);
    const heading = view.getByRole("heading", { level: 2, name: "Today" });
    expect(heading).toBeInTheDocument();
    expect(heading).not.toHaveAttribute("aria-hidden");
    view.unmount();

    render(<ActivityDayHeading label="19 July 2026" />);
    // Defaults to level 3 and remains labelled by its date text.
    expect(
      screen.getByRole("heading", { level: 3, name: "19 July 2026" }),
    ).toBeInTheDocument();
  });
});

describe("accessible structure", () => {
  it("exposes a labelled feed, accessible day headings and semantic timestamps", async () => {
    renderStream({
      loadPage: pageLoaderFor([
        rec({ id: "a", occurredAt: new Date("2026-07-19T10:00:00Z") }),
        rec({ id: "b", occurredAt: new Date("2026-07-18T10:00:00Z") }),
      ]),
    });

    const feed = await screen.findByRole("feed", { name: "Activity" });
    expect(feed).toBeInTheDocument();

    // Two day-group headings, in the accessibility tree at the default level 3,
    // each carrying the readable date (single naming source, no aria-hidden).
    const headings = within(feed).getAllByRole("heading", { level: 3 });
    expect(headings.length).toBe(2);
    expect(headings[0]).toHaveTextContent(/2026|Today|Yesterday|July/);

    // Semantic <time> with a machine datetime.
    const times = feed.querySelectorAll("time[datetime]");
    expect(times.length).toBe(2);
    expect(times[0].getAttribute("datetime")).toContain("2026-07-19");

    // Articles carry feed position semantics.
    const articles = within(feed).getAllByRole("article");
    expect(articles[0]).toHaveAttribute("aria-posinset", "1");
    expect(articles[0]).toHaveAttribute("aria-setsize", "2");
  });

  it("renders actor and a resolved subject", async () => {
    renderStream({
      loadPage: pageLoaderFor([
        rec({
          id: "a",
          actor: USER,
          subjects: [{ entityId: "p9", role: "subject" }],
        }),
      ]),
    });
    const article = await screen.findByRole("article");
    expect(within(article).getByText("Someone")).toBeInTheDocument();
    expect(within(article).getByText("Entity p9")).toBeInTheDocument();
  });
});

describe("entity links open the DS-03 Drawer", () => {
  it("a resolved subject is a keyboard-focusable drawer link", async () => {
    renderStream(
      {
        loadPage: pageLoaderFor([
          rec({ id: "a", subjects: [{ entityId: "p1", role: "subject" }] }),
        ]),
      },
      {
        renderDrawer: (entry) => ({
          title: "Opened",
          children: <p>opened {entry.key}</p>,
        }),
      },
    );
    const link = await screen.findByRole("link", { name: "Entity p1" });
    link.focus();
    expect(link).toHaveFocus();
    fireEvent.click(link);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("unknown type and unresolved subject", () => {
  it("renders an unknown event via the safe fallback with no JSON dump", async () => {
    renderStream({
      loadPage: pageLoaderFor([
        rec({
          id: "a",
          type: "widget.frobnicated",
          payload: { nested: { a: 1 }, list: [1, 2, 3] } as ActivityPayload,
        }),
      ]),
    });
    const article = await screen.findByRole("article");
    expect(within(article).getByText("Widget frobnicated")).toBeInTheDocument();
    expect(article).toHaveAttribute("data-known", "false");
    // No raw payload JSON anywhere.
    expect(article.textContent).not.toContain("nested");
    expect(article.textContent).not.toContain("[1,2,3]");
  });

  it("renders an unresolved subject without a link and without crashing", async () => {
    renderStream({
      loadPage: pageLoaderFor([
        rec({
          id: "a",
          type: "entity.deleted",
          subjects: [{ entityId: "ghost", role: "subject" }],
        }),
      ]),
    });
    const article = await screen.findByRole("article");
    expect(
      within(article).getByText("an unavailable item"),
    ).toBeInTheDocument();
    expect(within(article).queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("states", () => {
  it("shows the genuinely-empty state", async () => {
    renderStream({
      loadPage: async () => ({ items: [], nextCursor: null, hasMore: false }),
    });
    expect(await screen.findByText("No activity yet")).toBeInTheDocument();
  });

  it("shows an error and retries", async () => {
    let attempt = 0;
    const loadPage = vi.fn(async (): Promise<ActivityStreamPage> => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("boom");
      }
      return {
        items: toActivityItems([rec({ id: "a" })], { resolveEntity }),
        nextCursor: null,
        hasMore: false,
      };
    });
    renderStream({ loadPage });

    const retry = await screen.findByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    expect(await screen.findByRole("article")).toBeInTheDocument();
  });

  it("loads another page and shows the end-of-feed state", async () => {
    const first = toActivityItems([rec({ id: "a" })], { resolveEntity });
    const second = toActivityItems([rec({ id: "b" })], { resolveEntity });
    const loadPage = vi.fn(
      async (cursor: string | null): Promise<ActivityStreamPage> =>
        cursor === null
          ? { items: first, nextCursor: "1", hasMore: true }
          : { items: second, nextCursor: null, hasMore: false },
    );
    renderStream({ loadPage });

    const loadMore = await screen.findByRole("button", {
      name: /load more/i,
    });
    fireEvent.click(loadMore);
    await waitFor(() =>
      expect(screen.getByText(/reached the beginning/i)).toBeInTheDocument(),
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });
});

describe("DS-07 filtering — empty vs filtered-empty", () => {
  const fields = createActivityFilterFields({
    eventTypeOptions: [
      { value: "entity.created", label: "Created" },
      { value: "task.completed", label: "Task completed" },
    ],
  });

  it("applies the filter expression and distinguishes filtered-empty", async () => {
    const records = [
      rec({ id: "a", type: "entity.created" }),
      rec({
        id: "b",
        type: "task.completed",
        subjects: [{ entityId: "t1", role: "subject" }],
      }),
    ];
    const onClearFilters = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <DrawerProvider renderDrawer={() => null}>
          <ActivityStream
            ariaLabel="Activity"
            virtualization="off"
            loadPage={pageLoaderFor(records)}
            filterFields={fields}
            filterExpression={{ mode: "and", clauses: [] }}
            onClearFilters={onClearFilters}
          />
        </DrawerProvider>
      </MemoryRouter>,
    );
    // No filter → both events.
    await screen.findByRole("feed");
    expect(screen.getAllByRole("article")).toHaveLength(2);

    // A filter that matches nothing → filtered-empty with recovery.
    rerender(
      <MemoryRouter>
        <DrawerProvider renderDrawer={() => null}>
          <ActivityStream
            ariaLabel="Activity"
            virtualization="off"
            loadPage={pageLoaderFor(records)}
            filterFields={fields}
            filterExpression={{
              mode: "and",
              clauses: [
                {
                  id: "c1",
                  field: "activityType",
                  operator: "is",
                  value: "note.created",
                },
              ],
            }}
            onClearFilters={onClearFilters}
          />
        </DrawerProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("No activity matches your filters"),
    ).toBeInTheDocument();
    const clear = screen.getByRole("button", { name: /clear/i });
    fireEvent.click(clear);
    expect(onClearFilters).toHaveBeenCalled();
  });
});
