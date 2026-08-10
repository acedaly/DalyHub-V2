import { RouterProvider, createMemoryRouter, useLocation } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiaryDayNavigator } from "~/modules/diary/DiaryDayNavigator";

/**
 * DIARY-01B / UIX-04 §18 — the Day-mode date navigator, as a WEEK STRIP.
 *
 * The contract these tests pin is unchanged in substance and changed in shape:
 * the URL is still the whole state, "today" is still the canonical default
 * expressed by the ABSENCE of `?date=`, and a date change is still a scope
 * change that drops the pagination cursor. What moved is HOW a day is chosen —
 * seven day links instead of two steppers — so the assertions address days by
 * their full accessible name (which is the date, not the number on the tile) and
 * the steppers now move a WEEK.
 */

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="search">{location.search}</output>;
}

function renderNav(selectedDate: string, todayKey: string, url: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/diary",
        element: (
          <>
            <DiaryDayNavigator
              selectedDate={selectedDate}
              todayKey={todayKey}
            />
            <LocationProbe />
          </>
        ),
      },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
}

const search = () => screen.getByTestId("search").textContent ?? "";

describe("Diary week strip", () => {
  it("shows the seven days of the selected day's week, Monday first", () => {
    // 2026-07-15 is a Wednesday, so its week runs Mon 13 → Sun 19.
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    for (const label of [
      "Monday, 13 July 2026",
      "Tuesday, 14 July 2026",
      "Wednesday, 15 July 2026",
      "Thursday, 16 July 2026",
      "Friday, 17 July 2026",
      "Saturday, 18 July 2026",
      "Sunday, 19 July 2026",
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("selects a day and drops the scope-bound cursor", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15&cursor=abc");
    fireEvent.click(
      screen.getByRole("link", { name: "Thursday, 16 July 2026" }),
    );
    expect(search()).toContain("date=2026-07-16");
    expect(search()).not.toContain("cursor");
  });

  it("marks the selected day with aria-current, and only that day", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "date");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName("Wednesday, 15 July 2026");
  });

  it("names today in words, not by colour alone", () => {
    // Today's own week, so today is both the selected day AND today: the two
    // states are independent (a diary is mostly used to look at days that are
    // not today), and this is the one case where they coincide.
    renderNav("2026-07-20", "2026-07-20", "/diary");
    expect(
      screen.getByRole("link", { name: "Monday, 20 July 2026 (today)" }),
    ).toHaveAttribute("aria-current", "date");
  });

  it("steps a whole week back, and forward", () => {
    // Both are asserted against the SAME rendered `selectedDate`, because this
    // component is a pure function of its props: in the product the loader
    // re-renders it with the new day, but here the two links are simply the
    // seven-day offsets either side of the 15th.
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    fireEvent.click(screen.getByRole("link", { name: "Previous week" }));
    expect(search()).toContain("date=2026-07-08");

    fireEvent.click(screen.getByRole("link", { name: "Next week" }));
    expect(search()).toContain("date=2026-07-22");
  });

  it("jumps to today by clearing the date param", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    fireEvent.click(screen.getByRole("link", { name: "Today" }));
    expect(search()).not.toContain("date=");
  });

  it("marks Today as unavailable when it is already the selected day", () => {
    renderNav("2026-07-20", "2026-07-20", "/diary");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("navigates to a picked date via the accessible picker", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    fireEvent.change(
      screen.getByLabelText(/Go to a date — showing Wednesday, 15 July 2026/),
      { target: { value: "2026-07-02" } },
    );
    expect(search()).toContain("date=2026-07-02");
  });

  it("drops an open panel when the day changes", () => {
    // Selecting a day must not carry `?inspector=` into the new day, which would
    // reopen the previous day's entry over the new one's timeline.
    renderNav(
      "2026-07-15",
      "2026-07-20",
      "/diary?date=2026-07-15&inspector=view:e1",
    );
    fireEvent.click(screen.getByRole("link", { name: "Friday, 17 July 2026" }));
    expect(search()).toContain("date=2026-07-17");
    expect(search()).not.toContain("inspector");
  });
});
