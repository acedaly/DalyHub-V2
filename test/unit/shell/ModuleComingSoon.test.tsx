import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ModuleComingSoon } from "~/shared/shell/ModuleComingSoon";

describe("PX-03 ModuleComingSoon", () => {
  it("renders the module title, subtitle, fit paragraph and roadmap status", () => {
    render(
      <ModuleComingSoon
        name="Notes"
        entityType="note"
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

  it("shows the entity identity glyph only when an entity type is given", () => {
    const { container, rerender } = render(
      <ModuleComingSoon
        name="AI"
        summary="A propose → review → apply loop."
        fit="AI is a proposer, never an autonomous actor."
        roadmapStatus="It’s planned for Phase 11 — AI."
        capabilities={["A propose → review → apply loop"]}
      />,
    );
    expect(container.querySelector(".dh-entity-icon")).toBeNull();

    rerender(
      <ModuleComingSoon
        name="Reviews"
        entityType="review"
        summary="Guided rituals."
        fit="Review is DalyHub’s ritual layer."
        roadmapStatus="It’s planned for Phase 10 — Review."
        capabilities={["Guided review rituals"]}
      />,
    );
    expect(
      container.querySelector('.dh-entity-icon[data-entity="review"]'),
    ).not.toBeNull();
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
