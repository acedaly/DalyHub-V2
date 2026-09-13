import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SerializedTaskView } from "~/shared/task-record/task-view";
import type { MeetingItemKind } from "~/kernel/meetings";
import { MeetingItemRow } from "~/modules/meetings/MeetingFollowUp";

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
