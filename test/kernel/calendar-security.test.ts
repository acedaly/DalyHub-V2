/**
 * CAL-01 — the security boundaries, in the REAL Workers runtime.
 *
 * Three things are proved here that a unit test in Node could not prove, because
 * all three depend on the runtime's own primitives:
 *
 *   - the sealed-secret primitive uses Web Crypto AES-256-GCM as the Workers
 *     runtime provides it, is authenticated, and is bound to its context;
 *   - the feed fetch bounds redirects, revalidates each hop against the URL
 *     policy, and refuses an oversized body while STREAMING it rather than after
 *     buffering it;
 *   - the scheduled handler is inert and silent when nothing is configured.
 */

import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EncryptionKeyUnavailableError,
  SealedSecretError,
  fingerprintSecret,
  importEncryptionKey,
  openSecret,
  sealSecret,
} from "~/kernel/secrets";
import {
  FeedFetchError,
  fetchFeedBody,
  runScheduledCalendarRefresh,
} from "~/platform/calendar";

import {
  HTML_NOT_CALENDAR,
  TEST_FEED_URL,
  workCalendarFeed,
} from "../support/ics-fixtures";

const KEY = btoa("\0".repeat(32));
const OTHER_KEY = btoa("".repeat(32));
const AAD = "dalyhub.calendar.feed_url.v1:workspace-a";

