/**
 * NOTIFY-01 — the evaluator, as a pure function.
 *
 * These are the properties the whole feature rests on, and every one of them is
 * decidable without a database, a network or a clock:
 *
 *   - the digest fires once per OWNER-CALENDAR date, at or past the send time;
 *   - it survives both DST transitions — the spring-forward hour that never
 *     happens and the fall-back hour that happens twice;
 *   - an obligation sits in exactly one rung, and never fires a rung it has
 *     already passed.
 *
 * The wall clock is read through the REAL shared conversion
 * (`wallClockInTimeZone`), not a stub — DST is the thing under test, and a stub
 * would agree with whatever this file assumed.
 */

import { describe, expect, it } from "vitest";

import {
  OBLIGATION_RUNG_DAYS,
  evaluateDigestDue,
  rungForDaysUntilDue,
  sendTimeMinutes,
} from "~/kernel/notifications";
import { wallClockInTimeZone } from "~/shared/datetime";

const SYDNEY = "Australia/Sydney";

function decide(
  instant: string,
  options: {
    readonly sendTime?: string;
    readonly alreadyRecorded?: boolean;
    readonly enabled?: boolean;
    readonly digestEnabled?: boolean;
    readonly timeZone?: string;
  } = {},
) {
  const timeZone = options.timeZone ?? SYDNEY;
  return evaluateDigestDue({
    enabled: options.enabled ?? true,
    digestEnabled: options.digestEnabled ?? true,
    sendTime: options.sendTime ?? "07:00",
    localNow: wallClockInTimeZone(new Date(instant), timeZone),
    alreadyRecorded: options.alreadyRecorded ?? false,
  });
}

describe("the digest gate", () => {
  it("does not fire before the owner's local send time", () => {
    // 2026-08-16T20:45Z is 06:45 on 17 August in Sydney (UTC+10 in winter).
    const decision = decide("2026-08-16T20:45:00.000Z");
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe("before_send_time");
    expect(decision.localDate).toBe("2026-08-17");
  });

  it("fires at the send time, and at every tick after it, until it is recorded", () => {
    // 21:00Z is exactly 07:00 in Sydney.
    expect(decide("2026-08-16T21:00:00.000Z").send).toBe(true);
    // A send time between ticks must not be missed: the rule is "at or past".
    expect(decide("2026-08-16T21:10:00.000Z", { sendTime: "07:05" }).send).toBe(
      true,
    );
    expect(decide("2026-08-17T05:00:00.000Z").send).toBe(true);
  });

  it("stops once the ledger holds a digest for that local date", () => {
    const decision = decide("2026-08-16T21:15:00.000Z", {
      alreadyRecorded: true,
    });
    expect(decision.send).toBe(false);
    expect(decision.reason).toBe("already_recorded");
  });

  it("claims a key naming the owner's calendar date, not the UTC one", () => {
    // 21:00Z on 16 August is already 17 August in Sydney. A key built from the
    // runtime's date would send yesterday's digest every single morning.
    expect(decide("2026-08-16T21:00:00.000Z").dedupeKey).toBe(
      "digest:2026-08-17",
    );
  });

  it("is inert when notifications, or just the digest, are off", () => {
    expect(decide("2026-08-16T21:00:00.000Z", { enabled: false }).reason).toBe(
      "disabled",
    );
    expect(
      decide("2026-08-16T21:00:00.000Z", { digestEnabled: false }).reason,
    ).toBe("disabled");
  });

  it("refuses a send time that is not a time, rather than guessing", () => {
    expect(decide("2026-08-16T21:00:00.000Z", { sendTime: "7am" }).reason).toBe(
      "invalid_send_time",
    );
    expect(
      decide("2026-08-16T21:00:00.000Z", { sendTime: "24:00" }).reason,
    ).toBe("invalid_send_time");
  });

  /* ---------------------------------------------------------------------- */
  /* DST — the reason the schedule is a tick rather than a cron time         */
  /* ---------------------------------------------------------------------- */

  describe("across a DST transition", () => {
    /*
     * Sydney springs FORWARD at 02:00 on the first Sunday in October: the local
     * clock jumps 02:00 → 03:00 and 1 October 2026 is a 23-hour day. A digest
     * due at 02:30 falls inside the hour that never happens.
     */
    it("still sends when the send time falls inside the skipped hour", () => {
      const sendTime = "02:30";
      // 15:45Z on 3 October is 01:45 local on 4 October — before the jump.
      const before = decide("2026-10-03T15:45:00.000Z", { sendTime });
      expect(before.send).toBe(false);
      expect(before.localDate).toBe("2026-10-04");

      // 16:00Z is 03:00 local: 02:30 never occurred, but the clock is now PAST
      // it, and "at or past" is what makes the digest land late rather than
      // never.
      const after = decide("2026-10-03T16:00:00.000Z", { sendTime });
      expect(after.send).toBe(true);
      expect(after.localDate).toBe("2026-10-04");
    });

    /*
     * Sydney falls BACK at 03:00 on the first Sunday in April: 02:00–03:00 local
     * happens twice, and 5 April 2026 is a 25-hour day. A digest due at 02:30 is
     * "at or past" on BOTH passes.
     */
    it("claims the same key on both passes of a repeated hour", () => {
      const sendTime = "02:30";
      const first = decide("2026-04-04T15:45:00.000Z", { sendTime });
      const second = decide("2026-04-04T16:45:00.000Z", { sendTime });
      // Both are 02:45 local on 5 April — the same owner-calendar date, so the
      // same ledger key, so the second insert conflicts and nothing is sent
      // twice. The clock does not decide this; the ledger does.
      expect(first.localDate).toBe("2026-04-05");
      expect(second.localDate).toBe("2026-04-05");
      expect(first.dedupeKey).toBe(second.dedupeKey);
      expect(first.send).toBe(true);
      expect(second.send).toBe(true);
    });

    it("rolls to a new key at the owner's midnight, not the runtime's", () => {
      // 13:59Z on 16 August is 23:59 local; 14:00Z is 00:00 the next day.
      expect(decide("2026-08-16T13:59:00.000Z").localDate).toBe("2026-08-16");
      expect(decide("2026-08-16T14:00:00.000Z").localDate).toBe("2026-08-17");
    });
  });

  it("reads the same instant differently for owners in different zones", () => {
    const instant = "2026-08-16T21:00:00.000Z";
    expect(decide(instant, { timeZone: SYDNEY }).localDate).toBe("2026-08-17");
    expect(decide(instant, { timeZone: "Europe/London" }).localDate).toBe(
      "2026-08-16",
    );
  });
});

