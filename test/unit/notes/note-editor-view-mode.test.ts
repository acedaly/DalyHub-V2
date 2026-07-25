import { describe, expect, it } from "vitest";

import {
  availableNoteEditorViewModes,
  resolveNoteEditorViewMode,
} from "~/modules/notes/note-editor-view-mode";

/**
 * NOTES-01C — the desktop editor's view-mode model (pure): Split is only ever
 * OFFERED and SELECTED on a wide-enough viewport; Source and Preview are
 * always available and always pass through unchanged.
 */

describe("availableNoteEditorViewModes", () => {
  it("offers Source/Split/Preview when wide", () => {
    expect(availableNoteEditorViewModes(true)).toEqual([
      "source",
      "split",
      "preview",
    ]);
  });

  it("omits Split entirely when narrow — never merely disables it", () => {
    expect(availableNoteEditorViewModes(false)).toEqual(["source", "preview"]);
  });
});

describe("resolveNoteEditorViewMode", () => {
  it("passes Source through unchanged at any width", () => {
    expect(resolveNoteEditorViewMode("source", true)).toBe("source");
    expect(resolveNoteEditorViewMode("source", false)).toBe("source");
  });

  it("passes Preview through unchanged at any width", () => {
    expect(resolveNoteEditorViewMode("preview", true)).toBe("preview");
    expect(resolveNoteEditorViewMode("preview", false)).toBe("preview");
  });

  it("keeps Split when wide", () => {
    expect(resolveNoteEditorViewMode("split", true)).toBe("split");
  });

  it("degrades Split to Source when narrow — the canonical, editable mode, not Preview", () => {
    expect(resolveNoteEditorViewMode("split", false)).toBe("source");
  });
});
