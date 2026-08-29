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

import { MAX_TAG_LENGTH, canonicalTagKey, normaliseTag } from "~/kernel/tags";

import { taskRecurrenceLabel } from "./task-view";
import { addCalendarDays, calendarWeekday } from "~/kernel/datetime";

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
  /**
   * V2.6 FIND-04 — the `#tag` tokens, in first-seen order.
   *
   * Each carries the canonical key the vocabulary identifies it by, the label
   * the owner will see, and whether the workspace ALREADY knows the word. A
   * capture surface writes the labels onto the created Task and shows the
   * unknown ones as new in the preview — see {@link QuickCaptureTag}.
   */
  readonly tags: readonly QuickCaptureTag[];
  /** The recognised tokens, in first-seen order, for the preview. */
  readonly tokens: readonly QuickCaptureToken[];
}

/**
 * V2.6 FIND-04 — one recognised `#tag`.
 *
 * `known` is the whole of the recorded unknown-tag decision, expressed as data:
 * the token is ALWAYS recognised (`#` is an explicit marker, like `due …` and
 * `on …`, not a phrase the grammar is guessing at), and a word the workspace
 * does not hold yet is marked so the preview can OFFER to create it rather than
 * creating it silently. Removing the chip restores the literal words.
 */
export interface QuickCaptureTag {
  /** The canonical identity, from the ONE tag rule (`~/kernel/tags`). */
  readonly key: string;
  /**
   * What the owner sees. The vocabulary's own spelling when the workspace knows
   * the tag — so typing `#ERRAND` shows `Errand`, exactly as choosing it in the
   * picker would — and the typed spelling when it does not.
   */
  readonly label: string;
  /** False when the workspace has no such tag yet. */
  readonly known: boolean;
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
    | "recurrence"
    | "tag";
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
  p1: "Priority 1",
  p2: "Priority 2",
  p3: "Priority 3",
  p4: "Priority 4",
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

// DEBT-52 — the kernel's ONE calendar-day implementation.
const addDaysIso = addCalendarDays;
const weekdayOfIso = calendarWeekday;

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

/* -------------------------------------------------------------------------- */
/* V2.6 FIND-04 — the `#tag` token class                                      */
/* -------------------------------------------------------------------------- */

/**
 * The body a `#` must be followed by for the word to be a tag.
 *
 * Deliberately narrow, and every clause of it is a case the grammar has to get
 * WRONG-FREE rather than merely usually right:
 *
 *   - it must start with a letter or a digit, so `#-x` and `#_x` are text;
 *   - it may then contain letters, digits, `-` and `_`, and nothing else — so
 *     `#home.`, `#home,` and `#home!` are text, because the word is not a tag
 *     with punctuation attached, it is prose;
 *   - the whole word must match, because the parser's standing rule is that a
 *     token is a WHOLE whitespace-delimited word. `end.#home` is therefore text.
 *
 * Unicode-aware (`\p{L}`), so `#lürm` is a tag in the language the owner writes
 * in rather than only in English.
 */
const TAG_BODY = /^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u;

/** At least one LETTER — the rule that keeps `the #1 priority` ordinary text. */
const TAG_HAS_LETTER = /\p{L}/u;

/**
 * How many `#tag` tokens ONE capture line may carry.
 *
 * Far below the per-record ceiling on purpose: a capture line is a sentence, and
 * a sentence with eleven tags in it is not a capture, it is a paste. Beyond the
 * bound the extra words stay text, which is the parser's own failure direction.
 */
export const MAX_CAPTURE_TAGS = 10;

/**
 * Read one word as a `#tag`, or refuse it.
 *
 * Refusal is the important half. `#` is an explicit marker, so a word that
 * genuinely starts with one and reads as a tag IS one — but the cases below are
 * not tags and must survive as the words the owner typed:
 *
 *   - `#` alone, and `##` — a pasted Markdown heading marker;
 *   - `#1`, `#42`, `#1-2` — "the #1 priority" is the canonical adversarial case
 *     and the reason a digits-only body is refused;
 *   - anything with punctuation in or after it.
 */
function readTagWord(word: string): { key: string; label: string } | null {
  if (!word.startsWith("#")) return null;
  const body = word.slice(1);
  if (body.length === 0) return null;
  if (!TAG_BODY.test(body)) return null;
  if (!TAG_HAS_LETTER.test(body)) return null;
  const label = normaliseTag(body);
  const key = canonicalTagKey(body);
  if (key.length === 0 || [...key].length > MAX_TAG_LENGTH) return null;
  return { key, label };
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
    /**
     * V2.6 FIND-04 — the workspace's tag vocabulary, when the caller has it.
     *
     * OPTIONAL, and the parser is correct without it: `#tag` is recognised
     * either way, because `#` is an explicit marker rather than something the
     * grammar is guessing at. What the vocabulary decides is the SPELLING shown
     * (`#ERRAND` reads back as `Errand` when the workspace already knows the
     * tag) and whether the preview calls it a new tag.
     *
     * A surface that cannot supply it — an offline replay, a server-side
     * classification — parses exactly the same title into exactly the same
     * tags, and merely calls every one of them new.
     */
    readonly knownTags?: readonly {
      readonly key: string;
      readonly label: string;
    }[];
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
  const tags: QuickCaptureTag[] = [];
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

  /*
   * V2.6 FIND-04 — `#tag`, its own pass over the words the passes above left.
   *
   * A separate pass rather than another branch in the chain above, because a
   * capture may carry SEVERAL tags while every token above is at most one of its
   * kind. Nothing else about the grammar changes: whole words only, anywhere the
   * other tokens may appear, and a removed chip restores the literal word.
   */
  const vocabulary = new Map(
    (options.knownTags ?? []).map((tag) => [tag.key, tag.label] as const),
  );
  for (let i = 0; i < words.length; i++) {
    if (removed[i]) continue;
    if (tags.length >= MAX_CAPTURE_TAGS) break;
    const read = readTagWord(words[i]!);
    if (!read) continue;
    const id = `tag:${read.key}`;
    if (ignored.has(id)) continue;
    // The same tag typed twice is one tag, and the second word is still
    // consumed — a title reading "Call the plumber #home" with the tag taken
    // twice must not keep one of them as prose.
    const already = tags.some((tag) => tag.key === read.key);
    removed[i] = true;
    if (already) continue;
    const label = vocabulary.get(read.key);
    tags.push({
      key: read.key,
      label: label ?? read.label,
      known: label !== undefined,
    });
    tokens.push({
      id,
      raw: words[i]!,
      kind: "tag",
      // The preview WORDS the decision: an existing tag is named, and one the
      // workspace does not hold yet is offered as new, so the owner sees that
      // saving would add a word to their vocabulary before it happens.
      label: label === undefined ? `New tag: ${read.label}` : `Tag: ${label}`,
    });
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
      // TASKS-11 — an after-completion interval with no date in the TEXT is left
      // anchorless HERE, reporting `needsDate`. The anchor it needs is supplied by
      // `resolveCapturedRecurrenceAnchor` at submission, once the surface's own date
      // controls have been merged in — because a Due date typed into a form field is
      // a date this function never sees, and an anchor the parser merely IMPLIED must
      // never outrank one the owner actually entered.
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
      tags: [],
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
    tags,
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
    interpretation.delegate ||
    // V2.6 FIND-04 — a recognised tag materially changes the Task, so a capture
    // whose ONLY token is a `#tag` still shows the preview the owner corrects in.
    interpretation.tags.length > 0
  );
}

/** Which of a Task's dates a recognised rule will advance, and the anchor it needs. */
export type CapturedRecurrenceAnchor = {
  readonly dateKind: "scheduled" | "due";
  /**
   * A scheduled date the RULE requires and the capture did not carry, or null when
   * the anchor is a date the owner genuinely supplied. Non-null ONLY for an
   * after-completion rule with no date anywhere — see below.
   */
  readonly impliedScheduledDate: string | null;
};

/**
 * TASKS-04 / TASKS-11 — decide WHICH date a recognised rule advances, from the
 * parser's reading MERGED with whatever dates the surface supplies through its own
 * controls. Returns null when the rule has no anchor and must be dropped.
 *
 * This is the one place the decision is made, and it is deliberately made HERE rather
 * than during parsing. A Due date typed into a form field is a date `parseQuickCapture`
 * never sees, so resolving the anchor while parsing would let a value the parser
 * invented outrank one the owner actually entered. The order is therefore:
 *
 *   1. an explicit `due …` in the TEXT — that is the date the phrase attached to;
 *   2. a scheduled date, from the text or from the surface;
 *   3. a due date from the surface;
 *   4. for an `after_completion` rule ONLY, and only when there is no date at all,
 *      the owner's today.
 *
 * Step 4 is the one implication, and it is the narrowest one available: an interval
 * measured from the completion day still has to have a first occurrence, and "the day
 * the owner asked for it" is the only non-arbitrary choice. It is reached only after
 * every real date has been considered, so an explicit due date always wins. A FIXED
 * schedule never reaches it: "Pay rent every month" with no date stays anchorless and
 * the rule is dropped rather than pinned to an arbitrary day of the month.
 */
export function resolveCapturedRecurrenceAnchor(
  recurrence: QuickCaptureRecurrence | null,
  dates: {
    readonly scheduledDate?: string | null;
    readonly dueDate?: string | null;
  },
  todayIso: string | null = null,
): CapturedRecurrenceAnchor | null {
  if (recurrence === null) return null;
  const scheduled = dates.scheduledDate ?? null;
  const due = dates.dueDate ?? null;
  if (recurrence.dateKind === "due" && due !== null) {
    return { dateKind: "due", impliedScheduledDate: null };
  }
  if (scheduled !== null) {
    return { dateKind: "scheduled", impliedScheduledDate: null };
  }
  if (due !== null) return { dateKind: "due", impliedScheduledDate: null };
  if (recurrence.mode === "after_completion" && todayIso !== null) {
    return { dateKind: "scheduled", impliedScheduledDate: todayIso };
  }
  return null;
}

/**
 * TASKS-04 — write a recognised recurrence phrase onto a `/tasks/new` submission.
 *
 * The parser can recognise "every Monday" before the user has given the task a date,
 * so this is where recognition becomes PERSISTENCE: the rule is submitted only when
 * the capture genuinely carries the date it would repeat from (or, for TASKS-11's
 * after-completion mode, the day it was captured). Without an anchor the rule is
 * dropped rather than invented — the preview still showed the phrase, and the server
 * would refuse an anchorless rule anyway.
 *
 * Shared by every capture surface (the `/tasks` form, the in-list quick add and the
 * phone capture sheet) so there is ONE mapping from parsed phrase to submitted fields.
 * `todayIso` is the OWNER's calendar day (ADR-022); omitting it simply means no
 * anchor can be implied, never that a browser-local date is used.
 */
export function applyRecurrenceFields(
  body: FormData,
  recurrence: QuickCaptureRecurrence | null,
  dates: {
    readonly scheduledDate?: string | null;
    readonly dueDate?: string | null;
  },
  todayIso: string | null = null,
): void {
  const anchor = resolveCapturedRecurrenceAnchor(recurrence, dates, todayIso);
  if (recurrence === null || anchor === null) return;
  // The implied anchor is written HERE, beside the rule that needs it, so a surface
  // can never submit an after-completion rule with nothing to measure from.
  if (anchor.impliedScheduledDate !== null) {
    body.set("scheduledDate", anchor.impliedScheduledDate);
  }
  body.set("recurrenceFrequency", recurrence.frequency);
  body.set("recurrenceDateKind", anchor.dateKind);
  body.set("recurrenceInterval", String(recurrence.interval));
  // TASKS-11 — the scheduling MODE travels with the rule. Omitting it would let a
  // recognised "after completion" arrive at the create route as a fixed schedule,
  // which is exactly the silent mode crossing the parser exists to prevent.
  body.set("recurrenceMode", recurrence.mode);
  if (recurrence.weekdays.length > 0) {
    body.set("recurrenceWeekdays", recurrence.weekdays.join(","));
  }
}

/**
 * V2.6 FIND-04 — write the recognised `#tag`s onto a capture submission.
 *
 * The tags half of {@link applyRecurrenceFields}, and shared for the identical
 * reason: every capture surface (the `/tasks` form, the in-list quick add and
 * the phone capture sheet) must turn a recognised token into the SAME submitted
 * field, so there is ONE mapping from parsed line to created Task.
 *
 * The LABELS travel, not the keys — the create route validates them through the
 * one tag validator, which canonicalises identity and keeps the vocabulary's own
 * spelling when it already holds the tag. Nothing is written for a line with no
 * tags, so an untagged capture posts exactly the body it always did.
 */
export function applyCaptureTags(
  body: FormData,
  tags: readonly QuickCaptureTag[],
): void {
  if (tags.length === 0) return;
  body.set("tags", JSON.stringify(tags.map((tag) => tag.label)));
}
