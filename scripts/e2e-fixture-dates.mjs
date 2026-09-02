#!/usr/bin/env node
/**
 * The E2E fixture-date guard (V2.8 CONV-00-E, DEBT-236, ADR-115 decision 4).
 *
 * The rule it makes checkable:
 *
 *   A fixture or E2E journey must not hard-code a future calendar date whose
 *   correctness depends on the month or day the test runs.
 *
 * Two journeys went red the day the owner's calendar turned to September 2026:
 * each walked the date picker by a fixed number of month presses counted in
 * August and then clicked a day by a literal spoken date ("Wednesday 29 July
 * 2026"). An Assets journey went red the day a seeded obligation's `due_date`
 * passed (DEBT-219). Neither was a regression, and a gate that is red for the
 * calendar cannot report one. This script fails `Static` on the next literal of
 * either kind before it can arm.
 *
 * ── What it scans ───────────────────────────────────────────────────────────
 * Every `.sql`, `.ts` and `.mjs` file under `e2e/` — the seeds, the specs, the
 * fixtures and the helpers. Comments are stripped first (`--` in SQL, `//` and
 * `/* … *\/` in TypeScript, both string-aware), because a date in prose is a
 * date in prose; only a literal in CODE can arm.
 *
 * ── The three literal forms, and how each is judged ─────────────────────────
 *
 *   1. ISO `YYYY-MM-DD`, alone or leading a timestamp — the seeds' form.
 *      A DATA literal: fine when it is on or before the reference day (the
 *      past is what it is), flagged when it lies in the future.
 *   2. The long-form spoken label the picker's cells carry and a picker test
 *      clicks — weekday, day, month, year: "Wednesday 29 July 2026". A
 *      PICKER-ACTION label: flagged WHATEVER its date, past or future. The
 *      month walk that reaches it is counted from where the grid opens, which
 *      is the owner's current month whenever the value is unset — so a label
 *      from last month is as run-dependent as one from next month. The label
 *      that broke was already in the past on the commit that fixed it.
 *   3. The abbreviated display form the specs assert on — day, short month,
 *      year, with or without a weekday: "29 Jul 2026", "Thu, 12 Jun 2027".
 *      A DATA literal, judged as (1).
 *
 * ── The annotation ──────────────────────────────────────────────────────────
 * A literal that is deliberately fixed says why, ON THE SAME LINE:
 *
 *     // fixed-date: <why this date is intentionally fixed>      (TypeScript)
 *     -- fixed-date: <why this date is intentionally fixed>      (SQL)
 *
 * The annotation covers every literal on its line, in every supported form. A
 * Goal target of `2099-12-31` that no run will reach, or a rendered-form
 * assertion on a value the same test just typed, are the legitimate cases; a
 * near-future date "because that is when it was written" is not, and the
 * annotation is where a reviewer reads the difference.
 *
 * ── The reference day ───────────────────────────────────────────────────────
 * "Future" means later than the commit under test: the committer date of
 * `HEAD` (a pull request's merge commit is dated when CI runs it), falling back
 * to today when there is no repository. `--today YYYY-MM-DD` overrides it,
 * which is how the falsification below is run and how a future reviewer can
 * ask "which of these arms next month?".
 *
 * ── Commands ────────────────────────────────────────────────────────────────
 *   check [--today YYYY-MM-DD]   fail while any unannotated future data
 *                                literal or any unannotated picker label
 *                                exists (run by `Static`)
 *   list  [--today YYYY-MM-DD]   enumerate every literal in every supported
 *                                form with its classification — the
 *                                inventory CONV-00 classified on first run
 *
 * ── Not a second date authority ─────────────────────────────────────────────
 * Nothing here knows what a date MEANS to the product. It recognises the
 * shapes a fixture can carry and asks one question of each: does its
 * correctness change merely because the calendar advances?
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = join(ROOT, "e2e");

/** The file kinds the E2E layer keeps its fixtures, specs and helpers in. */
export const FIXTURE_EXTENSIONS = [".sql", ".ts", ".mjs"];

/** The same-line marker that classifies a literal as deliberately fixed. */
export const ANNOTATION = "fixed-date:";

const WEEKDAYS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const WEEKDAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// "Sept" is what `Intl` prints for en-AU; "Sep" is what the product's own
// `formatCalendarDate` prints. A spec may carry either.
const MONTHS_SHORT = [
  ["Jan"],
  ["Feb"],
  ["Mar"],
  ["Apr"],
  ["May"],
  ["Jun"],
  ["Jul"],
  ["Aug"],
  ["Sep", "Sept"],
  ["Oct"],
  ["Nov"],
  ["Dec"],
];

