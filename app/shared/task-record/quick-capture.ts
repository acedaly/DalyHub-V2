/**
 * TASKS-01 quick-capture parser (pure, React-free, testable) — ADR-043 §14.
 *
 * A DELIBERATELY BOUNDED, deterministic token vocabulary — NOT natural-language
 * understanding and NOT AI. It scans a captured line for a small closed set of
 * trailing/inline tokens (`p1`…`p4`, the Time Sectors, `someday`, `routine`,
 * `waiting`, `delegate`) and returns the remaining text as the title plus a
 * structured interpretation the UI shows as a preview the user can correct before
 * saving. No date phrases are guessed here — a real date is entered through the
 * shared trusted date control; this parser never claims to understand arbitrary
 * language.
 *
 * Every token must be a WHOLE whitespace-delimited word (case-insensitive), so a
 * title like "Plan the p1 launch party" keeps "p1" as text unless it stands alone.
 * The title is what remains after removing recognised tokens; if removing tokens
 * would empty the title, the ORIGINAL text is kept as the title (the tokens are
 * then treated as literal words) so capture never produces an empty task.
 */

import type { CommitmentState, TaskPriority, TimeSector } from "~/kernel/tasks";

/** The structured interpretation of a captured line. */
export interface QuickCaptureInterpretation {
  /** The task title (recognised tokens removed), never empty. */
  readonly title: string;
  /** The priority a `p1`–`p4` token set, or null. */
  readonly priority: TaskPriority | null;
  /** The Time Sector a sector token set, or null. */
  readonly timeSector: TimeSector | null;
  /** The commitment state (`someday` token → `someday`), else `active`. */
  readonly commitmentState: CommitmentState;
  /** Whether a `waiting` token was present. */
  readonly waiting: boolean;
  /** Whether a `delegate` token was present (offers the delegation flow). */
  readonly delegate: boolean;
  /** The recognised tokens, in first-seen order, for the preview. */
  readonly tokens: readonly QuickCaptureToken[];
}

/** A recognised token and the human label the preview shows. */
export interface QuickCaptureToken {
  readonly raw: string;
  readonly kind: "priority" | "sector" | "commitment" | "waiting" | "delegate";
  readonly label: string;
}

const PRIORITY_TOKENS: Record<string, TaskPriority> = {
  p1: "p1",
  p2: "p2",
  p3: "p3",
  p4: "p4",
};

/**
 * Multi-word sector phrases, longest first so "next week" wins over a bare "week".
 * Matched as whole trailing/inline word runs, case-insensitively.
 */
const SECTOR_PHRASES: ReadonlyArray<readonly [string, TimeSector]> = [
  ["next week", "next_week"],
  ["this week", "this_week"],
  ["next month", "next_month"],
  ["this month", "this_month"],
  ["long term", "long_term"],
];

const SINGLE_SECTOR_TOKENS: Record<string, TimeSector> = {
  routine: "routines",
  routines: "routines",
};

const PRIORITY_PREVIEW: Record<TaskPriority, string> = {
  p1: "P1 · Do",
  p2: "P2 · Defer",
  p3: "P3 · Delegate",
  p4: "P4 · Delete / Review",
};

const SECTOR_PREVIEW: Record<TimeSector, string> = {
  this_week: "This Week",
  next_week: "Next Week",
  this_month: "This Month",
  next_month: "Next Month",
  long_term: "Long Term",
  routines: "Routines",
};

/** Collapse internal whitespace and trim. */
function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Parse a captured line into a structured interpretation. Deterministic and pure.
 * The parser removes recognised tokens from the title; if that would empty the
 * title it keeps the original text (tokens become literal words) — capture never
 * yields an empty task.
 */
export function parseQuickCapture(raw: string): QuickCaptureInterpretation {
  const original = normaliseWhitespace(raw);
  const words = original.length > 0 ? original.split(" ") : [];
  const lower = words.map((w) => w.toLowerCase());
  const removed = new Array<boolean>(words.length).fill(false);

  let priority: TaskPriority | null = null;
  let timeSector: TimeSector | null = null;
  let commitmentState: CommitmentState = "active";
  let waiting = false;
  let delegate = false;
  const tokens: QuickCaptureToken[] = [];

  // Multi-word sector phrases first (whole consecutive words, case-insensitive).
  for (const [phrase, sector] of SECTOR_PHRASES) {
    if (timeSector !== null) break;
    for (let i = 0; i + 1 < words.length; i++) {
      if (removed[i] || removed[i + 1]) continue;
      if (`${lower[i]} ${lower[i + 1]}` === phrase) {
        timeSector = sector;
        removed[i] = true;
        removed[i + 1] = true;
        tokens.push({
          raw: phrase,
          kind: "sector",
          label: SECTOR_PREVIEW[sector],
        });
        break;
      }
    }
  }

  // Single whole-word tokens.
  for (let i = 0; i < words.length; i++) {
    if (removed[i]) continue;
    const w = lower[i]!;
    if (priority === null && w in PRIORITY_TOKENS) {
      priority = PRIORITY_TOKENS[w]!;
      removed[i] = true;
      tokens.push({
        raw: w,
        kind: "priority",
        label: PRIORITY_PREVIEW[priority],
      });
    } else if (timeSector === null && w in SINGLE_SECTOR_TOKENS) {
      timeSector = SINGLE_SECTOR_TOKENS[w]!;
      removed[i] = true;
      tokens.push({
        raw: w,
        kind: "sector",
        label: SECTOR_PREVIEW[timeSector],
      });
    } else if (
      commitmentState === "active" &&
      (w === "someday" || w === "maybe")
    ) {
      commitmentState = "someday";
      removed[i] = true;
      tokens.push({ raw: w, kind: "commitment", label: "Someday / Maybe" });
    } else if (!waiting && w === "waiting") {
      waiting = true;
      removed[i] = true;
      tokens.push({ raw: w, kind: "waiting", label: "Waiting" });
    } else if (!delegate && w === "delegate") {
      delegate = true;
      removed[i] = true;
      tokens.push({ raw: w, kind: "delegate", label: "Delegate" });
    }
  }

  const title = words.filter((_, i) => !removed[i]).join(" ");
  // If tokens consumed the whole line, fall back to the original text as the title
  // and drop the interpretation (the tokens were the entire capture — treat as text).
  if (title.length === 0) {
    return {
      title: original,
      priority: null,
      timeSector: null,
      commitmentState: "active",
      waiting: false,
      delegate: false,
      tokens: [],
    };
  }

  return {
    title,
    priority,
    timeSector,
    commitmentState,
    waiting,
    delegate,
    tokens,
  };
}

/** True when the interpretation materially changes the task (worth a preview). */
export function interpretationIsMeaningful(
  interpretation: QuickCaptureInterpretation,
): boolean {
  return (
    interpretation.priority !== null ||
    interpretation.timeSector !== null ||
    interpretation.commitmentState !== "active" ||
    interpretation.waiting ||
    interpretation.delegate
  );
}
