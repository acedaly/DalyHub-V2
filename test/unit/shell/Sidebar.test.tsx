import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { CaptureProvider } from "~/shared/capture";
import { Sidebar } from "~/shared/shell/Sidebar";

function renderSidebar(variant: "rail" | "overlay" = "rail") {
  return render(
    <MemoryRouter>
      <CaptureProvider>
        <Sidebar
          workspaceName="DalyHub"
          email="owner@example.com"
          navigation={[]}
          navId={`test-${variant}`}
          variant={variant}
        />
      </CaptureProvider>
    </MemoryRouter>,
  );
}

describe("the premium sidebar capture door", () => {
  it("puts the canonical Capture action in the desktop rail", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Capture" })).toBeInTheDocument();
  });

  it("does not duplicate Capture in the phone overlay", () => {
    renderSidebar("overlay");
    expect(
      screen.queryByRole("button", { name: "Capture" }),
    ).not.toBeInTheDocument();
  });
});
