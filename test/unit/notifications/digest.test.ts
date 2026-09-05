/**
 * NOTIFY-01 — the digest renderer, and the rule it exists to hold.
 *
 * The important assertion in this file is the first one: an empty digest is not
 * sent. Everything else is wording.
 */

import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  renderDigest,
  renderObligationNotice,
  type DigestFacts,
} from "~/kernel/notifications";

const QUIET: DigestFacts = {
  localDate: "2026-08-16",
  dueToday: 0,
  overdue: 0,
  inboxCount: 0,
  waiting: { count: 0, oldestDays: null, followUpDue: 0 },
  obligations: { visibleCount: 0, first: null },
  projects: [],
  events: [],
};

describe("an empty digest is not sent", () => {
  it("renders null when there is nothing to report", () => {
    // Silence has to MEAN something. A daily "nothing needs attention" is the
    // fastest way to teach the owner to ignore the channel.
    expect(renderDigest(QUIET)).toBeNull();
  });

  it("renders as soon as any single fact is non-empty", () => {
    const facts: readonly DigestFacts[] = [
      { ...QUIET, dueToday: 1 },
      { ...QUIET, overdue: 1 },
      { ...QUIET, inboxCount: 1 },
      { ...QUIET, waiting: { count: 1, oldestDays: 3, followUpDue: 0 } },
      // V2.7 RECALL-03 — a due follow-up is on its own worth saying.
      { ...QUIET, waiting: { count: 1, oldestDays: 3, followUpDue: 1 } },
      {
        ...QUIET,
        obligations: {
          visibleCount: 1,
          first: {
            title: "Registration renewal",
            subjectTitle: "Hilux",
            text: "Due in 6 days",
          },
        },
      },
      { ...QUIET, projects: [{ title: "Kitchen", statusLabel: "At risk" }] },
      { ...QUIET, events: [{ title: "Standup", timeLabel: "09:00" }] },
    ];
    for (const fact of facts) {
      expect(renderDigest(fact)).not.toBeNull();
    }
  });
});

describe("what the digest says", () => {
  it("titles itself with the owner's calendar day", () => {
    const digest = renderDigest({ ...QUIET, dueToday: 2 });
    expect(digest?.title).toBe("Your day — Sunday 16 August");
    expect(digest?.href).toBe("/today");
    expect(digest?.dedupeKey).toBe("digest:2026-08-16");
    expect(digest?.kind).toBe("digest");
  });

  it("states the day's work first, then the day, then what is ageing", () => {
    const digest = renderDigest({
      localDate: "2026-08-16",
      dueToday: 3,
      overdue: 2,
      inboxCount: 4,
      waiting: { count: 2, oldestDays: 9, followUpDue: 0 },
      obligations: { visibleCount: 3, first: null },
      projects: [
        { title: "Kitchen renovation", statusLabel: "At risk" },
        { title: "Website", statusLabel: "Stale" },
      ],
      events: [
        { title: "Standup", timeLabel: "09:00" },
        { title: "Public holiday", timeLabel: null },
      ],
    });
    expect(digest?.body.split("\n")).toEqual([
      "3 tasks for today · 2 overdue",
      "2 events: 09:00 Standup · Public holiday",
      "4 unfiled tasks in your inbox",
      "2 waiting items · oldest 9 days",
      "3 obligations need attention",
      "2 projects need a look: Kitchen renovation (At risk) · Website (Stale)",
    ]);
  });

  /* ------------------------------------------------------------------ */
  /* V2.7 RECALL-03 — the follow-ups-due line                            */
  /* ------------------------------------------------------------------ */

  it("states follow-ups due on their own line, exactly once", () => {
    const digest = renderDigest({
      ...QUIET,
      waiting: { count: 5, oldestDays: 12, followUpDue: 2 },
    });
    const lines = digest?.body.split("\n") ?? [];
    // Two facts, two lines, in the rail's order: what is ageing, then what has
    // come due. Never merged, and never stated twice.
    expect(lines).toEqual([
      "5 waiting items · oldest 12 days",
      "2 follow-ups due",
    ]);
    expect(lines.filter((line) => line.includes("follow-up"))).toHaveLength(1);
  });

  it("says one follow-up in the singular", () => {
    const digest = renderDigest({
      ...QUIET,
      waiting: { count: 1, oldestDays: 1, followUpDue: 1 },
    });
    expect(digest?.body).toContain("1 follow-up due");
  });

  /**
   * THE SUPPRESSION RULE, applied to the new fact.
   *
   * The digest has no "0 overdue" line and no "all projects on track" line
   * because a channel that speaks when there is nothing to report teaches the
   * owner to stop reading it. A "0 follow-ups due" line would be exactly that,
   * and this is the assertion that forbids it.
   */
  it("renders NO follow-up line when none are due", () => {
    const digest = renderDigest({
      ...QUIET,
      waiting: { count: 4, oldestDays: 6, followUpDue: 0 },
    });
    expect(digest?.body).toContain("4 waiting items");
    expect(digest?.body).not.toContain("follow-up");
    expect(digest?.body).not.toContain("0 follow-ups");
  });

  /**
   * FALSIFICATION 2 (the roadmap's own): point the follow-up line at
   * `waiting.count`.
   *
   * The two fields are adjacent by design — they are two facts about one
   * population — and the specific mistake that adjacency invites is rendering
   * the GENERIC waiting total under follow-up words. This fixture makes the two
   * numbers differ, so a renderer reading `count` would print "9 follow-ups
   * due" here and fail.
   */
  it("falsifies a follow-up line pointed at the generic waiting count", () => {
    const digest = renderDigest({
      ...QUIET,
      waiting: { count: 9, oldestDays: 30, followUpDue: 2 },
    });
    expect(digest?.body).toContain("2 follow-ups due");
    expect(digest?.body).not.toContain("9 follow-ups due");
  });

  it("names a single obligation rather than counting it", () => {
    const digest = renderDigest({
      ...QUIET,
      obligations: {
        visibleCount: 1,
        first: {
          title: "Registration renewal",
          subjectTitle: "Hilux",
          text: "Due in 6 days",
        },
      },
    });
    expect(digest?.body).toBe("Hilux — Registration renewal: Due in 6 days");
  });

  /*
   * V2.10 LIFE-03 — the line the whole programme exists for. A tax return has
   * no asset to be announced under, so it announces itself, and the sentence
   * still reads as English rather than as a missing value.
   */
  it("names an obligation about nothing after itself", () => {
    const digest = renderDigest({
      ...QUIET,
      obligations: {
        visibleCount: 1,
        first: {
          title: "Lodge the tax return",
          subjectTitle: null,
          text: "Due in 9 days",
        },
      },
    });
    expect(digest?.body).toBe("Lodge the tax return: Due in 9 days");
  });

  it("counts what it cannot name without saying 'asset'", () => {
    const digest = renderDigest({
      ...QUIET,
      obligations: { visibleCount: 3, first: null },
    });
    expect(digest?.body).toBe("3 obligations need attention");
  });

  it("counts the events it does not name", () => {
    const digest = renderDigest({
      ...QUIET,
      events: [
        { title: "One", timeLabel: "09:00" },
        { title: "Two", timeLabel: "10:00" },
        { title: "Three", timeLabel: "11:00" },
        { title: "Four", timeLabel: "12:00" },
      ],
    });
    expect(digest?.body).toContain("+1 more");
  });

  it("says singular things in the singular", () => {
    const digest = renderDigest({
      ...QUIET,
      dueToday: 1,
      inboxCount: 1,
      waiting: { count: 1, oldestDays: 1, followUpDue: 0 },
      projects: [{ title: "Kitchen", statusLabel: "Stale" }],
    });
    expect(digest?.body).toContain("1 task for today");
    expect(digest?.body).toContain("1 unfiled task in your inbox");
    expect(digest?.body).toContain("1 waiting item · oldest 1 day");
    expect(digest?.body).toContain("1 project needs a look");
  });

  it("stays inside the ledger's own bounds on an extreme day", () => {
    const digest = renderDigest({
      ...QUIET,
      dueToday: 40,
      projects: Array.from({ length: 12 }, (_, index) => ({
        title: `Project ${index} ${"long title ".repeat(20)}`,
        statusLabel: "At risk",
      })),
      events: Array.from({ length: 30 }, (_, index) => ({
        title: `Event ${index} ${"long title ".repeat(20)}`,
        timeLabel: "09:00",
      })),
    });
    expect(digest).not.toBeNull();
    expect(digest!.title.length).toBeLessThanOrEqual(NOTIFICATION_TITLE_MAX);
    expect(digest!.body.length).toBeLessThanOrEqual(NOTIFICATION_BODY_MAX);
  });
});

