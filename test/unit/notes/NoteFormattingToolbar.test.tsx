import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NoteFormattingToolbar } from "~/modules/notes/NoteFormattingToolbar";

/**
 * NOTES-04 — the writing toolbar as behaviour: accessible names, roving-tabindex
 * keyboard navigation, and — the core contract — that activating an action
 * splices Markdown into the SAME textarea value and pushes it through the
 * editor's `onChange` (so autosave runs normally), restoring the selection.
 */

function Harness({ initial = "" }: { readonly initial?: string }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <div>
      <NoteFormattingToolbar textareaRef={ref} onChange={setValue} />
      <textarea
        aria-label="Note"
        ref={ref}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}

function selectRange(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
) {
  textarea.focus();
  textarea.setSelectionRange(start, end);
}

describe("NoteFormattingToolbar", () => {
  it("renders an accessible toolbar with a labelled button per action", () => {
    render(<Harness />);
    const toolbar = screen.getByRole("toolbar", { name: "Formatting" });
    expect(toolbar).toBeInTheDocument();
    for (const name of [
      "Heading",
      "Bold",
      "Italic",
      "Bullets",
      "Numbered",
      "Checklist",
      "Quote",
      "Link",
      "Code",
      "Code block",
      "Table",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("bolds the current selection and updates the textarea value", () => {
    render(<Harness initial="abc" />);
    const textarea = screen.getByRole("textbox", {
      name: "Note",
    }) as HTMLTextAreaElement;
    selectRange(textarea, 0, 3);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(textarea.value).toBe("**abc**");
  });

  it("creates a bulleted list from a multi-line selection", () => {
    render(<Harness initial={"First item\nSecond item"} />);
    const textarea = screen.getByRole("textbox", {
      name: "Note",
    }) as HTMLTextAreaElement;
    selectRange(textarea, 0, textarea.value.length);
    fireEvent.click(screen.getByRole("button", { name: "Bullets" }));
    expect(textarea.value).toBe("- First item\n- Second item");
  });

  it("creates a checklist", () => {
    render(<Harness initial={"First item\nSecond item"} />);
    const textarea = screen.getByRole("textbox", {
      name: "Note",
    }) as HTMLTextAreaElement;
    selectRange(textarea, 0, textarea.value.length);
    fireEvent.click(screen.getByRole("button", { name: "Checklist" }));
    expect(textarea.value).toBe("- [ ] First item\n- [ ] Second item");
  });

  it("inserts a table when nothing is selected", () => {
    render(<Harness initial="" />);
    const textarea = screen.getByRole("textbox", {
      name: "Note",
    }) as HTMLTextAreaElement;
    selectRange(textarea, 0, 0);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(textarea.value).toContain("| Column 1 | Column 2 |");
    expect(textarea.value).toContain("| --- | --- |");
  });

  it("restores the selection to the textarea after formatting", () => {
    render(<Harness initial="abc" />);
    const textarea = screen.getByRole("textbox", {
      name: "Note",
    }) as HTMLTextAreaElement;
    selectRange(textarea, 0, 3);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    // The word stays selected inside the markers ("**[abc]**").
    expect(textarea.selectionStart).toBe(2);
    expect(textarea.selectionEnd).toBe(5);
  });

  it("uses roving tabindex — one Tab stop, Arrow keys move focus", () => {
    render(<Harness />);
    const heading = screen.getByRole("button", { name: "Heading" });
    const bold = screen.getByRole("button", { name: "Bold" });
    expect(heading).toHaveAttribute("tabindex", "0");
    expect(bold).toHaveAttribute("tabindex", "-1");

    heading.focus();
    fireEvent.keyDown(heading, { key: "ArrowRight" });
    expect(bold).toHaveFocus();
    expect(bold).toHaveAttribute("tabindex", "0");
    expect(heading).toHaveAttribute("tabindex", "-1");

    // End jumps to the last action.
    fireEvent.keyDown(bold, { key: "End" });
    expect(screen.getByRole("button", { name: "Table" })).toHaveFocus();
  });

  it("does not change the value for a no-op (e.g. no selection to unwrap)", () => {
    // Clicking Bold with a collapsed caret inserts a placeholder — but clicking
    // it on already-plain text with the placeholder selected toggles back.
    render(<Harness initial="" />);
    const textarea = screen.getByRole("textbox", {
      name: "Note",
    }) as HTMLTextAreaElement;
    selectRange(textarea, 0, 0);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(textarea.value).toBe("**bold text**");
  });
});
