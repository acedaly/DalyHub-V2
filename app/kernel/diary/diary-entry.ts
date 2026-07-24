/**
 * DIARY-01A Diary kernel — the canonical Diary Entry model.
 *
 * A Diary Entry is the atom of DalyHub's chronological life history. It is an
 * ordinary `entities` record of the `diary` type (identity, title and lifecycle
 * shared with every other entity, ADR-009) PLUS a chronology-bearing detail
 * slice this kernel owns: the entry TYPE, an OPTIONAL Markdown body, the
 * OCCURRED-AT instant that places it on the Timeline, the capture TIMEZONE and
 * the capture SOURCE. Storage-independent: nothing here imports D1, Cloudflare
 * or React (ADR-009). The D1 adapter (`app/platform/storage/d1`) is the only
 * place snake_case rows and SQLite specifics exist.
 *
 * Chronology is the primary organising principle (ADR-041). `occurredAt` — NOT
 * `createdAt` — is the entry's position in time, so an entry can be BACKDATED
 * ("Memory Mode": recording a moment that happened last week) or future-dated,
 * independently of when the row was written. `createdAt`/`updatedAt` remain the
 * ordinary record-lifecycle timestamps.
 */

import type { MarkdownSource } from "~/kernel/markdown";
import type { WorkspaceId } from "~/kernel/workspaces";

import type { DiaryEntryType } from "./diary-entry-type";

/**
 * Where a Diary Entry was captured from. A small, extensible provenance value —
 * the mechanism that lets future capture channels (voice, photo, email,
 * calendar, mobile quick-capture) attach WITHOUT a schema change or another
 * architectural rewrite: each is simply another `channel` value.
 */
export type DiaryEntrySource = {
  /**
   * The capture channel identifier (e.g. `manual`, `mobile`, `voice`, `photo`,
   * `email`, `calendar`, `import`, `ai`). A validated lowercase identifier —
   * an open vocabulary, never a database enum. Defaults to `manual`.
   */
  readonly channel: string;
  /**
   * An optional, bounded free-form reference to the origin (e.g. an external
   * message id, a file name, a calendar event id). `null` when there is none.
   * NEVER interpreted or dereferenced by the kernel — it is opaque provenance.
   */
  readonly reference: string | null;
};

/**
 * A stored Diary Entry: the shared entity header combined with the Diary-owned
 * detail slice. Every field is `readonly` — a stored record is an immutable
 * snapshot; mutations go through the repository and return a fresh record.
 */
export type DiaryEntry = {
  /** The entity id (application-generated, globally unique, stable). */
  readonly id: string;
  /** The workspace the entry belongs to (branded, validated). */
  readonly workspaceId: WorkspaceId;
  /** The kind of moment this entry records (validated, open vocabulary). */
  readonly entryType: DiaryEntryType;
  /** The entry's human-readable title (the entity title). */
  readonly title: string;
  /**
   * The optional Markdown body, stored as EXACT {@link MarkdownSource} through
   * the one shared FND-08 parser — never trimmed or rewritten. `null` means the
   * entry has no body (a title-and-metadata-only capture is valid and common in
   * a capture-first world).
   */
  readonly body: MarkdownSource | null;
  /**
   * The instant the recorded moment OCCURRED (UTC). The Timeline's ordering key.
   * Independent of `createdAt`: it may be earlier (backdated) or later
   * (planned/future) than when the row was written.
   */
  readonly occurredAt: Date;
  /**
   * The IANA timezone id in effect where/when the moment occurred (e.g.
   * `Australia/Sydney`, `UTC`). Captured so a Timeline can render the entry in
   * its LOCAL wall-clock time later, not just in UTC. Storage stays UTC.
   */
  readonly timezone: string;
  /** Where the entry was captured from. */
  readonly source: DiaryEntrySource;
  /** When the record was created (UTC, immutable). */
  readonly createdAt: Date;
  /**
   * The effective last-updated instant (UTC): the later of the entity header's
   * `updated_at` (a rename/soft-delete/restore) and the detail slice's
   * `updated_at` (an entry-detail edit), so a single coherent "last touched"
   * moment is exposed without the caller combining two timestamps.
   */
  readonly updatedAt: Date;
  /** The soft-deletion instant (UTC), or `null` for a live entry. */
  readonly deletedAt: Date | null;
};

/**
 * Input to capture a new Diary Entry. There is deliberately NO `workspaceId`
 * (FND-03 / ADR-010): scope comes from the repository's bound context. Lifecycle
 * fields (`id`, `createdAt`, `updatedAt`, `deletedAt`) are generated inside the
 * repository. Capture-first: `occurredAt`, `timezone` and `source` all have
 * sensible defaults, so the minimum viable capture is a type and a title.
 */
export type CreateDiaryEntryInput = {
  /** The entry type (validated; any syntactically valid identifier). */
  readonly entryType: string;
  /** The entry's title (validated, trimmed, required). */
  readonly title: string;
  /**
   * The optional Markdown body. `undefined`/`null` both mean "no body"; the
   * empty string is normalised to no body (an empty capture has no content).
   */
  readonly body?: string | null;
  /**
   * When the moment occurred (UTC). Defaults to the capture time (the clock's
   * `now`) — capture-first. Any past or future instant is accepted (Memory Mode
   * backdating), so this field is validated for being a real Date, not for
   * being recent.
   */
  readonly occurredAt?: Date;
  /** The IANA timezone id. Defaults to `UTC`. */
  readonly timezone?: string;
  /** The capture source. Defaults to `{ channel: "manual", reference: null }`. */
  readonly source?: {
    readonly channel?: string;
    readonly reference?: string | null;
  };
};

/**
 * Input to edit a Diary Entry's DETAIL slice. Only the Diary-owned fields are
 * here — NOT `title` and NOT lifecycle, which stay the generic `EntityRepository`'s
 * (no duplicated ownership, ADR-041 §rename/lifecycle). Every field is optional;
 * an omitted field is left unchanged. `body: null` clears the body.
 */
export type UpdateDiaryEntryInput = {
  readonly entryType?: string;
  readonly body?: string | null;
  readonly occurredAt?: Date;
  readonly timezone?: string;
  readonly source?: {
    readonly channel?: string;
    readonly reference?: string | null;
  };
};

/** Result of an entry-detail mutation: the fresh entry and whether it changed. */
export type DiaryEntryChangeResult = {
  readonly entry: DiaryEntry;
  readonly changed: boolean;
};
