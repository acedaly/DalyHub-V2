/**
 * PWA-04 — the offline snapshot contract.
 *
 * The exact, minimised shape the server sends and the device stores. It is a
 * kernel contract for the same reason the export snapshot is: it spans every
 * module, so it must not live inside one, and both sides must agree on it
 * byte-for-byte or the device silently renders nothing.
 *
 * ── Data minimisation is the design, not a review comment ────────────────────
 * Every field below earns its place by being rendered somewhere in the offline
 * views. The rule applied while writing this file was: *if the offline UI does
 * not display it or filter/sort on it, it is not in the snapshot*. That is why
 * there is no body Markdown on a task, no Activity, no audit payload, no
 * `createdBy`, no soft-delete metadata, no EntityLink graph, no server-only
 * column and no "might be useful later" field.
 *
 * What is deliberately ABSENT, and why:
 *   - **Note and Diary bodies are TRUNCATED, not stored whole.** A seven-day
 *     window of full Markdown is unbounded in size and is the most sensitive text
 *     in the product. The offline view shows an excerpt and says plainly that the
 *     full text needs a connection.
 *   - **No People or Projects database copy.** Only the specific person/project/
 *     area records referenced by a retained record are included, and only with the
 *     id + display label needed to render the reference.
 *   - **No credentials of any kind.** No Access token, no cookie, no header, no
 *     session, no workspace id and no subject: the identity is represented ONLY by
 *     an opaque namespace digest (see `offline-identity.ts`).
 */

import type { CalendarIso, OfflineWindow } from "./offline-window";

/** The version of THIS wire contract. Bumped when the shape changes. */
export const OFFLINE_SNAPSHOT_VERSION = 1;

/** How much Note/Diary body text is retained, in characters. */
export const OFFLINE_EXCERPT_LIMIT = 600;

/** The record kinds the snapshot carries. */
export const OFFLINE_RECORD_KINDS = [
  "task",
  "note",
  "diary",
  "meeting",
  "reference",
] as const;

export type OfflineRecordKind = (typeof OFFLINE_RECORD_KINDS)[number];

/**
 * A task, reduced to what the offline Today and Tasks views render.
 *
 * `dueDate`/`scheduledDate` are calendar dates (never instants) because that is
 * how DalyHub models planning; `completedAt` is an instant because completion is
 * a moment. `parentLabel` is the resolved Project/Area name — the offline view
 * shows the name, so storing the name avoids retaining the parent record itself.
 */
export interface OfflineTask {
  readonly id: string;
  readonly title: string;
  readonly status: "open" | "completed";
  readonly priority: string | null;
  readonly timeSector: string | null;
  readonly dueDate: CalendarIso | null;
  readonly scheduledDate: CalendarIso | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
  /** The Project/Area this task sits under, or null for an Inbox task. */
  readonly parentId: string | null;
  readonly parentLabel: string | null;
  /** True when the task is blocked on someone or something (TODAY-03). */
  readonly waiting: boolean;
}

/** A note, reduced to a readable card: title, tags, and a bounded excerpt. */
export interface OfflineNote {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  /** True when the body was longer than the excerpt limit. */
  readonly truncated: boolean;
  readonly tags: readonly string[];
  readonly updatedAt: string;
}

/** A diary entry, reduced to its chronology and a bounded excerpt. */
export interface OfflineDiaryEntry {
  readonly id: string;
  readonly title: string;
  readonly entryType: string;
  readonly occurredAt: string;
  readonly excerpt: string;
  readonly truncated: boolean;
}

/** A meeting, reduced to when it is, what it is called, and who is coming. */
export interface OfflineMeeting {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly heldAt: string | null;
  /** Display names only — never a Person record, never contact details. */
  readonly attendeeLabels: readonly string[];
}

/**
 * The minimum context a retained record needs to be understandable: the Projects,
 * Areas and People it points at, as an id and a label. This is the ONLY route by
 * which a project or person reaches the device — there is no bulk copy.
 */
export interface OfflineReference {
  readonly id: string;
  readonly kind: "project" | "area" | "person";
  readonly label: string;
}

/** The counts the offline Today view shows without recomputing from records. */
export interface OfflineTodaySummary {
  readonly dueTodayCount: number;
  readonly overdueCount: number;
  readonly upcomingCount: number;
  readonly completedRecentlyCount: number;
  readonly meetingsTodayCount: number;
}

/** The complete payload `GET /offline/snapshot` returns. */
export interface OfflineSnapshot {
  readonly snapshotVersion: number;
  /** The opaque identity+workspace digest this snapshot belongs to. */
  readonly namespace: string;
  /** A safe display label for the identity (the owner's email). */
  readonly identityLabel: string;
  /** A safe display label for the workspace. Never the workspace id. */
  readonly workspaceLabel: string;
  /** When the server built it (ISO-8601 UTC). */
  readonly generatedAt: string;
  readonly window: OfflineWindow;
  readonly today: OfflineTodaySummary;
  readonly tasks: readonly OfflineTask[];
  readonly notes: readonly OfflineNote[];
  readonly diary: readonly OfflineDiaryEntry[];
  readonly meetings: readonly OfflineMeeting[];
  readonly references: readonly OfflineReference[];
  /**
   * True when a section was truncated at its bound. The offline view says so
   * rather than implying the device holds everything.
   */
  readonly bounded: boolean;
}

/**
 * Per-section upper bounds. A snapshot is a useful working set, not a replica: a
 * workspace with two thousand tasks in the window must not push two thousand
 * records into IndexedDB on every sync. When a bound bites, `bounded` is true and
 * the offline UI says the snapshot is partial.
 */
export const OFFLINE_SNAPSHOT_LIMITS = {
  tasks: 400,
  notes: 100,
  diary: 150,
  meetings: 100,
  references: 300,
} as const;

/** Trim body text to the excerpt limit on a word boundary where possible. */
export function toExcerpt(
  body: string | null | undefined,
  limit: number = OFFLINE_EXCERPT_LIMIT,
): { readonly excerpt: string; readonly truncated: boolean } {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) {
    return { excerpt: text, truncated: false };
  }
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return {
    excerpt: (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim(),
    truncated: true,
  };
}
