/**
 * DS-04 — the accessible keyboard reorder path.
 *
 * Proves keyboard reorder emits the correct intent, a cancelled reorder does not
 * change order, pinned (non-reorderable) cards cannot move, focus stays on the
 * handle after a move, and the collection never loses/duplicates a card. (Pointer
 * reorder is covered end-to-end by Playwright, where real geometry exists.)
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Card,
  CardReorderHandle,
  ReorderableCardCollection,
} from "~/shared/card";

interface Row {
  readonly id: string;
  readonly title: string;
  readonly pinned?: boolean;
}

const ITEMS: readonly Row[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Bravo" },
  { id: "c", title: "Charlie" },
  { id: "d", title: "Delta", pinned: true },
];

function renderCollection(onReorder = vi.fn()) {
  render(
    <ReorderableCardCollection
      items={ITEMS}
      getItemId={(item) => item.id}
      getItemLabel={(item) => item.title}
      isReorderable={(item) => !item.pinned}
      ariaLabel="Records"
      onReorder={onReorder}
      renderItem={(item, { handleProps }) => (
        <Card
          id={item.id}
          title={item.title}
          onOpen={() => {}}
          reorderHandle={<CardReorderHandle {...handleProps} />}
        />
      )}
    />,
  );
  return { onReorder };
}

function handle(name: string) {
  return screen.getByRole("button", { name });
}

describe("ReorderableCardCollection — keyboard", () => {
  it("picks up, moves and drops, emitting the reorder intent", () => {
    const { onReorder } = renderCollection();
    const bravo = handle("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    expect(handle("Reorder Bravo")).toHaveAttribute("aria-pressed", "true");

    fireEvent.keyDown(handle("Reorder Bravo"), { key: "ArrowUp" });
    fireEvent.keyDown(handle("Reorder Bravo"), { key: "Enter" });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toEqual(["b", "a", "c", "d"]);
    expect(onReorder.mock.calls[0][1]).toMatchObject({
      id: "b",
      fromIndex: 1,
      toIndex: 0,
    });
  });

  it("keeps focus on the handle after a move", () => {
    renderCollection();
    const bravo = handle("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    fireEvent.keyDown(handle("Reorder Bravo"), { key: "ArrowDown" });
    fireEvent.keyDown(handle("Reorder Bravo"), { key: "Enter" });
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Reorder Bravo",
    );
  });

  it("cancels with Escape, leaving the order unchanged", () => {
    const { onReorder } = renderCollection();
    const bravo = handle("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    fireEvent.keyDown(handle("Reorder Bravo"), { key: "ArrowDown" });
    fireEvent.keyDown(handle("Reorder Bravo"), { key: "Escape" });
    expect(onReorder).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/cancelled/i);
  });

  it("announces the pick-up in a live region", () => {
    renderCollection();
    const bravo = handle("Reorder Bravo");
    bravo.focus();
    fireEvent.keyDown(bravo, { key: "Enter" });
    expect(screen.getByRole("status")).toHaveTextContent(/Picked up Bravo/);
  });

  it("cannot move a pinned (non-reorderable) card", () => {
    const { onReorder } = renderCollection();
    const delta = handle("Reorder Delta");
    expect(delta).toBeDisabled();
    fireEvent.keyDown(delta, { key: "Enter" });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("keeps every card exactly once through a move (no loss/duplication)", () => {
    const { onReorder } = renderCollection();
    const alpha = handle("Reorder Alpha");
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "Enter" });
    fireEvent.keyDown(handle("Reorder Alpha"), { key: "ArrowDown" });
    fireEvent.keyDown(handle("Reorder Alpha"), { key: "Enter" });
    const next = onReorder.mock.calls[0][0] as string[];
    expect([...next].sort()).toEqual(["a", "b", "c", "d"]);
    // The pinned 'd' stays last.
    expect(next[3]).toBe("d");
  });
});

/* -------------------------------------------------------------------------- */
/* Mid-drag collection changes                                                 */
/* -------------------------------------------------------------------------- */

interface Item {
  readonly id: string;
  readonly title: string;
}

function Coll({
  items,
  pinnedIds = [],
  onReorder,
}: {
  items: readonly Item[];
  pinnedIds?: readonly string[];
  onReorder: (nextIds: string[]) => void;
}) {
  return (
    <ReorderableCardCollection
      items={items}
      getItemId={(item) => item.id}
      getItemLabel={(item) => item.title}
      isReorderable={(item) => !pinnedIds.includes(item.id)}
      ariaLabel="Records"
      onReorder={onReorder}
      renderItem={(item, { handleProps }) => (
        <Card
          id={item.id}
          title={item.title}
          onOpen={() => {}}
          reorderHandle={<CardReorderHandle {...handleProps} />}
        />
      )}
    />
  );
}

