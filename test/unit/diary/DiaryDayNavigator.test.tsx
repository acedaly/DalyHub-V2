import { RouterProvider, createMemoryRouter, useLocation } from "react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DiaryDayNavigator } from "~/modules/diary/DiaryDayNavigator";

/**
 * DIARY-01B — the Day-mode date navigator: previous/next/Today and a native picker,
 * URL-backed, dropping the scope-bound cursor; "today" is the canonical default
 * (cleared param); invalid never breaks because the loader anchors the range.
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

describe("Diary day navigator", () => {
  it("steps to the previous day and drops the cursor", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15&cursor=abc");
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    expect(search()).toContain("date=2026-07-14");
    expect(search()).not.toContain("cursor");
  });

  it("steps to the next day", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(search()).toContain("date=2026-07-16");
  });

  it("jumps to today by clearing the date param", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(search()).not.toContain("date=");
  });

  it("disables Today when already on today", () => {
    renderNav("2026-07-20", "2026-07-20", "/diary");
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
  });

  it("navigates to a picked date via the accessible picker", () => {
    renderNav("2026-07-15", "2026-07-20", "/diary?date=2026-07-15");
    fireEvent.change(screen.getByLabelText("Select date"), {
      target: { value: "2026-07-02" },
    });
    expect(search()).toContain("date=2026-07-02");
  });
});