describe("the obligation notice", () => {
  const notice = renderObligationNotice({
    obligationId: "obl-1",
    subject: { id: "asset-1", title: "Hilux" },
    title: "Registration renewal",
    text: "Due in 7 days",
    rung: 7,
  });

  it("is keyed on the OBLIGATION and the rung, not on its subject", () => {
    // An Asset with a rego renewal and a service due in the same week must
    // produce two notices, not one.
    expect(notice.dedupeKey).toBe("obligation:obl-1:7");
    expect(notice.kind).toBe("obligation");
  });

  it("points at the obligation's own record, where the action is", () => {
    expect(notice.href).toBe("/obligations/obl-1");
    // The subject is still carried, so the inbox can say what a row concerned
    // even after the record it was about is gone.
    expect(notice.subjectEntityId).toBe("asset-1");
  });

  it("reuses the shared evaluator's own words", () => {
    expect(notice.title).toBe("Hilux — Registration renewal");
    expect(notice.body).toBe("Due in 7 days");
  });

  /*
   * V2.10 LIFE-03 — a notice about nothing in particular. It names itself, it
   * still has a record to open, and the subject falls back to the obligation
   * rather than to an empty string the inbox would render as a gap.
   */
  it("announces an obligation with no subject under its own title", () => {
    const alone = renderObligationNotice({
      obligationId: "obl-tax",
      subject: null,
      title: "Lodge the tax return",
      text: "Due in 30 days",
      rung: 30,
    });
    expect(alone.title).toBe("Lodge the tax return");
    expect(alone.href).toBe("/obligations/obl-tax");
    expect(alone.subjectEntityId).toBe("obl-tax");
    expect(alone.dedupeKey).toBe("obligation:obl-tax:30");
  });

  /*
   * ADR-049 decision 5, at the one surface where it matters most: a lock screen
   * is the single place an owner cannot choose not to show somebody.
   */
  it("carries no amount anywhere in it", () => {
    const rendered = `${notice.title} ${notice.body} ${notice.href}`;
    expect(rendered).not.toMatch(/\d+[.,]\d{2}/);
    expect(rendered).not.toMatch(/[$£€¥]/);
  });
});
