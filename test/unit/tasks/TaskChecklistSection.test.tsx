/**
 * TASKS-13 — the checklist section's INTERACTION.
 *
 * What matters here is not that a checkbox renders: it is that the flow the
 * feature exists for actually works, that a keyboard reaches every act, that
 * focus is never dropped, and that the section states the one thing an owner
 * will otherwise get wrong — completing every step does not complete the Task.
 *
 * The section is driven through the SAME `useTaskChecklist` hook the drawer
 * uses, over a spied `/tasks/:taskId` route, so what is asserted is where a
 * change is POSTED rather than a mocked internal.
 */

import { createMemoryRouter, RouterProvider } from "react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import { TaskChecklistSection } from "~/shared/task-record/TaskChecklistSection";
import { useTaskChecklist } from "~/shared/task-record/use-task-checklist";
import type { SerializedChecklistItem } from "~/shared/task-record/task-view";

function item(
  id: string,
  title: string,
  position: number,
  completed = false,
): SerializedChecklistItem {
  return {
    id,
    taskId: "t-1",
    title,
    position,
    completed,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
}

/** A host that wires the section to the hook, exactly as the drawer does. */
function Host({
  loaded,
}: {
  readonly loaded: readonly SerializedChecklistItem[];
}) {
  const checklist = useTaskChecklist("t-1", loaded, "/tasks");
  return <TaskChecklistSection checklist={checklist} />;
}

/**
 * Render the section behind a spied Task route.
 *
 * `respond` decides what the server says, so a test can assert the section
 * reconciles from the ANSWER rather than from what it asked for.
 */
function renderSection(
  loaded: readonly SerializedChecklistItem[] = [],
  respond: (body: FormData) => unknown = () => ({
    kind: "checklist",
    status: "success",
    checklist: loaded,
  }),
) {
  const posted = vi.fn((_body: FormData) => undefined);
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body as FormData;
    posted(body);
    return new Response(JSON.stringify(respond(body)), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const router = createMemoryRouter(
    [{ path: "/", element: <Host loaded={loaded} /> }],
    { initialEntries: ["/"] },
  );
  render(
    <FeedbackProvider>
      <RouterProvider router={router} />
    </FeedbackProvider>,
  );
  return {
    posted,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** The form fields of the nth submission, as a plain object. */
function fields(body: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of body.entries()) out[name] = String(value);
  return out;
}

describe("the empty state", () => {
  it("is ONE restrained affordance, not a card", () => {
    const { restore } = renderSection([]);
    const add = screen.getByTestId("checklist-add");
    expect(add).toHaveTextContent("Add checklist");
    // No progress line, because "0 of 0" says nothing.
    expect(screen.queryByTestId("checklist-progress")).toBeNull();
    // No list at all until there is something in it.
    expect(screen.queryByRole("list")).toBeNull();
    restore();
  });
});

describe("adding items with the keyboard", () => {
  it("opens an inline input, and Enter saves AND opens the next one", async () => {
    const { posted, restore } = renderSection([], () => ({
      kind: "checklist",
      status: "success",
      checklist: [item("i-1", "Check tyres", 0)],
    }));

    fireEvent.click(screen.getByTestId("checklist-add"));
    const input = await screen.findByTestId("checklist-composer");
    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.change(input, { target: { value: "Check tyres" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    expect(fields(posted.mock.calls[0]![0])).toMatchObject({
      intent: "checklist_add",
      title: "Check tyres",
    });

    // The input is still there, cleared and focused: a list is typed in one
    // flow rather than one round trip per step.
    await waitFor(() =>
      expect(screen.getByTestId("checklist-composer")).toHaveValue(""),
    );
    expect(document.activeElement).toBe(
      screen.getByTestId("checklist-composer"),
    );
    restore();
  });

  it("finishes on Cmd/Ctrl+Enter instead of opening another", async () => {
    const { restore } = renderSection([], () => ({
      kind: "checklist",
      status: "success",
      checklist: [item("i-1", "Check tyres", 0)],
    }));
    fireEvent.click(screen.getByTestId("checklist-add"));
    const input = await screen.findByTestId("checklist-composer");
    fireEvent.change(input, { target: { value: "Check tyres" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    await waitFor(() =>
      expect(screen.queryByTestId("checklist-composer")).toBeNull(),
    );
    // Focus returns to the control that opened it, never to the document body.
    expect(document.activeElement).toBe(screen.getByTestId("checklist-add"));
    restore();
  });

  it("Escape closes a BLANK input and keeps a typed one", async () => {
    const { posted, restore } = renderSection([]);
    fireEvent.click(screen.getByTestId("checklist-add"));
    const input = await screen.findByTestId("checklist-composer");

    // Typed words are never discarded by a stray keystroke.
    fireEvent.change(input, { target: { value: "Half a thought" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByTestId("checklist-composer")).toHaveValue(
      "Half a thought",
    );

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("checklist-composer")).toBeNull(),
    );
    expect(posted).not.toHaveBeenCalled();
    restore();
  });

  it("does not post a blank step", async () => {
    const { posted, restore } = renderSection([]);
    fireEvent.click(screen.getByTestId("checklist-add"));
    const input = await screen.findByTestId("checklist-composer");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(posted).not.toHaveBeenCalled());
    restore();
  });
});

describe("an existing checklist", () => {
  const ITEMS = [
    item("i-1", "Check tyre pressures", 0, true),
    item("i-2", "Fill water tanks", 1),
    item("i-3", "Charge batteries", 2),
  ];

  it("is a semantic list whose progress is two NUMBERS", () => {
    const { restore } = renderSection(ITEMS);
    expect(screen.getByTestId("checklist-progress")).toHaveTextContent(
      "1 of 3 complete",
    );
    expect(screen.getByTestId("checklist-progress").textContent).not.toMatch(
      /%/,
    );
    expect(screen.getAllByTestId("checklist-item")).toHaveLength(3);
    // A real list, named by the section's heading.
    expect(screen.getByRole("list")).toHaveAccessibleName("Checklist");
    restore();
  });

  it("names each checkbox with its own step, and carries the state", () => {
    const { restore } = renderSection(ITEMS);
    const done = screen.getByRole("checkbox", {
      name: "Check tyre pressures",
    });
    expect(done).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Fill water tanks" }),
    ).not.toBeChecked();
    restore();
  });

  it("posts a tick to the canonical intent, with the item and the flag", async () => {
    const { posted, restore } = renderSection(ITEMS, () => ({
      kind: "checklist",
      status: "success",
      checklist: ITEMS,
    }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Fill water tanks" }));
    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    expect(fields(posted.mock.calls[0]![0])).toMatchObject({
      intent: "checklist_set_completed",
      itemId: "i-2",
      completed: "1",
    });
    restore();
  });

  it("says plainly that finishing every step does not finish the Task", () => {
    const { restore } = renderSection([
      item("i-1", "A", 0, true),
      item("i-2", "B", 1, true),
    ]);
    expect(screen.getByTestId("checklist-progress")).toHaveTextContent(
      "the task is still open until you complete it",
    );
    restore();
  });

  it("offers Move up / Move down, disabled at the ends, and posts the WHOLE order", async () => {
    const { posted, restore } = renderSection(ITEMS, () => ({
      kind: "checklist",
      status: "success",
      checklist: ITEMS,
    }));
    const rows = screen.getAllByTestId("checklist-item");

    // The first row cannot move up; the last cannot move down.
    fireEvent.click(
      within(rows[0]!).getByRole("button", {
        name: /More actions for Check tyre pressures/,
      }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Move up" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    fireEvent.click(
      within(rows[1]!).getByRole("button", {
        name: /More actions for Fill water tanks/,
      }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));

    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    const body = posted.mock.calls[0]![0];
    expect(body.get("intent")).toBe("checklist_reorder");
    // Every id, in the new order — so the server can refuse a stale list rather
    // than applying half a move.
    expect(body.getAll("itemId")).toEqual(["i-2", "i-1", "i-3"]);
    restore();
  });

  it("restores focus to the NEXT step after a delete", async () => {
    const remaining = [ITEMS[0]!, ITEMS[2]!];
    const { posted, restore } = renderSection(ITEMS, () => ({
      kind: "checklist",
      status: "success",
      checklist: remaining,
    }));
    const rows = screen.getAllByTestId("checklist-item");
    fireEvent.click(
      within(rows[1]!).getByRole("button", {
        name: /More actions for Fill water tanks/,
      }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Delete item" }),
    );

    await waitFor(() => expect(posted).toHaveBeenCalledTimes(1));
    expect(fields(posted.mock.calls[0]![0])).toMatchObject({
      intent: "checklist_delete",
      itemId: "i-2",
    });
    // Focus lands on the step that took its place, never on the document body.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("checkbox", { name: "Charge batteries" }),
      ),
    );
    restore();
  });

  it("SAYS what a move and a delete did, for a reader who cannot see them", async () => {
    // A move reorders the DOM and a delete removes a row: both are silent to a
    // screen reader unless something speaks. The checkbox announces its own tick,
    // so ticking is deliberately NOT announced here — it would speak twice.
    const moved = [ITEMS[1]!, ITEMS[0]!, ITEMS[2]!];
    const { restore } = renderSection(ITEMS, () => ({
      kind: "checklist",
      status: "success",
      checklist: moved,
    }));
    const rows = screen.getAllByTestId("checklist-item");
    fireEvent.click(
      within(rows[1]!).getByRole("button", {
        name: /More actions for Fill water tanks/,
      }),
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "Move up" }));

    const live = screen.getByRole("status");
    await waitFor(() =>
      expect(live.textContent).toBe(
        "Fill water tanks moved to position 1 of 3.",
      ),
    );
    restore();
  });

  it("reconciles from the SERVER's answer, not from what it asked for", async () => {
    // The server normalises the title; the section must show what was stored.
    const { restore } = renderSection([item("i-1", "A", 0)], () => ({
      kind: "checklist",
      status: "success",
      checklist: [item("i-1", "A", 0), item("i-2", "Pack the fridge", 1)],
    }));
    fireEvent.click(screen.getByTestId("checklist-add"));
    const input = await screen.findByTestId("checklist-composer");
    fireEvent.change(input, { target: { value: "Pack the    fridge" } });
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });

    await waitFor(() =>
      expect(screen.getAllByTestId("checklist-item")).toHaveLength(2),
    );
    expect(
      screen.getByRole("checkbox", { name: "Pack the fridge" }),
    ).toBeTruthy();
    restore();
  });

  it("corrects itself from a refusal that carries the truth", async () => {
    const { restore } = renderSection(ITEMS, () => ({
      kind: "checklist",
      status: "error",
      formError:
        "This checklist changed somewhere else, so the new order was not saved.",
      checklist: [item("i-1", "Check tyre pressures", 0, true)],
    }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Fill water tanks" }));
    // The list becomes what the server says it is, rather than staying on a
    // state this device invented.
    await waitFor(() =>
      expect(screen.getAllByTestId("checklist-item")).toHaveLength(1),
    );
    restore();
  });
});
