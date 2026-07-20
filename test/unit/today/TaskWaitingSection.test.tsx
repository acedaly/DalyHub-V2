import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TaskWaitingSection } from "~/modules/today/task/TaskWaitingSection";
import type { SerializedTaskWaiting } from "~/modules/today/task/task-view";

// TODAY-03 — the Task Drawer waiting control. Time is injected (`nowMs`) so the
// elapsed label is deterministic and never flaky.

const NOW = Date.parse("2026-07-21T00:00:00.000Z");

const ENTITY_WAITING: SerializedTaskWaiting = {
  since: "2026-07-18T00:00:00.000Z",
  subject: { kind: "entity", id: "p1", type: "person", title: "Sarah Chen" },
};

const TEXT_WAITING: SerializedTaskWaiting = {
  since: "2026-07-20T00:00:00.000Z",
  subject: { kind: "text", note: "finance confirmation" },
};

function renderSection(
  overrides: Partial<Parameters<typeof TaskWaitingSection>[0]> = {},
) {
  const onSetWaiting = vi.fn().mockResolvedValue({ ok: true });
  const onClear = vi.fn().mockResolvedValue({ ok: true });
  const searchTargets = vi.fn().mockResolvedValue([]);
  render(
    <TaskWaitingSection
      waiting={null}
      completed={false}
      searchTargets={searchTargets}
      onSetWaiting={onSetWaiting}
      onClear={onClear}
      nowMs={NOW}
      {...overrides}
    />,
  );
  return { onSetWaiting, onClear, searchTargets };
}

describe("read-only state", () => {
  it("offers 'Mark as waiting' when not waiting", () => {
    renderSection();
    expect(
      screen.getByRole("button", { name: /mark as waiting/i }),
    ).toBeInTheDocument();
  });

  it("shows the entity subject, since date and elapsed duration when active", () => {
    renderSection({ waiting: ENTITY_WAITING });
    expect(screen.getByText("Sarah Chen")).toBeInTheDocument();
    expect(screen.getByText(/18 Jul 2026/)).toBeInTheDocument();
    expect(screen.getByText(/3 days/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clear waiting/i }),
    ).toBeInTheDocument();
  });

  it("shows a free-text subject", () => {
    renderSection({ waiting: TEXT_WAITING });
    expect(screen.getByText("finance confirmation")).toBeInTheDocument();
  });

  it("does not present a completed task as waiting", () => {
    renderSection({ waiting: ENTITY_WAITING, completed: true });
    // Completion hides the active waiting UI; the control offers to mark waiting.
    expect(screen.queryByText("Sarah Chen")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mark as waiting/i }),
    ).toBeInTheDocument();
  });
});

describe("editing", () => {
  it("saves a free-text subject", async () => {
    const { onSetWaiting } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /mark as waiting/i }));
    fireEvent.click(screen.getByLabelText(/something else/i));
    fireEvent.change(screen.getByLabelText(/what it's waiting on/i), {
      target: { value: "replacement parts" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(onSetWaiting).toHaveBeenCalledWith({
        mode: "text",
        note: "replacement parts",
      }),
    );
  });

  it("shows a validation message and does not save an empty free-text subject", () => {
    const { onSetWaiting } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /mark as waiting/i }));
    fireEvent.click(screen.getByLabelText(/something else/i));
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(onSetWaiting).not.toHaveBeenCalled();
    expect(screen.getByText(/enter what or whom/i)).toBeInTheDocument();
  });

  it("keeps the editor open and shows the server error on a failed save", async () => {
    const onSetWaiting = vi.fn().mockResolvedValue({
      ok: false,
      fieldErrors: { waitingNote: "Too long." },
    });
    renderSection({ onSetWaiting });
    fireEvent.click(screen.getByRole("button", { name: /mark as waiting/i }));
    fireEvent.click(screen.getByLabelText(/something else/i));
    fireEvent.change(screen.getByLabelText(/what it's waiting on/i), {
      target: { value: "x" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() =>
      expect(screen.getByText("Too long.")).toBeInTheDocument(),
    );
    // Still editing (the field control is present).
    expect(screen.getByLabelText(/what it's waiting on/i)).toBeInTheDocument();
  });

  it("clears waiting via the callback", async () => {
    const { onClear } = renderSection({ waiting: TEXT_WAITING });
    fireEvent.click(screen.getByRole("button", { name: /clear waiting/i }));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });

  it("cancels an edit without saving", () => {
    const { onSetWaiting } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /mark as waiting/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onSetWaiting).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /mark as waiting/i }),
    ).toBeInTheDocument();
  });
});
