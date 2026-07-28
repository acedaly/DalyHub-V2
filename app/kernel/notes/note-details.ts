/**
 * NOTES-01A Notes kernel — the Note-owned Markdown content contract.
 *
 * Notes are first-class DalyHub entities (AGENTS.md §4, ADR-009) but are
 * deliberately NOT part of the Area → Goal → Project → Task spine — a Note
 * attaches to the spine (and to anything else) only through a future
 * EntityLink (NOTES-02), never as a structural child. Identity, title,
 * workspace and lifecycle (create/rename/soft-delete/restore) stay the
 * generic `EntityRepository`'s; this module owns ONLY the additive slice the
 * base `entities` table deliberately does not model: the Note's durable
 * Markdown source.
 *
 * Markdown semantics (ADR-006, ADR-015 — FND-08 is authoritative and is not
 * duplicated here): the stored `content` is the EXACT validated
 * `MarkdownSource` — never trimmed, never whitespace/line-ending-normalised,
 * never reflowed, never stripped of raw HTML. The empty string is valid,
 * meaningful Markdown: an active Note with no `note_details` row represents
 * exactly that — valid, empty content — and is never backfilled. Rendered
 * HTML is derived, disposable output and is never persisted here or anywhere
 * else (FND-08 remains the one renderer/sanitiser).
 */

import {
  MarkdownError,
  parseMarkdownSource,
  type MarkdownSource,
} from "~/kernel/markdown";
import type { WorkspaceId } from "~/kernel/workspaces";

/** The Note entity type — a generic, non-reserved `entities.type` value (Notes
 * stay outside the spine's reserved-type set, so the generic `EntityRepository`
 * remains free to create/rename/soft-delete/restore Notes). */
export const NOTE_ENTITY_TYPE = "note";

/** Activity event appended when a Note's Markdown content genuinely changes. */
export const NOTE_CONTENT_UPDATED = "note.content_updated";

/** Activity event appended when a Note is put away (reversible archive). */
export const NOTE_ARCHIVED = "note.archived";

/** Activity event appended when an archived Note is brought back. */
export const NOTE_UNARCHIVED = "note.unarchived";

/** Activity event appended when a Note's tag set genuinely changes. */
export const NOTE_TAGS_UPDATED = "note.tags_updated";

/** The most tags one Note may carry. */
export const MAX_NOTE_TAGS = 20;
/** The longest a single tag may be, in code points. */
export const MAX_NOTE_TAG_LENGTH = 40;

/** The Note-owned detail fields: the durable Markdown source and, when it has
 * ever been written, the timestamp of that write. */
export type NoteDetails = {
  /** The exact, validated Markdown source. A Note with no `note_details` row
   * reads back as the validated empty string — never `null`, never undefined
   * defaulted content. */
  readonly content: MarkdownSource;
  /** When the content was last written. `null` when the Note has no
   * `note_details` row yet (content has never been saved) — combined with the
   * Note's own `entities.updated_at` by a future reader to compute an
   * effective "last updated" moment; this repository does not compute that
   * itself. */
  readonly contentUpdatedAt: Date | null;
  /**
   * The Note's tags, normalised (trimmed, case-folded, de-duplicated) and in
   * stable sorted order. Empty when the Note has no `note_details` row or no
   * tags — never `null`, mirroring the empty-content contract.
   */
  readonly tags: readonly string[];
  /**
   * When the Note was ARCHIVED (put away but kept), or `null` when it is
   * active. This is deliberately distinct from `entities.deleted_at`: archiving
   * is an organisational act the user takes on a note they want out of the way,
   * while soft-deletion is a removal. Both are reversible; only deletion hides
   * the record's canonical route.
   */
  readonly archivedAt: Date | null;
};

export type NoteDetailsRecord = NoteDetails & {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
};

export type NoteDetailsChangeResult = {
  readonly details: NoteDetailsRecord;
  readonly changed: boolean;
};

export type NoteDetailsValidationField = "id" | "content" | "tags";

export class NoteDetailsValidationError extends Error {
  readonly code = "validation" as const;
  readonly field: NoteDetailsValidationField;

