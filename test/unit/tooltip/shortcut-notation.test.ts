import { describe, expect, it } from "vitest";

import { formatShortcut } from "~/shared/commands/shortcut";
import { parseModShortcut } from "~/shared/tooltip";

/**
 * M3-TIP — the bridge between the editor's CodeMirror shortcut notation and the
 * command model's shortcut record.
 *
 * It exists so the tooltip can print a shortcut through the ONE platform-correct
 * formatter the Command Palette already uses, rather than growing a second
 * ⌘/Ctrl table. These assertions are therefore as much about the ROUND TRIP as
 * about the parse: a spec written next to an editor action has to come out the
 * other side as the string a user sees.
 */

describe("parseModShortcut", () => {
  it("reads a bare key", () => {
    expect(parseModShortcut("/")).toEqual({ key: "/", modifiers: [] });
  });

  it("reads the Mod convention", () => {
    expect(parseModShortcut("Mod-b")).toEqual({ key: "b", modifiers: ["mod"] });
  });

  it("reads several modifiers, in the order written", () => {
    expect(parseModShortcut("Mod-Shift-x")).toEqual({
      key: "x",
      modifiers: ["mod", "shift"],
    });
  });

  it("maps CodeMirror's platform aliases onto the command model's names", () => {
    expect(parseModShortcut("Cmd-k")).toEqual({
      key: "k",
      modifiers: ["meta"],
    });
    expect(parseModShortcut("Ctrl-Alt-p")).toEqual({
      key: "p",
      modifiers: ["ctrl", "alt"],
    });
    expect(parseModShortcut("Option-t")).toEqual({
      key: "t",
      modifiers: ["alt"],
    });
  });

  it("does not repeat a modifier written twice", () => {
    expect(parseModShortcut("Mod-Mod-s")).toEqual({
      key: "s",
      modifiers: ["mod"],
    });
  });

  it("refuses a spec it cannot display faithfully rather than guessing", () => {
    // A wrong shortcut is worse than no shortcut: the user presses it and
    // nothing happens.
    expect(parseModShortcut("Hyper-x")).toBeNull();
    expect(parseModShortcut("")).toBeNull();
    expect(parseModShortcut("-")).toBeNull();
  });
});

describe("round trip through the shared formatter", () => {
  it("prints the editor's own shortcuts on both platforms", () => {
    const bold = parseModShortcut("Mod-b");
    expect(bold).not.toBeNull();
    expect(formatShortcut(bold!, "mac")).toBe("⌘B");
    expect(formatShortcut(bold!, "other")).toBe("Ctrl+B");

    const redo = parseModShortcut("Mod-Shift-z");
    expect(formatShortcut(redo!, "mac")).toBe("⌘⇧Z");
    expect(formatShortcut(redo!, "other")).toBe("Ctrl+Shift+Z");
  });
});
