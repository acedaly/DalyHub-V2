import { describe, expect, it } from "vitest";

import {
  formatWaitingElapsed,
  formatWaitingSince,
  waitingSubjectLabel,
} from "~/shared/task-record/task-view";
import { waitingSubtitle } from "~/modules/today/task/waiting-view";

// TODAY-03 — pure, deterministic waiting derivations (time is injected, never
// wall-clock, so "since"/elapsed assertions are stable — no flakiness).
//
// V2.8 CONV-02 — the Card-shaped derivations that used to be tested here
// (`toWaitingCardData` and the follow-up label) went with the Waiting Card. The
// same facts are now the shared row's optional waiting fact, and their contract
// is `test/unit/task-record/task-row-waiting-fact.test.tsx`; the canonical
// formatters below are unchanged and are what that fact is rendered through.

const MS = (iso: string) => Date.parse(iso);

describe("formatWaitingElapsed (injected now)", () => {
  const since = "2026-07-18T00:00:00.000Z";
  it("reads 'today' on the same day", () => {
    expect(formatWaitingElapsed(since, MS("2026-07-18T06:00:00.000Z"))).toBe(
      "today",
    );
  });
  it("reads '1 day' and 'N days'", () => {
    expect(formatWaitingElapsed(since, MS("2026-07-19T00:00:00.000Z"))).toBe(
      "1 day",
    );
    expect(formatWaitingElapsed(since, MS("2026-07-21T00:00:00.000Z"))).toBe(
      "3 days",
    );
  });
  it("collapses to weeks then months", () => {
    expect(formatWaitingElapsed(since, MS("2026-08-08T00:00:00.000Z"))).toBe(
      "3 weeks",
    );
    expect(formatWaitingElapsed(since, MS("2026-09-30T00:00:00.000Z"))).toBe(
      "2 months",
    );
  });
  it("never goes negative", () => {
    expect(formatWaitingElapsed(since, MS("2026-07-01T00:00:00.000Z"))).toBe(
      "today",
    );
  });
  it("returns '' for an unparseable value", () => {
    expect(
      formatWaitingElapsed("not-a-date", MS("2026-07-20T00:00:00.000Z")),
    ).toBe("");
  });
});

describe("formatWaitingSince", () => {
  it("formats a UTC calendar date manually", () => {
    expect(formatWaitingSince("2026-07-18T22:30:00.000Z")).toBe("18 Jul 2026");
  });
  it("returns null for an unparseable value", () => {
    expect(formatWaitingSince("nope")).toBeNull();
  });
});

describe("waitingSubjectLabel", () => {
  it("uses the entity title", () => {
    expect(
      waitingSubjectLabel({
        kind: "entity",
        id: "p1",
        type: "person",
        title: "Sarah Chen",
      }),
    ).toBe("Sarah Chen");
  });
  it("uses the free-text note", () => {
    expect(waitingSubjectLabel({ kind: "text", note: "finance" })).toBe(
      "finance",
    );
  });
  it("falls back calmly for an unresolved entity target", () => {
    expect(
      waitingSubjectLabel({
        kind: "entity",
        id: null,
        type: null,
        title: null,
      }),
    ).toBe("someone no longer available");
  });
});

/* -------------------------------------------------------------------------- */
/* V2.7 RECALL-03 — the honest subtitle (DEBT-232)                             */
/* -------------------------------------------------------------------------- */

describe("waitingSubtitle never states a bound as a total", () => {
  /**
   * The DEBT-232 fixture, in the shape the 150-row kernel proof produces.
   *
   * With 150 waiting Tasks and a 50-row page, the surface is showing 50 and
   * more remain. The old line said "100 tasks are waiting…" from a 100-row cap;
   * the new one may only describe what it is actually showing, and must say
   * that more exist.
   */
  it("says what it is SHOWING while a page remains", () => {
    const line = waitingSubtitle({
      loaded: 50,
      hasMore: true,
      followUp: null,
      failed: false,
    });
    expect(line).toBe(
      "Showing the first 50 waiting tasks — load more to see the rest.",
    );
    // The falsification: it must not claim the loaded number is the population.
    expect(line).not.toBe("50 tasks are waiting on someone or something else.");
    expect(line).toContain("load more");
  });

  it("states the true total once the collection is exhausted", () => {
    expect(
      waitingSubtitle({
        loaded: 150,
        hasMore: false,
        followUp: null,
        failed: false,
      }),
    ).toBe("150 tasks are waiting on someone or something else.");
    expect(
      waitingSubtitle({
        loaded: 1,
        hasMore: false,
        followUp: null,
        failed: false,
      }),
    ).toBe("1 task is waiting on someone or something else.");
    expect(
      waitingSubtitle({
        loaded: 0,
        hasMore: false,
        followUp: null,
        failed: false,
      }),
    ).toBe("0 tasks are waiting on someone or something else.");
  });

  it("names the filter it is showing, so a filtered page is not read as the whole", () => {
    expect(
      waitingSubtitle({
        loaded: 3,
        hasMore: false,
        followUp: "due",
        failed: false,
      }),
    ).toBe(
      "3 tasks are waiting on someone or something else with a follow-up due.",
    );
    expect(
      waitingSubtitle({
        loaded: 50,
        hasMore: true,
        followUp: "overdue",
        failed: false,
      }),
    ).toContain("with an overdue follow-up");
  });

  it("states a failure as a failure rather than as zero", () => {
    expect(
      waitingSubtitle({
        loaded: 0,
        hasMore: false,
        followUp: null,
        failed: true,
      }),
    ).toBe("We couldn’t load your waiting tasks.");
  });
});
