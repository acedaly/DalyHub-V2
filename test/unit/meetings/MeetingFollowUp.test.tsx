import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SerializedTaskView } from "~/shared/task-record/task-view";
import type { MeetingItemKind } from "~/kernel/meetings";
import {
  MeetingFollowUpTab,
  MeetingItemRow,
} from "~/modules/meetings/MeetingFollowUp";
import type { FollowUpTaskEntry } from "~/modules/meetings/follow-up-view";

type Item = {
  id: string;
  kind: MeetingItemKind;
  bodyMarkdown: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

function item(over: Partial<Item> & { id: string }): Item {
  return {
    kind: "decision",
    bodyMarkdown: "Decide the thing",
    position: 0,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    ...over,
  };
}

function task(
  over: Partial<SerializedTaskView> & { id: string },
): SerializedTaskView {
  return {
    title: over.id,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
    deletedAt: null,
    completedAt: null,
    status: "todo",
    priority: null,
    dueDate: null,
    scheduledDate: null,
    timeSector: null,
    commitmentState: "active",
    delegation: null,
    description: null,
    tags: [],
    project: null,
    goal: null,
    area: null,
    waiting: null,
    ...over,
  };
}

const entry = (
  t: SerializedTaskView,
  itemId: string | null = null,
): FollowUpTaskEntry => ({
  task: t,
  itemId,
});

describe("MeetingItemRow", () => {
  it("offers Create task for an unconverted item and calls onConvert", () => {
    const onConvert = vi.fn();
    render(
      <ul>
        <MeetingItemRow
          item={item({ id: "i1", kind: "agenda", bodyMarkdown: "Prep deck" })}
          convertedTask={null}
          readOnly={false}
          onConvert={onConvert}
          onOpenTask={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText("Prep deck")).toBeInTheDocument();
    /*
     * UNTITLED-13 — the KIND chip is gone, and this assertion went with it.
     *
     * Every row in a list headed "Agenda items" is an agenda item, so the chip
     * was a label repeating its own section on every line — in the notebook,
     * where the heading above says it, and in the Follow-up tab's "Unconverted
     * action items", where the heading above says it too. The kind survives
     * where it is still doing work: as the accessible name of the row's
     * context menu ("Actions for this agenda item").
     */
    expect(screen.queryByText("Agenda item")).toBeNull();

    /*
     * §14 — the VISIBLE conversion control belongs to an ACTION item.
     *
     * An agenda item is a topic and a decision is a record of what was settled;
     * offering "Create task" as a full control on each one put three identical
     * buttons down an agenda of three topics. It is still one press away, in
     * the row's own context menu, on every kind.
     */
    expect(screen.queryByRole("button", { name: "Create task" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for this agenda item" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Create a task from this" }),
    );
    expect(onConvert).toHaveBeenCalledWith("i1");
    expect(screen.queryByRole("button", { name: "Open task" })).toBeNull();
  });

  it("keeps the conversion control visible on an ACTION item", () => {
    const onConvert = vi.fn();
    render(
      <ul>
        <MeetingItemRow
          item={item({
            id: "a1",
            kind: "action",
            bodyMarkdown: "Book the van",
          })}
          convertedTask={null}
          readOnly={false}
          onConvert={onConvert}
          onOpenTask={vi.fn()}
        />
      </ul>,
    );
    // Turning an action into a Task is the most frequent thing done on this
    // surface, and two presses for it during a live meeting is one too many.
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(onConvert).toHaveBeenCalledWith("a1");
  });

  it("offers Open task once converted and identifies the linked task textually", () => {
    const onOpenTask = vi.fn();
    render(
      <ul>
        <MeetingItemRow
          item={item({ id: "i2" })}
          convertedTask={task({
            id: "t2",
            title: "Ship it",
            completedAt: "2026-07-27T00:00:00.000Z",
          })}
          readOnly={false}
          onConvert={vi.fn()}
          onOpenTask={onOpenTask}
        />
      </ul>,
    );
    // The phrase is two elements now, because a long task title has to be able
    // to truncate without taking the words "Linked task" with it.
    expect(screen.getByText("Linked task")).toBeInTheDocument();
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open task" }));
    expect(onOpenTask).toHaveBeenCalledWith("t2");
  });

  it("shows a read-only state with no create/remove controls when read-only", () => {
    render(
      <ul>
        <MeetingItemRow
          item={item({ id: "i3" })}
          convertedTask={null}
          readOnly
          onConvert={vi.fn()}
          onOpenTask={vi.fn()}
          onRemove={vi.fn()}
        />
      </ul>,
    );
    expect(screen.getByText("Not converted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create task" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("labels the remove control accessibly and never nests interactive controls", () => {
    const onRemove = vi.fn();
    render(
      <ul>
        <MeetingItemRow
          item={item({ id: "i4", kind: "outcome" })}
          convertedTask={null}
          readOnly={false}
          onConvert={vi.fn()}
          onOpenTask={vi.fn()}
          onRemove={onRemove}
        />
      </ul>,
    );
    /*
     * §14 — Remove is in the shared context MENU now, not a permanent
     * destructive button beside every line.
     *
     * It used to be a always-rendered "Remove" faded to `opacity: 0` by a
     * `@media (hover: hover)` block with a `:focus-within` escape hatch — three
     * CSS mechanisms keeping one control simultaneously hidden and reachable.
     * The test drives what a person does: open the row's menu, choose the item.
     * The menu's own name still carries the kind, so several rows' menus are
     * still told apart by a screen-reader user.
     */
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for this outcome" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove outcome" }));
    expect(onRemove).toHaveBeenCalledWith("i4");
    // No nested interactive controls: no button contains another button/link.
    for (const button of screen.getAllByRole("button")) {
      expect(button.querySelector("button, a")).toBeNull();
    }
  });
});

describe("MeetingFollowUpTab", () => {
  const items = [
    item({ id: "i1", kind: "decision", bodyMarkdown: "Decision A" }),
    item({ id: "i2", kind: "outcome", bodyMarkdown: "Outcome B" }),
    item({ id: "i3", kind: "action", bodyMarkdown: "Action C" }),
  ];

  it("shows the calm empty state and lists only unconverted action items", () => {
    const onAddFollowUp = vi.fn();
    render(
      <MeetingFollowUpTab
        items={items}
        followUps={[]}
        readOnly={false}
        onConvert={vi.fn()}
        onOpenTask={vi.fn()}
        onAddFollowUp={onAddFollowUp}
      />,
    );
    expect(screen.getByText("No follow-up tasks yet")).toBeInTheDocument();
    expect(screen.queryByText("Decision A")).toBeNull();
    expect(screen.queryByText("Outcome B")).toBeNull();
    expect(screen.getByText("Action C")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add follow-up task" }));
    expect(onAddFollowUp).toHaveBeenCalled();
  });

  it("groups follow-up tasks by canonical state with counts and Open controls", () => {
    const onOpenTask = vi.fn();
    render(
      <MeetingFollowUpTab
        items={items}
        followUps={[
          entry(
            task({ id: "t1", title: "Open one", status: "in_progress" }),
            "i1",
          ),
          entry(
            task({ id: "t2", title: "Waiting one", status: "on_hold" }),
            "i2",
          ),
          entry(
            task({
              id: "t3",
              title: "Done one",
              completedAt: "2026-07-27T00:00:00.000Z",
            }),
          ),
        ]}
        readOnly={false}
        onConvert={vi.fn()}
        onOpenTask={onOpenTask}
        onAddFollowUp={vi.fn()}
      />,
    );
    /*
     * UNTITLED-13 — the count is a badge beside the heading, so the heading is
     * the state and the badge names its noun. "Open (1)" put a parenthesised
     * digit inside a heading's accessible name; "Open" + "1 task" is two facts
     * a screen reader can tell apart.
     */
    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Waiting or delegated" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Completed" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("1 task")).toHaveLength(3);

    fireEvent.click(
      screen.getByRole("button", { name: "Open task: Open one" }),
    );
    expect(onOpenTask).toHaveBeenCalledWith("t1");
  });

  it("announces completion when every follow-up is done", () => {
    render(
      <MeetingFollowUpTab
        items={[]}
        followUps={[
          entry(task({ id: "t1", completedAt: "2026-07-27T00:00:00.000Z" })),
        ]}
        readOnly={false}
        onConvert={vi.fn()}
        onOpenTask={vi.fn()}
        onAddFollowUp={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Everything from this meeting is complete."),
    ).toBeInTheDocument();
  });

  it("hides creation controls when read-only", () => {
    render(
      <MeetingFollowUpTab
        items={items}
        followUps={[]}
        readOnly
        onConvert={vi.fn()}
        onOpenTask={vi.fn()}
        onAddFollowUp={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Add follow-up task" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Create task" })).toBeNull();
    // Explicit action items still render, read-only; decisions/outcomes are not a
    // global conversion backlog.
    expect(screen.getByText("Action C")).toBeInTheDocument();
    expect(screen.queryByText("Decision A")).toBeNull();
  });
});
