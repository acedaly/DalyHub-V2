/**
 * AUDIT-07 — the multi-device preference lost-update, and its regression proof.
 *
 * The original defect, reproduced here as the FIRST test: `update` read the
 * whole record, merged the caller's field into that read, and upserted every
 * column from the merged snapshot. `version` was incremented but never
 * compared. So two devices that read version N and then saved two DIFFERENT
 * settings each wrote the other's field back to the value it had at N — and
 * both calls reported success. One person's change simply disappeared.
 *
 * The fix is deliberately two-part, because preferences are two different
 * shapes of value:
 *
 *   - INDEPENDENT fields merge. The write names only the columns in the patch,
 *     so a device saving `timezone` cannot touch `appearance`. No conflict is
 *     manufactured for a case that has no real disagreement.
 *   - A DERIVED value (the navigation hidden-set: read it, add an id, write the
 *     whole set) cannot merge that way, so its caller quotes the `version` it
 *     read and the write becomes a compare-and-set. A stale one is REFUSED with
 *     `AppPreferencesConflictError` rather than reported as saved.
 *
 * Every "device" below is a separate repository instance reading and writing the
 * real D1 row, so the staleness being tested is genuine storage staleness.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import { AppPreferencesConflictError } from "~/kernel/preferences";

import {
  makeAppPreferencesRepository,
  makeContext,
  resetTables,
} from "./support";

const WS = "prefs_conc_ws";
const OTHER_WS = "prefs_conc_other_ws";
const OWNER = "owner-subject";
const OTHER_OWNER = "other-owner";

/** A separate repository instance — one "device". */
function device(workspaceId: string = WS) {
  return makeAppPreferencesRepository(makeContext(workspaceId));
}

async function storedVersion(
  workspaceId: string,
  owner: string,
): Promise<number | null> {
  const row = await env.DB.prepare(
    `SELECT version FROM owner_app_preferences
      WHERE workspace_id = ? AND owner_id = ?`,
  )
    .bind(workspaceId, owner)
    .first<{ version: number }>();
  return row?.version ?? null;
}

beforeEach(async () => {
  await resetTables([WS, OTHER_WS]);
});

describe("AUDIT-07 — two stale devices cannot clobber each other", () => {
  it("keeps BOTH changes when two stale clients save different settings", async () => {
    // Seed a shared starting point, then let both devices read it.
    await device().update(OWNER, {
      appearance: "system",
      timezone: "Australia/Sydney",
    });

    const deviceA = device();
    const deviceB = device();
    const readA = await deviceA.get(OWNER);
    const readB = await deviceB.get(OWNER);
    // Both read the SAME version — this is the lost-update setup exactly.
    expect(readA.version).toBe(readB.version);

    // Device A changes the appearance…
    await deviceA.update(OWNER, { appearance: "dark" });
    // …and device B, still holding its stale snapshot, changes the timezone.
    await deviceB.update(OWNER, { timezone: "Europe/London" });

    // Before the fix, B's write carried A's stale `appearance: "system"` and
    // reset it. Both changes must survive.
    const stored = await device().get(OWNER);
    expect(stored.appearance).toBe("dark");
    expect(stored.timezone).toBe("Europe/London");
  });

  it("leaves every untouched column exactly as stored", async () => {
    await device().update(OWNER, {
      appearance: "light",
      timezone: "Pacific/Auckland",
      dateFormat: "iso",
      firstDayOfWeek: "sunday",
      defaultLandingDestination: "notes",
      defaultTasksView: "matrix",
      defaultDiaryMode: "timeline",
      navigation: { version: 1, hiddenModuleIds: ["diary"] },
    });
    const before = await device().get(OWNER);

    // A stale device that has never seen ANY of the above still only writes the
    // one column it names.
    const stale = device();
    await stale.update(OWNER, { defaultTasksView: "sectors" });

    const after = await device().get(OWNER);
    expect(after.defaultTasksView).toBe("sectors");
    expect(after.appearance).toBe(before.appearance);
    expect(after.timezone).toBe(before.timezone);
    expect(after.dateFormat).toBe(before.dateFormat);
    expect(after.firstDayOfWeek).toBe(before.firstDayOfWeek);
    expect(after.defaultLandingDestination).toBe(
      before.defaultLandingDestination,
    );
    expect(after.defaultDiaryMode).toBe(before.defaultDiaryMode);
    expect(after.navigation).toEqual(before.navigation);
  });

  it("resolves a SAME-field race to the later write, and advances the version once per change", async () => {
    await device().update(OWNER, { appearance: "system" });
    const deviceA = device();
    const deviceB = device();
    const base = (await deviceA.get(OWNER)).version;
    await deviceB.get(OWNER);

    await deviceA.update(OWNER, { appearance: "dark" });
    const second = await deviceB.update(OWNER, { appearance: "light" });

    // One field, two intentions: the later one wins, which is the only honest
    // answer for a single scalar setting — and nothing ELSE was lost with it.
    expect(second.preferences.appearance).toBe("light");
    expect((await device().get(OWNER)).appearance).toBe("light");
    expect(await storedVersion(WS, OWNER)).toBe(base + 2);
  });
});