  constructor(field: NoteDetailsValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.name = "NoteDetailsValidationError";
    this.field = field;
  }
}

/** No active Note with the given id exists in the bound workspace — used for a
 * nonexistent id, a soft-deleted Note, a wrong-type id AND a cross-workspace
 * id; the cases are never distinguished (fails closed, discloses nothing). */
export class NoteDetailsNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("Note not found");
    this.name = "NoteDetailsNotFoundError";
  }
}

export class NoteDetailsStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A note details storage error occurred.", options);
    this.name = "NoteDetailsStorageError";
  }
}

export class NoteDetailsConflictError extends Error {
  readonly code = "conflict" as const;
  constructor() {
    super("That change couldn't be completed. Please try again.");
    this.name = "NoteDetailsConflictError";
  }
}

/**
 * Validate a Note's Markdown content through the ONE shared FND-08 parser
 * (`parseMarkdownSource`) — no second parser, no duplicated size/control-
 * character rules. Unlike a nullable Markdown field (e.g. a Task description),
 * a Note's content is never normalised to `null`/omitted and never trimmed:
 * the exact submitted string — including a whitespace-only or empty string —
 * is what gets validated and preserved. A Markdown validation failure is
 * re-typed as a `NoteDetailsValidationError` so the error family stays
 * consistent within this module; the message is forwarded from
 * `MarkdownError`, which never echoes the source content.
 */
export function validateNoteContent(value: unknown): MarkdownSource {
  if (typeof value !== "string") {
    throw new NoteDetailsValidationError("content", "must be a string");
  }
  try {
    return parseMarkdownSource(value);
  } catch (cause) {
    if (cause instanceof MarkdownError) {
      throw new NoteDetailsValidationError("content", cause.message);
    }
    throw cause;
  }
}

/**
 * Normalise ONE tag: trim, collapse internal whitespace to single spaces and
 * case-fold. Tags are an organisational label, not free text — `"Reading "`,
 * `"reading"` and `"Reading"` are the same tag, so filtering by one finds all
 * three and a Note can never carry the "same" tag twice.
 */
export function normaliseNoteTag(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Validate and normalise a Note's whole tag set: every entry trimmed,
 * case-folded, de-duplicated and sorted, bounded by {@link MAX_NOTE_TAGS} and
 * {@link MAX_NOTE_TAG_LENGTH}. Sorting makes the stored value canonical, so an
 * unchanged set is byte-identical and never records a spurious Activity event.
 */
export function validateNoteTags(value: unknown): readonly string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new NoteDetailsValidationError("tags", "must be a list of tags");
  }
  const out = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new NoteDetailsValidationError("tags", "must be a list of tags");
    }
    const tag = normaliseNoteTag(entry);
    if (tag === "") continue;
    if ([...tag].length > MAX_NOTE_TAG_LENGTH) {
      throw new NoteDetailsValidationError(
        "tags",
        `each tag must be ${MAX_NOTE_TAG_LENGTH} characters or fewer`,
      );
    }
    out.add(tag);
  }
  if (out.size > MAX_NOTE_TAGS) {
    throw new NoteDetailsValidationError(
      "tags",
      `a note can carry at most ${MAX_NOTE_TAGS} tags`,
    );
  }
  return [...out].sort();
}

/**
 * Parse the wire form of a tag set into a validated tag set. Kept here so no
 * route or component invents its own splitting rule.
 *
 * Accepts the JSON array the shared DS-06 `TagsField` posts (matching how Assets
 * and People already submit tags) and, defensively, a comma-separated string —
 * so a no-JavaScript submission or a hand-written request still behaves.
 */
export function parseNoteTagInput(value: unknown): readonly string[] {
  if (typeof value !== "string") return validateNoteTags(value);
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      return validateNoteTags(JSON.parse(trimmed));
    } catch {
      throw new NoteDetailsValidationError("tags", "must be a list of tags");
    }
  }
  return validateNoteTags(trimmed === "" ? [] : trimmed.split(","));
}
