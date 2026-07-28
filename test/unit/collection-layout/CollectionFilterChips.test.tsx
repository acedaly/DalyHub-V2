/**
 * TASKS-03 — the shared active-filter chip row.
 *
 * The contract this asserts is what stops a filtered collection from silently
 * lying: every applied filter is named in WORDS, each has its own labelled remove
 * control naming what it removes, and one explicit Reset clears the filters
 * without throwing away the sort or the layout.
 */

import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CollectionFilterChips } from "~/shared/collection-layout";
import type { CollectionControlGroup } from "~/shared/collection-layout";

const GROUPS: readonly CollectionControlGroup[] = [
  {
    id: "priority",
    label: "Priority",
    param: "priority",
    options: [
      { value: "", label: "Any priority" },
      { value: "p1", label: "P1 · Urgent" },
    ],
  },
  {
    id: "due",
    label: "Due",
    param: "due",
    options: [
      { value: "", label: "Any due date" },
      { value: "overdue", label: "Overdue" },
    ],
  },
  {
    id: "sort",
    label: "Sort",
    param: "sort",
    kind: "sort",
    defaultValue: "smart",
    options: [
      { value: "smart", label: "Smart" },
      { value: "title", label: "Title" },
    ],
  },
];

function Harness({ search }: { readonly search: string }) {
  return (
    <MemoryRouter initialEntries={[`/tasks?${search}`]}>
      <Routes>
        <Route path="/tasks" element={<Chips />} />
      </Routes>
    </MemoryRouter>
  );
}

function Chips() {
  const location = useLocation();
  return (
    <CollectionFilterChips
      groups={GROUPS}
      params={new URLSearchParams(location.search)}
      basePath="/tasks"
    />
  );
}

describe("CollectionFilterChips", () => {
  it("renders nothing when no filter is applied", () => {
    const { container } = render(<Harness search="sort=title" />);
    expect(container.firstChild).toBeNull();
  });

  it("names every applied filter's DIMENSION and VALUE in words", () => {
    render(<Harness search="priority=p1&due=overdue" />);
    const list = screen.getByRole("list", { name: "Active filters" });
    expect(list.textContent).toContain("Priority:");
    expect(list.textContent).toContain("P1 · Urgent");
    expect(list.textContent).toContain("Due:");
    expect(list.textContent).toContain("Overdue");
  });

  it("gives every remove control an accessible name saying what it removes", () => {
    render(<Harness search="priority=p1&due=overdue" />);
    expect(
      screen.getByRole("link", { name: "Remove filter Priority: P1 · Urgent" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Remove filter Due: Overdue" }),
    ).toBeTruthy();
  });

  it("removes exactly ONE filter, keeping the others and the sort", () => {
    render(<Harness search="priority=p1&due=overdue&sort=title" />);
    const href = screen
      .getByRole("link", { name: "Remove filter Priority: P1 · Urgent" })
      .getAttribute("href");
    expect(href).toContain("due=overdue");
    expect(href).toContain("sort=title");
    expect(href).not.toContain("priority=p1");
  });

  it("clears pagination when a filter is removed", () => {
    render(<Harness search="priority=p1&cursor=abc" />);
    const href = screen
      .getByRole("link", { name: "Remove filter Priority: P1 · Urgent" })
      .getAttribute("href");
    expect(href).not.toContain("cursor");
  });

  it("offers ONE reset that clears the filters but not the sort", () => {
    render(<Harness search="priority=p1&due=overdue&sort=title" />);
    const reset = screen.getByRole("link", { name: "Reset filters" });
    const href = reset.getAttribute("href") ?? "";
    expect(href).not.toContain("priority");
    expect(href).not.toContain("due=");
    expect(href).toContain("sort=title");
  });

  it("shows NO chip for a shaping control", () => {
    render(<Harness search="priority=p1&sort=title" />);
    expect(
      screen.getByRole("list", { name: "Active filters" }).textContent,
    ).not.toContain("Sort");
  });

  it("preserves an unrelated parameter such as an open Drawer", () => {
    render(<Harness search="priority=p1&drawer=task%3At1" />);
    const href = screen
      .getByRole("link", { name: "Remove filter Priority: P1 · Urgent" })
      .getAttribute("href");
    expect(href).toContain("drawer=task%3At1");
  });
});
