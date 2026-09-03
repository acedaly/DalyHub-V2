/**
 * V2.8 CONV-02 — the shared row's ONE optional waiting fact, as a contract.
 *
 * ADR-115 decision 2: a fact about a Task goes on the row — as one optional
 * slot, decided once — or it goes nowhere. Until this item the waiting-for
 * subject, "since · elapsed" and RECALL-03's follow-up date were drawn only by
 * `/today/waiting`'s generic Card, so the shared row lacked a fact the Card
 * had. This file pins the slot's behaviour so it cannot quietly move back out
 * to a surface:
 *
 *   1. not provided → the row is byte-for-byte what it was (no element, no
 *      grid change, no wording);
 *   2. the subject, with the entity glyph where the subject is a record;
 *   3. the "since · elapsed" wording, through the canonical formatters and the
 *      SERVER's instant;
 *   4. the follow-up state — upcoming, due today, overdue — as a MACHINE value
 *      on the element and as WORDS in the text, never colour alone;
 *   5. no live region inside the fact: the surface announces, a fact does not;
 *   6. a long free-text subject wraps inside the row rather than truncating
 *      to nothing or widening the document;
 *   7. the pure helpers agree with the kernel's follow-up vocabulary and with
 *      the completion rule (a completed Task is never waiting).
 *
 * Falsified: rendering the fact separately on the Waiting page (the slot
 * absent from the row) fails 2–4 here and the consumer contract; a second
 * formatter inside the row would fail the wording assertions, which are the
 * canonical formatters' own output.
 */

import type { ReactElement } from "react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TaskRow, type TaskRowData } from "~/shared/task-record/TaskRow";
import { buildTaskRowActions } from "~/shared/task-record/task-row-actions";
import {
  formatWaitingElapsed,
  formatWaitingSince,
  taskFollowUpPresentation,
  taskRowWaitingFact,
  type TaskRowWaitingFact,
} from "~/shared/task-record/task-view";

const TODAY = "2026-08-22";
const YESTERDAY = "2026-08-21";
const NEXT_WEEK = "2026-08-31";
const SINCE = "2026-08-10T09:00:00.000Z";
const NOW_MS = Date.parse("2026-08-22T09:00:00.000Z");

