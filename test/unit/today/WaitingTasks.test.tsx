/**
 * V2.8 CONV-02 — `/today/waiting` renders the SHARED Task row, as behaviour.
 *
 * The Waiting surface used to draw a read-only generic Card with hand-built
 * props; it now renders `TaskRow` inside `TaskList`, hosted by the shared
 * `useTaskSurfaceActions`, departing through `useDepartingRows`, paging through
 * the shared keyset hook in `merge` mode. What this file proves, in order:
 *
 *   1. the rows are the shared row's anatomy, inside the shared list, with the
 *      waiting FACT on each — and with no Card, no drag grip and no selection
 *      control, because this scope switches those off through the row's own
 *      contract (see `WaitingTasks.tsx`);
 *   2. the overflow offers every action valid here and NOT "Plan for today";
 *   3. completion is ADR-086's optimistic patch through the canonical record
 *      route — painted before the answer, announced exactly once on success —
 *      and when the loader's fresh answer no longer holds the Task, the row
 *      LEAVES and the subtitle counts the server's answer, never a client
 *      decrement;
 *   4. a refused completion is put back exactly as it was;
 *   5. accumulated pages SURVIVE a mutation's revalidation (TASKS-09's rule,
 *      through the shared hook's `merge` mode), rather than collapsing to
 *      page one.
 *
 * The canonical posters are mocked at the module boundary, exactly as
 * `ProjectTasksTab.test.tsx` mocks them; nothing about the surface's own
 * reconciliation is stubbed.
 */

import { useLoaderData } from "react-router";
import { RouterProvider, createMemoryRouter } from "react-router";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WaitingTasks,
  type WaitingTasksProps,
} from "~/modules/today/task/WaitingTasks";
import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";
import { postTaskRecordActionOffline } from "~/shared/task-record/task-inline-edit";
import type { SerializedTaskListItem } from "~/shared/task-record/task-view";

vi.mock("~/shared/task-record/task-inline-edit", () => ({
  postTaskRecordActionOffline: vi.fn(async () => ({
    kind: "server" as const,
    data: { kind: "completion" as const, ok: true as const },
  })),
  postTaskRecordAction: vi.fn(async () => ({
    kind: "update" as const,
    status: "success" as const,
  })),
  postTaskBulkAction: vi.fn(async () => ({ ok: true as const, changed: 1 })),
  saveTaskRecordField: vi.fn(async () => ({ ok: true as const })),
  saveTaskBulkField: vi.fn(async () => ({ ok: true as const })),
}));

const TODAY = "2026-08-22";
const NOW_MS = Date.parse("2026-08-22T09:00:00.000Z");

function task(
  over: Partial<SerializedTaskListItem> = {},
): SerializedTaskListItem {
  return {
    id: "t1",
    title: "Await supplier sign-off",
    completedAt: null,
    status: "todo",
    priority: "p2",
    dueDate: null,
    scheduledDate: null,
    timeSector: null,
    commitmentState: "active",
    delegation: {
      to: "Sam",
      delegatedOn: "2026-08-10",
      followUpOn: TODAY,
      note: null,
    },
    recurrence: null,
    parent: { kind: "project", id: "p1", title: "Launch" },
    waiting: {
      since: "2026-08-10T09:00:00.000Z",
      subject: { kind: "text", note: "Sam Okafor" },
    },
    ...over,
  };
}

/** The pages the stub loader answers, mutable so a test can change the server's truth. */
interface Server {
  first: readonly SerializedTaskListItem[];
  firstCursor: string | null;
  pages: Record<
    string,
    { items: readonly SerializedTaskListItem[]; nextCursor: string | null }
  >;
  /** How many times page one has been read — a revalidation is the second. */
  reads?: number;
}

