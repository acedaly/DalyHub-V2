/**
 * DEBT-33 — an ordinary preference change appends a workspace-scoped event,
 * and the event says WHAT changed without saying what it changed to.
 *
 * SET-03 built the seam (`WorkspaceEventRecorder`) and adopted it for two
 * security acts, and the entry that asked for this named the reason the rest
 * had not followed: *"preference values can also be sensitive or identifying,
 * so arbitrary before/after payloads are not acceptable"*. A timezone is a
 * location. A default capture parent is a record id. A default view id names a
 * filter the owner wrote.
 *
 * So the closing condition is two claims, and this file is one test for each:
 * the event LANDS, in the one `activities` table with no subjects; and its
 * payload carries no VALUE that could identify the owner.
 *
 * Against real D1, through the real recorder, because the second claim is about
 * what is actually stored — a payload assertion against an in-memory object
 * would not see a serialiser that kept more than it was given.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  APP_PREFERENCES_CHANGED,
  RECORDABLE_PREFERENCE_FIELDS,
  preferencesChangedPayload,
} from "~/kernel/preferences";
import { createWorkspaceEventRecorder } from "~/platform/storage/d1";

import {
  ensureWorkspace,
  makeActivityRepository,
  makeContext,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_pref_events";
const CTX = makeContext(WS);

const OWNER = createActivityActorContext({
  type: "user",
  id: "access-subject-1",
});

function recorder() {
  return createWorkspaceEventRecorder(env.DB, CTX, {
    actorContext: OWNER,
    idGenerator: sequentialIds("pref"),
    clock: () => new Date("2026-08-25T09:00:00.000Z"),
  });
}

/**
 * A patch whose every VALUE is a string a person could be identified by, and
 * which appears nowhere else in the fixture. If any of these reaches the stored
 * row, the payload is leaking.
 */
const IDENTIFYING = {
  timezone: "Pacific/Kiritimati",
  dateFormat: "dmy",
  defaultTaskCaptureParentId: "e-the-owners-secret-project",
  defaultTaskViewId: "view-things-i-am-avoiding",
  navigation: { version: 1, hiddenModuleIds: ["diary", "people"] },
} as const;

describe("DEBT-33 — preference changes in the workspace feed (real D1)", () => {
  beforeEach(async () => {
    await resetTables([WS]);
    await ensureWorkspace(WS);
  });

  it("appends a subject-less event the workspace feed returns", async () => {
    const payload = preferencesChangedPayload({ timezone: "Europe/Lisbon" });
    expect(payload).not.toBeNull();
    await recorder().record({
      type: APP_PREFERENCES_CHANGED,
      payload: payload!,
    });

    const page = await makeActivityRepository(CTX).listForWorkspace({
      type: APP_PREFERENCES_CHANGED,
    });
    expect(page.items).toHaveLength(1);
    const [event] = page.items;
    expect(event.type).toBe(APP_PREFERENCES_CHANGED);
    // No subjects: it is about no record, so it must not reach any Timeline.
    expect(event.subjects).toEqual([]);
    expect(event.payload).toEqual({ fields: ["timezone"] });
    // The actor is the bound one; `record` takes no actor parameter at all.
    expect(event.actor).toEqual({ type: "user", id: "access-subject-1" });
  });

  it("carries NO preference value, checked against what D1 actually stored", async () => {
    const payload = preferencesChangedPayload(IDENTIFYING);
    expect(payload).not.toBeNull();
    await recorder().record({
      type: APP_PREFERENCES_CHANGED,
      payload: payload!,
    });

    const row = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE workspace_id = ? AND type = ?",
    )
      .bind(WS, APP_PREFERENCES_CHANGED)
      .first<{ payload_json: string }>();
    const stored = row?.payload_json ?? "";

    /*
     * The assertion is over the stored TEXT rather than a parsed object,
     * deliberately: a value nested inside a structure a future payload grew
     * would still be a leak, and a shape-based check would not see it.
     */
    for (const value of [
      IDENTIFYING.timezone,
      IDENTIFYING.defaultTaskCaptureParentId,
      IDENTIFYING.defaultTaskViewId,
      ...IDENTIFYING.navigation.hiddenModuleIds,
      IDENTIFYING.dateFormat,
    ]) {
      expect(
        stored,
        `the stored payload contains the preference VALUE "${value}" — a ` +
          "preference change may record WHAT changed and never what it " +
          "changed to (DEBT-33)",
      ).not.toContain(value);
    }

    // And it does carry the names, sorted, so the feed can say what changed.
    expect(JSON.parse(stored)).toEqual({
      fields: [
        "dateFormat",
        "defaultTaskCaptureParentId",
        "defaultTaskViewId",
        "navigation",
        "timezone",
      ],
    });
  });

  it("drops a key nobody declared rather than trusting it", async () => {
    /*
     * The allowlist is the safety property, not a convenience: a future
     * preference key whose NAME carries something identifying (a saved-view
     * title, a person's name) cannot reach the payload by being added to the
     * preferences type. It has to be added to `RECORDABLE_PREFERENCE_FIELDS`,
     * which is a deliberate act — and this is the test that makes it one.
     */
    const payload = preferencesChangedPayload({
      timezone: "Europe/Lisbon",
      secretNoteAbout: "Dr Chen",
      "": "empty",
    });
    expect(payload).toEqual({ fields: ["timezone"] });
    expect(RECORDABLE_PREFERENCE_FIELDS).not.toContain("secretNoteAbout");
  });

  it("records nothing at all for a patch that changes no preference", () => {
    // `null` rather than an empty payload: "the owner changed nothing" is noise
    // in a stream a person reads.
    expect(preferencesChangedPayload({})).toBeNull();
    expect(preferencesChangedPayload({ notAPreference: 1 })).toBeNull();
  });
});
