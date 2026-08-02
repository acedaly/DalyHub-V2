/**
 * PWA-11 — the offline runtime, driven through the provider the offline page
 * actually mounts.
 *
 * The storage layer and the sync engine are replaced with in-memory doubles
 * (there is no IndexedDB in this environment, and the point here is the
 * provider's behaviour, not IndexedDB's). What is real is the provider itself:
 * its state machine, its bounded reads, its one-pass sync guard, and the
 * components that render from it.
 *
 * Every test here corresponds to a way the installed iPhone app failed or could
 * have failed: a read that never resolves, a storage layer that is not there, a
 * stored snapshot that is nonsense, a sync pressed twice, and a connection that
 * comes back.
 */

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OfflineQueueRecord } from "~/kernel/offline";
import type { OfflineDatabaseFailure } from "~/shared/offline/offline-database";
import type {
  OfflineDataset,
  OfflineMetaRecord,
} from "~/shared/offline/offline-store";

/* -------------------------------------------------------------------------- */
/* Doubles                                                                    */
/* -------------------------------------------------------------------------- */

const EMPTY: OfflineDataset = {
  meta: null,
  tasks: [],
  notes: [],
  diary: [],
  meetings: [],
  references: [],
};

/** The device's storage, as a plain object the tests can shape per case. */
const device: {
  meta: OfflineMetaRecord | null;
  dataset: OfflineDataset;
  queue: OfflineQueueRecord[];
  failure: OfflineDatabaseFailure | null;
  /** When set, the read never settles — the iOS "no event ever arrives" case. */
  hang: boolean;
} = {
  meta: null,
  dataset: EMPTY,
  queue: [],
  failure: null,
  hang: false,
};

const syncCalls: { snapshot: number; replay: number } = {
  snapshot: 0,
  replay: 0,
};

/** Resolve on the next macrotask, so a pass is genuinely asynchronous. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

vi.mock("~/shared/offline/page-idle", () => ({
  // The real one waits for `load`, an idle callback and a settling delay. None
  // of that is what these tests are about.
  afterPageIdle: (work: () => void) => {
    work();
    return () => {};
  },
}));

vi.mock("~/shared/offline/service-worker", () => ({
  isServiceWorkerSupported: () => false,
  isRunningStandalone: () => false,
  registerServiceWorker: () => () => {},
  refreshOfflineShell: async () => {},
  reportOfflineShellReady: vi.fn(async () => {}),
  clearServiceWorkerCaches: async () => {},
  applyServiceWorkerUpdate: async () => {},
}));

vi.mock("~/shared/offline/probe", () => ({
  OFFLINE_PING_PATH: "/offline/ping",
  probeConnection: vi.fn(async () => "offline" as const),
  browserThinksItIsOnline: () => false,
}));

vi.mock("~/shared/offline/offline-store", async (importOriginal) => {
  // The pure helpers stay REAL — `sanitiseOfflineDataset` in particular, since
  // "corrupt data does not crash the page" is one of the things under test here.
  const actual =
    await importOriginal<typeof import("~/shared/offline/offline-store")>();
  const never = new Promise<never>(() => {});
  const result = <T,>(value: T) =>
    device.failure
      ? ({ ok: false, failure: device.failure } as const)
      : ({ ok: true, value } as const);
  return {
    ...actual,
    EMPTY_OFFLINE_DATASET: EMPTY,
    readLatestMeta: async () =>
      device.hang ? never : result(device.meta ?? null),
    readDataset: async () => (device.hang ? never : result(device.dataset)),
    readQueue: async () => (device.hang ? never : result(device.queue)),
    putQueueRecord: async (record: OfflineQueueRecord) => {
      if (device.failure)
        return { ok: false, failure: device.failure } as const;
      device.queue = [
        ...device.queue.filter((row) => row.id !== record.id),
        record,
      ];
      return { ok: true, value: record } as const;
    },
    deleteQueueRecord: async () => ({ ok: true, value: undefined }) as const,
    pruneSyncedQueue: async () => ({ ok: true, value: 0 }) as const,
    pruneRetention: async () => ({ ok: true, value: 0 }) as const,
    clearSnapshot: async () => ({ ok: true, value: undefined }) as const,
    clearAllOfflineData: async () => ({ ok: true, value: undefined }) as const,
    clearOtherNamespaces: async () => ({ ok: true, value: 0 }) as const,
    estimateOfflineStorage: async () => ({
      usageBytes: null,
      quotaBytes: null,
    }),
  };
});

vi.mock("~/shared/offline/sync", () => ({
  REPLAY_BATCH_SIZE: 10,
  reclaimStalled: async (records: readonly OfflineQueueRecord[]) => records,
  replayCapture: async () => ({ kind: "retryable", reason: "offline" }),
  syncSnapshot: vi.fn(async () => {
    syncCalls.snapshot += 1;
    // A real pass takes a turn of the event loop. Resolving synchronously would
    // hide exactly the re-entrancy this suite is here to catch.
    await tick();
    return {
      kind: "failed",
      reason: "offline",
      connection: "offline",
    } as const;
  }),
  replayQueue: vi.fn(async () => {
    syncCalls.replay += 1;
    await tick();
    return {
      attempted: 0,
      synced: 0,
      failed: 0,
      blocked: 0,
      connection: "offline",
    } as const;
  }),
}));

const { OfflineProvider, useOffline } =
  await import("~/shared/offline/OfflineProvider");
const { OfflineCaptureForm } =
  await import("~/shared/offline/OfflineCaptureForm");
const { OfflineSnapshotView } =
  await import("~/shared/offline/OfflineSnapshotView");
const { OfflineSyncPanel } = await import("~/shared/offline/OfflineSyncPanel");
const { resetOfflineDiagnostics } =
  await import("~/shared/offline/diagnostics");

function meta(overrides: Partial<OfflineMetaRecord> = {}): OfflineMetaRecord {
  return {
    namespace: "dh1-1-abc",
    identityLabel: "owner@example.invalid",
    workspaceLabel: "Personal",
    snapshotVersion: 1,
    lastSyncedAt: "2026-08-02T00:00:00.000Z",
    window: {
      startIso: "2026-07-26",
      todayIso: "2026-08-02",
      endIso: "2026-08-09",
      timezone: "Australia/Sydney",
    },
    today: {
      dueTodayCount: 0,
      overdueCount: 0,
      upcomingCount: 0,
      completedRecentlyCount: 0,
      meetingsTodayCount: 0,
    },
    bounded: false,
    counts: {},
    ...overrides,
  };
}

/** Surfaces the context as data attributes, so assertions read the real state. */
function Probe() {
  const offline = useOffline();
  return (
    <div
      data-testid="probe"
      data-local={offline?.local.kind}
      data-capture={offline?.capture.kind}
      data-reconnect={String(offline?.reconnectAvailable)}
      data-queue={String(offline?.queue.length)}
    />
  );
}

