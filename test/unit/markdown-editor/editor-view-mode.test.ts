import { describe, expect, it } from "vitest";

import {
  DEFAULT_EDITOR_VIEW_MODE,
  EDITOR_VIEW_MODES,
  editorViewModeLabel,
  otherEditorViewMode,
} from "~/shared/markdown-editor/editor-view-mode";

/**
 * NOTES-05 — the two-mode editor model (write ⇄ read). Retires NOTES-01C's
 * Source/Split/Preview: both modes are available on every viewport (no wide-only
 * Split to degrade).
 */

describe("editor view mode", () => {
  it("defaults to the live writing surface", () => {
    expect(DEFAULT_EDITOR_VIEW_MODE).toBe("write");
  });

  it("offers exactly write and read, in order", () => {
    expect([...EDITOR_VIEW_MODES]).toEqual(["write", "read"]);
  });

  it("toggles between the two modes", () => {
    expect(otherEditorViewMode("write")).toBe("read");
    expect(otherEditorViewMode("read")).toBe("write");
  });

  it("labels each mode", () => {
    expect(editorViewModeLabel("write")).toBe("Write");
    expect(editorViewModeLabel("read")).toBe("Read");
  });
});