const ISO_PATTERN = /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g;
const LONG_PATTERN = new RegExp(
  `\\b(${WEEKDAYS_LONG.join("|")}),?\\s+(\\d{1,2})\\s+(${MONTHS_LONG.join("|")}),?\\s+(\\d{4})\\b`,
  "g",
);
const SHORT_PATTERN = new RegExp(
  `\\b(?:(${WEEKDAYS_SHORT.join("|")}),?\\s+)?(\\d{1,2})\\s+(${MONTHS_SHORT.flat().join("|")}),?\\s+(\\d{4})\\b`,
  "g",
);

function pad(value) {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD` for a valid calendar triple, or null when the parts are not one. */
function isoOf(year, month, day) {
  if (month < 1 || month > 12 || day < 1) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > last) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

function shortMonthIndex(name) {
  return MONTHS_SHORT.findIndex((names) => names.includes(name));
}

/* -------------------------------------------------------------------------- */
/* Comment stripping                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Replace every comment in `source` with spaces of the same length, so that
 * line and column numbers survive. String-aware: a `--`, `//` or `/*` inside a
 * quoted string is content, not a comment. `kind` is "sql" or "ts".
 */
export function stripComments(source, kind) {
  const out = source.split("");
  let index = 0;
  let quote = null; // the delimiter of the string we are inside, or null
  const blank = (from, to) => {
    for (let at = from; at < to; at += 1) {
      if (out[at] !== "\n") out[at] = " ";
    }
  };
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (quote !== null) {
      if (char === "\\" && kind === "ts") {
        index += 2;
        continue;
      }
      if (char === quote) quote = null;
      // SQL doubles a quote to escape it; the second one re-enters the string
      // on the next iteration, which is the right outcome.
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || (kind === "ts" && char === "`")) {
      quote = char;
      index += 1;
      continue;
    }
    if (kind === "sql" && char === "-" && next === "-") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (kind === "ts" && char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      const stop = end === -1 ? source.length : end;
      blank(index, stop);
      index = stop;
      continue;
    }
    if (kind === "ts" && char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(index, stop);
      index = stop;
      continue;
    }
    index += 1;
  }
  return out.join("");
}

/* -------------------------------------------------------------------------- */
/* Scanning                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every date literal in `source`, in every supported form.
 *
 * Each finding carries `form` ("iso" | "long" | "short"), the literal `text`,
 * its calendar `iso`, its `line`, whether the line is `annotated`, and the
 * `verdict` against `today`:
 *
 *   past        — a data literal on or before the reference day (class 2)
 *   annotated   — deliberately fixed, and says why (class 3)
 *   future      — an unannotated data literal after the reference day (class 4)
 *   label       — an unannotated picker-action label, any date (class 4)
 */
export function scanSource(source, { kind, today }) {
  const code = stripComments(source, kind);
  const rawLines = source.split("\n");
  const codeLines = code.split("\n");
  const findings = [];

  codeLines.forEach((codeLine, lineIndex) => {
    const annotated = rawLines[lineIndex].includes(ANNOTATION);
    const line = lineIndex + 1;
    const taken = [];
    const overlaps = (start, end) =>
      taken.some(([from, to]) => start < to && end > from);
    const push = (form, text, iso, start) => {
      taken.push([start, start + text.length]);
      const isLabel = form === "long";
      const verdict = annotated
        ? "annotated"
        : isLabel
          ? "label"
          : iso > today
            ? "future"
            : "past";
      findings.push({ form, text, iso, line, annotated, verdict });
    };

    for (const match of codeLine.matchAll(LONG_PATTERN)) {
      const [text, , day, month, year] = match;
      const iso = isoOf(
        Number(year),
        MONTHS_LONG.indexOf(month) + 1,
        Number(day),
      );
      if (iso) push("long", text, iso, match.index);
    }
    for (const match of codeLine.matchAll(SHORT_PATTERN)) {
      const [text, , day, month, year] = match;
      if (overlaps(match.index, match.index + text.length)) continue;
      const iso = isoOf(Number(year), shortMonthIndex(month) + 1, Number(day));
      if (iso) push("short", text, iso, match.index);
    }
    for (const match of codeLine.matchAll(ISO_PATTERN)) {
      const [text, year, month, day] = match;
      if (overlaps(match.index, match.index + text.length)) continue;
      const iso = isoOf(Number(year), Number(month), Number(day));
      if (iso) push("iso", text, iso, match.index);
    }
  });

  return findings;
}

/** "sql" for a seed, "ts" for anything the TypeScript/ESM toolchain reads. */
export function kindOf(path) {
  return path.endsWith(".sql") ? "sql" : "ts";
}

