/**
 * V2.8 CONV-02 / ADR-115 decision 3 — a REFERENCE to a Task is a link, not a
 * row.
 *
 * Four surfaces name a Task without being a place the Task is worked: a search
 * result, a `/views` row, a Meeting's follow-up row and the next-action line.
 * Each carries a title, a destination and at most the shared signal primitives
 * (`PriorityIndicator`, `UrgencyChip`); none may grow a completion control, a
 * Task overflow menu, an inline editor or a metadata run — that would be a
 * third anatomy, and the fork this programme exists to close.
 *
 * Asserted by BEHAVIOUR, in the product's own control names rather than CSS
 * classes: each surface is rendered with a Task on it and asked whether it
 * offers the row's two defining controls. The structural half (no import of
 * the row or its editors) is in `shared-row-consumers.test.ts`.
 *
 * Falsified: giving any one of these a completion checkbox named
 * `Complete <title>` or a `More actions for <title>` menu fails exactly its
 * block below.
 */

import { MemoryRouter, createRoutesStub } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SerializedTaskView } from "~/shared/task-record/task-view";
import { DrawerProvider } from "~/shared/drawer";
import { NextActionLine } from "~/shared/task-record/NextActionLine";
import SearchSurface from "~/shared/search/SearchSurface";
import { assembleOutcome } from "~/shared/search/model";
import type { SearchFn } from "~/shared/search/client";
import type { SearchResultItem } from "~/shared/search/model";
import { MeetingFollowUpTab } from "~/modules/meetings/MeetingFollowUp";
import { ViewsWorkspace } from "~/modules/views/ViewsWorkspace";
import type { ViewsPageData } from "~/modules/views/views-contract";
import type { CrossViewResultDetail } from "~/kernel/views";

const TITLE = "Chase the signed contract";

/** The two controls the shared row has and a reference must not. */
function expectReferenceOnly(scope: HTMLElement) {
  expect(
    within(scope).queryByRole("checkbox", { name: `Complete ${TITLE}` }),
  ).toBeNull();
  expect(
    within(scope).queryByRole("checkbox", { name: `Reopen ${TITLE}` }),
  ).toBeNull();
  expect(
    within(scope).queryByRole("button", { name: `More actions for ${TITLE}` }),
  ).toBeNull();
  // …and none of the row's editors or its anatomy.
  expect(within(scope).queryByTestId("task-row")).toBeNull();
  expect(within(scope).queryByTestId("task-row-priority")).toBeNull();
  expect(within(scope).queryByTestId("task-row-due-date")).toBeNull();
  expect(within(scope).queryByTestId("task-row-parent")).toBeNull();
  expect(scope.querySelector(".dh-taskrow")).toBeNull();
}

describe("NextActionLine is a link to the Task, never a row", () => {
  it("names the Task, opens its record, and offers no completion or menu", () => {
    const { container } = render(
      <MemoryRouter>
        <DrawerProvider renderDrawer={() => null}>
          <NextActionLine
            task={{ id: "t1", title: TITLE, projectTitle: "Launch" }}
            absence="state"
          />
        </DrawerProvider>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: `Open ${TITLE} in Launch` }),
    ).toBeInTheDocument();
    expectReferenceOnly(container);
  });
});

