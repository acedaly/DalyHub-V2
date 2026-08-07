import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ViewSwitcher } from "~/shared/view-switcher";

/**
 * UIQ-013 — the ONE collection view switcher, as BEHAVIOUR.
 *
 * Every collection header renders this component, so these assertions are the
 * product-wide contract for "how do I change what this collection shows?": one
 * labelled group, exactly one option marked selected in a way assistive
 * technology can read, a URL that carries the choice, and geometry that does
 * not move when the choice changes.
 */

function renderAt(ui: React.ReactElement, path = "/tasks") {
  const router = createMemoryRouter([{ path: "*", element: ui }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

const LAYOUTS = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
  { value: "matrix", label: "Matrix" },
];

describe("ViewSwitcher", () => {
  it("names the group and marks exactly one option current", () => {
    renderAt(
      <ViewSwitcher
        param="view"
        options={LAYOUTS}
        value="board"
        label="Task layout"
      />,
    );
    const group = screen.getByRole("group", { name: "Task layout" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "List",
      "Board",
      "Matrix",
    ]);
    // Selected is exposed PROGRAMMATICALLY, not only painted.
    expect(
      links.filter((link) => link.getAttribute("aria-current") === "true"),
    ).toHaveLength(1);
    expect(within(group).getByRole("link", { name: "Board" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("carries the choice in the URL, defaulting the first option to no param", () => {
    renderAt(
      <ViewSwitcher
        param="view"
        options={LAYOUTS}
        value="list"
        label="Task layout"
      />,
      "/tasks?status=open",
    );
    const group = screen.getByRole("group", { name: "Task layout" });
    // An unrelated param survives every switch (the DS-03 `drawer` stack is the
    // case that matters most), and the default view is the ABSENCE of the param
    // rather than an explicit value.
    expect(within(group).getByRole("link", { name: "List" })).toHaveAttribute(
      "href",
      "/tasks?status=open",
    );
    expect(within(group).getByRole("link", { name: "Board" })).toHaveAttribute(
      "href",
      "/tasks?status=open&view=board",
    );
  });

  it("drops params a switch invalidates, such as a scope-bound cursor", () => {
    renderAt(
      <ViewSwitcher
        param="view"
        options={LAYOUTS}
        value="list"
        label="Task layout"
        clearParams={["cursor"]}
      />,
      "/tasks?cursor=abc123",
    );
    expect(
      screen.getByRole("link", { name: "Board" }).getAttribute("href"),
    ).toBe("/tasks?view=board");
  });

  it("uses each option's own route when the views are routes", () => {
    renderAt(
      <ViewSwitcher
        options={[
          { value: "all", label: "All people", href: "/people" },
          { value: "recent", label: "Recent", href: "/people/recent" },
        ]}
        value="recent"
        label="People views"
      />,
      "/people/recent",
    );
    expect(
      screen.getByRole("link", { name: "All people" }).getAttribute("href"),
    ).toBe("/people");
    expect(screen.getByRole("link", { name: "Recent" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("is a keyboard-operable toggle group in client-state mode", () => {
    const onSelect = vi.fn();
    renderAt(
      <ViewSwitcher
        options={[
          { value: "list", label: "List view" },
          { value: "grid", label: "Gallery view" },
        ]}
        value="list"
        label="Card layout"
        onSelect={onSelect}
      />,
    );
    const group = screen.getByRole("group", { name: "Card layout" });
    const list = within(group).getByRole("button", { name: "List view" });
    const gallery = within(group).getByRole("button", { name: "Gallery view" });

    // Client state is announced with `aria-pressed`, the correct semantic for a
    // toggle that is not a navigation.
    expect(list).toHaveAttribute("aria-pressed", "true");
    expect(gallery).toHaveAttribute("aria-pressed", "false");

    // Real buttons: Enter and Space activate natively, and both are ordinary
    // tab stops, so nothing here needs an invented roving model.
    gallery.focus();
    expect(document.activeElement).toBe(gallery);
    fireEvent.click(gallery);
    expect(onSelect).toHaveBeenCalledWith("grid");
  });

  it("does not toggle the active view off — a collection always has one", () => {
    const onSelect = vi.fn();
    renderAt(
      <ViewSwitcher
        options={[
          { value: "list", label: "List view" },
          { value: "grid", label: "Gallery view" },
        ]}
        value="list"
        label="Card layout"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "List view" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps an accessible name on an icon-only option", () => {
    renderAt(
      <ViewSwitcher
        options={[
          { value: "list", label: "List view", icon: <svg /> },
          { value: "grid", label: "Gallery view", icon: <svg /> },
        ]}
        value="list"
        label="Card layout"
        iconOnly
        onSelect={vi.fn()}
      />,
    );
    // The label is visually hidden but still the accessible NAME — an icon-only
    // control is never nameless (the tooltip beside it describes, never names).
    expect(
      screen.getByRole("button", { name: "Gallery view" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Gallery view")).toHaveClass("dh-visually-hidden");
  });

  it("renders nothing structural beyond one group, whatever the option count", () => {
    const { container } = renderAt(
      <ViewSwitcher
        param="view"
        options={LAYOUTS}
        value="list"
        label="Task layout"
      />,
    );
    // No nested containers: one `.dh-segmented` holding its options directly.
    // "Avoid excessive borders and nested containers" is a visual rule that is
    // only kept if the DOM keeps it.
    const switcher = container.querySelector(".dh-segmented");
    expect(switcher).not.toBeNull();
    expect(switcher?.querySelectorAll(".dh-segmented")).toHaveLength(0);
    expect(switcher?.children).toHaveLength(3);
  });
});
