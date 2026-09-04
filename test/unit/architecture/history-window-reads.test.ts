import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2.9 INS-01 — the windowed-read REGISTRY (DEBT-238).
 *
 * DEBT-238's closing condition asks that no adapter outside the Activity
 * repository carry its own `occurred_at` window predicate. Measured on this
 * branch, that condition cannot be met honestly and stated as met — so this
 * test states what IS true instead, in the CONV-01 shape: every remaining
 * windowed predicate is enumerated with the reason it did not converge, and any
 * NEW one fails this test until somebody decides about it.
 *
 * **The entry's own measurement was wrong in both directions, and correcting it
 * is part of closing it.** It named five adapters:
 * `d1-activity-window-repository.ts`, `d1-review-insight-repository.ts`,
 * `d1-project-health-repository.ts`, `d1-recent-records-repository.ts` and
 * `d1-meeting-repository.ts`. Three of those five carry no window predicate at
 * all — project-health reads `MAX(occurred_at)` with no bounds, recent-records
 * bounds by a scan LIMIT rather than by time, and the Meeting repository's
 * windows are over `meeting_details.starts_at`, a different column on a
 * different table. Two the entry did not name do carry one.
 *
 * What actually converged is the read the entry was really about: the Review's
 * `countPeriodCompletions`, which had asked the kernel's question in its own
 * SQL since REVIEW-03 and now shares `history-window-read.ts` with
 * `ActivityRepository.countByTypeInBuckets`. One predicate, two callers.
 *
 * Read as source, comments stripped, so prose about a window cannot satisfy —
 * or trip — a rule about code. The technique is
 * `test/unit/task-record/shared-row-consumers.test.ts`'s (CONV-01).
 */

const ROOT = process.cwd();
const ADAPTER_DIR = path.join(ROOT, "app", "platform", "storage", "d1");

/** Strip comments, so a rule about SQL is never satisfied or tripped by prose. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * One BOUND on an `occurred_at` column. A half-open window is two of them, so
 * the counts below are bounds rather than windows — a coarser unit, but an
 * unambiguous one to grep for.
 */
const WINDOW_PREDICATE = /occurred_at\s*[<>]=?/g;

function windowPredicateCount(file: string): number {
  const source = code(readFileSync(path.join(ADAPTER_DIR, file), "utf8"));
  return source.match(WINDOW_PREDICATE)?.length ?? 0;
}

function adapterFiles(): string[] {
  return readdirSync(ADAPTER_DIR)
    .filter((name) => name.endsWith(".ts"))
    .sort();
}

/**
 * Every file permitted to bound `occurred_at`, the count it may carry, and WHY
 * it did not converge onto `history-window-read.ts`.
 *
 * A count that moves — up or down — fails this test. Down is as important as
 * up: a converged read that quietly grows its own predicate back is the drift
 * this registry exists to catch.
 */
const PERMITTED: readonly {
  readonly file: string;
  readonly predicates: number;
  readonly reason: string;
}[] = [
  {
    file: "history-window-read.ts",
    predicates: 4,
    reason:
      "THE one windowed read over the Activity stream. Two callers share it: " +
      "ActivityRepository.countByTypeInBuckets and the Review's " +
      "countPeriodCompletions. This is where the predicate is supposed to be.",
  },
  {
    file: "d1-activity-repository.ts",
    predicates: 3,
    reason:
      "listInWindow's own half-open page predicate (2), plus the newest-first " +
      "keyset bound every paged listing has shared since FND-05 (1). Neither " +
      "can use the counting module: one is a grouped aggregate, the others " +
      "page records by keyset.",
  },
  {
    file: "d1-activity-window-repository.ts",
    predicates: 12,
    reason:
      "FOLLOW-01/02's plan history. A three-arm UNION that also extracts the " +
      "plan before and after each event from `payload_json`, plus an " +
      "open-ended arm that looks AFTER the window for the event that moved a " +
      "plan out of it. It asks 'what became of the work this period's plan " +
      "held', not 'how many of these happened per bucket'. Forcing it through " +
      "the shared read would be reuse for its own sake — the roadmap's " +
      "explicit non-goal.",
  },
  {
    file: "d1-review-insight-repository.ts",
    predicates: 2,
    reason:
      "listPeriodContributions: completed Tasks grouped by their LIVING " +
      "Project/Goal/Area ancestry. It keeps a liveness predicate the counting " +
      "read must not have (HARDEN-06C F-07), and it groups by ancestry rather " +
      "than by bucket. Was 6 bounds across two reads before INS-01; " +
      "countPeriodCompletions converged and took four of them with it.",
  },
  {
    file: "d1-alignment-repository.ts",
    predicates: 1,
    reason:
      "A one-sided recency threshold inside a grouped aggregate " +
      "(`COUNT(DISTINCT CASE WHEN a.occurred_at >= ? …)`), not a window: it " +
      "asks how much of a Goal's contribution is recent, in the same " +
      "statement that counts all of it.",
  },
  {
    file: "d1-diary-repository.ts",
    predicates: 2,
    reason:
      "NOT the Activity stream at all: `d.occurred_at` is the Diary entry's " +
      "own date column on `diary_details`. It happens to share a name. The " +
      "entry that raised DEBT-238 did not name this file, and it is not a " +
      "windowed read over `activities`.",
  },
];

describe("the windowed Activity read is one read, and every exception is named", () => {
  it("carries a predicate only in the enumerated files, at the enumerated counts", () => {
    const measured = adapterFiles()
      .map((file) => ({ file, predicates: windowPredicateCount(file) }))
      .filter((entry) => entry.predicates > 0);
    expect(measured).toEqual(
      PERMITTED.map(({ file, predicates }) => ({ file, predicates })).sort(
        (left, right) => left.file.localeCompare(right.file),
      ),
    );
  });

  it("gives every exception a stated reason, so none is an accident", () => {
    for (const entry of PERMITTED) {
      expect(entry.reason.length).toBeGreaterThan(60);
    }
  });

  it("does not carry a predicate in the three files DEBT-238 named but measurement cleared", () => {
    // The entry's claim, corrected by measurement rather than repeated.
    for (const file of [
      "d1-project-health-repository.ts",
      "d1-recent-records-repository.ts",
      "d1-meeting-repository.ts",
    ]) {
      expect(windowPredicateCount(file)).toBe(0);
    }
  });

  it("routes both counting callers through the one shared module", () => {
    const shared = "history-window-read";
    for (const file of [
      "d1-activity-repository.ts",
      "d1-review-insight-repository.ts",
    ]) {
      const source = code(readFileSync(path.join(ADAPTER_DIR, file), "utf8"));
      expect(source).toContain(`from "./${shared}"`);
      expect(source).toContain("countPrimarySubjectsByTypeInBuckets");
    }
  });

  it("keeps the history kernel free of storage and JSX", () => {
    const dir = path.join(ROOT, "app", "kernel", "history");
    for (const name of readdirSync(dir)) {
      const source = readFileSync(path.join(dir, name), "utf8");
      expect(source).not.toMatch(/D1Database|prepare\(|SELECT |from "react/);
    }
  });
});
