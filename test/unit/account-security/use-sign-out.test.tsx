/**
 * SET-03 / DEBT-68 — the sign-out path DalyHub owns.
 *
 * The behaviour under test is an ORDER and a DISTINCTION, and both are load-bearing:
 *
 *   - the device is cleared BEFORE the browser leaves, because after the
 *     navigation nothing on this page can run;
 *   - unsynchronised captures are PRESERVED, because they exist nowhere else,
 *     while a device with nothing pending is emptied completely.
 *
 * Neither is visible from the rendered output, so these drive the hook directly
 * and assert the call sequence.
 */

import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSignOut } from "~/shared/account-security";
import { RECENT_SEARCH_STORAGE_KEY } from "~/shared/search/recent";

/** Everything the hook did, in the order it did it. */
let trace: string[] = [];

/** A minimal offline context double, with a controllable queue depth. */
function offlineDouble(queued: number) {
  return {
    status: {
      pendingCaptures: queued,
      failedCaptures: 0,
      connection: "online",
      sync: "idle",
      lastSyncedAt: null,
    },
    meta: null,
    resetDevice: vi.fn(async () => {
      trace.push("resetDevice");
    }),
    clearCachedData: vi.fn(async () => {
      trace.push("clearCachedData");
    }),
  };
}

let offlineValue: ReturnType<typeof offlineDouble> | null = null;

vi.mock("~/shared/offline", () => ({
  useOffline: () => offlineValue,
  clearServiceWorkerCaches: async () => {
    trace.push("clearServiceWorkerCaches");
  },
}));

/** Drive the hook and expose its result to the test. */
function renderSignOut(navigate: (url: string) => void) {
  const result: { current: ReturnType<typeof useSignOut> | null } = {
    current: null,
  };
  function Probe() {
    result.current = useSignOut({ navigate });
    return null;
  }
  render(<Probe />);
  return result;
}

describe("useSignOut", () => {
  beforeEach(() => {
    trace = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        trace.push(`fetch ${url}`);
        return new Response("{}", { status: 200 });
      }),
    );
    window.localStorage.setItem(RECENT_SEARCH_STORAGE_KEY, "[]");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    offlineValue = null;
  });

  it("empties a device with nothing pending, then records, then leaves", async () => {
    offlineValue = offlineDouble(0);
    const navigate = vi.fn((url: string) => trace.push(`navigate ${url}`));
    const hook = renderSignOut(navigate);

    await act(async () => {
      await hook.current?.signOut();
    });

    // The whole device is cleared (the offline database included) because
    // nothing on it exists only here.
    expect(trace).toEqual([
      "resetDevice",
      "fetch /settings/account-security/sign-out",
      "navigate /cdn-cgi/access/logout",
    ]);
    // Personal Web Storage went with it.
    expect(window.localStorage.getItem(RECENT_SEARCH_STORAGE_KEY)).toBeNull();
  });

  // The distinction this whole feature turns on. Unsynchronised work is the one
  // class of local data with no copy on the server, so sign-out must not take it.
  it("preserves unsynchronised captures, clearing only reproducible data", async () => {
    offlineValue = offlineDouble(3);
    const navigate = vi.fn((url: string) => trace.push(`navigate ${url}`));
    const hook = renderSignOut(navigate);

    await act(async () => {
      await hook.current?.signOut();
    });

    expect(offlineValue.resetDevice).not.toHaveBeenCalled();
    expect(trace).toEqual([
      "clearCachedData",
      "clearServiceWorkerCaches",
      "fetch /settings/account-security/sign-out",
      "navigate /cdn-cgi/access/logout",
    ]);
  });

  it("reports the queue depth so the surface can warn before anyone clicks", () => {
    offlineValue = offlineDouble(2);
    const hook = renderSignOut(vi.fn());
    expect(hook.current?.queuedCaptures).toBe(2);
  });

  // Recording is valuable; being able to leave is more valuable. A failed history
  // write must not strand the owner on a device they are walking away from.
  it("still signs out when recording the event fails", async () => {
    offlineValue = offlineDouble(0);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const navigate = vi.fn((url: string) => trace.push(`navigate ${url}`));
    const hook = renderSignOut(navigate);

    await act(async () => {
      await hook.current?.signOut();
    });

    expect(navigate).toHaveBeenCalledWith("/cdn-cgi/access/logout");
  });

  // Same rule, one level down: storage that cannot be cleared could not be read
  // either, and refusing to sign out over it would be the wrong trade.
  it("still signs out when the device cannot be cleared", async () => {
    offlineValue = offlineDouble(0);
    offlineValue.resetDevice = vi.fn(async () => {
      throw new Error("IndexedDB unavailable");
    });
    const navigate = vi.fn();
    const hook = renderSignOut(navigate);

    await act(async () => {
      await hook.current?.signOut();
    });

    expect(navigate).toHaveBeenCalledWith("/cdn-cgi/access/logout");
    // …and the recorded event says the clear did NOT happen, rather than
    // claiming one that did not.
    const body = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as RequestInit;
    expect((body.body as FormData).get("localSnapshotCleared")).toBe("0");
  });
});
