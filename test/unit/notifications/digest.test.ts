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
  waiting: { count: 0, oldestDays: null , followUpDue: 0 },
  assets: { visibleCount: 0, first: null },
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
      { ...QUIET, waiting: { count: 1, oldestDays: 3 , followUpDue: 0 } },
      {
        ...QUIET,
        assets: {
          visibleCount: 1,
          first: { assetTitle: "Hilux", text: "Due in 6 days" },
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
      waiting: { count: 2, oldestDays: 9 , followUpDue: 0 },
      assets: { visibleCount: 3, first: null },
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
      "3 asset obligations need attention",
      "2 projects need a look: Kitchen renovation (At risk) · Website (Stale)",
    ]);
  });

  it("names a single obligation rather than counting it", () => {
    const digest = renderDigest({
      ...QUIET,
      assets: {
        visibleCount: 1,
        first: { assetTitle: "Hilux", text: "Registration expires in 6 days" },
      },
    });
    expect(digest?.body).toBe("Hilux: Registration expires in 6 days");
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
      waiting: { count: 1, oldestDays: 1 , followUpDue: 0 },
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
    assetId: "asset-1",
    assetTitle: "Hilux",
    title: "Registration renewal",
    text: "Due in 7 days",
    rung: 7,
  });

  it("is keyed on the OBLIGATION and the rung, not on the asset", () => {
    // An Asset with a rego renewal and a service due in the same week must
    // produce two notices, not one.
    expect(notice.dedupeKey).toBe("asset:obl-1:7");
  });

  it("points at the asset, which is what the owner opens", () => {
    expect(notice.subjectEntityId).toBe("asset-1");
    expect(notice.href).toBe("/asset/asset-1?tab=obligations");
  });

  it("reuses the Assets evaluator's own words", () => {
    expect(notice.title).toBe("Hilux — Registration renewal");
    expect(notice.body).toBe("Due in 7 days");
  });
});
