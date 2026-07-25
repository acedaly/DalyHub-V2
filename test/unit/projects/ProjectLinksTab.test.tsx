import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { ProjectLinksTab } from "~/modules/projects/ProjectLinksTab";
import { DrawerProvider } from "~/shared/drawer";

/**
 * PROJ-01/PROJ-05 — the project Key links tab: the structural Area/Goal
 * relationships render (and are now navigable — deliverable 4), and (PROJ-05 §5)
 * an archived project's picker goes read-only — the add/remove controls are HIDDEN,
 * not merely disabled, since link/unlink against an archived project's Task
 * endpoints always fails. Archived relationships stay navigable even so.
 */

function renderTab(archived: boolean) {
  return render(
    <MemoryRouter>
      <DrawerProvider renderDrawer={() => null}>
        <ProjectLinksTab
          projectId="p1"
          area={{ kind: "area", id: "a1", title: "Career" }}
          goal={{ kind: "goal", id: "g1", title: "Ship v2" }}
          links={[
            {
              linkId: "l1",
              linkType: "project.relates_to",
              direction: "outgoing",
              target: { id: "n1", type: "note", title: "Design notes" },
            },
          ]}
          searchTargets={vi.fn(() => Promise.resolve([]))}
          onLink={vi.fn(() => Promise.resolve())}
          onUnlink={vi.fn(() => Promise.resolve())}
          archived={archived}
        />
      </DrawerProvider>
    </MemoryRouter>,
  );
}

describe("ProjectLinksTab", () => {
  it("shows the structural Area/Goal relationship and existing related records", () => {
    renderTab(false);
    expect(screen.getByText("Career")).toBeInTheDocument();
    expect(screen.getByText("Design notes")).toBeInTheDocument();
  });

  it("makes the structural Area and Goal titles navigable to their records", () => {
    renderTab(false);
    expect(screen.getByRole("link", { name: "Area: Career" })).toHaveAttribute(
      "href",
      "/areas/a1",
    );
    expect(screen.getByRole("link", { name: "Goal: Ship v2" })).toHaveAttribute(
      "href",
      "/goals/g1",
    );
    // The existing related Note is a link to its canonical record.
    expect(
      screen.getByRole("link", { name: "Note: Design notes" }),
    ).toHaveAttribute("href", "/notes/n1");
  });

  it("keeps relationships navigable even when the project is archived (read-only)", () => {
    renderTab(true);
    expect(screen.getByRole("link", { name: "Area: Career" })).toHaveAttribute(
      "href",
      "/areas/a1",
    );
    // ...while the unlink control is hidden.
    expect(
      screen.queryByRole("button", { name: /Remove link to Design notes/ }),
    ).not.toBeInTheDocument();
  });

  it("offers search/add and remove controls when not archived", () => {
    renderTab(false);
    expect(
      screen.getByRole("combobox", { name: "Related records" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Remove link to Design notes/ }),
    ).toBeInTheDocument();
  });

  it("hides search/add and remove controls when the project is archived", () => {
    renderTab(true);
    // The existing relationship is still readable...
    expect(screen.getByText("Design notes")).toBeInTheDocument();
    // ...but nothing offers to mutate it (hidden, not disabled).
    expect(
      screen.queryByRole("combobox", { name: "Related records" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Remove link to Design notes/ }),
    ).not.toBeInTheDocument();
  });
});
