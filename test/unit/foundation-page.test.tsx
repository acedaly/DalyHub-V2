import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FoundationPage } from "../../app/components/foundation-page";

describe("FoundationPage", () => {
  it("renders the primary heading", () => {
    render(<FoundationPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "DalyHub V2" }),
    ).toBeInTheDocument();
  });

  it("states that the foundation is operational", () => {
    render(<FoundationPage />);
    expect(
      screen.getByText(/repository and toolchain foundation is operational/i),
    ).toBeInTheDocument();
  });

  it("links to the health endpoint", () => {
    render(<FoundationPage />);
    const link = screen.getByRole("link", { name: "/health" });
    expect(link).toHaveAttribute("href", "/health");
  });
});
