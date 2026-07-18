/**
 * DS-04 — the accessible keyboard reorder path.
 *
 * Proves keyboard reorder emits the correct intent, a cancelled reorder does not
 * change order, pinned (non-reorderable) cards cannot move, focus stays on the
 * handle after a move, and the collection never loses/duplicates a card. (Pointer
 * reorder is covered end-to-end by Playwright, where real geometry exists.)
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
