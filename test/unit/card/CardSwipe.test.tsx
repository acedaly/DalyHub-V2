/**
 * DS-04 (TODAY-06) — Card swipe quick-actions behaviour (component).
 *
 * Proves the acceptance criteria of the touch swipe accelerator with real pointer
 * events in a touch-first environment (matchMedia stubbed to report a coarse,
 * hover-none device): a clear horizontal swipe reveals the tray; a minor drag does
 * NOT; a vertical drag is never captured (page scroll preserved); a handled swipe
 * never also opens the card; a tray action drives the SAME `CardAction` handler and
 * closes the tray; only one tray is open at a time; a disabled tray action cannot
 * fire; and on a non-touch device swipe is inert (mouse/keyboard behaviour is
 * unchanged). Real gesture geometry is additionally covered by Playwright.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import { Card } from "~/shared/card";
import type { CardAction, CardProps } from "~/shared/card";
import { closeActiveSwipeTray } from "~/shared/card";

/** Stub `matchMedia` so the hook sees a touch-first (or non-touch) device. */
function stubMatchMedia(touchFirst: boolean): MockInstance {
  const impl = (query: string): MediaQueryList =>
    ({
      matches: touchFirst,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  return vi.spyOn(window, "matchMedia").mockImplementation(impl);
}

/** A horizontal (or diagonal) drag over the card surface via real pointer events. */
function drag(
  el: Element,
  { dx, dy }: { dx: number; dy: number },
  pointerId = 1,
) {
  const start = { clientX: 200, clientY: 200, pointerId, button: 0 };
  fireEvent.pointerDown(el, start);
  fireEvent.pointerMove(el, {
    clientX: 200 + dx,
    clientY: 200 + dy,
    pointerId,
  });
  fireEvent.pointerUp(el, {
    clientX: 200 + dx,
    clientY: 200 + dy,
    pointerId,
  });
}

function renderSwipeCard(overrides: Partial<CardProps> = {}) {
  const onComplete = vi.fn();
  const onPlan = vi.fn();
  const onOpen = vi.fn();
  const swipeActions: CardAction[] = [
    { id: "complete", label: "Complete", onSelect: onComplete },
    { id: "plan", label: "Plan today", onSelect: onPlan },
  ];
  const utils = render(
    <Card
      id="t-1"
      title="Draft the proposal"
      typeLabel="Task"
      onOpen={onOpen}
      quickActions={swipeActions}
      swipeActions={swipeActions}
      data-testid="task-card"
      {...overrides}
    />,
  );
  const card = screen.getByTestId("task-card");
  return { ...utils, card, onComplete, onPlan, onOpen };
}

describe("Card swipe — touch-first device", () => {
  beforeEach(() => stubMatchMedia(true));
  afterEach(() => {
    closeActiveSwipeTray();
    vi.restoreAllMocks();
  });

  it("reveals the action tray on a clear horizontal swipe", () => {
    const { card } = renderSwipeCard();
    expect(card).toHaveAttribute("data-swipe-open", "false");
    drag(card, { dx: -120, dy: 0 });
    expect(card).toHaveAttribute("data-swipe-open", "true");
  });

  it("does NOT reveal the tray from a minor accidental drag (below threshold)", () => {
    const { card, onOpen } = renderSwipeCard();
    drag(card, { dx: -6, dy: 2 });
    expect(card).toHaveAttribute("data-swipe-open", "false");
    // A minor movement is a tap: the card still opens on the ensuing click.
    fireEvent.click(screen.getByRole("button", { name: "Draft the proposal" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not capture a vertical drag (page scroll is preserved)", () => {
    const { card, onOpen } = renderSwipeCard();
    drag(card, { dx: -8, dy: -60 });
    expect(card).toHaveAttribute("data-swipe-open", "false");
    // The vertical gesture never claimed the pointer, so a tap still opens.
    fireEvent.click(screen.getByRole("button", { name: "Draft the proposal" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open the card after a handled swipe (the tap-open is suppressed)", () => {
    const { card, onOpen } = renderSwipeCard();
    drag(card, { dx: -120, dy: 0 });
    // The synthetic compatibility click a touch fires after the swipe is swallowed.
    fireEvent.click(screen.getByRole("button", { name: "Draft the proposal" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(card).toHaveAttribute("data-swipe-open", "true");
  });

  it("does not swallow a genuine tap after a swipe that emitted NO compatibility click", () => {
    const { card, onOpen } = renderSwipeCard();
    // A swipe arms click-suppression...
    drag(card, { dx: -120, dy: 0 });
    expect(card).toHaveAttribute("data-swipe-open", "true");
    // ...but no compatibility click follows (not every mobile browser emits one).
    // A later DELIBERATE tap must still open the card: its pointer-down clears the
    // stale suppression, so suppression can never remain armed across gestures.
    fireEvent.pointerDown(card, {
      clientX: 200,
      clientY: 200,
      pointerId: 2,
      button: 0,
    });
    fireEvent.pointerUp(card, { clientX: 200, clientY: 200, pointerId: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Draft the proposal" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("fires the SAME action handler from the tray and then closes it", () => {
    const { card, onComplete } = renderSwipeCard();
    drag(card, { dx: -120, dy: 0 });
    expect(card).toHaveAttribute("data-swipe-open", "true");
    // The tray is an aria-hidden duplicate; grab its button by text within the card.
    const trayButtons = within(card.parentElement as HTMLElement).getAllByText(
      "Complete",
    );
    // Two "Complete" controls exist (visible quick action + tray); the tray one is
    // inside .dh-card__swipe-tray.
    const trayButton = trayButtons
      .map((node) => node.closest(".dh-card__swipe-action"))
      .find((node): node is HTMLElement => node !== null);
    expect(trayButton).toBeTruthy();
    fireEvent.click(trayButton!);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(card).toHaveAttribute("data-swipe-open", "false");
  });

  it("keeps only one tray open at a time across cards", () => {
    render(
      <>
        <Card
          id="a"
          title="Card A"
          onOpen={() => {}}
          swipeActions={[{ id: "x", label: "X", onSelect: () => {} }]}
          data-testid="card-a"
        />
        <Card
          id="b"
          title="Card B"
          onOpen={() => {}}
          swipeActions={[{ id: "y", label: "Y", onSelect: () => {} }]}
          data-testid="card-b"
        />
      </>,
    );
    const a = screen.getByTestId("card-a");
    const b = screen.getByTestId("card-b");
    drag(a, { dx: -120, dy: 0 });
    expect(a).toHaveAttribute("data-swipe-open", "true");
    drag(b, { dx: -120, dy: 0 });
    expect(b).toHaveAttribute("data-swipe-open", "true");
    expect(a).toHaveAttribute("data-swipe-open", "false");
  });

  it("does not start a swipe from a nested control (checkbox stays operable)", () => {
    const onSelectedChange = vi.fn();
    const { card } = renderSwipeCard({
      selection: { selected: false, onSelectedChange },
    });
    const checkbox = within(card).getByRole("checkbox");
    // A press+drag that starts on the checkbox must not engage the swipe.
    drag(checkbox, { dx: -120, dy: 0 });
    expect(card).toHaveAttribute("data-swipe-open", "false");
    fireEvent.click(checkbox);
    expect(onSelectedChange).toHaveBeenCalled();
  });

  it("a disabled tray action cannot fire", () => {
    const onSelect = vi.fn();
    const { card } = renderSwipeCard({
      swipeActions: [{ id: "d", label: "Blocked", onSelect, disabled: true }],
    });
    drag(card, { dx: -120, dy: 0 });
    const trayButton = (card.parentElement as HTMLElement).querySelector(
      ".dh-card__swipe-action",
    ) as HTMLButtonElement;
    expect(trayButton).toBeTruthy();
    expect(trayButton.disabled).toBe(true);
    fireEvent.click(trayButton);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("Card swipe — non-touch device is inert", () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => {
    closeActiveSwipeTray();
    vi.restoreAllMocks();
  });

  it("never reveals the tray and opens the card normally on click", () => {
    const { card, onOpen } = renderSwipeCard();
    drag(card, { dx: -120, dy: 0 });
    expect(card).toHaveAttribute("data-swipe-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "Draft the proposal" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
