/**
 * CAPTURE-01 Capture kernel — the ONE universal capture contract.
 *
 * DalyHub has exactly one way for a thought to arrive from outside the running
 * application, and this module is its vocabulary. A capture is deliberately tiny:
 * an INTENT, some TEXT, and a little provenance. It is not a task model, not a
 * note model, and never a way to address DalyHub's internal representation —
 * the client says what it meant, and DalyHub decides what that becomes.
 *
 *   iPhone Shortcut / Share Sheet / Siri / email / the PWA
 *        ↓
 *   CaptureRequest              (this module — validated, bounded)
 *        ↓
 *   capture classification      (deterministic; `./capture-classification`)
 *        ↓
 *   TaskRepository.createTask / EntityRepository.create + NoteDetails.update
 *        ↓
 *   D1
 *
 * There is NO `shortcut_tasks` table, no `email_notes` table and no second Task
 * or Note creation path (AGENTS.md CAPTURE-01 §9.8). Capture SOURCES differ; the DalyHub
 * records they produce do not.
 *
 * Storage-, transport- and framework-independent: nothing here imports D1,
 * Cloudflare, React, React Router or `env`.
 */

/* -------------------------------------------------------------------------- */
/* Intent                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What the sender says the capture IS. A closed set, because an open one would
 * mean the server guessing at strings a client invented.
 *
 *   - `task`   create a Task. The deterministic TASKS-01 parser runs over the text.
 *   - `note`   create a Note.
 *   - `inbox`  create an intentionally unclassified Task with no parent — which is
 *              exactly what DalyHub's Inbox already IS (active, unassigned Tasks).
 *              CAPTURE-01 adds no third entity type for it.
 *   - `auto`   let DalyHub classify, conservatively, and fall back to Inbox.
 */
export const CAPTURE_INTENTS = ["task", "note", "inbox", "auto"] as const;

export type CaptureIntent = (typeof CAPTURE_INTENTS)[number];

/** True when a value names a capture intent. */
export function isCaptureIntent(value: unknown): value is CaptureIntent {
  return (
    typeof value === "string" &&
    (CAPTURE_INTENTS as readonly string[]).includes(value)
  );
}

/**
 * The intent used when a caller supplies none.
 *
 * `auto` rather than `inbox`: a caller that says nothing still gets the
 * conservative classifier, which itself falls back to Inbox whenever it is not
 * confident. Nothing is ever lost by defaulting here (CAPTURE-01 §8).
 */
export const DEFAULT_CAPTURE_INTENT: CaptureIntent = "auto";

/* -------------------------------------------------------------------------- */
/* Source                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * WHERE a capture came from. A bounded enum, not a free string: the value is
 * written into Activity, so an arbitrary caller-supplied label would be an
 * unbounded write into the audit trail and a presentation surface that can be
 * made to say anything.
 */
export const CAPTURE_SOURCES = [
  /** DalyHub's own in-app / PWA capture. */
  "dalyhub",
  /** An Apple Shortcut run from the Home Screen, a widget, the Action Button or Siri. */
  "ios-shortcut",
  /** An Apple Shortcut invoked from the iOS Share Sheet. */
  "ios-share-sheet",
  /** Email forwarded to the configured capture address. */
  "email",
  /** A direct API caller that named no more specific source. */
  "api",
] as const;

export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

/** True when a value names a capture source. */
export function isCaptureSource(value: unknown): value is CaptureSource {
  return (
    typeof value === "string" &&
    (CAPTURE_SOURCES as readonly string[]).includes(value)
  );
}

/** The source assumed when a caller names none. */
export const DEFAULT_CAPTURE_SOURCE: CaptureSource = "api";

/**
 * The owner-facing name of a source, for Activity and for the Settings surface.
 * Product language, not protocol language (CAPTURE-01 §34).
 */
export const CAPTURE_SOURCE_LABELS: Readonly<Record<CaptureSource, string>> = {
  dalyhub: "DalyHub",
  "ios-shortcut": "Apple Shortcut",
  "ios-share-sheet": "the iOS Share Sheet",
  email: "email capture",
  api: "the capture API",
};

/* -------------------------------------------------------------------------- */
/* Destination                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What a capture actually BECAME. Only two record types exist here, because
 * Inbox is a Task without a parent rather than a record type of its own.
 */
export type CaptureRecordKind = "task" | "note";

/**
 * The owner-facing destination of a capture — the phrase a Shortcut shows back
 * ("Saved Task to Inbox"). Derived, never stored as a field on the record.
 *
 * There are only two, because CAPTURE-01 files nothing automatically: a captured
 * Task is always an UNASSIGNED Task, which is precisely what DalyHub's Inbox is,
 * and a captured Note is a Note. No Project, Area or Goal is ever guessed (CAPTURE-01 §39) —
 * organising is the owner's, afterwards, with full context.
 */
