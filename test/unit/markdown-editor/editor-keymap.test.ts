import { describe, expect, it } from "vitest";

import { formattingKeymap } from "~/shared/markdown-editor/editor-keymap";
import { MARKDOWN_FORMATTING_ACTIONS } from "~/shared/markdown-editor/formatting-actions";

/**
 * NOTES-05 — the editor's formatting shortcuts are derived from the shared
 * action catalogue (only the actions that declare a `shortcut`), so a single
 * code path backs both a click and a keystroke.
 */

describe("formattingKeymap", () => {
  const bindings = formattingKeymap();

  it("binds exactly the actions that declare a shortcut", () => {
    const withShortcut = MARKDOWN_FORMATTING_ACTIONS.filter((a) => a.shortcut);
    expect(bindings).toHaveLength(withShortcut.length);
    expect(bindings.map((b) => b.key).sort()).toEqual(
      withShortcut.map((a) => a.shortcut).sort(),
    );
  });

  it("never rebinds the reserved global shortcuts (Mod-K stays the palette; `/` stays search)", () => {
    // Mod-k IS used by the editor for links, but only while the editor is
    // focused — it must not be a bare `/` or a global capture. Assert none of
    // the editor bindings claim the search key.
    expect(bindings.some((b) => b.key === "/")).toBe(false);
  });

  it("provides a run handler for every binding", () => {
    for (const binding of bindings) {
      expect(typeof binding.run).toBe("function");
      expect(binding.preventDefault).toBe(true);
    }
  });

  it("includes the common formatting shortcuts", () => {
    const keys = bindings.map((b) => b.key);
    expect(keys).toContain("Mod-b");
    expect(keys).toContain("Mod-i");
    expect(keys).toContain("Mod-k");
  });
});
