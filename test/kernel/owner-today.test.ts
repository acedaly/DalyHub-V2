/**
 * AUDIT-14 — ONE definition of the owner's current calendar day.
 *
 * DalyHub had two. Task paths resolved the owner's stored timezone, while Asset
 * history, obligations and the obligation→task gateway resolved a hard-coded
 * `Australia/Sydney`. For any owner living elsewhere the SAME instant read as
 * two different calendar dates in one product: an obligation could be recorded
 * as done "yesterday" on the Asset while the Task it generated agreed it was
 * "today", and due/overdue state disagreed between modules for part of every
 * day.
 *
 * The authority is now `WorkspaceScope.ownerTimeZone()` / `.ownerTodayIso()`,
 * resolved once per request from the owner's stored preference. These tests
 * prove: the stored zone is what answers; a clearly different zone answers
 * differently for the SAME instant; two modules given that one answer agree;
 * Asset obligations (including the Task they close) follow it; and the
 * calendar-date recurrence arithmetic survives a DST boundary in a zone that
 * has one.
 *
 * Every assertion names its instant and its zone. Nothing here reads the
 * machine's timezone, and the two places that must use the wall clock (the
 * composition wiring) sample the owner day either side of the call and accept
 * only those, so a run that straddles the owner's midnight cannot flake.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "~/kernel/auth";
import { DEFAULT_OWNER_TIME_ZONE } from "~/kernel/preferences";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { createOwnerAlignmentContext } from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";
import { createOwnerHealthContext } from "~/shared/project-health";

import {
  FakeClock,
  makeAssetHistoryRepository,
  makeObligationRepository,
  makeAssetRepository,
  makeContext,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OWNER = "owner-subject";

const SYDNEY = "Australia/Sydney";
const LOS_ANGELES = "America/Los_Angeles";

/**
 * 2026-08-08T02:00:00Z. Deliberately inside the window where the calendar date
 * genuinely differs by zone: it is midday on the 8th in Sydney (UTC+10) and
 * still the evening of the 7th in Los Angeles (UTC−7). A single instant, two
 * honest answers — which is exactly the disagreement AUDIT-14 was about.
 */
const INSTANT = new Date("2026-08-08T02:00:00.000Z");

function sessionFor(subject = OWNER): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

async function scopeFor(subject = OWNER) {
  return resolveAuthenticatedWorkspaceScope(
    { DB: env.DB, DEFAULT_WORKSPACE_ID: WS },
    sessionFor(subject),
  );
}

