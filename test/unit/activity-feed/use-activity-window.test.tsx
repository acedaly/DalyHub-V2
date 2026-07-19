/**
 * DS-05 — the virtualisation windowing hook's ResizeObserver bookkeeping.
 *
 * Proves the review fixes: an element mounted BEFORE the observer is created still
 * becomes observed when the observer is created (callback refs run during commit,
 * before the passive effect); clearing a ref unobserves it; swapping an element
 * unobserves the previous one; and unmounting disconnects the observer.
 */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useActivityWindow } from "~/shared/activity-feed";

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  observed = new Set<Element>();
  disconnected = false;
  constructor(_callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.disconnected = true;
    this.observed.clear();
  }
}

const scrollRef = { current: null };

beforeEach(() => {
  MockResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWindow(enabled: boolean) {
  return renderHook(
    ({ enabled: e }: { enabled: boolean }) =>
      useActivityWindow({
        rowKeys: ["k1"],
        estimateRowHeight: () => 10,
        enabled: e,
        scrollElementRef: scrollRef,
      }),
    { initialProps: { enabled } },
  );
}

describe("useActivityWindow — ResizeObserver registration", () => {
  it("observes an element that mounted before the observer was created", () => {
    const el = document.createElement("div");
    const { result, rerender } = renderWindow(false);

    // Register the row while virtualisation (and thus the observer) is disabled.
    act(() => result.current.rowRef("k1")(el));
    expect(MockResizeObserver.instances).toHaveLength(0);

    // Enabling creates the observer, which must pick up the already-mounted row.
    rerender({ enabled: true });
    const observer = MockResizeObserver.instances.at(-1);
    expect(observer?.observed.has(el)).toBe(true);
  });

  it("unobserves an element when its ref is cleared (row leaves the window)", () => {
    const el = document.createElement("div");
    const { result } = renderWindow(true);
    const observer = MockResizeObserver.instances.at(-1);

    act(() => result.current.rowRef("k1")(el));
    expect(observer?.observed.has(el)).toBe(true);

    act(() => result.current.rowRef("k1")(null));
    expect(observer?.observed.has(el)).toBe(false);
  });

  it("unobserves the previous element when a key's element is swapped", () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    const { result } = renderWindow(true);
    const observer = MockResizeObserver.instances.at(-1);

    act(() => result.current.rowRef("k1")(first));
    act(() => result.current.rowRef("k1")(second));

    expect(observer?.observed.has(first)).toBe(false);
    expect(observer?.observed.has(second)).toBe(true);
  });

  it("disconnects the observer on unmount", () => {
    const el = document.createElement("div");
    const { result, unmount } = renderWindow(true);
    const observer = MockResizeObserver.instances.at(-1);

    act(() => result.current.rowRef("k1")(el));
    unmount();

    expect(observer?.disconnected).toBe(true);
  });
});