function renderInRouter(node: ReactElement) {
  const router = createMemoryRouter([{ path: "/", element: node }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
}

const baseTask: TaskRowData = {
  id: "task-1",
  title: "Await supplier sign-off",
  priority: null,
  stateKind: "waiting",
  stateLabel: "Waiting",
  stateTone: "waiting",
  dueDate: null,
  scheduledDate: null,
  parent: null,
  completed: false,
  waiting: true,
  stillOwed: true,
  recurrence: null,
};

function fact(over: Partial<TaskRowWaitingFact> = {}): TaskRowWaitingFact {
  return {
    subject: { kind: "text", note: "Sam Okafor" },
    since: SINCE,
    nowMs: NOW_MS,
    followUpOn: null,
    ...over,
  };
}

function row(waiting?: TaskRowWaitingFact) {
  return renderInRouter(
    <ul className="dh-tasklist">
      <TaskRow
        task={baseTask}
        todayIso={TODAY}
        parents={[]}
        href="/tasks"
        onOpen={() => {}}
        headingLevel={3}
        onCompletedChange={() => {}}
        onInlineSave={() => {}}
        overflowActions={buildTaskRowActions(baseTask, {
          onOpenRecord: () => {},
        })}
        {...(waiting ? { waiting } : {})}
      />
    </ul>,
  );
}

describe("the waiting slot — not provided", () => {
  it("draws no waiting element and no waiting words on an ordinary row", () => {
    const { container } = row();
    expect(screen.queryByTestId("task-row-waiting")).toBeNull();
    expect(container.querySelector(".dh-taskrow__waiting")).toBeNull();
    expect(screen.queryByText(/Waiting for/)).toBeNull();
    expect(screen.queryByText(/Follow up/)).toBeNull();
    // The row's own anatomy is unchanged: one lead, one heading, one meta run.
    const item = screen.getByTestId("task-row");
    expect(item.querySelectorAll(":scope > *")).toHaveLength(4);
  });
});

describe("the waiting slot — provided", () => {
  it("states the subject, with the entity's glyph where the subject is a record", () => {
    row(
      fact({
        subject: {
          kind: "entity",
          id: "person-1",
          type: "person",
          title: "Sarah Chen",
        },
      }),
    );
    const subject = screen.getByTestId("task-row-waiting-subject");
    expect(subject).toHaveTextContent(/^Waiting for\s*Sarah Chen$/);
    expect(subject.querySelector("[data-entity='person']")).not.toBeNull();
  });

  it("states a free-text subject with no glyph, through the canonical label", () => {
    row(fact({ subject: { kind: "text", note: "the council" } }));
    const subject = screen.getByTestId("task-row-waiting-subject");
    expect(subject).toHaveTextContent("the council");
    expect(subject.querySelector("[data-entity]")).toBeNull();
  });

  it("degrades an unresolved entity subject calmly, never to an id", () => {
    row(
      fact({
        subject: { kind: "entity", id: "gone", type: null, title: null },
      }),
    );
    const subject = screen.getByTestId("task-row-waiting-subject");
    expect(subject).toHaveTextContent("someone no longer available");
    expect(subject).not.toHaveTextContent("gone");
  });

  it("states since and elapsed through the canonical formatters against the server's instant", () => {
    row(fact());
    const since = screen.getByTestId("task-row-waiting-since");
    // The exact output of the two shared formatters — no second wording.
    expect(since).toHaveTextContent(
      `Since ${formatWaitingSince(SINCE)} · ${formatWaitingElapsed(SINCE, NOW_MS)}`,
    );
    expect(since).toHaveTextContent("Since 10 Aug 2026 · 12 days");
  });

  it("draws no follow-up when the owner recorded no chase date", () => {
    row(fact({ followUpOn: null }));
    expect(screen.queryByTestId("task-row-follow-up")).toBeNull();
    expect(screen.getByTestId("task-row-waiting")).not.toHaveAttribute(
      "data-follow-up-state",
    );
  });

  it("states an UPCOMING follow-up with its date and the machine state", () => {
    row(fact({ followUpOn: NEXT_WEEK }));
    const followUp = screen.getByTestId("task-row-follow-up");
    expect(followUp).toHaveAttribute("data-state", "upcoming");
    expect(followUp).toHaveTextContent(/^Follow up · /);
    expect(followUp).toHaveTextContent(
      taskFollowUpPresentation(NEXT_WEEK, TODAY)!.label,
    );
    expect(screen.getByTestId("task-row-waiting")).toHaveAttribute(
      "data-follow-up-state",
      "upcoming",
    );
  });

  it("states a follow-up DUE TODAY in words, not colour", () => {
    row(fact({ followUpOn: TODAY }));
    const followUp = screen.getByTestId("task-row-follow-up");
    expect(followUp).toHaveAttribute("data-state", "due_today");
    expect(followUp).toHaveTextContent("Follow up due · Today");
    expect(screen.getByTestId("task-row-waiting")).toHaveAttribute(
      "data-follow-up-state",
      "due_today",
    );
  });

  it("states an OVERDUE follow-up in words, not colour", () => {
    row(fact({ followUpOn: YESTERDAY }));
    const followUp = screen.getByTestId("task-row-follow-up");
    expect(followUp).toHaveAttribute("data-state", "overdue");
    // The state is TEXT the assistive tree reads; the stylesheet's colour is
    // a second signal (AGENTS.md §15).
    expect(followUp).toHaveTextContent("Follow up overdue · Yesterday");
    expect(screen.getByTestId("task-row-waiting")).toHaveAttribute(
      "data-follow-up-state",
      "overdue",
    );
  });

  it("carries no live region of its own — the surface announces, a fact does not", () => {
    row(fact({ followUpOn: YESTERDAY }));
    const item = screen.getByTestId("task-row");
    const waiting = screen.getByTestId("task-row-waiting");
    expect(
      waiting.querySelectorAll("[aria-live], [role='status'], [role='alert']"),
    ).toHaveLength(0);
    expect(waiting).not.toHaveAttribute("aria-live");
    expect(waiting).not.toHaveAttribute("role");
    // …and the fact is outside the heading, so a long subject never becomes
    // part of the row's heading text.
    const heading = within(item).getByRole("heading", { level: 3 });
    expect(heading).not.toHaveTextContent("Waiting for");
  });

  it("keeps a long free-text subject whole and wrappable rather than truncated", () => {
    const note =
      "Lodged 15 July; 20 business days quoted by the planning department";
    row(fact({ subject: { kind: "text", note } }));
    const subject = screen.getByTestId("task-row-waiting-subject");
    expect(subject).toHaveTextContent(note);
    // The element is a wrapping run (the stylesheet's contract), inside the
    // row rather than inside the title cell's nowrap grammar.
    expect(subject.closest(".dh-taskrow__waiting")).not.toBeNull();
    expect(subject.closest(".dh-taskrow__main")).toBeNull();
    expect(subject.closest(".dh-taskrow__title")).toBeNull();
  });
});

describe("the pure helpers", () => {
  const item = {
    waiting: { since: SINCE, subject: { kind: "text" as const, note: "Sam" } },
    completedAt: null,
    delegation: { followUpOn: YESTERDAY },
  };

  it("builds the fact from a list item, lifting the chase date out of the delegation", () => {
    expect(taskRowWaitingFact(item, NOW_MS)).toEqual({
      subject: { kind: "text", note: "Sam" },
      since: SINCE,
      nowMs: NOW_MS,
      followUpOn: YESTERDAY,
    });
    expect(
      taskRowWaitingFact({ ...item, delegation: null }, NOW_MS)?.followUpOn,
    ).toBeNull();
  });

  it("answers null for a Task that is not waiting, and for a completed one", () => {
    expect(taskRowWaitingFact({ ...item, waiting: null }, NOW_MS)).toBeNull();
    // Completion clears waiting atomically (ADR-029 §29.4a); a stale waiting
    // record beside a completion must never be drawn as a live fact.
    expect(
      taskRowWaitingFact(
        { ...item, completedAt: "2026-08-22T08:00:00.000Z" },
        NOW_MS,
      ),
    ).toBeNull();
  });

  it("resolves the follow-up state against the OWNER's day, in the kernel's vocabulary", () => {
    expect(taskFollowUpPresentation(YESTERDAY, TODAY)).toEqual({
      state: "overdue",
      label: "Yesterday",
    });
    expect(taskFollowUpPresentation(TODAY, TODAY)).toEqual({
      state: "due_today",
      label: "Today",
    });
    expect(taskFollowUpPresentation("2026-08-23", TODAY)).toEqual({
      state: "upcoming",
      label: "Tomorrow",
    });
    expect(taskFollowUpPresentation(NEXT_WEEK, TODAY)?.state).toBe("upcoming");
    expect(taskFollowUpPresentation(null, TODAY)).toBeNull();
    expect(taskFollowUpPresentation("not-a-date", TODAY)).toBeNull();
    // The SAME stored date, read on two owner-days: overdue for the owner
    // already living on the 23rd, due today for the one still on the 22nd.
    expect(taskFollowUpPresentation(TODAY, "2026-08-23")?.state).toBe(
      "overdue",
    );
    expect(taskFollowUpPresentation(TODAY, TODAY)?.state).toBe("due_today");
  });
});