export type CaptureDestination = "Inbox" | "Notes";

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Bounds, all enforced at the boundary before anything reaches the domain (CAPTURE-01 §16).
 * They are generous for a human writing on a phone and hostile to anything else.
 */

/** The largest capture body DalyHub will read at all, in bytes. */
export const CAPTURE_REQUEST_MAX_BYTES = 32 * 1024;

/** The most text one capture may carry, in code points. */
export const CAPTURE_TEXT_MAX_LENGTH = 10_000;

/** The longest supplied title, in code points. Shorter than the entity limit on
 * purpose: a capture title is a headline, and the rest belongs in the body. */
export const CAPTURE_TITLE_MAX_LENGTH = 200;

/** The longest supplied source title (a shared page's `<title>`), in code points. */
export const CAPTURE_SOURCE_TITLE_MAX_LENGTH = 300;

/** The longest accepted source URL, in code points. */
export const CAPTURE_URL_MAX_LENGTH = 2_048;

/** The generated title of a Note captured without one, in code points. */
export const CAPTURE_DERIVED_TITLE_MAX_LENGTH = 80;

/**
 * The URL schemes a capture may carry. `http`/`https` only: a `javascript:`,
 * `data:` or `file:` URL in a Markdown link is an injection vector, and no
 * capture surface has a legitimate reason to send one (CAPTURE-01 §35).
 */
export const CAPTURE_URL_SCHEMES: ReadonlySet<string> = new Set([
  "http:",
  "https:",
]);

/* -------------------------------------------------------------------------- */
/* The request                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A validated capture — the ONE shape every transport produces and the capture
 * application service consumes.
 *
 * Note what is absent: no `workspaceId`, no `entityId`, no position, no
 * `deletedAt`, no completion state. A caller supplies INTENT; DalyHub owns
 * representation (CAPTURE-01 §4, §36). The workspace is resolved server-side from the
 * credential and can never be selected by a request.
 */
export type CaptureRequest = {
  readonly intent: CaptureIntent;
  /** The captured text. Non-empty unless a title was supplied. */
  readonly text: string;
  /** An explicit title, or null to derive one. */
  readonly title: string | null;
  readonly source: CaptureSource;
  /** An `http(s)` URL the capture came from, or null. */
  readonly sourceUrl: string | null;
  /** The human title of `sourceUrl` (e.g. a shared page's title), or null. */
  readonly sourceTitle: string | null;
  /** The caller's idempotency key, or null when the caller sent none. */
  readonly clientCaptureId: string | null;
  /** When the sender says it was captured. Advisory only — never a record's
   * `createdAt`, which stays the repository's own clock. */
  readonly capturedAt: Date | null;
};

/* -------------------------------------------------------------------------- */
/* The result                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What a successful capture reports back. Deliberately small (CAPTURE-01 §9, §42): enough
 * for a Shortcut to say "Saved Task to Inbox" and offer "Open in DalyHub",
 * and nothing else. No internal storage detail, no full record, no workspace id.
 */
export type CaptureOutcome = {
  readonly id: string;
  readonly kind: CaptureRecordKind;
  readonly title: string;
  readonly destination: CaptureDestination;
  /** The canonical in-app path, e.g. `/tasks/abc`. A Shortcut joins it to the
   * origin it already posted to — DalyHub invents no second link scheme (CAPTURE-01 §43). */
  readonly path: string;
  /** True when this response replayed an earlier identical capture (CAPTURE-01 §10). */
  readonly replayed: boolean;
};

/** The canonical in-app path for a captured record. */
export function capturePathFor(kind: CaptureRecordKind, id: string): string {
  return kind === "task" ? `/tasks/${id}` : `/notes/${id}`;
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The Activity event appended for a capture that arrived from OUTSIDE the running
 * application (CAPTURE-01 §18).
 *
 * The record's own `entity.created` event is still written by the repository, in
 * the same atomic batch as the record — that is unchanged and remains the fact
 * that the record exists. This second event carries the one thing that batch
 * cannot know: how the capture reached DalyHub. It is appended through the
 * existing SET-03 `WorkspaceEventRecorder` into the SAME `activities` stream, so
 * CAPTURE-01 grows no parallel audit table.
 *
 * In-app capture does NOT record it: the PWA is DalyHub, and an event saying "a
 * DalyHub record was created via DalyHub" is noise.
 */
export const CAPTURE_RECEIVED = "capture.received";

/**
 * The `capture.received` payload. Structural facts only — never the captured
 * text, the title, the source URL or anything else the owner wrote (CAPTURE-01 §44).
 */
export type CaptureReceivedPayload = {
  readonly source: CaptureSource;
  readonly kind: CaptureRecordKind;
  readonly destination: CaptureDestination;
  /** The capture credential's stable id, or null for email capture (which has
   * no token). Never the token, never a hash of it. */
  readonly captureTokenId: string | null;
  /** The credential's owner-facing device name, so the feed can say WHICH phone. */
  readonly deviceName: string | null;
};
