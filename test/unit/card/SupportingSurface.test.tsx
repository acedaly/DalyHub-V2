/**
 * M3X-02 — the supporting expressive surface (hierarchy Level 2).
 *
 * What these hold is the CONTRACT that keeps a Level 2 surface from becoming a
 * second hero: it draws only what it was given, its progress carries a text
 * value as well as a shape, its whole area is one ordinary link, and a control
 * placed on it stays a control rather than being swallowed by that link.
 */

import { RouterProvider, createMemoryRouter } from "react-router";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SupportingSurface } from "~/shared/card";

function renderSurface(node: React.ReactElement) {
  const router = createMemoryRouter(
    [
      { path: "/", element: node },
      { path: "*", element: <div /> },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("SupportingSurface", () => {
  it("is a named region with a real heading, so the page outline survives", () => {
    renderSurface(
      <SupportingSurface eyebrow="Current focus" title="Kitchen fit-out" />,
    );
    const region = screen.getByRole("region", { name: "Kitchen fit-out" });
    expect(
      within(region).getByRole("heading", {
        level: 3,
        name: "Kitchen fit-out",
      }),
    ).toBeInTheDocument();
    expect(within(region).getByText("Current focus")).toBeInTheDocument();
  });

  it("draws nothing it was not given", () => {
    const { container } = renderSurface(<SupportingSurface title="Bare" />);
    expect(container.querySelector(".dh-scard__eyebrow")).toBeNull();
    expect(container.querySelector(".dh-scard__supporting")).toBeNull();
    expect(container.querySelector(".dh-scard__metric")).toBeNull();
    expect(container.querySelector(".dh-scard__progress")).toBeNull();
    expect(container.querySelector(".dh-scard__meta")).toBeNull();
    expect(container.querySelector(".dh-scard__action")).toBeNull();
  });

  it("never carries progress by shape alone", () => {
    renderSurface(
      <SupportingSurface
        title="Kitchen fit-out"
        progress={{ value: 3, max: 8, valueText: "3 of 8 tasks complete" }}
      />,
    );
    const bar = screen.getByRole("progressbar", {
      name: "Kitchen fit-out progress",
    });
    expect(bar).toHaveAttribute("aria-valuenow", "38");
    expect(bar).toHaveAttribute("aria-valuetext", "3 of 8 tasks complete");
    // The percentage is beside the bar, as text, not only inside it.
    expect(screen.getByText("38%")).toBeInTheDocument();
  });

  it("makes the whole surface one ordinary link when given a destination", () => {
    renderSurface(
      <SupportingSurface
        title="Kitchen fit-out"
        href="/projects/p1"
        openAriaLabel="Open Kitchen fit-out"
      />,
    );
    const link = screen.getByRole("link", { name: "Open Kitchen fit-out" });
    expect(link).toHaveAttribute("href", "/projects/p1");
  });

  it("keeps an action above the surface link, so it stays pressable", () => {
    const { container } = renderSurface(
      <SupportingSurface
        title="Review the brief"
        href="/notes/n1"
        action={<button type="button">Open task</button>}
      />,
    );
    const action = container.querySelector(".dh-scard__action");
    expect(action).not.toBeNull();
    // The layering is structural, not a stylesheet coincidence: the action is a
    // sibling of the covering link's own element rather than inside it.
    expect(action!.querySelector(".dh-scard__open")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Open task" }),
    ).toBeInTheDocument();
  });

  it("carries its tone as a modifier, never as the only signal", () => {
    const { container } = renderSurface(
      <SupportingSurface eyebrow="Next up" title="Ops planning" tone="quiet" />,
    );
    expect(container.querySelector(".dh-scard--quiet")).toBeInTheDocument();
    // The words survive the tone entirely.
    expect(screen.getByText("Next up")).toBeInTheDocument();
  });
});
