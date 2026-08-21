/**
 * DHDS-11 — destinations: what they accept, what they draw, and when a request
 * is allowed to happen.
 *
 * A DOM test has no layout, so the geometry every destination is hit-tested
 * against is supplied here explicitly. That is not a shortcut around the
 * product — the rectangles are the only thing being faked, and everything the
 * assertions read (which target resolved, what it drew, what it announced, what
 * it called and when) is the real provider running its real pointer loop.
 *
 * The three rules this exists to protect:
 *
 *   1. a destination that would not CHANGE anything never lights up (§37);
 *   2. NOTHING is requested while the pointer merely passes over a target —
 *      a mutation happens on a committed drop and at no other moment (§55);
 *   3. a release over empty space is a cancellation, not an error (§37).
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DragHandle,
  DragProvider,
  useDragHandle,
  useDropTarget,
} from "~/shared/drag";
import type { DragPayload } from "~/shared/drag";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** Rectangles by `data-rect`, so the fixture states its own layout. */
const RECTS: Record<string, [number, number, number, number]> = {
  // [left, top, right, bottom]
  work: [0, 0, 200, 100],
  personal: [0, 100, 200, 200],
};

let originalRect: typeof Element.prototype.getBoundingClientRect;

beforeEach(() => {
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function rect(this: Element) {
    const key = this.getAttribute?.("data-rect");
    const box = key === null || key === undefined ? undefined : RECTS[key];
    const [left, top, right, bottom] = box ?? [0, 0, 0, 0];
    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  };
  // The provider asks the document what is under the pointer in order to find a
  // scroll container. Nothing is, here, and the viewport must not scroll.
  document.elementFromPoint = () => null;
  window.scrollBy = () => {};
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalRect;
});

/** Let the provider's animation frame run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

/* -------------------------------------------------------------------------- */
/* Fixture                                                                     */
/* -------------------------------------------------------------------------- */

function Bucket({
  id,
  label,
  currentOf,
  onDrop,
}: {
  readonly id: string;
  readonly label: string;
  /** The payload this bucket already holds — it must refuse its own object. */
  readonly currentOf: string | null;
  readonly onDrop: (payload: DragPayload) => void;
}) {
  const drop = useDropTarget({
    id,
    label,
    accepts: (payload) =>
      payload.kind === "task" && payload.data?.bucket !== currentOf,
    onDrop,
  });
  return (
    <section
      ref={drop.ref}
      data-rect={id}
      data-testid={`bucket-${id}`}
      aria-label={label}
      data-dh-drop-candidate={drop.isCandidate ? "true" : undefined}
      data-dh-drop-active={drop.isActive ? "true" : undefined}
    />
  );
}

function Source({ bucket }: { readonly bucket: string }) {
  const { handleProps } = useDragHandle({
    payload: {
      kind: "task",
      id: "t-1",
      label: "Prepare training brief",
      data: { bucket },
    },
    renderPreview: () => <span>Prepare training brief</span>,
    label: "Move Prepare training brief",
  });
  return (
    <div data-dh-drag-item="true" data-rect="work">
      <DragHandle {...handleProps} />
    </div>
  );
}

function renderBoard(onDrop = vi.fn()) {
  render(
    <DragProvider>
      <Source bucket="work" />
      <Bucket id="work" label="Work" currentOf="work" onDrop={onDrop} />
      <Bucket
        id="personal"
        label="Personal"
        currentOf="personal"
        onDrop={onDrop}
      />
    </DragProvider>,
  );
  return { onDrop };
}

const bucket = (id: string) => screen.getByTestId(`bucket-${id}`);
const grip = () =>
  screen.getByRole("button", { name: "Move Prepare training brief" });

function announcement(): string {
  return screen
    .getAllByRole("status")
    .map((region) => region.textContent ?? "")
    .join(" ");
}

async function lift() {
  fireEvent.pointerDown(grip(), { button: 0, clientX: 10, clientY: 10 });
  await settle();
}

