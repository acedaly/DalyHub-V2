/**
 * TASKS-01 quick-capture parser (pure, React-free, testable) — ADR-043 §14.
 *
 * A DELIBERATELY BOUNDED, deterministic token vocabulary — NOT natural-language
 * understanding and NOT AI. It scans a captured line for a small closed set of
 * trailing/inline tokens (`p1`…`p4`, the Time Sectors, `someday`, `routine`,
 * `waiting`, `delegate`), bounded calendar phrases and basic `every ...`
 * recurrence, then returns the remaining text as the title plus a structured
 * interpretation the UI shows as a preview the user can correct before saving.
 * Calendar language is intentionally small, owner-day driven and explicit; this
 * parser never claims to understand arbitrary language.
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
  /** The scheduled/committed calendar date parsed from restrained date grammar. */
  readonly scheduledDate: string | null;
  /** The due/deadline date parsed from restrained `due ...` grammar. */
  readonly dueDate: string | null;
  /** A restrained recurrence phrase, or null when the capture is one-off. */
  readonly recurrence: QuickCaptureRecurrence | null;
  /** Whether a `waiting` token was present. */
  readonly waiting: boolean;
  /** Whether a `delegate` token was present (offers the delegation flow). */
  readonly delegate: boolean;
  /** The recognised tokens, in first-seen order, for the preview. */
  readonly tokens: readonly QuickCaptureToken[];
}

/** A recognised token and the human label the preview shows. */
export interface QuickCaptureToken {
  readonly id: string;
  readonly raw: string;
  readonly kind:
    | "priority"
    | "sector"
    | "commitment"
    | "waiting"
    | "delegate"
    | "scheduled_date"
    | "due_date"
    | "recurrence";
  readonly label: string;
}

export type QuickCaptureRecurrence = {
  readonly frequency: "day" | "weekday" | "week" | "month" | "year";
  readonly interval: number;
  readonly weekdays: readonly number[];
  readonly dateKind: "scheduled" | "due" | null;
  readonly needsDate: boolean;
  readonly label: string;
};

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
  p1: "P1 · Urgent",
  p2: "P2 · High",
  p3: "P3 · Normal",
  p4: "P4 · Low",
};

