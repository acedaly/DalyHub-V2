import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsGroup, SettingsLayout } from "~/shared/settings";

describe("DS-10b SettingsGroup & SettingsLayout", () => {
  it("labels the region with a heading and description", () => {
    render(
      <SettingsGroup title="General" description="Ordinary settings.">
        <div>row</div>
      </SettingsGroup>,
    );
    const heading = screen.getByRole("heading", { name: "General" });
    expect(heading).toBeInTheDocument();
    // The section is named by its heading.
    expect(screen.getByRole("region", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Ordinary settings.")).toBeInTheDocument();
  });

  it("renders the dangerous region with a differentiated, non-colour-only cue", () => {
    const { container } = render(
      <SettingsGroup
        title="Danger zone"
        description="Destructive actions."
        tone="danger"
      >
        <div>row</div>
      </SettingsGroup>,
    );
    // The heading text itself communicates danger (not colour alone).
    expect(
      screen.getByRole("heading", { name: /Danger zone/ }),
    ).toBeInTheDocument();
    // The differentiating class is present, and the warning glyph is decorative.
    const section = container.querySelector(".dh-settings-group--danger");
    expect(section).not.toBeNull();
    const glyph = section!.querySelector("svg");
    expect(glyph).toHaveAttribute("aria-hidden", "true");
  });

  it("renders the surface heading at the requested level", () => {
    render(
      <SettingsLayout title="Workspace settings" headingLevel={2}>
        <div>child</div>
      </SettingsLayout>,
    );
    const heading = screen.getByRole("heading", {
      name: "Workspace settings",
      level: 2,
    });
    expect(heading).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Workspace settings" }),
    ).toBeInTheDocument();
  });

  it("supports an unheaded surface named via aria-label (embedded use)", () => {
    render(
      <SettingsLayout aria-label="Embedded settings">
        <div>child</div>
      </SettingsLayout>,
    );
    expect(
      screen.getByRole("region", { name: "Embedded settings" }),
    ).toBeInTheDocument();
  });
});
