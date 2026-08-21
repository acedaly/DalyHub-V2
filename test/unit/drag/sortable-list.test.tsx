/**
 * DHDS-11 — the reorder surface, as a keyboard user meets it.
 *
 * Pointer geometry does not exist in a DOM test (every rectangle is 0×0), so
 * pointer reorder is proved end-to-end in Playwright where real geometry does.
 * What is proved here is everything that is NOT geometry, and it is the half
 * that carries the accessibility contract:
 *
 *   - the keyboard grammar (pick up, move, drop, cancel);
 *   - what is emitted, and that it is INTENT rather than a mutation;
 *   - what is announced, and that the instructions are spoken once;
 *   - that a list which changes under a held object refuses to emit an order;
 *   - that a read-only collection offers no grip at all.
 *
 * It replaces the behavioural half of `ReorderableCardCollection.test.tsx`,
 * removed with that component (the product's second drag system).
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DragProvider, SortableHandle, SortableList } from "~/shared/drag";

interface Row {
  readonly id: string;
  readonly title: string;
}

const ITEMS: readonly Row[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Bravo" },
  { id: "c", title: "Charlie" },
];

type ReorderSpy = ReturnType<
  typeof vi.fn<(nextIds: readonly string[], detail: unknown) => void>
>;

function renderList(
  over: {
    items?: readonly Row[];
    onReorder?: ReorderSpy;
    disabled?: boolean;
  } = {},
) {
  const onReorder: ReorderSpy =
    over.onReorder ??
    vi.fn<(nextIds: readonly string[], detail: unknown) => void>();
  const view = render(
    <DragProvider>
      <SortableList
        id="rows"
        kind="row"
        ariaLabel="Rows"
        items={over.items ?? ITEMS}
        getItemId={(item) => item.id}
        getItemLabel={(item) => item.title}
        disabled={over.disabled ?? false}
        onReorder={onReorder}
        renderItem={(item, api) => (
          <div>
            <SortableHandle {...api.handleProps} />
            <span>{item.title}</span>
          </div>
        )}
      />
    </DragProvider>,
  );
  return { onReorder, view };
}

const grip = (name: string) => screen.getByRole("button", { name });

/** The provider's live region — the drag's own channel, not the list's. */
function announcement(): string {
  const regions = screen.getAllByRole("status");
  return regions.map((region) => region.textContent ?? "").join(" ");
}

/** The rendered order, read off the list rather than off component state. */
function renderedOrder(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "")
    .map((text) => text.replace(/\s+/g, ""));
}

