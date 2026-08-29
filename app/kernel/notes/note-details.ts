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
  TagValidationError,
  canonicalTagKey,
  tagLabels,
  validateEntityTags,
  type WorkspaceTag,
} from "~/kernel/tags";
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

/**
 * AUDIT-08 — optimistic concurrency for a Note's long-form content.
 *
 * `expectedContentUpdatedAt` is the {@link NoteDetails.contentUpdatedAt} the
 * editor loaded — the identity of the text this edit was written against.
 * `null` is a real, distinct value meaning "the Note had never had its content
 * saved when I opened it", not "no precondition"; omitting the option entirely
 * is what means that.
 *
 * A Note is long-form authored content, so the failure this prevents is not a
 * setting flipping back — it is a paragraph someone wrote disappearing without
 * anyone being told. The write therefore refuses rather than merges: Markdown
 * has no deterministic safe merge, and a wrong merge produces text neither
 * person wrote.
 */
export type UpdateNoteContentOptions = {
  readonly expectedContentUpdatedAt?: Date | null;
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

/**
 * The write was refused because the stored Note moved on since the caller read
 * it (AUDIT-08). It is an EXPECTED outcome — "this note changed elsewhere" —
 * never an infrastructure failure, and never a silent success: the newer stored
 * content is intact and the caller's text is still theirs to keep.
 */
export class NoteDetailsConflictError extends Error {
  readonly code = "conflict" as const;
  constructor() {
    super("This note changed somewhere else. Nothing has been overwritten.");
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
 * Normalise ONE tag to its canonical IDENTITY.
 *
 * **V2.6 FIND-02 — this is the canonical key rule, promoted into
 * `~/kernel/tags`.** It is kept as a named export because NOTES-02's own
 * documentation and tests refer to it, and because it still says the true thing:
 * `"Reading "`, `"reading"` and `"Reading"` are one tag. What CHANGED is that the
 * folded form is now the tag's identity in the workspace vocabulary rather than
 * the value stored on a Note, so the casing the owner typed survives on the
 * vocabulary's label instead of being discarded on write.
 */
export function normaliseNoteTag(value: string): string {
  return canonicalTagKey(value);
}

/**
 * Validate a Note's whole tag set, returning the display labels in canonical
 * order.
 *
 * **V2.6 FIND-02 — this delegates to the ONE tag validator**, so a Note, a
 * Person and an Asset now agree on what a tag is. The Note-specific parts that
 * remain are the ERROR TYPE and the tighter Note limits.
 */
export function validateNoteTags(value: unknown): readonly string[] {
  return tagLabels(validateNoteTagSet(value));
}

/** The same validation, returning the canonical key/label pairs a write needs. */
export function validateNoteTagSet(value: unknown): readonly WorkspaceTag[] {
  let validated: readonly WorkspaceTag[];
  try {
    validated = validateEntityTags(value, "tags");
  } catch (cause) {
    if (cause instanceof TagValidationError) {
      throw new NoteDetailsValidationError(
        "tags",
        cause.message.replace(/^tags /, ""),
      );
    }
    throw cause;
  }
  // NOTES-02's own bounds are TIGHTER than the shared ceiling, and they are
  // preserved rather than widened: a Note is a document, and twenty labels is
  // already more than a document earns.
  for (const tag of validated) {
    if ([...tag.label].length > MAX_NOTE_TAG_LENGTH) {
      throw new NoteDetailsValidationError(
        "tags",
        `each tag must be ${MAX_NOTE_TAG_LENGTH} characters or fewer`,
      );
    }
  }
  if (validated.length > MAX_NOTE_TAGS) {
    throw new NoteDetailsValidationError(
      "tags",
      `a note can carry at most ${MAX_NOTE_TAGS} tags`,
    );
  }
  return validated;
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