async function moveTo(x: number, y: number) {
  fireEvent.pointerMove(window, { clientX: x, clientY: y });
  await settle();
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

describe("a destination that would change nothing", () => {
  it("is not a candidate at all, so it can never light up and then refuse", async () => {
    renderBoard();
    await lift();
    expect(bucket("work")).not.toHaveAttribute("data-dh-drop-candidate");
    expect(bucket("personal")).toHaveAttribute(
      "data-dh-drop-candidate",
      "true",
    );
  });

  it("stays dark even with the pointer directly over it", async () => {
    renderBoard();
    await lift();
    await moveTo(100, 50); // inside Work
    expect(bucket("work")).not.toHaveAttribute("data-dh-drop-active");
  });

  it("does not commit when the object is released over it", async () => {
    const { onDrop } = renderBoard();
    await lift();
    await moveTo(100, 50);
    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(onDrop).not.toHaveBeenCalled();
    expect(announcement()).toMatch(/stayed where it was/i);
  });
});

describe("progressive disclosure", () => {
  it("draws nothing on anything until a drag actually starts", () => {
    renderBoard();
    expect(bucket("personal")).not.toHaveAttribute("data-dh-drop-candidate");
    expect(bucket("work")).not.toHaveAttribute("data-dh-drop-candidate");
  });

  it("promotes exactly ONE destination to active — the one under the pointer", async () => {
    renderBoard();
    await lift();
    await moveTo(100, 150); // inside Personal
    expect(bucket("personal")).toHaveAttribute("data-dh-drop-active", "true");
    expect(bucket("work")).not.toHaveAttribute("data-dh-drop-active");
    expect(
      document.querySelectorAll('[data-dh-drop-active="true"]'),
    ).toHaveLength(1);
  });

  it("returns every destination to rest when the drag ends", async () => {
    renderBoard();
    await lift();
    await moveTo(100, 150);
    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(
      document.querySelectorAll('[data-dh-drop-candidate="true"]'),
    ).toHaveLength(0);
  });
});

describe("committing", () => {
  it("calls the destination's own handler ONCE, on release", async () => {
    const { onDrop } = renderBoard();
    await lift();
    await moveTo(100, 120);
    // Still nothing: passing over a target is not an operation.
    expect(onDrop).not.toHaveBeenCalled();
    await moveTo(100, 180);
    expect(onDrop).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop.mock.calls[0][0]).toMatchObject({
      kind: "task",
      id: "t-1",
      label: "Prepare training brief",
    });
  });

  it("announces the destination in the product's words", async () => {
    renderBoard();
    await lift();
    await moveTo(100, 150);
    expect(announcement()).toMatch(
      /Prepare training brief over Personal\. Release to move\./,
    );
    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(announcement()).toMatch(
      /Prepare training brief moved to Personal\./,
    );
  });

  it("treats a release over empty space as a change of mind, not an error", async () => {
    const { onDrop } = renderBoard();
    await lift();
    await moveTo(900, 900); // outside every rectangle
    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(onDrop).not.toHaveBeenCalled();
    expect(announcement()).toMatch(/Move cancelled/);
    expect(announcement()).not.toMatch(/error|failed|couldn/i);
  });

  it("abandons the drag on Escape without committing anything", async () => {
    const { onDrop } = renderBoard();
    await lift();
    await moveTo(100, 150);
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onDrop).not.toHaveBeenCalled();
    expect(
      document.querySelectorAll('[data-dh-drop-active="true"]'),
    ).toHaveLength(0);
  });
});

describe("the floating object", () => {
  it("exists only while a pointer drag is live, and is inert to the pointer", async () => {
    renderBoard();
    expect(document.querySelector(".dh-drag-preview")).toBeNull();
    await lift();
    const layer = document.querySelector(".dh-drag-layer");
    expect(layer).not.toBeNull();
    // `aria-hidden`, because the object it depicts is already in the document
    // and the live region is what tells a screen reader where it is.
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(document.querySelector(".dh-drag-preview")?.textContent).toBe(
      "Prepare training brief",
    );
    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(document.querySelector(".dh-drag-preview")).toBeNull();
  });

  it("marks the document as dragging so the whole page can show one cursor", async () => {
    renderBoard();
    await lift();
    expect(document.body.getAttribute("data-dh-dragging")).toBe("true");
    await act(async () => {
      fireEvent.pointerUp(window);
    });
    expect(document.body.getAttribute("data-dh-dragging")).toBeNull();
  });
});