describe("sendTimeMinutes", () => {
  it("reads a 24-hour clock and refuses anything else", () => {
    expect(sendTimeMinutes("00:00")).toBe(0);
    expect(sendTimeMinutes("07:05")).toBe(425);
    expect(sendTimeMinutes("23:59")).toBe(1439);
    expect(sendTimeMinutes("7:00")).toBeNull();
    expect(sendTimeMinutes("24:00")).toBeNull();
    expect(sendTimeMinutes("07:60")).toBeNull();
    expect(sendTimeMinutes("")).toBeNull();
  });
});

describe("the obligation rungs", () => {
  it("has exactly three, largest first", () => {
    expect(OBLIGATION_RUNG_DAYS).toEqual([30, 7, 1]);
  });

  it("places an obligation in the SMALLEST rung it is inside", () => {
    expect(rungForDaysUntilDue(31)).toBeNull();
    expect(rungForDaysUntilDue(30)).toBe(30);
    expect(rungForDaysUntilDue(12)).toBe(30);
    expect(rungForDaysUntilDue(8)).toBe(30);
    expect(rungForDaysUntilDue(7)).toBe(7);
    expect(rungForDaysUntilDue(2)).toBe(7);
    expect(rungForDaysUntilDue(1)).toBe(1);
    expect(rungForDaysUntilDue(0)).toBe(1);
  });

  it("keeps an overdue obligation in the last rung rather than inventing one", () => {
    // Deduped forever by its key, so this says "expires tomorrow" exactly once
    // and never becomes a daily accusation.
    expect(rungForDaysUntilDue(-1)).toBe(1);
    expect(rungForDaysUntilDue(-400)).toBe(1);
  });

  it("has no rung for an obligation with no due date", () => {
    // A meter-only obligation ("service at 10,000 km") has no days to count
    // down. It reaches the owner through Today and the digest; what it cannot
    // do is claim a number of days it does not have.
    expect(rungForDaysUntilDue(null)).toBeNull();
  });

  it("skips rungs an obligation was never inside", () => {
    // Added three days before it is due: the 7-day rung fires and the 30-day
    // rung is never claimed, because "expires in 30 days" is not true of a date
    // three days away. This is what stops a burst on first use.
    expect(rungForDaysUntilDue(3)).toBe(7);
  });
});
