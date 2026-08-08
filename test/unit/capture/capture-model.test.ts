/**
 * MOBILE-01 — the shared Quick Capture model.
 *
 * Covers the capture-type memory (session-scoped, storage-failure-safe, never
 * making another type unreachable) and the Meeting start-time default's rounding.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CAPTURE_TYPES,
  CAPTURE_TYPE_DESCRIPTORS,
  CAPTURE_TYPE_SESSION_KEY,
  captureDescriptor,
  defaultMeetingStartLocal,
  isCaptureType,
  readRememberedCaptureType,
  rememberCaptureType,
  resolveInitialCaptureType,
} from "~/shared/capture/capture-model";
import { utcToOwnerLocal } from "~/shared/datetime";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("capture types", () => {
  it("describes every capture type exactly once", () => {
    expect(CAPTURE_TYPE_DESCRIPTORS.map((d) => d.type)).toEqual([
      ...CAPTURE_TYPES,
    ]);
  });

  it("gives every type an entity identity and a human label", () => {
    for (const descriptor of CAPTURE_TYPE_DESCRIPTORS) {
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.description.length).toBeGreaterThan(0);
      expect(descriptor.entityType.length).toBeGreaterThan(0);
    }
  });

  it("resolves a descriptor for every type", () => {
    for (const type of CAPTURE_TYPES) {
      expect(captureDescriptor(type).type).toBe(type);
    }
  });

  it("offers Asset from the global capture surface (ASSET-03)", () => {
    // The gap ASSET-03 closed: recording something you own required navigating
    // to Assets and finding a module-specific button. It is now one of the
    // types the global `+` offers, last because it is the least routine.
    expect(CAPTURE_TYPES).toContain("asset");
    expect(CAPTURE_TYPES[CAPTURE_TYPES.length - 1]).toBe("asset");
    expect(captureDescriptor("asset").entityType).toBe("asset");
    expect(captureDescriptor("asset").label).toBe("Asset");
  });

  it("narrows only real capture types", () => {
    expect(isCaptureType("task")).toBe(true);
    expect(isCaptureType("project")).toBe(false);
    expect(isCaptureType(undefined)).toBe(false);
  });
});

describe("resolveInitialCaptureType", () => {
  it("prefers an explicitly requested type over the remembered one", () => {
    expect(resolveInitialCaptureType("note", "task")).toBe("note");
  });

  it("falls back to the remembered type", () => {
    expect(resolveInitialCaptureType(undefined, "meeting")).toBe("meeting");
  });

  it("shows the chooser when nothing is remembered or requested", () => {
    expect(resolveInitialCaptureType(undefined, null)).toBeNull();
  });

  it("ignores a corrupted remembered value rather than opening a broken panel", () => {
    expect(resolveInitialCaptureType(undefined, "not-a-type")).toBeNull();
  });
});

describe("capture-type session memory", () => {
  it("round-trips through sessionStorage", () => {
    rememberCaptureType("diary");
    expect(window.sessionStorage.getItem(CAPTURE_TYPE_SESSION_KEY)).toBe(
      "diary",
    );
    expect(readRememberedCaptureType()).toBe("diary");
  });

  it("survives storage being unavailable (private mode) without throwing", () => {
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(() => rememberCaptureType("task")).not.toThrow();
    expect(readRememberedCaptureType()).toBeNull();
  });
});

describe("defaultMeetingStartLocal", () => {
  const TZ = "Australia/Sydney";

  it("rounds up to the next quarter hour", () => {
    // 2026-07-28T00:01:00Z is 10:01 in Sydney (AEST, UTC+10) → 10:15.
    const value = defaultMeetingStartLocal(
      new Date("2026-07-28T00:01:00Z"),
      TZ,
      utcToOwnerLocal,
    );
    expect(value).toBe("2026-07-28T10:15");
  });

  it("leaves a time already on a quarter hour where it is", () => {
    const value = defaultMeetingStartLocal(
      new Date("2026-07-28T00:30:00Z"),
      TZ,
      utcToOwnerLocal,
    );
    expect(value).toBe("2026-07-28T10:30");
  });

  it("resolves in the OWNER's timezone, not the runtime's", () => {
    const sydney = defaultMeetingStartLocal(
      new Date("2026-07-28T00:01:00Z"),
      TZ,
      utcToOwnerLocal,
    );
    const london = defaultMeetingStartLocal(
      new Date("2026-07-28T00:01:00Z"),
      "Europe/London",
      utcToOwnerLocal,
    );
    expect(sydney).not.toBe(london);
    expect(london).toBe("2026-07-28T01:15");
  });

  it("rolls over the hour and the day correctly", () => {
    // 13:50 UTC = 23:50 Sydney → next quarter hour is midnight the following day.
    const value = defaultMeetingStartLocal(
      new Date("2026-07-28T13:50:00Z"),
      TZ,
      utcToOwnerLocal,
    );
    expect(value).toBe("2026-07-29T00:00");
  });
});