function renderWaiting(
  server: Server,
  followUp: WaitingTasksProps["followUp"] = null,
) {
  function Route() {
    const data = useLoaderData() as {
      items: readonly SerializedTaskListItem[];
      nextCursor: string | null;
    };
    return (
      <FeedbackProvider>
        <DrawerProvider renderDrawer={() => null}>
          <WaitingTasks
            items={data.items}
            nextCursor={data.nextCursor}
            followUp={followUp}
            nowMs={NOW_MS}
            todayIso={TODAY}
            parents={[{ id: "p1", kind: "project", title: "Launch" }]}
            failed={false}
          />
        </DrawerProvider>
      </FeedbackProvider>
    );
  }
  const router = createMemoryRouter(
    [
      {
        path: "/today/waiting",
        loader: ({ request }) => {
          const cursor = new URL(request.url).searchParams.get("cursor");
          if (cursor !== null) {
            return {
              items: server.pages[cursor]?.items ?? [],
              nextCursor: server.pages[cursor]?.nextCursor ?? null,
              failed: false,
            };
          }
          server.reads = (server.reads ?? 0) + 1;
          // A fresh array on every read, as a loader's JSON is over the wire:
          // a revalidation that changed nothing still delivers a NEW page one.
          return {
            items: [...server.first],
            nextCursor: server.firstCursor,
            failed: false,
          };
        },
        Component: Route,
      },
    ],
    { initialEntries: ["/today/waiting"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

const list = () => screen.findByRole("list", { name: "Waiting tasks" });

beforeEach(() => {
  vi.mocked(postTaskRecordActionOffline).mockClear();
});

describe("CONV-02 — the Waiting surface renders the shared Task row", () => {
  it("draws every waiting Task as the shared row, with its waiting fact, and no Card, grip or selection", async () => {
    renderWaiting({
      first: [
        task({ id: "t1", title: "Await supplier sign-off" }),
        task({
          id: "t2",
          title: "Chase the council",
          delegation: null,
          waiting: {
            since: "2026-08-20T09:00:00.000Z",
            subject: {
              kind: "entity",
              id: "person-1",
              type: "person",
              title: "Sarah Chen",
            },
          },
        }),
      ],
      firstCursor: null,
      pages: {},
    });
    const rows = within(await list()).getAllByTestId("task-row");
    expect(rows).toHaveLength(2);
    expect((await list()).closest(".dh-tasklist")).not.toBeNull();
    // The old anatomy is gone: no Card, no Card metadata run, no drag item —
    // and no selection control, because this scope does not select.
    expect(document.querySelector(".dh-card")).toBeNull();
    expect(document.querySelector(".dh-card__meta")).toBeNull();
    expect(document.querySelector("[data-dh-drag-item]")).toBeNull();
    expect(document.querySelector(".dh-taskrow__handle")).toBeNull();
    expect(screen.queryByTestId("task-select")).toBeNull();
    expect(screen.queryByRole("button", { name: /Select tasks/ })).toBeNull();

    const first = rows[0]!;
    // The row's own controls: completion, the open link, the inline editors,
    // the overflow — and exactly ONE checkbox-like control at rest.
    expect(
      within(first).getByRole("checkbox", {
        name: "Complete Await supplier sign-off",
      }),
    ).toBeInTheDocument();
    expect(within(first).getAllByRole("checkbox")).toHaveLength(1);
    expect(
      within(first).getByRole("link", { name: "Open Await supplier sign-off" }),
    ).toHaveAttribute("href", "/today/waiting?drawer=task%3At1");
    expect(within(first).getByTestId("task-row-priority")).toHaveTextContent(
      "P2",
    );
    expect(within(first).getByTestId("task-row-parent")).toHaveTextContent(
      "Launch",
    );
    expect(within(first).getByTestId("task-row-due-date")).toBeInTheDocument();
    expect(within(first).getByTestId("task-row-state")).toHaveTextContent(
      "Waiting",
    );
    expect(
      within(first).getByRole("button", {
        name: "More actions for Await supplier sign-off",
      }),
    ).toBeInTheDocument();

    // The waiting FACT, through the row's one slot: subject, since · elapsed,
    // and the follow-up state as a machine value and as words.
    expect(
      within(first).getByTestId("task-row-waiting-subject"),
    ).toHaveTextContent("Sam Okafor");
    expect(
      within(first).getByTestId("task-row-waiting-since"),
    ).toHaveTextContent("Since 10 Aug 2026 · 12 days");
    expect(within(first).getByTestId("task-row-follow-up")).toHaveTextContent(
      "Follow up due · Today",
    );
    expect(within(first).getByTestId("task-row-waiting")).toHaveAttribute(
      "data-follow-up-state",
      "due_today",
    );
    // The second row: an entity subject with its glyph, and no follow-up.
    const second = rows[1]!;
    expect(
      within(second).getByTestId("task-row-waiting-subject"),
    ).toHaveTextContent("Sarah Chen");
    expect(
      within(second)
        .getByTestId("task-row-waiting-subject")
        .querySelector("[data-entity='person']"),
    ).not.toBeNull();
    expect(within(second).queryByTestId("task-row-follow-up")).toBeNull();
    // The subtitle counts the LOADED population.
    expect(
      screen.getByText("2 tasks are waiting on someone or something else."),
    ).toBeInTheDocument();
  });

  it("offers every action valid in the Waiting scope, and not 'Plan for today'", async () => {
    renderWaiting({
      first: [
        task({
          id: "t1",
          title: "Await supplier sign-off",
          recurrence: {
            frequency: "week",
            interval: 1,
            dateKind: "due",
            mode: "fixed",
            weekdays: [],
            ordinal: null,
            weekendRule: "allow",
            endsAfterCount: null,
            endsOnDate: null,
            anchorDay: null,
            anchorMonth: null,
          },
          dueDate: "2026-08-25",
        }),
      ],
      firstCursor: null,
      pages: {},
    });
    await list();
    fireEvent.click(
      screen.getByRole("button", {
        name: "More actions for Await supplier sign-off",
      }),
    );
    for (const name of [
      "Rename",
      "Move to Project or Area…",
      "Move to Someday / Maybe",
      "Skip this occurrence",
      "Stop repeating",
      "Open task",
    ]) {
      expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    }
    // Today's day excludes waiting work, so the act is not offered here.
    expect(
      screen.queryByRole("menuitem", { name: "Plan for today" }),
    ).toBeNull();
    // The recurrence signal follows the row's own rule.
    expect(screen.getByTestId("task-row-repeat")).toHaveTextContent(
      "Repeats: Every week",
    );
  });
});

describe("CONV-02 — completion is the shared optimistic path, and membership is the server's", () => {
  it("paints the completion first, announces it once, and the row LEAVES when the loader no longer holds it", async () => {
    let release: () => void = () => {};
    vi.mocked(postTaskRecordActionOffline).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              kind: "server",
              data: { kind: "completion", ok: true },
            } as never);
        }),
    );
    const server: Server = {
      first: [
        task({ id: "t1", title: "Await supplier sign-off" }),
        task({ id: "t2", title: "Chase the council", delegation: null }),
      ],
      firstCursor: null,
      pages: {},
    };
    renderWaiting(server);
    const rows = within(await list()).getAllByTestId("task-row");
    const row = rows[0]!;
    fireEvent.click(
      within(row).getByRole("checkbox", {
        name: "Complete Await supplier sign-off",
      }),
    );
    // The row leads the server (ADR-086), through the canonical intent…
    expect(row).toHaveAttribute("data-completed", "true");
    expect(postTaskRecordActionOffline).toHaveBeenCalledWith(
      "t1",
      { intent: "complete" },
      { operation: "complete" },
    );
    // …and nothing has claimed success yet.
    expect(screen.getByRole("status")).toHaveTextContent("");

    // The SERVER's next answer: completion cleared the waiting state, so the
    // population no longer holds the Task. Membership is decided there.
    server.first = [server.first[1]!];
    await act(async () => {
      release();
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Completed Await supplier sign-off.",
      ),
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    // The row departs (DHDS-11) and the subtitle states the server's count.
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("list", { name: "Waiting tasks" }),
        ).queryAllByTestId("task-row"),
      ).toHaveLength(1),
    );
    expect(
      screen.getByText("1 task is waiting on someone or something else."),
    ).toBeInTheDocument();
  });

  it("puts a refused completion back exactly as it was", async () => {
    vi.mocked(postTaskRecordActionOffline).mockResolvedValueOnce({
      kind: "refused",
      message: "That task couldn’t be completed.",
    } as never);
    renderWaiting({
      first: [task({ id: "t1", title: "Await supplier sign-off" })],
      firstCursor: null,
      pages: {},
    });
    const row = within(await list()).getByTestId("task-row");
    fireEvent.click(
      within(row).getByRole("checkbox", {
        name: "Complete Await supplier sign-off",
      }),
    );
    expect(row).toHaveAttribute("data-completed", "true");
    await waitFor(() =>
      expect(row).not.toHaveAttribute("data-completed", "true"),
    );
    expect(screen.getByRole("status")).toHaveTextContent("");
    // Still a member: the server refused, so nothing departed.
    expect(within(await list()).getAllByTestId("task-row")).toHaveLength(1);
  });

  it("keeps the loaded pages when a mutation re-reads the list", async () => {
    const server: Server = {
      first: [
        task({ id: "t1", title: "First page one" }),
        task({ id: "t2", title: "First page two" }),
      ],
      firstCursor: "c1",
      pages: {
        c1: {
          items: [
            task({ id: "t3", title: "Second page one" }),
            task({ id: "t4", title: "Second page two" }),
          ],
          nextCursor: null,
        },
      },
    };
    renderWaiting(server);
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more waiting tasks" }),
    );
    await waitFor(
      () =>
        expect(
          within(
            screen.getByRole("list", { name: "Waiting tasks" }),
          ).getAllByTestId("task-row"),
        ).toHaveLength(4),
      { timeout: 5_000 },
    );

    // Complete a first-page row. The server's fresh page one no longer holds
    // it, and the row that was second slides up; the cursor moves with it.
    server.first = [server.first[1]!, server.pages.c1!.items[0]!];
    server.firstCursor = "c2";
    server.pages.c2 = { items: [server.pages.c1!.items[1]!], nextCursor: null };
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Complete First page one" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Completed First page one.",
      ),
    );
    // The accumulation SURVIVES: three rows, in order, none repeated, and the
    // owner is not dropped back to page one.
    await waitFor(() => {
      const titles = within(screen.getByRole("list", { name: "Waiting tasks" }))
        .getAllByTestId("task-row-open")
        .map((link) => link.textContent);
      expect(titles).toEqual([
        "First page two",
        "Second page one",
        "Second page two",
      ]);
    });
    expect(
      screen.queryByRole("button", { name: "Load more waiting tasks" }),
    ).toBeNull();
  });

  it("keeps an accepted change on a row the refreshed first page did not answer", async () => {
    const server: Server = {
      first: [
        task({ id: "t1", title: "First page one" }),
        task({ id: "t2", title: "First page two" }),
      ],
      firstCursor: "c1",
      pages: {
        c1: {
          items: [
            task({ id: "t3", title: "Second page one" }),
            task({ id: "t4", title: "Second page two" }),
          ],
          nextCursor: null,
        },
      },
    };
    const router = renderWaiting(server);
    fireEvent.click(
      await screen.findByRole("button", { name: "Load more waiting tasks" }),
    );
    await waitFor(
      () =>
        expect(
          within(
            screen.getByRole("list", { name: "Waiting tasks" }),
          ).getAllByTestId("task-row"),
        ).toHaveLength(4),
      { timeout: 5_000 },
    );

    // Complete a SECOND-page row. The server accepts; its fresh page one is
    // the same two rows it was, and says nothing about the row that changed.
    const row = within(
      screen.getByRole("list", { name: "Waiting tasks" }),
    ).getAllByTestId("task-row")[2]!;
    fireEvent.click(
      within(row).getByRole("checkbox", { name: "Complete Second page one" }),
    );
    expect(row).toHaveAttribute("data-completed", "true");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Completed Second page one.",
      ),
    );
    // The re-read arrived (the first page is a fresh array) and dropped the
    // guesses it ANSWERED — not the one it did not: the accepted completion is
    // still on the row, struck through, rather than snapped back to open.
    await waitFor(() => expect(server.reads).toBe(2));
    await waitFor(() => expect(router.state.revalidation).toBe("idle"));
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Waiting tasks" }))
          .getAllByTestId("task-row-open")
          .map((link) => link.textContent),
      ).toEqual([
        "First page one",
        "First page two",
        "Second page one",
        "Second page two",
      ]),
    );
    expect(
      within(
        screen.getByRole("list", { name: "Waiting tasks" }),
      ).getAllByTestId("task-row")[2],
    ).toHaveAttribute("data-completed", "true");
    expect(
      screen.getByRole("checkbox", { name: "Reopen Second page one" }),
    ).toBeChecked();
  });
});
