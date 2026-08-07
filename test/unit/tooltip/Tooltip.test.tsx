import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tooltip, composeRefs } from "~/shared/tooltip";

/**
 * M3-TIP — the ONE tooltip primitive, as BEHAVIOUR.
 *
 * The August 2026 interaction audit's finding 2 was not "the tooltips look
 * wrong", it was "`title` is the only tooltip mechanism, and `title` never
 * appears on keyboard focus". So the assertions that matter here are the ones
 * `title` could never have passed: a tooltip on `:focus-visible`, a real
 * `aria-describedby` association, Escape dismissal, and — the reason a tooltip
 * is safe to put on a toolbar at all — that it adds no Tab stop and takes no
 * focus.
 */

afterEach(() => {
  vi.useRealTimers();
});

function renderTooltip(props: Partial<Parameters<typeof Tooltip>[0]> = {}) {
  return render(
    <>
      <button type="button">before</button>
      <Tooltip label="Bold" {...props}>
        {(tip) => (
          <button
            type="button"
            ref={tip.ref}
            aria-label="Bold"
            aria-describedby={tip.describedBy}
          >
            B
          </button>
        )}
      </Tooltip>
      <button type="button">after</button>
    </>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole("button", { name: "Bold" });
}

describe("Tooltip", () => {
  it("shows nothing until the control is hovered or focused", () => {
    renderTooltip();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger()).not.toHaveAttribute("aria-describedby");
  });

  it("appears on pointer hover after the intent delay, and goes on pointer leave", () => {
    vi.useFakeTimers();
    renderTooltip();

    fireEvent.pointerEnter(trigger());
    // Deliberately not immediate: a tooltip that fires the instant a pointer
    // crosses a toolbar flashes thirteen times on the way past.
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Bold");

    fireEvent.pointerLeave(trigger());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("appears on KEYBOARD focus — the case `title` never covered", () => {
    renderTooltip();
    act(() => {
      trigger().focus();
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Bold");

    act(() => {
      trigger().blur();
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("associates itself with the trigger through aria-describedby", () => {
    renderTooltip();
    act(() => {
      trigger().focus();
    });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.id).toBeTruthy();
    expect(trigger()).toHaveAttribute("aria-describedby", tooltip.id);
    // The NAME still belongs to the control; the tooltip only describes it.
    expect(trigger()).toHaveAccessibleName("Bold");
    expect(trigger()).toHaveAccessibleDescription("Bold");
  });

  it("dismisses on Escape while leaving focus on the trigger", () => {
    renderTooltip();
    act(() => {
      trigger().focus();
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(trigger(), { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    // ...and the association goes with it, so nothing dangles.
    expect(trigger()).not.toHaveAttribute("aria-describedby");
  });

  it("adds no Tab stop and is never focusable", () => {
    renderTooltip();
    act(() => {
      trigger().focus();
    });
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).not.toHaveAttribute("tabindex");
    expect(
      tooltip.querySelectorAll("[tabindex], button, a, input"),
    ).toHaveLength(0);
    expect(trigger()).toHaveFocus();
  });

  it("does not open on a touch tap, which has no hover state", () => {
    vi.useFakeTimers();
    renderTooltip();
    fireEvent.pointerEnter(trigger(), { pointerType: "touch" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes when the control is pressed, so it never covers what the press opened", () => {
    vi.useFakeTimers();
    renderTooltip();
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.pointerDown(trigger());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders the keyboard shortcut through the shared formatter", () => {
    renderTooltip({ shortcut: "Mod-Shift-x" });
    act(() => {
      trigger().focus();
    });
    // The development environment is not an Apple platform, so `Mod` reads as
    // Ctrl — the same string the Command Palette and keyboard reference show.
    expect(screen.getByRole("tooltip")).toHaveTextContent("Ctrl+Shift+X");
  });

  it("renders the trigger but no tooltip when disabled", () => {
    renderTooltip({ disabled: true });
    act(() => {
      trigger().focus();
    });
    expect(trigger()).toBeInTheDocument();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not disturb the trigger's own click handler", () => {
    const onClick = vi.fn();
    render(
      <Tooltip label="Capture">
        {(tip) => (
          <button
            type="button"
            ref={tip.ref}
            aria-label="Capture"
            aria-describedby={tip.describedBy}
            onClick={onClick}
          >
            +
          </button>
        )}
      </Tooltip>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Capture" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("composeRefs", () => {
  it("gives the same node to a ref object and a ref callback", () => {
    const object = { current: null as HTMLButtonElement | null };
    const callback = vi.fn();
    render(
      <button type="button" ref={composeRefs(object, callback)}>
        both
      </button>,
    );
    const node = screen.getByRole("button", { name: "both" });
    expect(object.current).toBe(node);
    expect(callback).toHaveBeenCalledWith(node);
  });
});