describe("a /views row is a link to the Task, never a row", () => {
  it("names the Task with its context and offers no completion or menu", () => {
    const data: ViewsPageData = {
      title: "Views",
      groups: [
        {
          id: "task",
          label: "Tasks",
          entityType: "task",
          items: [
            {
              scope: "task",
              entityType: "task",
              id: "t1",
              title: TITLE,
              updatedAtIso: "2026-08-20T00:00:00.000Z",
              areaTitle: "Work",
              projectTitle: "Launch",
              goalTitle: null,
              archived: false,
              statusLabel: "Waiting",
              dateLabel: "Overdue · due 20 Aug 2026",
              overdue: true,
              detail: { kind: "task" } as unknown as CrossViewResultDetail,
            },
          ],
        },
      ],
      total: 1,
      bounded: false,
      readCount: 1,
      saturatedScopes: [],
      unavailable: [],
      scopeOptions: [
        {
          scope: "task",
          label: "Tasks",
          selected: true,
          query: "scopes=task",
          hidden: false,
        },
      ],
      views: [],
      activeViewId: null,
      modified: false,
      filterCount: 0,
      currentQuery: "",
      shareUrl: "https://app.test/views",
      changeBoundary: null,
      awaitingFirstReview: false,
    };
    const Stub = createRoutesStub([
      { path: "/views", Component: () => <ViewsWorkspace data={data} /> },
    ]);
    const { container } = render(<Stub initialEntries={["/views"]} />);
    const row = screen.getByTestId("cross-view-result-t1");
    expect(
      within(row).getByRole("link", { name: new RegExp(TITLE) }),
    ).toBeInTheDocument();
    // The reference keeps its supporting words — a state, a date, a context —
    // as TEXT, not as the row's editors.
    expect(row).toHaveTextContent("Waiting");
    expect(row).toHaveTextContent("Launch");
    expectReferenceOnly(container);
  });
});

describe("a Meeting follow-up row is a link to the Task, never a row", () => {
  it("names the Task, opens it, and offers no completion or menu", () => {
    const task: SerializedTaskView = {
      id: "t1",
      title: TITLE,
      createdAt: "2026-07-27T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
      deletedAt: null,
      completedAt: null,
      status: "todo",
      priority: "p1",
      dueDate: "2026-08-20",
      scheduledDate: null,
      timeSector: null,
      commitmentState: "active",
      delegation: null,
      description: null,
      tags: [],
      project: null,
      goal: null,
      area: null,
      waiting: {
        since: "2026-08-10T00:00:00.000Z",
        subject: { kind: "text", note: "Sam" },
      },
    };
    const onOpenTask = vi.fn();
    const { container } = render(
      <MeetingFollowUpTab
        items={[]}
        followUps={[{ task, itemId: null }]}
        readOnly={false}
        onConvert={vi.fn()}
        onOpenTask={onOpenTask}
        onAddFollowUp={vi.fn()}
      />,
    );
    const open = screen.getByRole("button", { name: `Open task: ${TITLE}` });
    expect(open).toBeInTheDocument();
    expectReferenceOnly(container);
  });
});

describe("a search result is a link to the Task, never a row", () => {
  it("names the Task with its signals and offers no completion or menu", async () => {
    const items: readonly SearchResultItem[] = [
      {
        id: "t1",
        title: TITLE,
        subtitle: "Launch",
        entityType: "task",
        signals: [
          {
            id: "priority",
            kind: "priority",
            label: "P1",
            value: "p1",
            tone: "neutral",
            accessibleLabel: "P1 priority",
          },
          {
            id: "urgency",
            kind: "urgency",
            label: "Due today",
            value: "due_today",
            tone: "warning",
            accessibleLabel: "Due today",
          },
        ],
        target: {
          kind: "drawer",
          drawerKey: "task:t1",
          canonicalPath: "/today",
        },
      },
    ];
    const search: SearchFn = async (query) =>
      assembleOutcome(query, [
        {
          providerId: "tasks.search",
          moduleId: "tasks",
          moduleLabel: "Tasks",
          ok: true,
          items,
        },
      ]);
    const { container } = render(
      <MemoryRouter initialEntries={["/home"]}>
        <SearchSurface
          search={search}
          onClose={vi.fn()}
          opener={null}
          debounceMs={0}
        />
      </MemoryRouter>,
    );
    const input = screen.getByRole("combobox");
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(input, { target: { value: "Chase" } });
    const option = await screen.findByRole("option", {
      name: new RegExp(TITLE),
    });
    // The signal primitives are allowed — a reference may reuse them.
    expect(within(option).getByText("P1")).toBeInTheDocument();
    expect(within(option).getByText("Due today")).toBeInTheDocument();
    expectReferenceOnly(container);
  });
});
