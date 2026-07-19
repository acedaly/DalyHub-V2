/**
 * DS-06 — the Markdown source control: edits source, safe preview through the
 * shared pipeline, source preserved verbatim.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MarkdownField } from "~/shared/forms";

describe("MarkdownField", () => {
  it("edits the source verbatim (no trimming or mutation)", () => {
    const onChange = vi.fn();
    render(<MarkdownField label="Description" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Description" }), {
      target: { value: "  # Heading  \n\n- item" },
    });
    expect(onChange).toHaveBeenCalledWith("  # Heading  \n\n- item");
  });

  it("renders a safe preview through the shared Markdown pipeline", async () => {
    function H() {
      const [value, setValue] = useState("# Hello\n\nSome **bold** text.");
      return (
        <MarkdownField label="Description" value={value} onChange={setValue} />
      );
    }
    render(<H />);
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Hello" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("bold")).toBeInTheDocument();
  });

  it("shows a calm empty-preview message for blank source", async () => {
    render(
      <MarkdownField label="Description" value="   " onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    await waitFor(() =>
      expect(screen.getByText("Nothing to preview yet.")).toBeInTheDocument(),
    );
  });

  it("updates the preview when the source changes", async () => {
    function H() {
      const [value, setValue] = useState("# First");
      return (
        <div>
          <MarkdownField
            label="Description"
            value={value}
            onChange={setValue}
          />
          <button type="button" onClick={() => setValue("# Second")}>
            change
          </button>
        </div>
      );
    }
    render(<H />);
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "First" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Second" }),
      ).toBeInTheDocument(),
    );
  });
});
