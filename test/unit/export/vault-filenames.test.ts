/**
 * X-04 — deterministic, collision-safe, cross-platform vault filenames.
 *
 * A vault that cannot be extracted on Windows, or that silently overwrites one
 * note with another on macOS, is not an export. These tests hold the rules that
 * stop that happening.
 */

import { describe, expect, it } from "vitest";

import {
  assertSafeZipPath,
  buildVaultFilenameIndex,
  markdownLink,
  relativeVaultPath,
  safeVaultStem,
  stableIdSuffix,
} from "~/platform/export";

describe("safeVaultStem", () => {
  it("keeps an ordinary title exactly as written", () => {
    expect(safeVaultStem("Training notes")).toBe("Training notes");
  });

  it("preserves Unicode instead of transliterating it", () => {
    expect(safeVaultStem("Café résumé — 日本語 🌱")).toBe(
      "Café résumé — 日本語 🌱",
    );
  });

  it("normalises to NFC so decomposed and composed titles agree", () => {
    // "é" as e + combining acute, versus the precomposed character.
    expect(safeVaultStem("Café")).toBe(safeVaultStem("Café"));
  });

  it("replaces path separators so a title can never create a folder", () => {
    expect(safeVaultStem("Health / Fitness")).toBe("Health - Fitness");
    expect(safeVaultStem("a\\b")).toBe("a-b");
    expect(safeVaultStem("../../etc/passwd")).not.toContain("/");
    expect(safeVaultStem("../../etc/passwd")).not.toContain("\\");
  });

  it("replaces every Windows-reserved character", () => {
    const stem = safeVaultStem('a<b>c:d"e|f?g*h');
    for (const character of '<>:"|?*') {
      expect(stem).not.toContain(character);
    }
  });

  it("removes control characters", () => {
    expect(safeVaultStem("a\u0000b\u0007c")).toBe("abc");
    expect(safeVaultStem("a\u007fb")).toBe("ab");
  });

  it("collapses whitespace, including newlines and tabs", () => {
    expect(safeVaultStem("a\n\n  b\tc")).toBe("a b c");
  });

  it("strips leading and trailing dots and spaces", () => {
    expect(safeVaultStem("  .hidden.  ")).toBe("hidden");
    expect(safeVaultStem("Trailing dot.")).toBe("Trailing dot");
  });

  it("falls back rather than producing an empty name", () => {
    expect(safeVaultStem("")).toBe("Untitled");
    expect(safeVaultStem("///")).toBe("Untitled");
    expect(safeVaultStem("   ")).toBe("Untitled");
    expect(safeVaultStem("...")).toBe("Untitled");
  });

  it("escapes Windows reserved device names", () => {
    expect(safeVaultStem("CON")).toBe("_CON");
    expect(safeVaultStem("nul")).toBe("_nul");
    expect(safeVaultStem("COM1.notes")).toBe("_COM1.notes");
    // A name that merely CONTAINS a device name is fine.
    expect(safeVaultStem("Console")).toBe("Console");
  });

  it("bounds a very long title in both code points and UTF-8 bytes", () => {
    const long = "x".repeat(500);
    expect(safeVaultStem(long).length).toBeLessThanOrEqual(80);

    const emoji = "🌱".repeat(200);
    const stem = safeVaultStem(emoji);
    expect(new TextEncoder().encode(stem).length).toBeLessThanOrEqual(160);
    // Never split a surrogate pair: the result re-encodes cleanly.
    expect([...stem].every((character) => character === "🌱")).toBe(true);
  });

  it("is deterministic", () => {
    const title = "Weird / title: with * chars";
    expect(safeVaultStem(title)).toBe(safeVaultStem(title));
  });
});

