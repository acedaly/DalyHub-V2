/**
 * NOTES-06 — single-Note export.
 *
 * A Note is stored as EXACT, byte-for-byte validated Markdown source
 * ([ADR-015]), so exporting it is a *serve what is stored* operation with no
 * conversion and no lossy step. That rule is load-bearing here:
 *
 *   - the `.md` export IS the canonical source, with only two deliberate
 *     transformations — a metadata header and the `[[…]]` reference rewrite;
 *   - the `.txt` export is the shared analyser's plain-text projection;
 *   - **re-rendered HTML is never exported as if it were the note.** No format
 *     here goes through the renderer, so there is no second HTML sink and the
 *     FND-08 boundary is untouched.
 *
 * This module is PURE: it builds strings and filenames. Authorisation, workspace
 * scope and the HTTP response belong to the route that composes it.
 */

import {
  transformReferencesForExport,
  markdownToPlainText,
  type ReferenceResolver,
} from "~/platform/markdown/note-document";

/** The formats a single Note can be exported as. */
export const NOTE_EXPORT_FORMATS = ["md", "txt"] as const;
export type NoteExportFormat = (typeof NOTE_EXPORT_FORMATS)[number];

export function isNoteExportFormat(value: unknown): value is NoteExportFormat {
  return (
    typeof value === "string" &&
    (NOTE_EXPORT_FORMATS as readonly string[]).includes(value)
  );
}

/** The user-facing name and MIME type of each format. */
export const NOTE_EXPORT_FORMAT_INFO: Readonly<
  Record<
    NoteExportFormat,
    { label: string; extension: string; mediaType: string }
  >
> = {
  md: {
    label: "Markdown (.md)",
    extension: "md",
    mediaType: "text/markdown; charset=utf-8",
  },
  txt: {
    label: "Plain text (.txt)",
    extension: "txt",
    mediaType: "text/plain; charset=utf-8",
  },
};

export interface NoteExportInput {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archived: boolean;
}

/* -------------------------------------------------------------------------- */
/* Filenames                                                                  */
/* -------------------------------------------------------------------------- */

/** The longest slug an exported filename carries (before the extension). */
const MAX_SLUG_LENGTH = 60;

/**
 * A safe, human-readable filename stem for a Note title.
 *
 * Deliberately conservative: only `[a-z0-9]` plus single hyphens survive, so the
 * result can never contain a path separator, a device name character, a leading
 * dot, a control character or a quote that would break a `Content-Disposition`
 * header. A title with no usable characters (emoji-only, CJK-only under this
 * rule, or blank) falls back to `note`, never to an empty name.
 */
export function safeFilenameStem(title: string): string {
  const slug = title
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug === "" ? "note" : slug;
}

/**
 * The filename for a Note export.
 *
 * Two Notes may legitimately share a title, and a browser silently renaming
 * `meeting-notes (3).md` loses which note it was. When the caller reports that
 * the stem is not unique in the workspace, a short, stable suffix from the
 * Note's own id disambiguates it — the same note always exports to the same
 * name, and two same-titled notes never collide.
 */
export function noteExportFilename(
  note: Pick<NoteExportInput, "id" | "title">,
  format: NoteExportFormat,
  options: { readonly disambiguate?: boolean } = {},
): string {
  const stem = safeFilenameStem(note.title);
  const suffix = options.disambiguate
    ? `-${note.id
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-6)
        .toLocaleLowerCase()}`
    : "";
  return `${stem}${suffix}.${NOTE_EXPORT_FORMAT_INFO[format].extension}`;
}

/* -------------------------------------------------------------------------- */
/* Bodies                                                                     */
/* -------------------------------------------------------------------------- */

/** Escape a value for a YAML double-quoted scalar. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The Markdown export: YAML front matter carrying the metadata worth keeping,
 * then the note's title as an H1, then the canonical source with its `[[…]]`
 * references rewritten.
 *
 * Front matter is the portable convention every Markdown tool already
 * understands (Obsidian, Jekyll, Pandoc), so the metadata survives the round trip
 * instead of becoming prose. Everything after it is the user's own source: no
 * reflowing, no line-ending normalisation, no syntax rewriting beyond references.
 */
export function buildNoteMarkdownExport(
  note: NoteExportInput,
  resolve: ReferenceResolver,
): string {
  const front = [
    "---",
    `title: ${yamlString(note.title)}`,
    `created: ${note.createdAt.toISOString()}`,
    `updated: ${note.updatedAt.toISOString()}`,
    `tags: [${note.tags.map((tag) => yamlString(tag)).join(", ")}]`,
    ...(note.archived ? ["archived: true"] : []),
    `source: ${yamlString("DalyHub")}`,
    "---",
    "",
  ].join("\n");

  const body = transformReferencesForExport(note.content, "markdown", resolve);
  const heading = `# ${note.title}\n`;
  return `${front}${heading}\n${body}${body.endsWith("\n") ? "" : "\n"}`;
}

/**
 * The plain-text export: a readable projection with no Markdown punctuation.
 * References collapse to their labels — a `.txt` file has nowhere to put a
 * destination, and a dangling `[[…]]` would be exactly the broken internal
 * syntax §10 forbids.
 */
export function buildNotePlainTextExport(note: NoteExportInput): string {
  const header = [
    note.title,
    "=".repeat(Math.max(3, Math.min(note.title.length, 60))),
    `Created: ${note.createdAt.toISOString()}`,
    `Updated: ${note.updatedAt.toISOString()}`,
    ...(note.tags.length > 0 ? [`Tags: ${note.tags.join(", ")}`] : []),
    ...(note.archived ? ["Archived: yes"] : []),
    "",
  ].join("\n");
  // References collapse to their labels FIRST, so the plain-text projection
  // never carries `[[…]]` — the analyser would otherwise pass it through as
  // literal prose, which is exactly the broken internal syntax §10 forbids.
  const body = markdownToPlainText(
    transformReferencesForExport(note.content, "text", () => null),
  );
  return `${header}\n${body}\n`;
}

/** Build the export body for a format. One switch, so no route re-implements it. */
export function buildNoteExport(
  note: NoteExportInput,
  format: NoteExportFormat,
  resolve: ReferenceResolver,
): string {
  return format === "md"
    ? buildNoteMarkdownExport(note, resolve)
    : buildNotePlainTextExport(note);
}
