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
    /*
     * UNTITLED-18 — asserted on the CUE, not on a class name.
     *
     * This read `.dh-settings-group--danger`, a modifier that existed only to
     * select the tint in `settings.css`. The paint is Untitled utilities on the
     * component now, so that class is gone and the class it was replaced by
     * would be just as much an implementation detail to pin.
     *
     * What the test is actually for is the RULE: the dangerous region must be
     * distinguishable by something other than colour (AGENTS.md §15). Two things
     * carry that — the heading text, asserted above, and a warning glyph, which
     * is decorative because the heading already says it in words. Both survive a
     * repaint; neither survives being silently dropped.
     */
    const glyph = container.querySelector("svg");
    expect(glyph).not.toBeNull();
    expect(glyph).toHaveAttribute("aria-hidden", "true");
  });

  it("draws no danger glyph on an ordinary group", () => {
    // The other half of the rule above: if every group had the mark, the mark
    // would say nothing. Without this, dropping the `tone` check entirely would
    // still pass the test before it.
    const { container } = render(
      <SettingsGroup title="General" description="Ordinary settings.">
        <div>row</div>
      </SettingsGroup>,
    );
    expect(container.querySelector("svg")).toBeNull();
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
