import { fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { AriaRouterProvider } from "~/shared/router/AriaRouterProvider";
import { ViewSwitcher } from "~/shared/view-switcher";

/**
 * UIQ-013 — the ONE collection view switcher, as BEHAVIOUR.
 *
 * Every collection header renders this component, so these assertions are the
 * product-wide contract for "how do I change what this collection shows?": one
 * labelled group, exactly one option marked selected in a way assistive
 * technology can read, a URL that carries the choice, and geometry that does
 * not move when the choice changes.
 *
 * ── UNTITLED-04 ─────────────────────────────────────────────────────────────
 * The control is drawn with genuine Untitled source now, and which source
 * depends on what the switcher IS. A URL-backed switcher is Untitled's
 * `application/tabs` (`type="button-border"`) whose items take an `href`, so it
 * is a `tablist` of ANCHORS: deep-linkable, middle-clickable and correct with
 * no JavaScript, exactly as before, with `aria-selected` in place of
 * `aria-current`. A client-state switcher is Untitled's `base/button-group`, a
 * React Aria toggle group, which keeps `aria-pressed`.
 */

/**
 * Rendered inside `AriaRouterProvider`, because that is how the app mounts it:
 * React Aria resolves a `Tab`'s `href` through React Router's `useHref`, so the
 * relative `?view=board` a switcher produces becomes the absolute path a browser
 * and a screen reader read. Testing it without the provider would assert a
 * different href from the one the product ships.
 */
function renderAt(ui: React.ReactElement, path = "/tasks") {
  const router = createMemoryRouter(
    [{ path: "*", element: <AriaRouterProvider>{ui}</AriaRouterProvider> }],
    { initialEntries: [path] },
  );
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
    const group = screen.getByRole("navigation", { name: "Task layout" });
    const links = within(group).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "List",
      "Board",
      "Matrix",
    ]);
    // Selected is exposed PROGRAMMATICALLY, not only painted.
    expect(
      links.filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
    expect(within(group).getByRole("link", { name: "Board" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // …and every option is still a real anchor.
    for (const link of links) expect(link.tagName).toBe("A");
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
    const group = screen.getByRole("navigation", { name: "Task layout" });
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
      "page",
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
    /*
     * UNTITLED-04 — Untitled's `base/button-group` is a React Aria
     * `ToggleButtonGroup` in single-selection mode, which announces as a
     * `radiogroup` of `radio`s rather than a `group` of pressed buttons. Both
     * are correct ARIA for "exactly one of these"; the radio group is the
     * stronger statement, because it tells assistive technology the options are
     * mutually exclusive rather than leaving that to be inferred from three
     * independent toggles.
     */
    const group = screen.getByRole("radiogroup", { name: "Card layout" });
    const list = within(group).getByRole("radio", { name: "List view" });
    const gallery = within(group).getByRole("radio", { name: "Gallery view" });

    expect(list).toHaveAttribute("aria-checked", "true");
    expect(gallery).toHaveAttribute("aria-checked", "false");

    // Real buttons underneath: Enter and Space activate natively.
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
    fireEvent.click(screen.getByRole("radio", { name: "List view" }));
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
    // The accessible NAME survives on the option itself — an icon-only control
    // is never nameless.
    expect(
      screen.getByRole("radio", { name: "Gallery view" }),
    ).toBeInTheDocument();
  });

  it("renders nothing structural beyond one group, whatever the option count", () => {
    renderAt(
      <ViewSwitcher
        param="view"
        options={LAYOUTS}
        value="list"
        label="Task layout"
      />,
    );
    // No nested containers: ONE tablist holding its options directly. "Avoid
    // excessive borders and nested containers" is a visual rule that is only
    // kept if the DOM keeps it.
    const group = screen.getByRole("navigation", { name: "Task layout" });
    expect(within(group).queryAllByRole("tablist")).toHaveLength(0);
    expect(group.children).toHaveLength(3);
  });
});