const BASE: readonly Item[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Bravo" },
  { id: "c", title: "Charlie" },
];

function pickUpBravo() {
  const bravo = screen.getByRole("button", { name: "Reorder Bravo" });
  bravo.focus();
  fireEvent.keyDown(bravo, { key: "Enter" });
}

describe("ReorderableCardCollection — mid-drag collection changes", () => {
  it("cancels when another item is removed during a drag", () => {
    const onReorder = vi.fn();
    const { rerender } = render(<Coll items={BASE} onReorder={onReorder} />);
    pickUpBravo();
    rerender(
      <Coll
        items={[BASE[0], BASE[1]]} // Charlie removed
        onReorder={onReorder}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/list changed/i);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("cancels when another item is added during a drag", () => {
    const onReorder = vi.fn();
    const { rerender } = render(<Coll items={BASE} onReorder={onReorder} />);
    pickUpBravo();
    rerender(
      <Coll
        items={[...BASE, { id: "d", title: "Delta" }]}
        onReorder={onReorder}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/list changed/i);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("cancels when the parent order changes externally during a drag", () => {
    const onReorder = vi.fn();
    const { rerender } = render(<Coll items={BASE} onReorder={onReorder} />);
    pickUpBravo();
    rerender(
      <Coll items={[BASE[2], BASE[0], BASE[1]]} onReorder={onReorder} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/list changed/i);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("cancels when an item’s reorderable/pinned state changes during a drag", () => {
    const onReorder = vi.fn();
    const { rerender } = render(<Coll items={BASE} onReorder={onReorder} />);
    pickUpBravo();
    rerender(<Coll items={BASE} pinnedIds={["c"]} onReorder={onReorder} />);
    expect(screen.getByRole("status")).toHaveTextContent(/list changed/i);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does not fire onReorder on a drop after an invalidated drag", () => {
    const onReorder = vi.fn();
    const { rerender } = render(<Coll items={BASE} onReorder={onReorder} />);
    pickUpBravo();
    // Invalidate.
    rerender(<Coll items={[BASE[0], BASE[1]]} onReorder={onReorder} />);
    // Attempting to drop now (Enter) does not emit a stale order.
    const bravo = screen.getByRole("button", { name: "Reorder Bravo" });
    fireEvent.keyDown(bravo, { key: "Enter" });
    fireEvent.keyDown(bravo, { key: "Enter" });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("still emits the correct order for an unchanged drag", () => {
    const onReorder = vi.fn();
    render(<Coll items={BASE} onReorder={onReorder} />);
    pickUpBravo();
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Bravo" }), {
      key: "ArrowUp",
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Bravo" }), {
      key: "Enter",
    });
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0][0]).toEqual(["b", "a", "c"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Pointer listener cleanup                                                    */
/* -------------------------------------------------------------------------- */

describe("ReorderableCardCollection — pointer listener cleanup", () => {
  const added: string[] = [];
  const removed: string[] = [];
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    addSpy?.mockRestore();
    removeSpy?.mockRestore();
    added.length = 0;
    removed.length = 0;
  });

  it("removes pointermove/up/cancel listeners after a pointer drag", () => {
    const onReorder = vi.fn();
    render(<Coll items={BASE} onReorder={onReorder} />);
    const bravo = screen.getByRole("button", { name: "Reorder Bravo" });

    // Spy AFTER the initial render so React's own setup listeners aren't affected;
    // observe only the drag effect's add/remove pairs. Delegate to the real impls.
    const realAdd = window.addEventListener.bind(window);
    const realRemove = window.removeEventListener.bind(window);
    addSpy = vi
      .spyOn(window, "addEventListener")
      .mockImplementation((type, listener, options) => {
        added.push(type as string);
        return realAdd(type, listener, options);
      });
    removeSpy = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation((type, listener, options) => {
        removed.push(type as string);
        return realRemove(type, listener, options);
      });

    // Begin a pointer drag; the effect registers window listeners.
    fireEvent.pointerDown(bravo, { button: 0 });
    expect(added.filter((t) => t === "pointercancel").length).toBeGreaterThan(
      0,
    );

    // End it via Escape (keyboard cancel), which tears the drag down and runs the
    // effect cleanup that must remove every pointer listener it added.
    fireEvent.keyDown(bravo, { key: "Escape" });

    const cancelAdds = added.filter((t) => t === "pointercancel").length;
    const cancelRemoves = removed.filter((t) => t === "pointercancel").length;
    // Every pointercancel listener that was added is also removed — none leak.
    expect(cancelRemoves).toBe(cancelAdds);
  });
});