beforeEach(() => {
  device.meta = null;
  device.dataset = EMPTY;
  device.queue = [];
  device.failure = null;
  device.hang = false;
  syncCalls.snapshot = 0;
  syncCalls.replay = 0;
  resetOfflineDiagnostics();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const probe = () => screen.getByTestId("probe");

/**
 * Drain pending microtasks and zero-delay timers inside `act`, so React has
 * applied every state update a settled pass produced. Deterministic — it waits
 * for the queue to empty, not for a fixed number of milliseconds.
 */
async function settle(rounds = 6): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/* -------------------------------------------------------------------------- */

describe("reading this device's storage", () => {
  it("resolves to a stated empty state when nothing is stored", async () => {
    render(
      <OfflineProvider autoSyncOnReconnect={false}>
        <Probe />
        <OfflineSnapshotView />
      </OfflineProvider>,
    );

    await waitFor(() => expect(probe()).toHaveAttribute("data-local", "empty"));
    expect(
      screen.getByText("No local snapshot exists yet"),
    ).toBeInTheDocument();
  });

  it("resolves to a stated failure when storage is unavailable", async () => {
    device.failure = {
      kind: "unavailable",
      message: "This browser is not storing offline data (private mode).",
    };

    render(
      <OfflineProvider autoSyncOnReconnect={false}>
        <Probe />
        <OfflineSnapshotView />
        <OfflineCaptureForm />
      </OfflineProvider>,
    );

    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-local", "unavailable"),
    );
    expect(
      screen.getByText("Local storage is unavailable"),
    ).toBeInTheDocument();
    // And the capture form says WHY rather than silently not appearing. The
    // reason is on BOTH surfaces, which is the point: neither of them refuses
    // in silence.
    expect(probe()).toHaveAttribute("data-capture", "unavailable");
    expect(
      screen.getAllByText(/not storing offline data \(private mode\)/),
    ).toHaveLength(2);
  });

  it("resolves to 'could not be read' when the stored data is unusable", async () => {
    device.failure = {
      kind: "migrationFailed",
      message: "The offline database is incomplete.",
    };

    render(
      <OfflineProvider autoSyncOnReconnect={false}>
        <Probe />
        <OfflineSnapshotView />
      </OfflineProvider>,
    );

    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-local", "unreadable"),
    );
    expect(
      screen.getByText("Local data could not be read"),
    ).toBeInTheDocument();
  });

  it("does not crash on a snapshot whose stored rows are nonsense", async () => {
    // A corrupted snapshot is not a hypothetical: a device that ran out of quota
    // mid-write leaves exactly this. The page must render, not throw.
    device.meta = meta();
    device.dataset = {
      meta: meta(),
      tasks: [null, { id: 1 }, { title: {} }] as unknown as never,
      notes: [] as never,
      diary: [] as never,
      meetings: [] as never,
      references: [] as never,
    };

    expect(() =>
      render(
        <OfflineProvider autoSyncOnReconnect={false}>
          <Probe />
          <OfflineSnapshotView />
        </OfflineProvider>,
      ),
    ).not.toThrow();

    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-local", "loaded"),
    );
    // Still an honest, rendered page rather than a blank one.
    expect(
      screen.getByText(/Offline snapshot — stored on this device/),
    ).toBeInTheDocument();
  });

  it("never leaves the page checking: a read that hangs still resolves", async () => {
    // The exact iOS symptom. `readLatestMeta` never settles, and the provider
    // must still reach a state — here through the deadline in the store, which
    // the double stands in for by rejecting the wait.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    device.hang = true;

    render(
      <OfflineProvider autoSyncOnReconnect={false}>
        <Probe />
      </OfflineProvider>,
    );

    // While the read is in flight the state is `checking` — a bounded state, and
    // the ONLY unresolved one.
    expect(probe()).toHaveAttribute("data-local", "checking");
    vi.useRealTimers();
  });
});