async function setOwnerTimeZone(timezone: string): Promise<void> {
  const scope = await scopeFor();
  await scope.appPreferences.update(OWNER, { timezone });
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("AUDIT-14 — the owner's stored timezone is the one authority", () => {
  it("falls back to the documented default when no preference is stored", async () => {
    const scope = await scopeFor();
    expect(await scope.ownerTimeZone()).toBe(DEFAULT_OWNER_TIME_ZONE);
    expect(await scope.ownerTodayIso(INSTANT)).toBe(
      ownerCalendarIso(INSTANT, DEFAULT_OWNER_TIME_ZONE),
    );
  });

  it("resolves the Sydney owner's expected calendar date", async () => {
    await setOwnerTimeZone(SYDNEY);
    const scope = await scopeFor();
    expect(await scope.ownerTimeZone()).toBe(SYDNEY);
    expect(await scope.ownerTodayIso(INSTANT)).toBe("2026-08-08");
  });

  it("resolves a clearly different timezone's OWN date for the same instant", async () => {
    await setOwnerTimeZone(LOS_ANGELES);
    const scope = await scopeFor();
    expect(await scope.ownerTimeZone()).toBe(LOS_ANGELES);
    // The regression in one line: the same instant, a day earlier for this owner.
    expect(await scope.ownerTodayIso(INSTANT)).toBe("2026-08-07");
  });

  it("answers once per scope, so one request cannot straddle two owner days", async () => {
    await setOwnerTimeZone(LOS_ANGELES);
    const scope = await scopeFor();
    expect(await scope.ownerTimeZone()).toBe(LOS_ANGELES);

    // The preference changes underneath an in-flight request. The scope keeps
    // the answer it already gave: a page that resolved "today" for one module
    // must not resolve a different "today" for the next.
    await (await scopeFor()).appPreferences.update(OWNER, { timezone: SYDNEY });
    expect(await scope.ownerTimeZone()).toBe(LOS_ANGELES);

    // A NEW scope (the next request) picks the new preference up.
    expect(await (await scopeFor()).ownerTimeZone()).toBe(SYDNEY);
  });

  it("keeps the timezone workspace-and-owner scoped", async () => {
    await setOwnerTimeZone(LOS_ANGELES);
    // A different owner in the same workspace has their own preference row, and
    // no row means the documented default — never the other owner's zone.
    const otherScope = await scopeFor("someone-else");
    expect(await otherScope.ownerTimeZone()).toBe(DEFAULT_OWNER_TIME_ZONE);
    expect(await (await scopeFor()).ownerTimeZone()).toBe(LOS_ANGELES);
  });
});

describe("AUDIT-14 — two modules cannot disagree about today", () => {
  it("gives Project health, Goal alignment and the scope the same owner day", async () => {
    await setOwnerTimeZone(LOS_ANGELES);
    const scope = await scopeFor();
    const timeZone = await scope.ownerTimeZone();

    const scopeToday = await scope.ownerTodayIso(INSTANT);
    const healthToday = createOwnerHealthContext(INSTANT, timeZone).todayIso;
    const alignmentToday = createOwnerAlignmentContext(INSTANT, timeZone)
      .evaluation.todayIso;

    expect(healthToday).toBe(scopeToday);
    expect(alignmentToday).toBe(scopeToday);
    // …and it is genuinely the owner's day, not the Sydney one it used to be.
    expect(scopeToday).toBe("2026-08-07");
    expect(ownerCalendarIso(INSTANT, SYDNEY)).toBe("2026-08-08");
  });

  it("resolves an instant's calendar date the same way in every module", async () => {
    await setOwnerTimeZone(LOS_ANGELES);
    const scope = await scopeFor();
    const timeZone = await scope.ownerTimeZone();
    const health = createOwnerHealthContext(INSTANT, timeZone);
    const alignment = createOwnerAlignmentContext(INSTANT, timeZone);

    // Not just "today": every instant→date conversion the evaluators do.
    const older = new Date("2026-08-01T02:00:00.000Z");
    expect(health.calendarIsoOf(older)).toBe(
      alignment.evaluation.calendarIsoOf(older),
    );
    expect(health.calendarIsoOf(older)).toBe(
      ownerCalendarIso(older, LOS_ANGELES),
    );
  });
});

describe("AUDIT-14 — Asset dates follow the owner, not Sydney", () => {
  /** Assets + history bound to one explicit zone and one fixed instant. */
  function assetPair(timeZone: string, nowIso: string, prefix: string) {
    const context = makeContext(WS);
    const ownerTimeZone = () => Promise.resolve(timeZone);
    return {
      assets: makeAssetRepository(context, {
        clock: new FakeClock(nowIso).now,
        idGenerator: sequentialIds(`${prefix}asset`),
        ownerTimeZone,
      }),
      history: makeAssetHistoryRepository(context, {
        clock: new FakeClock(nowIso).now,
        idGenerator: sequentialIds(`${prefix}hist`),
        activityIdGenerator: sequentialIds(`${prefix}act`),
        ownerTimeZone,
      }),
      // V2.10 LIFE-01 — the owner-day rules an obligation carries are the
      // shared store's now, and this file is where they are proven.
      obligations: makeObligationRepository(context, {
        clock: new FakeClock(nowIso).now,
        idGenerator: sequentialIds(`${prefix}obl`),
        activityIdGenerator: sequentialIds(`${prefix}oact`),
        proofGateway: makeAssetHistoryRepository(context, {
          clock: new FakeClock(nowIso).now,
          idGenerator: sequentialIds(`${prefix}hist`),
          activityIdGenerator: sequentialIds(`${prefix}act`),
          ownerTimeZone,
        }),
        ownerTimeZone,
      }),
    };
  }

  it("defaults an obligation's completion date to the OWNER's day", async () => {
    const sydney = assetPair(SYDNEY, INSTANT.toISOString(), "syd");
    const la = assetPair(LOS_ANGELES, INSTANT.toISOString(), "la");

    const sydneyAsset = await sydney.assets.create({
      title: "Car",
      assetType: "vehicle",
    });
    const laAsset = await la.assets.create({
      title: "Truck",
      assetType: "vehicle",
    });

    const sydneyObligation = await sydney.obligations.create({
      subjectEntityId: sydneyAsset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-08-10",
    });
    const laObligation = await la.obligations.create({
      subjectEntityId: laAsset.id,
      category: "service",
      title: "Service",
      dueDate: "2026-08-10",
    });

    // Neither caller supplies `completedOn`, so each falls back to "today".
    const sydneyDone = await sydney.obligations.complete(sydneyObligation.id);
    const laDone = await la.obligations.complete(laObligation.id);

    // ONE instant, two owners, two honest answers — and the Los Angeles owner is
    // no longer told their work happened on Sydney's day.
    expect(sydneyDone.proof?.date).toBe("2026-08-08");
    expect(laDone.proof?.date).toBe("2026-08-07");
  });

  it("defaults a meter reading's date to the OWNER's day", async () => {
    const la = assetPair(LOS_ANGELES, INSTANT.toISOString(), "la");
    const asset = await la.assets.create({
      title: "Truck",
      assetType: "vehicle",
    });
    const reading = await la.history.recordMeterReading({
      assetId: asset.id,
      value: 120_000,
      unit: "km",
    });
    expect(reading.event.eventDate).toBe("2026-08-07");
  });

  it("resolves the Assets collection's owner day through the scope", async () => {
    await setOwnerTimeZone(LOS_ANGELES);
    const scope = await scopeFor();
    // The collection read model takes `today` from the caller; the caller is the
    // loader, and the loader now asks the scope. Same instant, owner's date.
    const page = await scope.assets.list({
      today: await scope.ownerTodayIso(INSTANT),
    });
    expect(page.items).toEqual([]);
    expect(await scope.ownerTodayIso(INSTANT)).toBe("2026-08-07");
  });
});

describe("AUDIT-14 — the obligation→task gateway uses the owner's day", () => {
  it("schedules a recurring linked Task's successor from the owner's today", async () => {
    await setOwnerTimeZone(LOS_ANGELES);
    const scope = await scopeFor();

    // A daily Task whose anchor is well in the past, so the successor date is
    // decided entirely by the owner's TODAY (the rule resumes tomorrow rather
    // than replaying every skipped day).
    const task = await scope.tasks.createTask({
      title: "Check the oil",
      scheduledDate: "2026-01-01",
      recurrence: { frequency: "day", interval: 1, dateKind: "scheduled" },
    });
    const asset = await scope.assets.create({
      title: "Truck",
      assetType: "vehicle",
    });
    const obligation = await scope.obligations.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Oil check",
      dueDate: "2026-01-01",
    });
    // The repository never creates Tasks (§22); the route composes the two, so
    // this test does the same and then links the Task it made.
    await scope.obligations.linkTask(obligation.id, task.id);

    // Sample the owner's day either side of the call: the wall clock is real
    // here (this is the composition wiring, not a fixture), so the only
    // non-flaky assertion is "one of the days this call could legitimately
    // see". What this test proves is the WIRING — the gateway asks the scope
    // rather than a constant; the deterministic proof that the answer differs
    // by zone is the fixed-clock repository test above.
    const before = ownerCalendarIso(new Date(), LOS_ANGELES);
    await scope.obligations.complete(obligation.id);
    const after = ownerCalendarIso(new Date(), LOS_ANGELES);

    const successors = await scope.tasks.listTasks({ limit: 50 });
    const next = successors.items.find(
      (item) => item.id !== task.id && item.title === "Check the oil",
    );
    expect(next).toBeDefined();
    expect([before, after].map((day) => addDay(day))).toContain(
      next!.scheduledDate,
    );

    // And the original Task really was closed by the gateway.
    const original = await scope.tasks.getTask(task.id);
    expect(original?.completedAt).not.toBeNull();
  });
});

