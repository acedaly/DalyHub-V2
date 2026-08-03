/**
 * PWA-11 — nothing in the offline path may navigate the page.
 *
 * There is exactly one `location.reload()` in DalyHub's own code: the one that
 * makes a service-worker update real. Everything here is about proving that it
 * fires at most ONCE per page lifecycle, and that the other three candidates for
 * an unwanted navigation — a controller change, an expired Cloudflare Access
 * session while offline, and a connection coming back — do not navigate at all.
 *
 * Those four are the complete set of ways an installed PWA can put itself into
 * the restart loop WebKit terminates.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQueueRecord } from "~/kernel/offline";
import {
  applyServiceWorkerUpdate,
  hasUsedUpdateReload,
  resetUpdateReloadGuardForTests,
} from "~/shared/offline/service-worker";
import { replayCapture, syncSnapshot } from "~/shared/offline/sync";

/* -------------------------------------------------------------------------- */
/* A service-worker registration whose controller can be changed on demand     */
/* -------------------------------------------------------------------------- */

function installServiceWorkerDouble() {
  const listeners: (() => void)[] = [];
  const waiting = { postMessage: vi.fn() };
  const container = {
    controller: {},
    addEventListener(type: string, listener: () => void) {
      if (type === "controllerchange") listeners.push(listener);
    },
    removeEventListener() {},
    getRegistration: async () => ({ waiting }),
    ready: Promise.resolve({ active: waiting }),
    register: vi.fn(),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: container,
    configurable: true,
  });
  return {
    waiting,
    /** Fire `controllerchange`, exactly as an activating worker does. */
    changeController: () => listeners.forEach((listener) => listener()),
    listenerCount: () => listeners.length,
  };
}

const reload = vi.fn();

beforeEach(() => {
  resetUpdateReloadGuardForTests();
  reload.mockClear();
  Object.defineProperty(window, "location", {
    value: { reload, href: "https://hub.example.invalid/offline" },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "isSecureContext", {
    value: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the service-worker update reload", () => {
  it("reloads once when the controller changes", async () => {
    const worker = installServiceWorkerDouble();

    await applyServiceWorkerUpdate();
    worker.changeController();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(hasUsedUpdateReload()).toBe(true);
  });

  it("cannot reload twice, however many times the controller changes", async () => {
    const worker = installServiceWorkerDouble();

    await applyServiceWorkerUpdate();
    worker.changeController();
    worker.changeController();
    worker.changeController();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("cannot reload twice when the update is applied more than once", async () => {
    // The regression this guard was written for: the flag used to be LOCAL to
    // the call, so a second press installed a second listener with a second
    // budget — and two presses meant two reloads.
    const worker = installServiceWorkerDouble();

    await applyServiceWorkerUpdate();
    await applyServiceWorkerUpdate();
    await applyServiceWorkerUpdate();
    expect(worker.listenerCount()).toBe(1);

    worker.changeController();
    worker.changeController();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing at all when no worker is waiting", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        controller: {},
        addEventListener() {},
        removeEventListener() {},
        getRegistration: async () => ({ waiting: null }),
      },
      configurable: true,
    });

    await applyServiceWorkerUpdate();

    expect(reload).not.toHaveBeenCalled();
    expect(hasUsedUpdateReload()).toBe(false);
  });
});

describe("an expired Cloudflare Access session while offline", () => {
  it("never navigates: a blocked replay reports, it does not redirect", async () => {
    // Access answers an unauthenticated request with a cross-origin redirect,
    // which `redirect: "manual"` surfaces as an opaque redirect. The queue must
    // record "waiting for sign-in" and stop. Following it — or reloading after
    // it — is how an offline page ends up bouncing between DalyHub and an
    // identity provider until the platform kills it.
    const record = createQueueRecord({
      namespace: "dh1-1-abc",
      payload: { kind: "task", title: "Buy milk", dueDate: null },
      now: new Date("2026-08-02T00:00:00.000Z"),
    });
    const fetchImpl = vi.fn(async () => {
      const response = new Response(null, { status: 0 });
      Object.defineProperty(response, "type", { value: "opaqueredirect" });
      return response;
    });

    const outcome = await replayCapture(
      record,
      fetchImpl as unknown as typeof fetch,
    );

    expect(outcome.kind).toBe("blocked");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // The capture is still the device's, and the page is still the page.
    expect(reload).not.toHaveBeenCalled();
    expect(window.location.href).toBe("https://hub.example.invalid/offline");
  });

  it("never navigates when the snapshot request is answered by Access", async () => {
    const fetchImpl = vi.fn(async () => {
      const response = new Response(null, { status: 0 });
      Object.defineProperty(response, "type", { value: "opaqueredirect" });
      return response;
    });

    const result = await syncSnapshot({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("skipped");
    if (result.kind === "skipped")
      expect(result.connection).toBe("authRequired");
    expect(reload).not.toHaveBeenCalled();
  });

  it("never navigates when there is simply no network", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Load failed");
    });

    const result = await syncSnapshot({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.kind).toBe("failed");
    expect(reload).not.toHaveBeenCalled();
  });
});
