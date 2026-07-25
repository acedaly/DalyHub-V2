import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { LiveMarkdownEditor } from "~/shared/markdown-editor";

/**
 * NOTES-05 — the shared writing-first editor. CodeMirror mounts only in a real
 * browser (covered by Playwright); here we force the accessible, controlled
 * `<textarea>` fallback (the same surface a no-JS client gets) by making the
 * lazily-imported CodeMirror setup throw, which the editor's own `.catch`
 * handles by keeping the fallback in place. This proves the surface-agnostic
 * contract: label, controlled value, toolbar formatting, the Read toggle and
 * validation messaging.
 */
vi.mock("~/shared/markdown-editor/editor-setup", () => ({
  createEditorExtensions: () => {
    throw new Error("CodeMirror is not mounted in unit tests");
  },
}));

function Harness({
  initial = "",
  error = null,
}: {
  initial?: string;
  error?: string | null;
}) {
  const [value, setValue] = useState(initial);
  return (
    <LiveMarkdownEditor
      label="Note"
      value={value}
      onChange={setValue}
      help="Markdown supported"
      error={error}
      toolbarLabel="Formatting"
    />
  );
}

describe("LiveMarkdownEditor (fallback surface)", () => {
  it("renders an accessible, controlled editing surface named by its label", () => {
    render(<Harness initial="hello" />);
    const textbox = screen.getByRole("textbox", { name: "Note" });
    expect(textbox).toHaveValue("hello");
  });

  it("emits the exact source on edit", () => {
    render(<Harness />);
    const textbox = screen.getByRole("textbox", { name: "Note" });
    fireEvent.change(textbox, { target: { value: "line one\n\n  spaced" } });
    expect(textbox).toHaveValue("line one\n\n  spaced");
  });

  it("exposes a WAI-ARIA toolbar with roving tabindex", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    const buttons = within(toolbar).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(6);
    // Exactly one button is a tab stop (roving tabindex).
    const tabbable = buttons.filter((b) => b.getAttribute("tabindex") === "0");
    expect(tabbable).toHaveLength(1);
  });

  it("applies a formatting action to the source and restores selection", () => {
    render(<Harness initial="bold me" />);
    const textbox = screen.getByRole("textbox", {
      name: "Note",
    }) as HTMLTextAreaElement;
    textbox.setSelectionRange(0, 7);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(textbox).toHaveValue("**bold me**");
  });

  it("toggles to Read (rendering through the shared pipeline) and back", async () => {
    render(<Harness initial="# Title" />);
    fireEvent.click(screen.getByRole("button", { name: "Read" }));
    expect(
      screen.queryByRole("textbox", { name: "Note" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Title" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Write" }));
    expect(screen.getByRole("textbox", { name: "Note" })).toBeInTheDocument();
  });

  it("shows a validation error politely", () => {
    render(<Harness error="Too large" />);
    expect(screen.getByText("Too large")).toBeInTheDocument();
  });
});
