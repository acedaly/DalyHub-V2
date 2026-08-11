/**
 * TASKS-01 quick-capture parser (pure, React-free, testable) — ADR-043 §14,
 * extended by TASKS-11.
 *
 * A DELIBERATELY BOUNDED, deterministic token vocabulary — NOT natural-language
 * understanding and NOT AI. It scans a captured line for a small closed set of
 * trailing/inline tokens (`p1`…`p4`, the Time Sectors, `someday`, `routine`,
 * `waiting`, `delegate`), bounded calendar phrases and bounded `every ...`
 * recurrence, then returns the remaining text as the title plus a structured
 * interpretation the UI shows as a preview the user can correct before saving.
 * Calendar language is intentionally small, owner-day driven and explicit; this
 * parser never claims to understand arbitrary language.
 *
 * Every token must be a WHOLE whitespace-delimited word (case-insensitive), so a
 * title like "Plan the p1 launch party" keeps "p1" as text unless it stands alone.
 * An UNMARKED calendar word (`today`, `friday`, `12/08`) is recognised only when it
 * TRAILS the line, so "Review the today show notes" keeps its words; a date anywhere
 * else needs an explicit `due …` or `on …` marker.
 * The title is what remains after removing recognised tokens; if removing tokens
 * would empty the title, the ORIGINAL text is kept as the title (the tokens are
 * then treated as literal words) so capture never produces an empty task.
 *
 * TASKS-11 adds ONE new idea and no new machinery: a recurrence phrase may carry an
 * explicit AFTER-COMPLETION suffix ("every 6 months after completion"), which selects
 * the TASKS-07 `after_completion` scheduling mode instead of the default fixed
 * schedule. The mode is never inferred — a phrase without one of the six recognised
 * suffixes still means a fixed schedule, exactly as it did before — and a phrase the
 * grammar cannot fully recognise (an interval outside the canonical 1–99, an
 * after-completion suffix on a weekday-pinned rule) is left as ORDINARY WORDS rather
 * than clamped into a rule the owner did not ask for.
 */

import type {
  CommitmentState,
  TaskPriority,
  TaskRecurrenceMode,
  TimeSector,
} from "~/kernel/tasks";

import { taskRecurrenceLabel } from "./task-view";

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
  /**
   * TASKS-11 — the TASKS-07 scheduling mode the phrase selected. `fixed` unless the
   * capture said "after completion" (or one of the five other recognised suffixes)
   * in so many words. There is no inference from the title, the frequency or the
   * kind of work: crossing modes silently is the one thing a recurring-task parser
   * must never do.
   */
  readonly mode: TaskRecurrenceMode;
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

/**
 * True when every word after `end` has already been consumed by a token — i.e. the
 * span ending at `end` is the TAIL of what remains of the line.
 */
function isTrailing(removed: readonly boolean[], end: number): boolean {
  for (let i = end + 1; i < removed.length; i++) {
    if (!removed[i]) return false;
  }
  return true;
}

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

/**
 * The counted units a `every N <unit>` phrase may use, singular and plural. The set is
 * exactly the kernel's four countable frequencies — "every 3 weekdays" is not a rule
 * the model has, so it is not a phrase the grammar pretends to read.
 */
const COUNTED_RECURRENCE_UNITS: Record<
  string,
  "day" | "week" | "month" | "year"
> = {
  day: "day",
  days: "day",
  week: "week",
  weeks: "week",
  month: "month",
  months: "month",
  year: "year",
  years: "year",
};

/**
 * TASKS-11 — the CLOSED set of suffixes that select the after-completion mode.
 *
 * Six phrases, each an exact whole-word sequence. This is deliberately a list and not
 * a pattern: "prefer a small grammar with clear boundaries over hundreds of synonyms",
 * and every entry here is covered by a test. Anything else — "when needed", "every so
 * often", "after the service" — is not recognised, so the capture keeps its words and
 * the Task keeps whatever fixed schedule (or none) the rest of the line described.
 */
const AFTER_COMPLETION_SUFFIXES: ReadonlyArray<readonly string[]> = [
  ["after", "completion"],
  ["after", "completed"],
  ["after", "completing"],
  ["after", "finishing"],
  ["after", "i", "complete", "it"],
  ["after", "i", "finish", "it"],
];

/**
 * The index of the LAST word of a recognised after-completion suffix beginning at
 * `index`, or null. Whole words only, so "aftercompletion" and "after completions"
 * are ordinary text.
 */