describe("SortableList — the keyboard grammar", () => {
  it("picks up, moves and drops, emitting the new order as INTENT", () => {
    const { onReorder } = renderList();
    const bravo = grip("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    expect(grip("Reorder Bravo")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(grip("Reorder Bravo"), { key: "ArrowUp" });
    fireEvent.keyDown(grip("Reorder Bravo"), { key: "Enter" });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toEqual(["b", "a", "c"]);
    expect(onReorder.mock.calls[0][1]).toMatchObject({
      id: "b",
      fromIndex: 1,
      toIndex: 0,
    });
  });

  it("moves the object in the list as it goes, so the gap is visible", () => {
    renderList();
    const bravo = grip("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    expect(renderedOrder()).toEqual(["Alpha", "Bravo", "Charlie"]);
    fireEvent.keyDown(grip("Reorder Bravo"), { key: "ArrowUp" });
    expect(renderedOrder()).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("keeps focus on the grip through the whole operation", () => {
    renderList();
    const bravo = grip("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    fireEvent.keyDown(grip("Reorder Bravo"), { key: "ArrowDown" });
    fireEvent.keyDown(grip("Reorder Bravo"), { key: "Enter" });
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Reorder Bravo",
    );
  });

  it("clamps at both ends rather than wrapping or emitting nothing", () => {
    const { onReorder } = renderList();
    const alpha = grip("Reorder Alpha");
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "Enter" });
    fireEvent.keyDown(grip("Reorder Alpha"), { key: "ArrowUp" });
    fireEvent.keyDown(grip("Reorder Alpha"), { key: "ArrowUp" });
    fireEvent.keyDown(grip("Reorder Alpha"), { key: "Enter" });
    // Already first: the order is unchanged, so nothing is emitted at all.
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("cancels with Escape and emits nothing", () => {
    const { onReorder } = renderList();
    const bravo = grip("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    fireEvent.keyDown(grip("Reorder Bravo"), { key: "ArrowDown" });
    fireEvent.keyDown(grip("Reorder Bravo"), { key: "Escape" });
    expect(onReorder).not.toHaveBeenCalled();
    expect(announcement()).toMatch(/cancelled/i);
    expect(renderedOrder()).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("Space works exactly as Enter does", () => {
    const { onReorder } = renderList();
    const charlie = grip("Reorder Charlie");
    charlie.focus();
    fireEvent.keyDown(charlie, { key: " " });
    fireEvent.keyDown(grip("Reorder Charlie"), { key: "ArrowUp" });
    fireEvent.keyDown(grip("Reorder Charlie"), { key: " " });
    expect(onReorder.mock.calls[0][0]).toEqual(["a", "c", "b"]);
  });

  it("never loses or duplicates a row, whatever the move", () => {
    const { onReorder } = renderList();
    const alpha = grip("Reorder Alpha");
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "Enter" });
    fireEvent.keyDown(grip("Reorder Alpha"), { key: "ArrowDown" });
    fireEvent.keyDown(grip("Reorder Alpha"), { key: "ArrowDown" });
    fireEvent.keyDown(grip("Reorder Alpha"), { key: "Enter" });
    expect([...onReorder.mock.calls[0][0]].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("SortableList — what it says", () => {
  it("teaches the keys on pick-up and never repeats them", () => {
    renderList();
    const bravo = grip("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    expect(announcement()).toMatch(/Picked up Bravo/);
    expect(announcement()).toMatch(/arrow keys/);

    fireEvent.keyDown(grip("Reorder Bravo"), { key: "ArrowUp" });
    expect(announcement()).toMatch(/Bravo moved to position 1 of 3/);
    expect(announcement()).not.toMatch(/arrow keys/);
  });

  it("names the grip with the object, so a column of them is distinguishable", () => {
    renderList();
    expect(grip("Reorder Alpha")).toBeInTheDocument();
    expect(grip("Reorder Charlie")).toBeInTheDocument();
  });

  it("describes the grip with instructions that exist once for the list", () => {
    renderList();
    const described = grip("Reorder Alpha").getAttribute("aria-describedby");
    expect(described).not.toBeNull();
    expect(document.querySelectorAll(`#${described}`)).toHaveLength(1);
  });
});

describe("SortableList — refusing to emit a stale order", () => {
  it("cancels when the collection changes under a held object", () => {
    const onReorder: ReorderSpy =
      vi.fn<(nextIds: readonly string[], detail: unknown) => void>();
    const { view } = renderList({ onReorder });
    const bravo = grip("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    fireEvent.keyDown(grip("Reorder Bravo"), { key: "ArrowUp" });

    // Another device deleted Charlie while the object was in the air.
    view.rerender(
      <DragProvider>
        <SortableList
          id="rows"
          kind="row"
          ariaLabel="Rows"
          items={[ITEMS[0]!, ITEMS[1]!]}
          getItemId={(item) => item.id}
          getItemLabel={(item) => item.title}
          onReorder={onReorder}
          renderItem={(item, api) => (
            <div>
              <SortableHandle {...api.handleProps} />
              <span>{item.title}</span>
            </div>
          )}
        />
      </DragProvider>,
    );

    expect(announcement()).toMatch(/this list changed somewhere else/i);
    expect(onReorder).not.toHaveBeenCalled();
    // …and the object is no longer held, so a stray Enter cannot commit it.
    expect(grip("Reorder Bravo")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("SortableList — a read-only collection", () => {
  it("offers a grip that cannot be used, and emits nothing", () => {
    const { onReorder } = renderList({ disabled: true });
    const bravo = grip("Reorder Bravo");
    expect(bravo).toBeDisabled();
    fireEvent.keyDown(bravo, { key: "Enter" });
    expect(grip("Reorder Bravo")).toHaveAttribute("aria-pressed", "false");
    expect(onReorder).not.toHaveBeenCalled();
  });
});

describe("SortableList — at rest", () => {
  it("renders no drag preview until something is actually picked up", () => {
    renderList();
    expect(document.querySelector(".dh-drag-preview")).toBeNull();
    expect(document.body.getAttribute("data-dh-dragging")).toBeNull();
  });

  it("keys rows by their canonical id, never by their index", () => {
    // Proved behaviourally: reordering the DATA must not remount the rows, so a
    // focused grip keeps focus across a re-render that changes every index.
    const { view } = renderList();
    grip("Reorder Charlie").focus();
    view.rerender(
      <DragProvider>
        <SortableList
          id="rows"
          kind="row"
          ariaLabel="Rows"
          items={[ITEMS[2]!, ITEMS[0]!, ITEMS[1]!]}
          getItemId={(item) => item.id}
          getItemLabel={(item) => item.title}
          onReorder={vi.fn()}
          renderItem={(item, api) => (
            <div>
              <SortableHandle {...api.handleProps} />
              <span>{item.title}</span>
            </div>
          )}
        />
      </DragProvider>,
    );
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Reorder Charlie",
    );
  });
});
