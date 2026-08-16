/**
 * CONTROL-01 — the DalyHub month grid.
 *
 * The risk in replacing a native `<input type="date">` is not that the pixels
 * are wrong; it is that the DATES are. A hand-built calendar that reads a
 * weekday through the local clock puts Saturday on Friday for every owner west
 * of Greenwich, and a month that pads its first week from a `new Date()` walks
 * a day at the boundary. These pin the arithmetic, and the keyboard contract
 * that has to replace the platform's.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CalendarGrid } from "~/shared/forms/CalendarGrid";

function grid(props: Partial<React.ComponentProps<typeof CalendarGrid>> = {}) {
  const onSelect = vi.fn();
  render(
    <CalendarGrid
      label="Due date"
      value={props.value ?? "2026-09-03"}
      todayIso={props.todayIso ?? "2026-09-01"}
      onSelect={props.onSelect ?? onSelect}
      {...props}
    />,
  );
  return { onSelect, node: screen.getByRole("grid", { name: "Due date" }) };
}

describe("CalendarGrid — the month it draws", () => {
  it("starts the week on Monday, like the product's own week strip", () => {
    const { node } = grid();
    const heads = within(node).getAllByRole("columnheader");
    expect(heads.map((head) => head.getAttribute("aria-label"))).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });

  it("pads the first week from the month's real weekday", () => {
    // 1 September 2026 is a Tuesday, so the grid opens with one blank cell.
    const { node } = grid();
    const firstWeek = within(node).getAllByRole("row")[1] as HTMLElement;
    const cells = within(firstWeek).getAllByRole("gridcell");
    expect(cells).toHaveLength(7);
    expect(within(cells[0]!).queryByRole("button")).toBeNull();
    expect(within(cells[1]!).getByRole("button")).toHaveAccessibleName(
      "Tuesday 1 September 2026, today",
    );
  });

  it("draws every day of the month and no more", () => {
    const { node } = grid();
    // September has 30 days.
    expect(
      within(node)
        .getAllByRole("button")
        .filter((button) => button.hasAttribute("data-iso")),
    ).toHaveLength(30);
  });

  it("gets February right in a leap year", () => {
    // The classic off-by-one, and the one a hand-rolled `daysInMonth` gets wrong.
    const { node } = grid({ value: "2028-02-10", todayIso: "2028-02-10" });
    expect(
      within(node)
        .getAllByRole("button")
        .filter((button) => button.hasAttribute("data-iso")),
    ).toHaveLength(29);
  });

  it("names a day by its full date, never by its number alone", () => {
    const { node } = grid();
    expect(
      within(node).getByRole("button", { name: "Wednesday 30 September 2026" }),
    ).toBeInTheDocument();
  });

  it("says 'today' in words as well as drawing a ring", () => {
    // AGENTS.md §15 — never a mark or a colour alone.
    const { node } = grid();
    expect(
      within(node).getByRole("button", {
        name: "Tuesday 1 September 2026, today",
      }),
    ).toHaveAttribute("data-today", "true");
  });

  it("marks no day as today when the surface has no honest one", () => {
    // A wrong "today" on a calendar is worse than none: the owner's day is a
    // server fact (ADR-022), never the browser clock.
    const { node } = grid({ todayIso: null });
    expect(node.querySelector("[data-today]")).toBeNull();
  });
});

describe("CalendarGrid — the keyboard", () => {
  it("costs ONE tab stop, not forty-two", () => {
    const { node } = grid();
    expect(node.querySelectorAll("button:not([tabindex='-1'])")).toHaveLength(
      1,
    );
  });

  it("moves a day with arrows and a week with up/down", () => {
    const { node } = grid();
    const focused = () =>
      node.querySelector("button:not([tabindex='-1'])") as HTMLElement;
    fireEvent.keyDown(node, { key: "ArrowRight" });
    expect(focused()).toHaveAccessibleName("Friday 4 September 2026");
    fireEvent.keyDown(node, { key: "ArrowDown" });
    expect(focused()).toHaveAccessibleName("Friday 11 September 2026");
    fireEvent.keyDown(node, { key: "ArrowUp" });
    expect(focused()).toHaveAccessibleName("Friday 4 September 2026");
    fireEvent.keyDown(node, { key: "ArrowLeft" });
    expect(focused()).toHaveAccessibleName("Thursday 3 September 2026");
  });

  it("jumps to the week's ends, Monday-first", () => {
    const { node } = grid();
    const focused = () =>
      node.querySelector("button:not([tabindex='-1'])") as HTMLElement;
    fireEvent.keyDown(node, { key: "Home" });
    expect(focused()).toHaveAccessibleName("Monday 31 August 2026");
    fireEvent.keyDown(node, { key: "End" });
    expect(focused()).toHaveAccessibleName("Sunday 6 September 2026");
  });

  it("crosses a month with an ARROW, not only with the chevrons", () => {
    // A keyboard user reaching the 1st of next month must not have to leave the
    // grid to find a month button.
    const { node } = grid({ value: "2026-09-30", todayIso: "2026-09-01" });
    fireEvent.keyDown(node, { key: "ArrowRight" });
    expect(screen.getByText("October 2026")).toBeInTheDocument();
    expect(
      node.querySelector("button:not([tabindex='-1'])"),
    ).toHaveAccessibleName("Thursday 1 October 2026");
  });

  it("clamps the day when a month is too short for it", () => {
    // 31 January → February has no 31st. Clamping beats silently landing in
    // March, which is what naive date arithmetic does.
    const { node } = grid({ value: "2026-01-31", todayIso: "2026-01-01" });
    fireEvent.keyDown(node, { key: "PageDown" });
    expect(screen.getByText("February 2026")).toBeInTheDocument();
    expect(
      node.querySelector("button:not([tabindex='-1'])"),
    ).toHaveAccessibleName("Saturday 28 February 2026");
  });

  it("commits the selected day as an ISO date", () => {
    const { node, onSelect } = grid();
    fireEvent.click(
      within(node).getByRole("button", { name: "Monday 14 September 2026" }),
    );
    expect(onSelect).toHaveBeenCalledWith("2026-09-14");
  });
});