function matchAfterCompletion(
  lower: readonly string[],
  index: number,
): number | null {
  for (const suffix of AFTER_COMPLETION_SUFFIXES) {
    let matched = true;
    for (let offset = 0; offset < suffix.length; offset++) {
      if (lower[index + offset] !== suffix[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index + suffix.length - 1;
  }
  return null;
}

/**
 * Read ONE complete recurrence phrase starting at `index`, or null.
 *
 * The phrase is read in three ordered parts, and a failure in any of them abandons the
 * WHOLE phrase rather than keeping a partial reading — which is what stops a title
 * being damaged by a half-recognised rule:
 *
 *   1. an optional `repeat` / `repeats` lead-in, then the mandatory `every`;
 *   2. the unit spec — `day`, `weekday`, a weekday name, a bare `week`/`month`/`year`,
 *      or `N day|week|month|year` (singular or plural) with N inside the CANONICAL
 *      1–99 interval bound the kernel enforces;
 *   3. an optional after-completion suffix (TASKS-11), refused for the two shapes the
 *      kernel refuses — `every weekday` and a weekday-pinned weekly rule — because
 *      "every Monday, three days after I finish it" is not a thing anyone means.
 */
function parseRecurrencePhrase(
  words: readonly string[],
  lower: readonly string[],
  index: number,
): {
  readonly recurrence: Omit<QuickCaptureRecurrence, "dateKind" | "needsDate">;
  readonly end: number;
  readonly raw: string;
} | null {
  let cursor = index;
  if (
    (lower[cursor] === "repeat" || lower[cursor] === "repeats") &&
    lower[cursor + 1] === "every"
  ) {
    cursor += 1;
  }
  if (lower[cursor] !== "every") return null;

  const next = lower[cursor + 1];
  if (!next) return null;

  let frequency: QuickCaptureRecurrence["frequency"];
  let interval = 1;
  let weekdays: readonly number[] = [];
  let end: number;

  if (next === "day") {
    frequency = "day";
    end = cursor + 1;
  } else if (next === "weekday") {
    frequency = "weekday";
    end = cursor + 1;
  } else if (next in WEEKDAYS) {
    frequency = "week";
    weekdays = [WEEKDAYS[next]!];
    end = cursor + 1;
  } else if (next === "week" || next === "weeks") {
    frequency = "week";
    end = cursor + 1;
  } else if (next === "month" || next === "months") {
    frequency = "month";
    end = cursor + 1;
  } else if (next === "year" || next === "years") {
    frequency = "year";
    end = cursor + 1;
  } else if (/^\d+$/.test(next)) {
    const unitWord = lower[cursor + 2];
    const unit = unitWord ? COUNTED_RECURRENCE_UNITS[unitWord] : undefined;
    if (!unit) return null;
    const counted = Number(next);
    // The kernel's canonical bound, not a parser-specific one. Out of range means the
    // phrase is NOT a rule: "every 999999 months after completion" keeps its words
    // rather than being clamped into a repeat the owner never asked for.
    if (!Number.isInteger(counted) || counted < 1 || counted > 99) return null;
    frequency = unit;
    interval = counted;
    end = cursor + 2;
  } else {
    return null;
  }

  let mode: TaskRecurrenceMode = "fixed";
  const afterCompletionEnd = matchAfterCompletion(lower, end + 1);
  if (afterCompletionEnd !== null) {
    if (frequency === "weekday" || weekdays.length > 0) return null;
    mode = "after_completion";
    end = afterCompletionEnd;
  }

  return {
    recurrence: {
      frequency,
      interval,
      weekdays,
      mode,
      // The ONE shared formatter, so the preview chip, the custom editor's summary,
      // the task row and the record all state the same rule in the same words.
      label: `Repeat: ${taskRecurrenceLabel({
        frequency,
        interval,
        weekdays,
        mode,
        dateKind: "scheduled",
      })}`,
    },
    end,
    raw: words.slice(index, end + 1).join(" "),
  };
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
    // Words belonging to a date token the user REMOVED: kept as plain title text
    // rather than re-read by the unmarked-date pass.
    const blockedDate = new Array<boolean>(words.length).fill(false);

    // Recurrence PHRASES are consumed first, so a trailing date is still trailing
    // once the `every …` phrase after it is gone ("Water the plants tomorrow every
    // week" reads as a date AND a repeat, not as prose). The anchor the rule repeats
    // from is resolved after the date pass below.
    for (let i = 0; i < words.length; i++) {
      if (removed[i] || recurrence !== null) continue;
      const parsed = parseRecurrencePhrase(words, lower, i);
      if (!parsed) continue;
      const id = `recurrence:${i}:${parsed.raw.toLowerCase()}`;
      if (ignored.has(id)) continue;
      recurrence = {
        ...parsed.recurrence,
        dateKind: null,
        needsDate: true,
      };
      for (let j = i; j <= parsed.end; j++) removed[j] = true;
      tokens.push({
        id,
        raw: parsed.raw,
        kind: "recurrence",
        label: parsed.recurrence.label,
      });
    }

    for (let i = 0; i < words.length; i++) {
      if (removed[i]) continue;
      const w = lower[i]!;
      const explicitKind =
        w === "due" ? "due_date" : w === "on" ? "scheduled_date" : null;
      if (explicitKind) {
        const parsed = parseDateWord(words, lower, i + 1, options.todayIso);
        if (!parsed) continue;
        const id = `${explicitKind}:${i}:${parsed.raw.toLowerCase()}`;
        if (ignored.has(id)) {
          // A REMOVED token must restore the user's words as they typed them — not
          // quietly reappear as a different interpretation. Block this span from the
          // unmarked-date pass below.
          for (let j = i; j <= parsed.end; j++) blockedDate[j] = true;
          continue;
        }
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
        if (blockedDate[i]) continue;
        if (i > 0 && lower[i - 1] === "every") continue;
        const parsed = parseDateWord(words, lower, i, options.todayIso);
        if (!parsed) continue;
        // An UNMARKED date word is only a date when it TRAILS the line ("Water the
        // plants today"), never mid-sentence ("Review the today show notes"). A date
        // meant to appear anywhere gets an explicit marker — `due …` or `on …` — which
        // the branch above handles. This is the restraint that keeps the parser
        // trustworthy: it never silently eats a word the user meant as prose.
        if (!isTrailing(removed, parsed.end)) continue;
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

    // Resolve which date the rule repeats FROM, now that both passes have run. A
    // `due …` date wins (that is the date the phrase attached to); otherwise the
    // scheduled date; and a single-weekday weekly rule with no date at all gets the
    // NEXT such weekday, because "every Monday" plainly means starting Monday.
    if (recurrence !== null) {
      let dateKind: QuickCaptureRecurrence["dateKind"] =
        dueDate !== null ? "due" : scheduledDate !== null ? "scheduled" : null;
      if (
        dateKind === null &&
        recurrence.frequency === "week" &&
        recurrence.weekdays.length === 1
      ) {
        scheduledDate = nextWeekdayIso(
          options.todayIso,
          recurrence.weekdays[0]!,
        );
        dateKind = "scheduled";
      }
      // TASKS-11 — an after-completion interval with no date in the capture starts
      // TODAY. This is the same restraint the weekday rule above already applies, not
      // a new liberty: an `after_completion` rule measures from the day the work is
      // finished, so its FIRST occurrence has to be the day the owner asked for it —
      // there is no other non-arbitrary reading, and the kernel refuses an anchorless
      // rule outright. A FIXED schedule is deliberately NOT treated this way: "Pay
      // rent every month" with no date still carries `needsDate`, and the rule is
      // dropped rather than pinned to an arbitrary day of the month.
      if (dateKind === null && recurrence.mode === "after_completion") {
        scheduledDate = options.todayIso;
        dateKind = "scheduled";
      }
      recurrence = { ...recurrence, dateKind, needsDate: dateKind === null };
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

/**
 * TASKS-04 — write a recognised recurrence phrase onto a `/tasks/new` submission.
 *
 * The parser can recognise "every Monday" before the user has given the task a date,
 * so this is where recognition becomes PERSISTENCE: the rule is submitted only when
 * the capture genuinely carries the date it would repeat from, preferring an explicit
 * `due …` when that is the date the phrase attached to. Without an anchor the rule is
 * dropped rather than invented — the preview still showed the phrase, and the server
 * would refuse an anchorless rule anyway.
 *
 * Shared by every capture surface (the `/tasks` form, the in-list quick add and the
 * phone capture sheet) so there is ONE mapping from parsed phrase to submitted fields.
 */
export function applyRecurrenceFields(
  body: FormData,
  recurrence: QuickCaptureRecurrence | null,
  dates: {
    readonly scheduledDate?: string | null;
    readonly dueDate?: string | null;
  },
): void {
  if (recurrence === null) return;
  const scheduled = dates.scheduledDate ?? null;
  const due = dates.dueDate ?? null;
  const dateKind =
    recurrence.dateKind === "due" && due !== null
      ? "due"
      : scheduled !== null
        ? "scheduled"
        : due !== null
          ? "due"
          : null;
  if (dateKind === null) return;
  body.set("recurrenceFrequency", recurrence.frequency);
  body.set("recurrenceDateKind", dateKind);
  body.set("recurrenceInterval", String(recurrence.interval));
  // TASKS-11 — the scheduling MODE travels with the rule. Omitting it would let a
  // recognised "after completion" arrive at the create route as a fixed schedule,
  // which is exactly the silent mode crossing the parser exists to prevent.
  body.set("recurrenceMode", recurrence.mode);
  if (recurrence.weekdays.length > 0) {
    body.set("recurrenceWeekdays", recurrence.weekdays.join(","));
  }
}