describe("buildVaultFilenameIndex", () => {
  const request = (id: string, title: string, folder = "Notes") => ({
    id,
    title,
    folder,
  });

  it("gives a unique title its plain, readable name", () => {
    const index = buildVaultFilenameIndex([request("n1", "Reading list")]);
    expect(index.get("n1")?.path).toBe("Notes/Reading list.md");
  });

  it("suffixes EVERY member of a duplicate-title group, not just the later ones", () => {
    const index = buildVaultFilenameIndex([
      request("n1", "Training notes"),
      request("n2", "Training notes"),
    ]);
    expect(index.get("n1")?.path).toBe(
      `Notes/Training notes (${stableIdSuffix("n1")}).md`,
    );
    expect(index.get("n2")?.path).toBe(
      `Notes/Training notes (${stableIdSuffix("n2")}).md`,
    );
  });

  it("treats a case-only difference as a collision", () => {
    const index = buildVaultFilenameIndex([
      request("n1", "Plan"),
      request("n2", "plan"),
    ]);
    const first = index.get("n1")!.path;
    const second = index.get("n2")!.path;
    expect(first).not.toBe(second);
    expect(first.toLowerCase()).not.toBe(second.toLowerCase());
  });

  it("does not collide records with the same title in DIFFERENT folders", () => {
    const index = buildVaultFilenameIndex([
      request("n1", "Health", "Areas"),
      request("n2", "Health", "Notes"),
    ]);
    // Different folders are different namespaces, so both keep plain names.
    expect(index.get("n1")?.path).toBe("Areas/Health.md");
    expect(index.get("n2")?.path).toBe("Notes/Health.md");
  });

  it("is independent of the order records arrive in", () => {
    const requests = [
      request("n3", "Same"),
      request("n1", "Same"),
      request("n2", "Other"),
    ];
    const forward = buildVaultFilenameIndex(requests);
    const reversed = buildVaultFilenameIndex([...requests].reverse());
    for (const { id } of requests) {
      expect(reversed.get(id)?.path).toBe(forward.get(id)?.path);
    }
  });

  it("never emits two paths that collide case-insensitively", () => {
    const requests = [
      request("a", "Note"),
      request("b", "note"),
      request("c", "NOTE"),
      request("d", "Note"),
      request("e", ""),
      request("f", "   "),
      request("g", "CON"),
      request("h", "con"),
    ];
    const index = buildVaultFilenameIndex(requests);
    const paths = requests.map((r) => index.get(r.id)!.path.toLowerCase());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("never produces a path that escapes its folder", () => {
    const index = buildVaultFilenameIndex([
      request("n1", "../../../etc/passwd"),
      request("n2", "..\\..\\windows\\system32"),
      request("n3", "/absolute"),
    ]);
    for (const location of index.values()) {
      const segments = location.path.split("/");
      // Exactly two segments: the folder and the file. The title contributed
      // no separator of its own.
      expect(segments.length).toBe(2);
      expect(segments[0]).toBe("Notes");
      // No segment IS a relative reference (dots inside a name are harmless).
      expect(segments).not.toContain("..");
      expect(segments).not.toContain(".");
      // And the archive writer agrees the path is safe.
      expect(() => assertSafeZipPath(location.path)).not.toThrow();
    }
  });
});

describe("stableIdSuffix", () => {
  it("is stable, lowercase and alphanumeric", () => {
    expect(stableIdSuffix("A1B2-C3D4-E5F6")).toBe("c3d4e5f6".slice(-6));
    expect(stableIdSuffix("A1B2-C3D4-E5F6")).toMatch(/^[a-z0-9]{6}$/);
  });

  it("survives an id with no alphanumeric characters", () => {
    expect(stableIdSuffix("---")).toBe("record");
  });
});

describe("relativeVaultPath", () => {
  it("walks up and back down between folders", () => {
    expect(relativeVaultPath("Areas/Health.md", "Goals/Run.md")).toBe(
      "../Goals/Run.md",
    );
  });

  it("uses an explicit ./ for a sibling", () => {
    expect(relativeVaultPath("Notes/A.md", "Notes/B.md")).toBe("./B.md");
  });

  it("reaches a root file from a folder", () => {
    expect(relativeVaultPath("Notes/A.md", "Home.md")).toBe("../Home.md");
  });

  it("reaches a folder file from the root", () => {
    expect(relativeVaultPath("Home.md", "Notes/A.md")).toBe("Notes/A.md");
  });
});

describe("markdownLink", () => {
  it("uses a bare destination when the path needs no escaping", () => {
    expect(markdownLink("Run", "../Goals/Run.md")).toBe(
      "[Run](../Goals/Run.md)",
    );
  });

  it("uses CommonMark angle brackets when the path has spaces or parentheses", () => {
    expect(markdownLink("Run 5k", "../Goals/Run 5k.md")).toBe(
      "[Run 5k](<../Goals/Run 5k.md>)",
    );
    expect(markdownLink("A", "Notes/Note (abc123).md")).toBe(
      "[A](<Notes/Note (abc123).md>)",
    );
  });

  it("escapes brackets in the label so the link cannot break out", () => {
    expect(markdownLink("a [b] c", "x.md")).toBe("[a \\[b\\] c](x.md)");
  });

  it("flattens a multi-line label", () => {
    expect(markdownLink("a\nb", "x.md")).toBe("[a b](x.md)");
  });
});
