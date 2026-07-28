import { describe, expect, it } from "vitest";

import {
  buildNoteExport,
  buildNoteMarkdownExport,
  buildNotePlainTextExport,
  isNoteExportFormat,
  noteExportFilename,
  safeFilenameStem,
  type NoteExportInput,
} from "~/platform/notes/note-export";
import { filenameFromDisposition } from "~/modules/notes/use-note-export";

/**
 * NOTES-06 — the export contract.
 *
 * The rule that must never break: a `.md` export IS the stored canonical
 * Markdown source (ADR-015), with only a metadata header and the reference
 * rewrite added. No format re-renders the note as HTML and calls it the note.
 */
function note(over: Partial<NoteExportInput> = {}): NoteExportInput {
  return {
    id: "note_abc123def",
    title: "Reading list",
    content: "# Reading list\n\n- one\n- two\n",
    tags: ["reading", "research"],
    createdAt: new Date("2026-07-01T09:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    archived: false,
    ...over,
  };
}

const resolve = (title: string) =>
  title.toLowerCase() === "atlas"
    ? { id: "n_atlas", type: "note", title: "Atlas" }
    : null;

describe("safe filenames", () => {
  it("keeps a readable slug and drops everything that could escape a path", () => {
    expect(safeFilenameStem("Reading list")).toBe("reading-list");
    expect(safeFilenameStem("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFilenameStem('a"b:c*d?e<f>g|h')).toBe("a-b-c-d-e-f-g-h");
    expect(safeFilenameStem("  .hidden  ")).toBe("hidden");
  });

  it("falls back to a usable name rather than an empty one", () => {
    expect(safeFilenameStem("")).toBe("note");
    expect(safeFilenameStem("🎉🎉")).toBe("note");
  });

  it("bounds the length and never ends in a stray separator", () => {
    const stem = safeFilenameStem("x ".repeat(200));
    expect(stem.length).toBeLessThanOrEqual(60);
    expect(stem.endsWith("-")).toBe(false);
  });

  it("uses the format's extension, and disambiguates only when asked", () => {
    expect(noteExportFilename(note(), "md")).toBe("reading-list.md");
    expect(noteExportFilename(note(), "txt")).toBe("reading-list.txt");
    // `note_abc123def` → alphanumerics only → last six → a stable suffix.
    expect(noteExportFilename(note(), "md", { disambiguate: true })).toBe(
      "reading-list-123def.md",
    );
  });

  it("gives the SAME note the same disambiguated name every time", () => {
    const first = noteExportFilename(note(), "md", { disambiguate: true });
    const second = noteExportFilename(note(), "md", { disambiguate: true });
    expect(first).toBe(second);
    expect(first).not.toBe(noteExportFilename(note(), "md"));
  });

  it("accepts only the supported formats", () => {
    expect(isNoteExportFormat("md")).toBe(true);
    expect(isNoteExportFormat("txt")).toBe(true);
    expect(isNoteExportFormat("pdf")).toBe(false);
    expect(isNoteExportFormat(null)).toBe(false);
  });
});

describe("Markdown export", () => {
  it("carries the metadata as portable front matter and keeps the body verbatim", () => {
    const out = buildNoteMarkdownExport(note(), resolve);
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain('title: "Reading list"');
    expect(out).toContain("created: 2026-07-01T09:00:00.000Z");
    expect(out).toContain("updated: 2026-07-20T10:00:00.000Z");
    expect(out).toContain('tags: ["reading", "research"]');
    expect(out).toContain("# Reading list\n");
    expect(out).toContain("- one\n- two\n");
  });

  it("preserves headings, lists, tables and links exactly", () => {
    const content =
      "## Risks\n\n1. first\n2. second\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[link](https://example.test)\n";
    const out = buildNoteMarkdownExport(note({ content }), resolve);
    expect(out).toContain(content);
  });

  it("marks an archived note in the front matter", () => {
    expect(
      buildNoteMarkdownExport(note({ archived: true }), resolve),
    ).toContain("archived: true");
  });

  it("rewrites references to explicit DalyHub links and never leaves broken syntax", () => {
    const out = buildNoteMarkdownExport(
      note({ content: "See [[Atlas]] and [[Ghost]].\n" }),
      resolve,
    );
    expect(out).toContain("[Atlas](dalyhub://note/n_atlas)");
    expect(out).toContain("and Ghost.");
    expect(out).not.toContain("[[");
  });

  it("escapes a quote in the title rather than breaking the front matter", () => {
    expect(
      buildNoteMarkdownExport(note({ title: 'The "big" list' }), resolve),
    ).toContain('title: "The \\"big\\" list"');
  });

  it("never emits rendered HTML", () => {
    const out = buildNoteMarkdownExport(
      note({ content: "**bold** and `code`\n" }),
      resolve,
    );
    expect(out).not.toContain("<strong>");
    expect(out).not.toContain("<p>");
    expect(out).toContain("**bold**");
  });
});

describe("plain-text export", () => {
  it("has a readable header and a syntax-free body", () => {
    const out = buildNotePlainTextExport(note());
    expect(out.startsWith("Reading list\n")).toBe(true);
    expect(out).toContain("Created: 2026-07-01T09:00:00.000Z");
    expect(out).toContain("Tags: reading, research");
    expect(out).toContain("- one");
    expect(out).not.toContain("# ");
  });

  it("collapses references to their labels", () => {
    expect(
      buildNotePlainTextExport(note({ content: "See [[Atlas|the project]]." })),
    ).toContain("See the project.");
  });

  it("omits the tag line entirely when there are no tags", () => {
    expect(buildNotePlainTextExport(note({ tags: [] }))).not.toContain("Tags:");
  });
});

describe("format dispatch and download naming", () => {
  it("routes each format to its builder", () => {
    expect(buildNoteExport(note(), "md", resolve).startsWith("---")).toBe(true);
    expect(
      buildNoteExport(note(), "txt", resolve).startsWith("Reading list"),
    ).toBe(true);
  });

  it("reads the server's filename, preferring the UTF-8 form", () => {
    expect(
      filenameFromDisposition(
        `attachment; filename="reading-list.md"; filename*=UTF-8''reading%2Dlist.md`,
        "fallback.md",
      ),
    ).toBe("reading-list.md");
    expect(
      filenameFromDisposition(
        'attachment; filename="plain.txt"',
        "fallback.txt",
      ),
    ).toBe("plain.txt");
    expect(filenameFromDisposition(null, "fallback.md")).toBe("fallback.md");
  });
});
