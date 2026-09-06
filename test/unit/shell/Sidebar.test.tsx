import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { CaptureProvider } from "~/shared/capture";
import { Sidebar } from "~/shared/shell/Sidebar";

/*
 * A DATA router, not a `MemoryRouter`.
 *
 * PERF-01 gave the rail a pending-destination mark, which reads
 * `useNavigation()` — and that hook has no meaning outside a data router, so it
 * throws in one. In the product the rail is always inside the framework router;
 * this harness now says so too.
 */
function renderSidebar(variant: "rail" | "overlay" = "rail") {
  const Stub = createRoutesStub([
    {
      path: "*",
      Component: () => (
        <CaptureProvider>
          <Sidebar
            workspaceName="DalyHub"
            email="owner@example.com"
            navigation={[]}
            navId={`test-${variant}`}
            variant={variant}
          />
        </CaptureProvider>
      ),
    },
  ]);
  return render(<Stub initialEntries={["/"]} />);
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
