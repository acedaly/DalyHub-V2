/**
 * DOC-EDITOR-01 — the writing surface's commit shortcut.
 *
 * Two rules, and the second is the one that protects the owner's writing:
 *
 *   - ⌘/Ctrl+Enter commits, so an explicit-save long-form surface has a keyboard
 *     path that does not require leaving the text;
 *   - **plain Enter never commits.** Enter is a paragraph. A multiline editor
 *     that saves on Enter cannot be used to write anything longer than a
 *     sentence, and the owner discovers that by losing one.
 *
 * These run against the SSR/no-JS fallback surface (CodeMirror mounts only in a
 * real browser — the enhanced surface's binding is exercised by Playwright). That
 * is deliberate rather than a limitation: keyboard save must not depend on
 * enhancement having happened, so the surface that works without JavaScript is
 * exactly the one worth asserting here.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  LiveMarkdownEditor,
  MarkdownEditorField,
} from "~/shared/markdown-editor";

/** The writing surface itself — the editor's group carries the same name. */
function surfaceNamed(name: string): HTMLElement {
  return screen.getByRole("textbox", { name });
}

vi.mock("~/shared/markdown-editor/editor-setup", () => ({
  createEditorExtensions: () => {
    throw new Error("CodeMirror is not mounted in unit tests");
  },
}));

function EditorHarness({
  onCommit,
  initial = "First paragraph.",
}: {
  onCommit?: () => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <LiveMarkdownEditor
      label="Note"
      value={value}
      onChange={setValue}
      onCommit={onCommit}
    />
  );
}

describe("⌘/Ctrl+Enter commits; Enter does not", () => {
  it("commits on ⌘+Enter", () => {
    const onCommit = vi.fn();
    render(<EditorHarness onCommit={onCommit} />);
    fireEvent.keyDown(surfaceNamed("Note"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits on Ctrl+Enter, for everyone not on a Mac", () => {
    const onCommit = vi.fn();
    render(<EditorHarness onCommit={onCommit} />);
    fireEvent.keyDown(surfaceNamed("Note"), {
      key: "Enter",
      ctrlKey: true,
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("does NOT commit on plain Enter, and leaves the paragraph alone", () => {
    const onCommit = vi.fn();
    render(<EditorHarness onCommit={onCommit} />);
    const surface = surfaceNamed("Note");
    fireEvent.keyDown(surface, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    // The textarea's own newline handling is untouched — nothing prevented it.
    fireEvent.change(surface, {
      target: { value: "First paragraph.\n\nSecond." },
    });
    expect(surface).toHaveValue("First paragraph.\n\nSecond.");
  });

  it("does not commit on Shift+Enter either — that is a hard line break", () => {
    const onCommit = vi.fn();
    render(<EditorHarness onCommit={onCommit} />);
    fireEvent.keyDown(surfaceNamed("Note"), {
      key: "Enter",
      shiftKey: true,
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("binds nothing when the surface has no commit — an autosaving Note", () => {
    render(<EditorHarness />);
    const surface = surfaceNamed("Note");
    // No handler, no throw, and no interference with the key.
    fireEvent.keyDown(surface, { key: "Enter", metaKey: true });
    expect(surface).toHaveValue("First paragraph.");
  });
});

describe("MarkdownEditorField passes the commit through — except when it cannot", () => {
  function FieldHarness(props: {
    onCommit?: () => void;
    disabled?: boolean;
    readOnly?: boolean;
  }) {
    const [value, setValue] = useState("Body");
    return (
      <MarkdownEditorField
        label="Details"
        value={value}
        onChange={setValue}
        {...props}
      />
    );
  }

  it("reaches the host's Save from inside the writing surface", () => {
    const onCommit = vi.fn();
    render(<FieldHarness onCommit={onCommit} />);
    fireEvent.keyDown(surfaceNamed("Details"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("does not fire while the field is disabled mid-submit", () => {
    const onCommit = vi.fn();
    render(<FieldHarness onCommit={onCommit} disabled />);
    fireEvent.keyDown(surfaceNamed("Details"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not fire on a read-only field", () => {
    const onCommit = vi.fn();
    render(<FieldHarness onCommit={onCommit} readOnly />);
    fireEvent.keyDown(surfaceNamed("Details"), {
      key: "Enter",
      metaKey: true,
    });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