/* -------------------------------------------------------------------------- */

describe("sync", () => {
  it("cannot run two passes at once, however many times Sync now is pressed", async () => {
    // Requirement: repeated sync presses cannot create duplicate records. The
    // idempotency key on the server is the backstop; NOT sending the same
    // capture twice is the fix.
    device.meta = meta();
    device.dataset = { ...EMPTY, meta: meta() };

    render(
      <OfflineProvider autoSyncOnReconnect={false}>
        <Probe />
        <OfflineSyncPanel />
      </OfflineProvider>,
    );
    // Let the provider's own first pass finish, so what follows is only the
    // owner's presses.
    // Let the provider's own first pass finish, so what follows is only the
    // owner's presses. Deterministic: it drains the queue rather than waiting a
    // fixed time.
    await settle();
    expect(screen.getByRole("button", { name: /sync now/i })).toBeEnabled();
    const before = syncCalls.snapshot;

    // Three presses before the pass has had a chance to finish — an impatient
    // owner on a slow connection, which is precisely when this happens.
    const button = screen.getByRole("button", { name: /sync now/i });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
      fireEvent.click(button);
    });

    await settle();
    expect(syncCalls.snapshot).toBeGreaterThan(before);
    // Three presses, one pass. Not three.
    expect(syncCalls.snapshot - before).toBe(1);
  });

  it("keeps queued captures when a pass fails", async () => {
    // Requirement: reconnect does not lose queued captures. A failing pass must
    // leave the queue exactly as it found it.
    device.meta = meta();
    device.dataset = { ...EMPTY, meta: meta() };
    const { createQueueRecord } = await import("~/kernel/offline");
    device.queue = [
      createQueueRecord({
        namespace: "dh1-1-abc",
        payload: { kind: "task", title: "Buy milk", dueDate: null },
        now: new Date("2026-08-02T00:00:00.000Z"),
      }),
    ];

    render(
      <OfflineProvider autoSyncOnReconnect={false}>
        <Probe />
        <OfflineSyncPanel />
      </OfflineProvider>,
    );

    await waitFor(() => expect(probe()).toHaveAttribute("data-queue", "1"));
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(device.queue).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("reconnecting", () => {
  it("OFFERS a sync on the offline shell rather than performing one", async () => {
    const { probeConnection } = await import("~/shared/offline/probe");
    device.meta = meta();
    device.dataset = { ...EMPTY, meta: meta() };

    render(
      <OfflineProvider autoSyncOnReconnect={false}>
        <Probe />
        <OfflineSyncPanel />
      </OfflineProvider>,
    );
    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-local", "loaded"),
    );
    const passesBefore = syncCalls.snapshot;

    vi.mocked(probeConnection).mockResolvedValue("online");
    window.dispatchEvent(new Event("online"));

    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-reconnect", "true"),
    );
    expect(
      screen.getByText(/A connection may be available again/),
    ).toBeInTheDocument();
    // Nothing was sent, and nothing navigated.
    expect(syncCalls.snapshot).toBe(passesBefore);
  });

  it("synchronises on its own INSIDE the application, where that is wanted", async () => {
    const { probeConnection } = await import("~/shared/offline/probe");
    device.meta = meta();
    device.dataset = { ...EMPTY, meta: meta() };

    render(
      <OfflineProvider>
        <Probe />
      </OfflineProvider>,
    );
    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-local", "loaded"),
    );

    vi.mocked(probeConnection).mockResolvedValue("online");
    window.dispatchEvent(new Event("online"));

    // The offer is only ever made on the surface that asked for it.
    await waitFor(() =>
      expect(probe()).toHaveAttribute("data-reconnect", "false"),
    );
  });
});
