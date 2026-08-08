/**
 * DOC-EDITOR-01 architecture test — ONE long-form writing surface.
 *
 * DalyHub has had two long-form controls before: the live editor and a bare
 * `<textarea>` with a "Show preview" disclosure (`MarkdownField`). EDIT-02 moved
 * every product surface off the second one; DOC-EDITOR-01 deleted it, along with
 * the never-adopted `InlineMarkdownField`. That is only worth doing once, so this
 * scan is what stops the divergence coming back by accident — a second editor
 * engine, a second toolbar, or a module-local Markdown textarea.
 *
 * It asserts boundaries, never file counts: adding a file to
 * `app/shared/markdown-editor` is expected and must not fail a test.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const APP_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "app",
);
const EDITOR_DIR = path.join("shared", "markdown-editor");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(APP_DIR).map((file) => ({
  relative: path.relative(APP_DIR, file),
  source: readFileSync(file, "utf8"),
}));

const outsideEditor = FILES.filter(
  (file) => !file.relative.startsWith(EDITOR_DIR),
);

describe("DOC-EDITOR-01 — one editing engine", () => {
  it("keeps every CodeMirror/Lezer import inside the shared editor", () => {
    const offenders = outsideEditor
      .filter((file) => /from\s+"@(codemirror|lezer)\//.test(file.source))
      .map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it("has exactly one formatting toolbar component", () => {
    const toolbars = FILES.filter((file) =>
      /role=\{?"toolbar"/.test(file.source),
    ).map((file) => file.relative);
    expect(toolbars).toEqual([path.join(EDITOR_DIR, "EditorToolbar.tsx")]);
  });

  it("has exactly one catalogue of Markdown formatting actions", () => {
    const catalogues = FILES.filter((file) =>
      /MARKDOWN_FORMATTING_ACTIONS\s*[:=]/.test(file.source),
    ).map((file) => file.relative);
    expect(catalogues).toEqual([
      path.join(EDITOR_DIR, "formatting-actions.ts"),
    ]);
  });
});

describe("DOC-EDITOR-01 — the superseded long-form controls stay deleted", () => {
  it.each([
    "MarkdownField",
    "InlineMarkdownField",
    "NoteFormattingToolbar",
    "LegacyEditor",
    "EditorV2",
    "OldMarkdownToolbar",
  ])("declares no %s", (symbol) => {
    const declarations = FILES.filter((file) =>
      new RegExp(
        `(export\\s+(function|const|class)\\s+${symbol}\\b|from\\s+"[^"]*\\/${symbol}")`,
      ).test(file.source),
    ).map((file) => file.relative);
    expect(declarations).toEqual([]);
  });

  it("leaves no module rendering its own Markdown textarea", () => {
    // The ONE permitted `<textarea>` for Markdown is the shared editor's
    // SSR/no-JS fallback. `dh-input--markdown` was the deleted control's class;
    // its reappearance would mean a second long-form control.
    const offenders = FILES.filter((file) =>
      /dh-input--markdown/.test(file.source),
    ).map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it("exports no long-form control from the shared forms barrel", () => {
    const barrel = FILES.find(
      (file) => file.relative === path.join("shared", "forms", "index.ts"),
    );
    expect(barrel).toBeDefined();
    // `~/shared/forms` is imported by nearly every route. A Markdown control in
    // it is both a bundle cost and the trap DEBT-101 described: the next module
    // that needs one finds it there and re-opens the divergence.
    expect(barrel!.source).not.toMatch(/Markdown/);
  });
});

describe("DOC-EDITOR-01 — Markdown stays canonical and sanitised", () => {
  it("introduces no rich-text document model or alternative persistence format", () => {
    const offenders = outsideEditor
      .filter((file) =>
        /from\s+"(prosemirror|lexical|slate|@tiptap|quill|draft-js)/.test(
          file.source,
        ),
      )
      .map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it("renders read state only through the shared FND-08 pipeline", () => {
    // The editor may import the renderer (its Read mode) but must never carry a
    // parser or sanitiser of its own.
    const editorFiles = FILES.filter((file) =>
      file.relative.startsWith(EDITOR_DIR),
    );
    const offenders = editorFiles
      .filter((file) =>
        /from\s+"(unified|remark-|rehype-|micromark|marked|markdown-it)/.test(
          file.source,
        ),
      )
      .map((file) => file.relative);
    expect(offenders).toEqual([]);
  });
});