describe("AUDIT-07 — the version is a real write precondition", () => {
  it("refuses a stale compare-and-set and preserves the newer stored value", async () => {
    await device().update(OWNER, {
      navigation: { version: 1, hiddenModuleIds: [] },
    });
    const stale = await device().get(OWNER);

    // Another device hides a module in the meantime.
    await device().update(OWNER, {
      navigation: { version: 1, hiddenModuleIds: ["diary"] },
    });

    // The stale device quotes the version it read. Its whole-set write would
    // have erased "diary" from the hidden list.
    await expect(
      device().update(
        OWNER,
        { navigation: { version: 1, hiddenModuleIds: ["notes"] } },
        { expectedVersion: stale.version },
      ),
    ).rejects.toBeInstanceOf(AppPreferencesConflictError);

    // The newer stored data survives untouched.
    expect((await device().get(OWNER)).navigation.hiddenModuleIds).toEqual([
      "diary",
    ]);
  });

  it("commits when the quoted version is still current, and advances it", async () => {
    const current = await device().get(OWNER);
    const result = await device().update(
      OWNER,
      { navigation: { version: 1, hiddenModuleIds: ["notes"] } },
      { expectedVersion: current.version },
    );
    expect(result.changed).toBe(true);
    expect(result.preferences.version).toBe(current.version + 1);
    expect(result.preferences.navigation.hiddenModuleIds).toEqual(["notes"]);
  });

  it("accepts version 0 as 'no row yet', and refuses it once a row exists", async () => {
    // The synthetic defaults record reports version 0; quoting it must create
    // the first row rather than conflict with a row that is not there.
    const defaults = await device().get(OWNER);
    expect(defaults.version).toBe(0);
    const created = await device().update(
      OWNER,
      { dateFormat: "iso" },
      { expectedVersion: 0 },
    );
    expect(created.preferences.version).toBe(1);

    await expect(
      device().update(
        OWNER,
        { dateFormat: "dmy_slash" },
        { expectedVersion: 0 },
      ),
    ).rejects.toBeInstanceOf(AppPreferencesConflictError);
    expect((await device().get(OWNER)).dateFormat).toBe("iso");
  });

  it("treats an unchanged compare-and-set as an idempotent no-op, not a conflict", async () => {
    const first = await device().update(OWNER, { firstDayOfWeek: "sunday" });
    const result = await device().update(
      OWNER,
      { firstDayOfWeek: "sunday" },
      { expectedVersion: first.preferences.version },
    );
    expect(result.changed).toBe(false);
    expect(await storedVersion(WS, OWNER)).toBe(first.preferences.version);
  });

  it("does not conflict when another device already made the SAME change", async () => {
    await device().update(OWNER, { defaultDiaryMode: "timeline" });
    const stale = await device().get(OWNER);
    const winner = await device().update(OWNER, { defaultDiaryMode: "day" });
    expect(winner.preferences.version).toBe(stale.version + 1);

    // The stale device asks for exactly what is already stored. Nothing would be
    // lost by agreeing, so this reports the honest no-op rather than a conflict.
    const result = await device().update(
      OWNER,
      { defaultDiaryMode: "day" },
      { expectedVersion: stale.version },
    );
    expect(result.changed).toBe(false);
    expect(result.preferences.defaultDiaryMode).toBe("day");
    expect(await storedVersion(WS, OWNER)).toBe(winner.preferences.version);
  });
});

describe("AUDIT-07 — the concurrency token never crosses a boundary", () => {
  it("keeps versions independent per workspace and per owner", async () => {
    const here = device(WS);
    const there = device(OTHER_WS);

    await here.update(OWNER, { timezone: "Europe/London" });
    await here.update(OWNER, { timezone: "Europe/Dublin" });
    const hereVersion = (await here.get(OWNER)).version;
    expect(hereVersion).toBe(2);

    // The other workspace has no row at all, so its version is still 0 and a
    // compare-and-set there is unaffected by this workspace's advancing version.
    expect((await there.get(OWNER)).version).toBe(0);
    await there.update(
      OWNER,
      { timezone: "America/New_York" },
      { expectedVersion: 0 },
    );
    expect((await there.get(OWNER)).timezone).toBe("America/New_York");
    expect((await here.get(OWNER)).timezone).toBe("Europe/Dublin");

    // Quoting THIS workspace's version against the other workspace's row is
    // refused: a token from one workspace can never authorise a write in another.
    await expect(
      there.update(
        OWNER,
        { timezone: "UTC" },
        { expectedVersion: hereVersion },
      ),
    ).rejects.toBeInstanceOf(AppPreferencesConflictError);
    expect((await there.get(OWNER)).timezone).toBe("America/New_York");

    // Owners inside one workspace are separate too.
    await here.update(OTHER_OWNER, { timezone: "Asia/Tokyo" });
    expect((await here.get(OTHER_OWNER)).version).toBe(1);
    expect((await here.get(OWNER)).version).toBe(2);
  });

  it("keeps the existing defaults and theme-free appearance behaviour intact", async () => {
    // Nothing about the patch write changed what an owner with no row reads.
    const fresh = await device(OTHER_WS).get(OTHER_OWNER);
    expect(fresh.version).toBe(0);
    expect(fresh.appearance).toBe("system");
    expect(fresh.timezone).toBe("Australia/Sydney");
    expect(fresh.defaultLandingDestination).toBe("today");
    expect(fresh.navigation).toEqual({ version: 1, hiddenModuleIds: [] });

    // And a first appearance write still creates the row with just that column
    // changed from the defaults.
    const saved = await device(OTHER_WS).update(OTHER_OWNER, {
      appearance: "dark",
    });
    expect(saved.preferences.appearance).toBe("dark");
    expect(saved.preferences.timezone).toBe("Australia/Sydney");
    expect(saved.preferences.defaultTasksView).toBe("focus");
  });
});
