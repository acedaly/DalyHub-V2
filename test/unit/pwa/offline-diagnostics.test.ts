/**
 * PWA-11 — the offline surface's diagnostics.
 *
 * Two things are asserted, and the second one matters more than the first:
 *
 *   1. **Classification.** A failed module load, an IndexedDB failure, a service
 *      worker failure and an authentication redirect must be TOLD APART, because
 *      the whole point of this channel is that "the offline page crashed" was not
 *      a diagnosable statement.
 *   2. **Redaction.** DalyHub is behind Cloudflare Access and an Access redirect
 *      carries a token in its query string. A diagnostics channel that keeps urls
 *      verbatim is a credential leak wearing a debugging feature's clothes, so
 *      the redaction rules are asserted against real token shapes.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OFFLINE_DIAGNOSTIC_LIMIT,
  classifyOfflineFailure,
  installOfflineDiagnostics,
  readOfflineDiagnostics,
  recordOfflineDiagnostic,
  redactDetail,
  redactUrl,
  resetOfflineDiagnostics,
  subscribeOfflineDiagnostics,
  summariseOfflineDiagnostics,
} from "~/shared/offline/diagnostics";

beforeEach(() => {
  resetOfflineDiagnostics();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  resetOfflineDiagnostics();
  vi.restoreAllMocks();
});

describe("classifyOfflineFailure", () => {
  it("recognises a failed dynamic module import", () => {
    // This is the exact shape of the failure that caused the iPhone loop: a
    // route module that could not be fetched with no connection.
    expect(
      classifyOfflineFailure({
        message: "Failed to fetch dynamically imported module: /assets/x.js",
      }),
    ).toBe("moduleLoad");
    expect(
      classifyOfflineFailure({
        message: "Importing a module script failed.",
      }),
    ).toBe("moduleLoad");
    expect(classifyOfflineFailure({ source: "script" })).toBe("moduleLoad");
    expect(classifyOfflineFailure({ source: "link" })).toBe("moduleLoad");
  });

  it("recognises HTML arriving where JavaScript was expected", () => {
    // The other half of the same crash: a worker that answers a script request
    // with a document. It must be visible as a MODULE failure, not as generic
    // noise, because it points at the service worker rather than at the app.
    expect(classifyOfflineFailure({ message: "Unexpected token '<'" })).toBe(
      "moduleLoad",
    );
  });

  it("recognises an IndexedDB failure", () => {
    expect(classifyOfflineFailure({ name: "VersionError" })).toBe("indexedDb");
    expect(
      classifyOfflineFailure({
        message: "The offline database is incomplete.",
      }),
    ).toBe("indexedDb");
  });

  it("recognises storage that this browser will not provide", () => {
    expect(classifyOfflineFailure({ name: "QuotaExceededError" })).toBe(
      "storageUnavailable",
    );
    expect(
      classifyOfflineFailure({
        message: "This browser is not storing offline data (private mode…).",
      }),
    ).toBe("storageUnavailable");
  });

  it("recognises a service-worker failure", () => {
    expect(
      classifyOfflineFailure({
        message: "ServiceWorker script evaluation failed",
      }),
    ).toBe("serviceWorker");
  });

  it("recognises an authentication boundary", () => {
    expect(
      classifyOfflineFailure({ message: "Your DalyHub sign-in has expired." }),
    ).toBe("authRedirect");
  });

  it("recognises unusable stored data", () => {
    expect(
      classifyOfflineFailure({
        name: "SyntaxError",
        message: "Unexpected end of JSON input",
      }),
    ).toBe("snapshotCorrupt");
  });

  it("recognises an ordinary offline request failure", () => {
    expect(
      classifyOfflineFailure({ name: "TypeError", message: "Load failed" }),
    ).toBe("network");
  });

  it("falls back to runtime rather than guessing", () => {
    expect(classifyOfflineFailure({ message: "something else entirely" })).toBe(
      "runtime",
    );
  });
});

describe("redaction", () => {
  it("removes the query string, which is where an Access token lives", () => {
    expect(
      redactUrl(
        "https://hub.example.invalid/cdn-cgi/access/login?token=abc123&redirect_url=/today",
      ),
    ).toBe("https://hub.example.invalid/cdn-cgi/access/login");
  });

  it("keeps a bare path readable", () => {
    expect(redactUrl("/assets/entry-abc.js")).toBe("/assets/entry-abc.js");
  });

  it("replaces anything token-shaped left in a message", () => {
    const detail = redactDetail(
      "Rejected with CF_Authorization=eyJhbGciOiJSUzI1NiIsImtpZCI6InNvbWVraWQifQ",
    );
    expect(detail).not.toContain("eyJhbGciOiJSUzI1NiIs");
    expect(detail).toContain("[redacted]");
  });

  it("strips the query string wherever it appears in a message", () => {
    expect(
      redactDetail(
        "GET https://hub.example.invalid/offline/snapshot?since=2026-08-02 failed",
      ),
    ).not.toContain("since=");
  });

  it("bounds the length, so one enormous error cannot fill the ring", () => {
    expect(redactDetail("x".repeat(5_000)).length).toBeLessThanOrEqual(160);
  });

  it("describes an Error by name and message, never by stack", () => {
    const error = new Error("The offline database could not be read.");
    expect(redactDetail(error)).toBe(
      "Error: The offline database could not be read.",
    );
  });
});

describe("the ring", () => {
  it("keeps the newest entries and never grows without bound", () => {
    for (let index = 0; index < OFFLINE_DIAGNOSTIC_LIMIT + 10; index += 1) {
      recordOfflineDiagnostic("runtime", `failure ${index}`);
    }
    const entries = readOfflineDiagnostics();
    expect(entries).toHaveLength(OFFLINE_DIAGNOSTIC_LIMIT);
    expect(entries.at(-1)?.detail).toBe(
      `failure ${OFFLINE_DIAGNOSTIC_LIMIT + 9}`,
    );
  });

  it("writes to the console at most once per code, so it cannot become the loop", () => {
    const warn = vi.spyOn(console, "warn");
    for (let index = 0; index < 50; index += 1) {
      recordOfflineDiagnostic("moduleLoad", "again");
    }
    recordOfflineDiagnostic("indexedDb", "different");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("summarises by code with a count and the last occurrence", () => {
    recordOfflineDiagnostic("moduleLoad", "first");
    recordOfflineDiagnostic("indexedDb", "db");
    recordOfflineDiagnostic("moduleLoad", "second");

    const summary = summariseOfflineDiagnostics();
    const modules = summary.find((row) => row.code === "moduleLoad");
    expect(modules?.count).toBe(2);
    expect(modules?.lastDetail).toBe("second");
  });

  it("notifies subscribers", () => {
    const seen = vi.fn();
    const stop = subscribeOfflineDiagnostics(seen);
    recordOfflineDiagnostic("network", "offline");
    expect(seen).toHaveBeenCalledTimes(1);
    stop();
    recordOfflineDiagnostic("network", "offline again");
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("installOfflineDiagnostics", () => {
  it("captures an unhandled rejection and classifies it", () => {
    const stop = installOfflineDiagnostics();
    // happy-dom does not synthesise `unhandledrejection` from a real rejected
    // promise, so the event is dispatched directly — which is the same object
    // the listener receives in a browser.
    const event = new Event("unhandledrejection") as Event & {
      reason?: unknown;
    };
    event.reason = new TypeError(
      "Failed to fetch dynamically imported module: /assets/today.js",
    );
    window.dispatchEvent(event);

    expect(readOfflineDiagnostics().at(-1)?.code).toBe("moduleLoad");
    stop();
  });

  it("captures a failed resource element, whose error does not bubble", () => {
    // A `<link>` rather than a `<script>` only because the test DOM refuses to
    // hold a script element with a src it cannot fetch. Both take the identical
    // branch in the listener, and both are the same fact: a file the application
    // shell needs is not on this device.
    const stop = installOfflineDiagnostics();
    const link = document.createElement("link");
    link.setAttribute("href", "/assets/route-abc.css");
    document.head.appendChild(link);
    link.dispatchEvent(new Event("error"));

    const last = readOfflineDiagnostics().at(-1);
    expect(last?.code).toBe("moduleLoad");
    expect(last?.detail).toContain("/assets/route-abc.css");
    stop();
    link.remove();
  });

  it("is idempotent, so a re-render cannot double-record", () => {
    const first = installOfflineDiagnostics();
    const second = installOfflineDiagnostics();
    const event = new Event("unhandledrejection") as Event & {
      reason?: unknown;
    };
    event.reason = new Error("boom");
    window.dispatchEvent(event);

    expect(readOfflineDiagnostics()).toHaveLength(1);
    first();
    second();
  });
});