/** Every fixture, spec and helper file under `e2e/`, recursively, sorted. */
export function listFixtureFiles(dir = FIXTURE_DIR) {
  const files = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (FIXTURE_EXTENSIONS.some((ext) => entry.name.endsWith(ext)))
        files.push(path);
    }
  };
  walk(dir);
  return files.sort();
}

/**
 * The reference day: `HEAD`'s committer date, or today when there is no
 * repository to ask. Both are `YYYY-MM-DD` in UTC.
 */
export function referenceDay() {
  try {
    const committed = execFileSync("git", ["log", "-1", "--format=%cs"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(committed)) return committed;
  } catch {
    // Not a repository (or no git): fall through to the calendar.
  }
  return new Date().toISOString().slice(0, 10);
}

/** Scan every fixture file; each finding also carries its repo-relative `file`. */
export function scanFixtures({ today, files = listFixtureFiles() }) {
  const findings = [];
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    for (const finding of scanSource(source, { kind: kindOf(path), today })) {
      findings.push({ ...finding, file: relative(ROOT, path) });
    }
  }
  return findings;
}

/** The findings `check` fails on. */
export function offenders(findings) {
  return findings.filter(
    (finding) => finding.verdict === "future" || finding.verdict === "label",
  );
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                         */
/* -------------------------------------------------------------------------- */

function parseToday(args) {
  const at = args.indexOf("--today");
  if (at === -1) return referenceDay();
  const value = args[at + 1];
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("--today takes a YYYY-MM-DD day");
  }
  return value;
}

function describe(finding) {
  const why =
    finding.verdict === "label"
      ? "picker label — generate it from the run day, or annotate why it is fixed"
      : "future data literal — derive it from the run day, or annotate why it is fixed";
  return `  ${finding.file}:${finding.line}  ${JSON.stringify(finding.text)} (${finding.form}, ${finding.iso})  ${why}`;
}

function commandCheck(args) {
  const today = parseToday(args);
  const findings = scanFixtures({ today });
  const bad = offenders(findings);
  if (bad.length === 0) {
    const counts = summarise(findings);
    console.log(
      `e2e fixture dates: ${findings.length} literal(s) in ${counts.files} file(s) ` +
        `(${counts.past} past, ${counts.annotated} annotated), none unannotated in the future, ` +
        `no bare picker label — reference day ${today}.`,
    );
    return;
  }
  console.error(
    `e2e fixture dates: ${bad.length} literal(s) would make a test's meaning depend on the day it runs (reference day ${today}).\n` +
      `A deliberately fixed date says why on the same line: \`// ${ANNOTATION} <why>\` (TypeScript) or \`-- ${ANNOTATION} <why>\` (SQL).\n` +
      `A run-relative one is derived from the owner's day (\`ownerToday\`, \`e2e/calendar-dates.ts\`, \`date('now', …)\`).\n`,
  );
  for (const finding of bad) console.error(describe(finding));
  process.exitCode = 1;
}

function summarise(findings) {
  const files = new Set(findings.map((finding) => finding.file)).size;
  const count = (verdict) =>
    findings.filter((finding) => finding.verdict === verdict).length;
  return {
    files,
    past: count("past"),
    annotated: count("annotated"),
    future: count("future"),
    label: count("label"),
  };
}

function commandList(args) {
  const today = parseToday(args);
  const findings = scanFixtures({ today });
  for (const finding of findings) {
    console.log(
      `${finding.verdict.padEnd(9)} ${finding.form.padEnd(5)} ${finding.iso}  ${finding.file}:${finding.line}  ${JSON.stringify(finding.text)}`,
    );
  }
  const counts = summarise(findings);
  console.log(
    `\n${findings.length} literal(s) in ${counts.files} file(s) — reference day ${today}\n` +
      `  past (fixed historical)          ${counts.past}\n` +
      `  annotated (deliberately fixed)   ${counts.annotated}\n` +
      `  future, unannotated              ${counts.future}\n` +
      `  picker label, unannotated        ${counts.label}`,
  );
}

// Importable as a module — `test/unit/ci/e2e-fixture-dates.test.ts` exercises
// the scanner directly — so the CLI only runs when this file IS the entry point.
const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const [command, ...rest] = invokedDirectly ? process.argv.slice(2) : ["noop"];
switch (command) {
  case "noop":
    break;
  case "check":
  case "--check":
    commandCheck(rest);
    break;
  case "list":
  case "--list":
    commandList(rest);
    break;
  default:
    console.error(
      "usage: e2e-fixture-dates.mjs <check|list> [--today YYYY-MM-DD]",
    );
    process.exitCode = 2;
}