const SECTOR_PREVIEW: Record<TimeSector, string> = {
  this_week: "This Week",
  next_week: "Next Week",
  this_month: "This Month",
  next_month: "Next Month",
  long_term: "Long Term",
  routines: "Routines",
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Collapse internal whitespace and trim. */
function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function addDaysIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const base = Date.UTC(year!, month! - 1, day!);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

function weekdayOfIso(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}

function validIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseDateWord(
  words: readonly string[],
  lower: readonly string[],
  index: number,
  todayIso: string,
): { readonly iso: string; readonly end: number; readonly raw: string } | null {
  const word = lower[index];
  if (!word) return null;
  if (word === "today" || word === "tonight") {
    return { iso: todayIso, end: index, raw: words[index]! };
  }
  if (word === "tomorrow") {
    return { iso: addDaysIso(todayIso, 1), end: index, raw: words[index]! };
  }
  if (word === "next" && lower[index + 1] in WEEKDAYS) {
    const target = WEEKDAYS[lower[index + 1]!]!;
    const current = weekdayOfIso(todayIso);
    const baseDelta = (target - current + 7) % 7;
    const delta = baseDelta === 0 ? 7 : baseDelta + 7;
    return {
      iso: addDaysIso(todayIso, delta),
      end: index + 1,
      raw: `${words[index]} ${words[index + 1]}`,
    };
  }
  if (word in WEEKDAYS) {
    const target = WEEKDAYS[word]!;
    const current = weekdayOfIso(todayIso);
    const delta = (target - current + 7) % 7;
    return { iso: addDaysIso(todayIso, delta), end: index, raw: words[index]! };
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(words[index]!);
  if (isoMatch) {
    const iso = validIso(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
    return iso ? { iso, end: index, raw: words[index]! } : null;
  }
  const auMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(words[index]!);
  if (auMatch) {
    const todayYear = Number(todayIso.slice(0, 4));
    const day = Number(auMatch[1]);
    const month = Number(auMatch[2]);
    const explicitYear = auMatch[3] ? Number(auMatch[3]) : null;
    let iso = validIso(explicitYear ?? todayYear, month, day);
    if (!iso) return null;
    if (explicitYear === null && iso < todayIso) {
      iso = validIso(todayYear + 1, month, day);
      if (!iso) return null;
    }
    return { iso, end: index, raw: words[index]! };
  }
  return null;
}

function previewDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return "Today";
  if (iso === addDaysIso(todayIso, 1)) return "Tomorrow";
  const month = MONTH_LABELS[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7);
  return `${Number(iso.slice(8, 10))} ${month}`;
}

function nextWeekdayIso(todayIso: string, target: number): string {
  const current = weekdayOfIso(todayIso);
  const delta = (target - current + 7) % 7 || 7;
  return addDaysIso(todayIso, delta);
}

function parseRecurrencePhrase(
  words: readonly string[],
  lower: readonly string[],
  index: number,
): {
  readonly recurrence: Omit<QuickCaptureRecurrence, "dateKind" | "needsDate">;
  readonly end: number;
  readonly raw: string;
} | null {
  if (lower[index] !== "every") return null;
  const next = lower[index + 1];
  if (!next) return null;
  if (next === "day") {
    return {
      recurrence: {
        frequency: "day",
        interval: 1,
        weekdays: [],
        label: "Repeat: Every day",
      },
      end: index + 1,
      raw: words.slice(index, index + 2).join(" "),
    };
  }
  if (next === "weekday") {
    return {
      recurrence: {
        frequency: "weekday",
        interval: 1,
        weekdays: [],
        label: "Repeat: Every weekday",
      },
      end: index + 1,
      raw: words.slice(index, index + 2).join(" "),
    };
  }
  if (next in WEEKDAYS) {
    const weekday = WEEKDAYS[next]!;
    return {
      recurrence: {
        frequency: "week",
        interval: 1,
        weekdays: [weekday],
        label: `Repeat: Every ${WEEKDAY_LABELS[weekday]}`,
      },
      end: index + 1,
      raw: words.slice(index, index + 2).join(" "),
    };
  }
  const simple = (
    unit: "week" | "month" | "year",
  ): ReturnType<typeof parseRecurrencePhrase> => ({
    recurrence: {
      frequency: unit,
      interval: 1,
      weekdays: [],
      label: `Repeat: Every ${unit}`,
    },
    end: index + 1,
    raw: words.slice(index, index + 2).join(" "),
  });
  if (next === "week" || next === "weeks") return simple("week");
  if (next === "month" || next === "months") return simple("month");
  if (next === "year" || next === "years") return simple("year");

  const interval = Number(next);
  const unit = lower[index + 2];
  if (
    Number.isInteger(interval) &&
    interval >= 2 &&
    interval <= 99 &&
    (unit === "weeks" ||
      unit === "week" ||
      unit === "months" ||
      unit === "month" ||
      unit === "years" ||
      unit === "year")
  ) {
    const frequency =
      unit === "weeks" || unit === "week"
        ? "week"
        : unit === "months" || unit === "month"
          ? "month"
          : "year";
    return {
      recurrence: {
        frequency,
        interval,
        weekdays: [],
        label: `Repeat: Every ${interval} ${frequency}s`,
      },
      end: index + 2,
      raw: words.slice(index, index + 3).join(" "),
    };
  }
  return null;
}

/**
 * Parse a captured line into a structured interpretation. Deterministic and pure.
 * The parser removes recognised tokens from the title; if that would empty the
 * title it keeps the original text (tokens become literal words) — capture never
 * yields an empty task.
 */
export function parseQuickCapture(
  raw: string,
  options: {
    readonly ignoredTokenIds?: ReadonlySet<string>;
    readonly todayIso?: string;
  } = {},
): QuickCaptureInterpretation {
  const original = normaliseWhitespace(raw);
  const words = original.length > 0 ? original.split(" ") : [];
  const lower = words.map((w) => w.toLowerCase());
  const removed = new Array<boolean>(words.length).fill(false);

  let priority: TaskPriority | null = null;
  let timeSector: TimeSector | null = null;
  let scheduledDate: string | null = null;
  let dueDate: string | null = null;
  let recurrence: QuickCaptureRecurrence | null = null;
  let commitmentState: CommitmentState = "active";
  let waiting = false;
  let delegate = false;
  const tokens: QuickCaptureToken[] = [];
  const ignored = options.ignoredTokenIds ?? new Set<string>();

  // Multi-word sector phrases first (whole consecutive words, case-insensitive).
  for (const [phrase, sector] of SECTOR_PHRASES) {
    if (timeSector !== null) break;
    for (let i = 0; i + 1 < words.length; i++) {
      if (removed[i] || removed[i + 1]) continue;
      if (`${lower[i]} ${lower[i + 1]}` === phrase) {
        const id = `sector:${phrase}`;
        if (ignored.has(id)) break;
        timeSector = sector;
        removed[i] = true;
        removed[i + 1] = true;
        tokens.push({
          id,
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
      const id = `priority:${w}`;
      if (ignored.has(id)) continue;
      priority = PRIORITY_TOKENS[w]!;
      removed[i] = true;
      tokens.push({
        id,
        raw: w,
        kind: "priority",
        label: PRIORITY_PREVIEW[priority],
      });
    } else if (timeSector === null && w in SINGLE_SECTOR_TOKENS) {
      const id = `sector:${w}`;
      if (ignored.has(id)) continue;
      timeSector = SINGLE_SECTOR_TOKENS[w]!;
      removed[i] = true;
      tokens.push({
        id,
        raw: w,
        kind: "sector",
        label: SECTOR_PREVIEW[timeSector],
      });
    } else if (
      commitmentState === "active" &&
      (w === "someday" || w === "maybe")
    ) {
      const id = `commitment:${w}`;
      if (ignored.has(id)) continue;
      commitmentState = "someday";
      removed[i] = true;
      tokens.push({
        id,
        raw: w,
        kind: "commitment",
        label: "Someday / Maybe",
      });
    } else if (!waiting && w === "waiting") {
      const id = "waiting:waiting";
      if (ignored.has(id)) continue;
      waiting = true;
      removed[i] = true;
      tokens.push({ id, raw: w, kind: "waiting", label: "Waiting" });
    } else if (!delegate && w === "delegate") {
      const id = "delegate:delegate";
      if (ignored.has(id)) continue;
      delegate = true;
      removed[i] = true;
      tokens.push({ id, raw: w, kind: "delegate", label: "Delegate" });
    }
  }

  if (options.todayIso) {
    for (let i = 0; i < words.length; i++) {
      if (removed[i]) continue;
      const w = lower[i]!;
      const explicitKind =
        w === "due" ? "due_date" : w === "on" ? "scheduled_date" : null;
      if (explicitKind) {
        const parsed = parseDateWord(words, lower, i + 1, options.todayIso);
        if (!parsed) continue;
        const id = `${explicitKind}:${i}:${parsed.raw.toLowerCase()}`;
        if (ignored.has(id)) continue;
        if (explicitKind === "due_date" && dueDate === null) {
          dueDate = parsed.iso;
        } else if (
          explicitKind === "scheduled_date" &&
          scheduledDate === null
        ) {
          scheduledDate = parsed.iso;
        } else {
          continue;
        }
        for (let j = i; j <= parsed.end; j++) removed[j] = true;
        tokens.push({
          id,
          raw: words.slice(i, parsed.end + 1).join(" "),
          kind: explicitKind,
          label: `${explicitKind === "due_date" ? "Due" : "Scheduled"}: ${previewDate(parsed.iso, options.todayIso)}`,
        });
        continue;
      }
      if (scheduledDate === null) {
        if (i > 0 && lower[i - 1] === "every") continue;
        const parsed = parseDateWord(words, lower, i, options.todayIso);
        if (!parsed) continue;
        const id = `scheduled_date:${i}:${parsed.raw.toLowerCase()}`;
        if (ignored.has(id)) continue;
        scheduledDate = parsed.iso;
        for (let j = i; j <= parsed.end; j++) removed[j] = true;
        tokens.push({
          id,
          raw: parsed.raw,
          kind: "scheduled_date",
          label: `Scheduled: ${previewDate(parsed.iso, options.todayIso)}`,
        });
      }
    }

    for (let i = 0; i < words.length; i++) {
      if (removed[i] || recurrence !== null) continue;
      const parsed = parseRecurrencePhrase(words, lower, i);
      if (!parsed) continue;
      const id = `recurrence:${i}:${parsed.raw.toLowerCase()}`;
      if (ignored.has(id)) continue;
      let dateKind: QuickCaptureRecurrence["dateKind"] =
        dueDate !== null ? "due" : scheduledDate !== null ? "scheduled" : null;
      if (
        dateKind === null &&
        parsed.recurrence.frequency === "week" &&
        parsed.recurrence.weekdays.length === 1
      ) {
        scheduledDate = nextWeekdayIso(
          options.todayIso,
          parsed.recurrence.weekdays[0]!,
        );
        dateKind = "scheduled";
      }
      recurrence = {
        ...parsed.recurrence,
        dateKind,
        needsDate: dateKind === null,
      };
      for (let j = i; j <= parsed.end; j++) removed[j] = true;
      tokens.push({
        id,
        raw: parsed.raw,
        kind: "recurrence",
        label: recurrence.label,
      });
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
      scheduledDate: null,
      dueDate: null,
      recurrence: null,
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
    scheduledDate,
    dueDate,
    recurrence,
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
    interpretation.scheduledDate !== null ||
    interpretation.dueDate !== null ||
    interpretation.recurrence !== null ||
    interpretation.waiting ||
    interpretation.delegate
  );
}