describe("the sealed-secret primitive", () => {
  it("round-trips a value under the same key and context", async () => {
    const key = await importEncryptionKey(KEY);
    const sealed = await sealSecret(key, TEST_FEED_URL, AAD);
    expect(await openSecret(key, sealed, AAD)).toBe(TEST_FEED_URL);
  });

  it("produces a versioned envelope that contains no plaintext", async () => {
    const key = await importEncryptionKey(KEY);
    const sealed = await sealSecret(key, TEST_FEED_URL, AAD);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("calendar.example.com");
    expect(sealed).not.toContain("synthetic");
  });

  it("produces a different ciphertext every time", async () => {
    const key = await importEncryptionKey(KEY);
    const a = await sealSecret(key, TEST_FEED_URL, AAD);
    const b = await sealSecret(key, TEST_FEED_URL, AAD);
    // A fresh IV per seal, so the column leaks nothing by comparison — which is
    // exactly why duplicate detection uses a keyed fingerprint instead.
    expect(a).not.toBe(b);
  });

  it("refuses to open under a different key", async () => {
    const sealed = await sealSecret(
      await importEncryptionKey(KEY),
      TEST_FEED_URL,
      AAD,
    );
    await expect(
      openSecret(await importEncryptionKey(OTHER_KEY), sealed, AAD),
    ).rejects.toBeInstanceOf(SealedSecretError);
  });

  it("refuses to open under a different WORKSPACE", async () => {
    const key = await importEncryptionKey(KEY);
    const sealed = await sealSecret(key, TEST_FEED_URL, AAD);
    // The context binding is what stops a ciphertext being lifted from one
    // workspace's row into another's and becoming that workspace's feed.
    await expect(
      openSecret(key, sealed, "dalyhub.calendar.feed_url.v1:workspace-b"),
    ).rejects.toBeInstanceOf(SealedSecretError);
  });

  it("refuses a TAMPERED ciphertext rather than decrypting it", async () => {
    const key = await importEncryptionKey(KEY);
    const sealed = await sealSecret(key, TEST_FEED_URL, AAD);
    const parts = sealed.split(".");
    const flipped = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -2)}AA`;
    // GCM's tag is verified on open, so a stored value is either exactly what
    // was sealed or an error — never a substituted URL the synchroniser fetches.
    await expect(openSecret(key, flipped, AAD)).rejects.toBeInstanceOf(
      SealedSecretError,
    );
  });

  it("refuses a missing, malformed or short key rather than stretching it", async () => {
    await expect(importEncryptionKey(undefined)).rejects.toBeInstanceOf(
      EncryptionKeyUnavailableError,
    );
    await expect(importEncryptionKey("   ")).rejects.toBeInstanceOf(
      EncryptionKeyUnavailableError,
    );
    await expect(importEncryptionKey(btoa("short"))).rejects.toBeInstanceOf(
      EncryptionKeyUnavailableError,
    );
  });

  it("fingerprints deterministically, and differently per key", async () => {
    const a = await fingerprintSecret(KEY, TEST_FEED_URL, AAD);
    const b = await fingerprintSecret(KEY, TEST_FEED_URL, AAD);
    const other = await fingerprintSecret(OTHER_KEY, TEST_FEED_URL, AAD);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    // Keyed, not a bare digest: a database dump plus a candidate URL confirms
    // nothing without the deployment key.
    expect(a).not.toBe(other);
  });
});

describe("the bounded, guarded feed fetch", () => {
  it("follows a redirect that stays inside the policy", async () => {
    const body = await fetchFeedBody(TEST_FEED_URL, {
      fetcher: async (url) =>
        url === TEST_FEED_URL
          ? new Response(null, {
              status: 302,
              headers: { location: "https://cdn.example.com/moved.ics" },
            })
          : new Response(workCalendarFeed(), { status: 200 }),
    });
    expect(body).toContain("BEGIN:VCALENDAR");
  });

  it("REVALIDATES a redirect target against the URL policy", async () => {
    // The hop an unguarded redirect follower would use to reach a private
    // address. The policy runs on every hop, not only at entry.
    await expect(
      fetchFeedBody(TEST_FEED_URL, {
        fetcher: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data/" },
          }),
      }),
    ).rejects.toMatchObject({ code: "blocked_target" });
  });

  it("refuses a redirect to a loopback address", async () => {
    await expect(
      fetchFeedBody(TEST_FEED_URL, {
        fetcher: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/admin" },
          }),
      }),
    ).rejects.toMatchObject({ code: "blocked_target" });
  });

  it("bounds the number of redirects", async () => {
    let hop = 0;
    await expect(
      fetchFeedBody(TEST_FEED_URL, {
        fetcher: async () => {
          hop += 1;
          return new Response(null, {
            status: 302,
            headers: {
              location: `https://calendar.example.com/hop-${hop}.ics`,
            },
          });
        },
      }),
    ).rejects.toMatchObject({ code: "too_many_redirects" });
    // Bounded, and the bound is small: a loop cannot cost an isolate.
    expect(hop).toBeLessThanOrEqual(4);
  });

  it("refuses an oversized body declared by Content-Length", async () => {
    await expect(
      fetchFeedBody(TEST_FEED_URL, {
        fetcher: async () =>
          new Response("BEGIN:VCALENDAR", {
            status: 200,
            headers: { "content-length": String(50 * 1024 * 1024) },
          }),
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("refuses an oversized body that LIES about its length", async () => {
    // A hostile server can understate or omit Content-Length, so the bound is
    // enforced while reading. This body is streamed and cut off, rather than
    // buffered whole and then measured.
    const chunk = new TextEncoder().encode("A".repeat(256 * 1024));
    await expect(
      fetchFeedBody(TEST_FEED_URL, {
        fetcher: async () =>
          new Response(
            new ReadableStream({
              pull(controller) {
                controller.enqueue(chunk);
              },
            }),
            { status: 200 },
          ),
      }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("maps response statuses onto actionable, non-leaking codes", async () => {
    const codeFor = async (status: number) => {
      try {
        await fetchFeedBody(TEST_FEED_URL, {
          fetcher: async () =>
            new Response("upstream detail nobody should see", { status }),
        });
        return "ok";
      } catch (cause) {
        return (cause as FeedFetchError).code;
      }
    };
    expect(await codeFor(401)).toBe("unauthorised");
    expect(await codeFor(403)).toBe("unauthorised");
    expect(await codeFor(404)).toBe("not_found");
    expect(await codeFor(410)).toBe("not_found");
    expect(await codeFor(500)).toBe("server_error");
  });

  it("never carries the remote body or URL out in its error", async () => {
    try {
      await fetchFeedBody("https://calendar.example.com/secret-token.ics", {
        fetcher: async () => new Response(HTML_NOT_CALENDAR, { status: 500 }),
      });
      throw new Error("expected a refusal");
    } catch (cause) {
      const message = (cause as Error).message;
      expect(message).not.toContain("secret-token");
      expect(message).not.toContain("Sign in");
      expect(message).not.toContain("doctype");
    }
  });

  it("refuses a blocked target before it makes any request at all", async () => {
    let called = false;
    await expect(
      fetchFeedBody("https://127.0.0.1/x.ics", {
        fetcher: async () => {
          called = true;
          return new Response("");
        },
      }),
    ).rejects.toMatchObject({ code: "blocked_target" });
    expect(called).toBe(false);
  });
});

describe("the scheduled refresh", () => {
  /**
   * Load the composition boundary BEFORE the timed assertions — V2.4-GATE-01.
   *
   * `runScheduledCalendarRefresh` reaches the workspace through
   * `await import("~/platform/workspaces")`, a dynamic import the handler makes
   * deliberately so the cron entry point does not pull every repository in the
   * product into module scope. The first caller therefore pays for compiling
   * that whole graph, and in this file the first caller is a test with the
   * default five-second budget.
   *
   * Which made the result depend on what else had run. MEASURED on this branch:
   * the full kernel suite is green — some earlier file has already loaded the
   * boundary — while `vitest run test/kernel/calendar-security.test.ts` on its
   * own times out at 5,000 ms, and the same call completes in ~5.7 s when given
   * room. A test whose outcome is decided by its neighbours is not measuring
   * the thing it names, and it is the reason this file has a history of being
   * called environment-dependent (DEBT-179).
   *
   * The fix is not a bigger number: the assertions below keep the default
   * budget, and what moves is the one-time module compilation, out of the
   * measurement and into setup where it belongs. If the handler ever becomes
   * genuinely slow, these tests still fail.
   */
  beforeAll(async () => {
    await import("~/platform/workspaces");
  });

  it("does nothing, quietly, when no encryption key is configured", async () => {
    const summary = await runScheduledCalendarRefresh({
      DB: env.DB,
      DEFAULT_WORKSPACE_ID: "does-not-matter",
    });
    // A tick that cannot possibly succeed must not mark every source red.
    expect(summary).toEqual({
      ran: false,
      sources: 0,
      failed: 0,
      skippedReason: "not_configured",
    });
  });

  it("does not throw when the workspace cannot be resolved", async () => {
    const summary = await runScheduledCalendarRefresh({
      DB: env.DB,
      DEFAULT_WORKSPACE_ID: "no-such-workspace",
      APP_ENCRYPTION_KEY: KEY,
    });
    // A `scheduled` handler that throws is only ever a log line nobody reads.
    expect(summary.ran).toBe(false);
    expect(summary.skippedReason).toBe("no_workspace");
  });
});
