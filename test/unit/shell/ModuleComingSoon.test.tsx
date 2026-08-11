import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ModuleComingSoon } from "~/shared/shell/ModuleComingSoon";

describe("PX-03 ModuleComingSoon", () => {
  it("renders the module title, subtitle, fit paragraph and roadmap status", () => {
    render(
      <ModuleComingSoon
        name="Notes"
        summary="Markdown records that document any entity in DalyHub."
        fit="Notes attach across the spine via EntityLinks."
        roadmapStatus="It’s planned for Phase 5 — Notes (NOTES-01 → NOTES-04)."
        capabilities={["Create, edit and read Markdown notes"]}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Markdown records that document any entity in DalyHub."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Notes attach across the spine via EntityLinks."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Coming Soon" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/NOTES-01/)).toBeInTheDocument();
  });

  it("lists every planned capability as a real list item", () => {
    render(
      <ModuleComingSoon
        name="Diary"
        summary="Dated Markdown journal entries."
        fit="Diary is your private journal."
        roadmapStatus="It’s planned for Phase 9 — Diary."
        capabilities={["Write dated entries", "Link to the day’s context"]}
      />,
    );
    const list = screen.getByRole("list");
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("Write dated entries")).toBeInTheDocument();
    expect(screen.getByText("Link to the day’s context")).toBeInTheDocument();
  });

  /*
   * UIX-06 — the placeholder's header draws no glyph, because no page header in
   * the product does: the badge gave collections a page origin 40px right of
   * Today's and Analytics', and repeated the glyph the sidebar was already
   * showing for the same route.
   */
  it("draws no entity glyph in the page header", () => {
    const { container } = render(
      <ModuleComingSoon
        name="Reviews"
        summary="Guided rituals."
        fit="Review is DalyHub’s ritual layer."
        roadmapStatus="It’s planned for Phase 10 — Review."
        capabilities={["Guided review rituals"]}
      />,
    );
    expect(
      container.querySelector(".dh-pane-header .dh-entity-icon"),
    ).toBeNull();
  });

  it("never renders placeholder lorem-ipsum copy", () => {
    render(
      <ModuleComingSoon
        name="Help"
        summary="Guidance for how DalyHub works."
        fit="Help is planned to become DalyHub’s in-app guidance."
        roadmapStatus="Help isn’t a dedicated phase on the DalyHub V2 roadmap yet."
        capabilities={[
          "The keyboard-shortcut reference already shipped for Today",
        ]}
      />,
    );
    expect(screen.queryByText(/lorem ipsum/i)).not.toBeInTheDocument();
  });
});
