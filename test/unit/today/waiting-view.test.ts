import { describe, expect, it } from "vitest";

import {
  formatWaitingElapsed,
  formatWaitingSince,
  waitingSubjectLabel,
} from "~/modules/today/task/task-view";
import { toWaitingCardData } from "~/modules/today/task/waiting-view";

// TODAY-03 — pure, deterministic waiting derivations (time is injected, never
// wall-clock, so "since"/elapsed assertions are stable — no flakiness).

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

describe("toWaitingCardData", () => {
  const base = {
    id: "t1",
    title: "Prepare supplier agreement",
    priority: "high" as const,
    dueDate: "2026-07-15",
    scheduledDate: null,
    parent: { kind: "project" as const, id: "p1", title: "Procurement uplift" },
  };

  it("derives the subject, since, elapsed and an overdue due label", () => {
    const card = toWaitingCardData(
      {
        ...base,
        waiting: {
          since: "2026-07-18T00:00:00.000Z",
          subject: {
            kind: "entity",
            id: "person-1",
            type: "person",
            title: "Sarah Chen",
          },
        },
      },
      MS("2026-07-21T00:00:00.000Z"),
      "2026-07-20",
    );
    expect(card.subjectLabel).toBe("Sarah Chen");
    expect(card.subjectType).toBe("person");
    expect(card.sinceLabel).toBe("18 Jul 2026");
    expect(card.elapsedLabel).toBe("3 days");
    // Due 2026-07-15 is before today 2026-07-20 → overdue (danger tone).
    expect(card.dateLabel).toEqual({
      label: "Due 15 Jul 2026",
      tone: "danger",
    });
  });

  it("carries a free-text subject with no subject type", () => {
    const card = toWaitingCardData(
      {
        ...base,
        dueDate: null,
        waiting: {
          since: "2026-07-20T00:00:00.000Z",
          subject: { kind: "text", note: "finance confirmation" },
        },
      },
      MS("2026-07-20T06:00:00.000Z"),
      "2026-07-20",
    );
    expect(card.subjectLabel).toBe("finance confirmation");
    expect(card.subjectType).toBeNull();
    expect(card.elapsedLabel).toBe("today");
    expect(card.dateLabel).toBeNull();
  });
});