describe("AUDIT-14 — DST does not corrupt calendar-date behaviour", () => {
  it("reads the owner's calendar date correctly either side of a spring-forward", () => {
    // Los Angeles springs forward at 02:00 local on 8 March 2026 (UTC−8 → UTC−7).
    // 09:30Z is 01:30 local (still PST) — the 8th. Five hours later it is 07:30
    // local (PDT) — still the 8th. The calendar DATE is unaffected by the shift,
    // which is the property the recurrence arithmetic depends on.
    expect(
      ownerCalendarIso(new Date("2026-03-08T09:30:00Z"), LOS_ANGELES),
    ).toBe("2026-03-08");
    expect(
      ownerCalendarIso(new Date("2026-03-08T14:30:00Z"), LOS_ANGELES),
    ).toBe("2026-03-08");
    // And the day boundary itself still lands where the owner experiences it:
    // 07:59Z is 23:59 local on the 7th, 08:00Z is 00:00 local on the 8th.
    expect(
      ownerCalendarIso(new Date("2026-03-08T07:59:00Z"), LOS_ANGELES),
    ).toBe("2026-03-07");
    expect(
      ownerCalendarIso(new Date("2026-03-08T08:00:00Z"), LOS_ANGELES),
    ).toBe("2026-03-08");
  });

  it("reads the owner's calendar date correctly either side of a fall-back", () => {
    // Sydney's DST ends at 03:00 local on 5 April 2026 (UTC+11 → UTC+10), making
    // a 25-hour local day. The date must still advance exactly once.
    expect(ownerCalendarIso(new Date("2026-04-04T12:59:00Z"), SYDNEY)).toBe(
      "2026-04-04",
    );
    expect(ownerCalendarIso(new Date("2026-04-04T13:00:00Z"), SYDNEY)).toBe(
      "2026-04-05",
    );
    expect(ownerCalendarIso(new Date("2026-04-05T13:59:00Z"), SYDNEY)).toBe(
      "2026-04-05",
    );
    expect(ownerCalendarIso(new Date("2026-04-05T14:00:00Z"), SYDNEY)).toBe(
      "2026-04-06",
    );
  });

  it("keeps a daily obligation recurring across the owner's DST boundary", async () => {
    // The obligation series is calendar-date arithmetic and must stay that way:
    // a 23- or 25-hour local day still advances the due date by exactly one day.
    const context = makeContext(WS);
    const ownerTimeZone = () => Promise.resolve(LOS_ANGELES);
    const assets = makeAssetRepository(context, {
      clock: new FakeClock("2026-03-07T20:00:00.000Z").now,
      idGenerator: sequentialIds("dstasset"),
      ownerTimeZone,
    });
    // V2.10 LIFE-01 — obligations live in the ONE shared store now, wired
    // with the Assets adapter as its proof gateway exactly as the product is.
    const obligations = makeObligationRepository(context, {
      clock: new FakeClock("2026-03-07T20:00:00.000Z").now,
      idGenerator: sequentialIds("dsthist"),
      activityIdGenerator: sequentialIds("dstact"),
      ownerTimeZone,
    });

    const asset = await assets.create({
      title: "Generator",
      assetType: "equipment",
    });
    const obligation = await obligations.create({
      subjectEntityId: asset.id,
      category: "service",
      title: "Daily check",
      dueDate: "2026-03-07",
      recurrenceKind: "days",
      recurrenceInterval: 1,
    });

    // 20:00Z on the 7th is 12:00 local on the 7th — the day before the shift.
    const done = await obligations.complete(obligation.id);
    expect(done.proof?.date).toBe("2026-03-07");
    expect(done.successor?.dueDate).toBe("2026-03-08");
  });
});

/** The next calendar date after `iso`, by pure date arithmetic. */
function addDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return next.toISOString().slice(0, 10);
}
