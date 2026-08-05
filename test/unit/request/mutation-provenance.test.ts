import { describe, expect, it } from "vitest";

import {
  evaluateMutationProvenance,
  isSafeMethod,
  trustedOriginFor,
} from "~/platform/request/mutation-provenance";

import { TEST_APP_ORIGIN, browserRequest } from "../../support/requests";

/** The protected application origin every case is judged against. */
const APP = TEST_APP_ORIGIN;

interface RequestShape {
  readonly method?: string;
  readonly url?: string;
  /** Raw `Origin` value. `undefined` omits the header entirely. */
  readonly origin?: string;
  /** Raw `Sec-Fetch-Site` value. `undefined` omits the header entirely. */
  readonly fetchSite?: string;
}

function build({
  method = "POST",
  url = `${APP}/tasks/t-1/mutate`,
  origin,
  fetchSite,
}: RequestShape = {}): Request {
  return browserRequest(url, { method, origin, fetchSite });
}

function verdict(shape: RequestShape = {}) {
  return evaluateMutationProvenance(build(shape), APP);
}

const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

describe("mutation provenance — safe methods", () => {
  it.each(["GET", "HEAD", "OPTIONS"])(
    "allows %s with no provenance headers at all",
    (method) => {
      expect(verdict({ method })).toEqual({
        allowed: true,
        reason: "safe_method",
      });
    },
  );

  it("allows a safe method regardless of a hostile Origin — a read is not a mutation", () => {
    expect(
      verdict({
        method: "GET",
        origin: "https://evil.example",
        fetchSite: "cross-site",
      }),
    ).toEqual({ allowed: true, reason: "safe_method" });
  });

  it("treats the method case-insensitively, as HTTP does", () => {
    expect(isSafeMethod("get")).toBe(true);
    expect(isSafeMethod("Head")).toBe(true);
    expect(isSafeMethod("post")).toBe(false);
  });
});

describe("mutation provenance — accepted same-origin mutations", () => {
  it.each(UNSAFE_METHODS)(
    "accepts a same-origin %s carrying only an exact Origin",
    (method) => {
      expect(verdict({ method, origin: APP })).toEqual({
        allowed: true,
        reason: "same_origin",
      });
    },
  );

  it("accepts an exact Origin corroborated by Sec-Fetch-Site: same-origin", () => {
    expect(verdict({ origin: APP, fetchSite: "same-origin" })).toEqual({
      allowed: true,
      reason: "same_origin",
    });
  });

  it("accepts the corroborating header in any case — HTTP values are case-insensitive", () => {
    expect(verdict({ origin: APP, fetchSite: "Same-Origin" })).toEqual({
      allowed: true,
      reason: "same_origin",
    });
  });

  it("ignores a default port the browser omits, per URL-origin semantics", () => {
    // `https://hub.daly.id.au` and its :443 form are the SAME origin; the
    // request URL carrying the explicit port must not change the verdict.
    expect(
      evaluateMutationProvenance(
        build({ origin: APP, url: `${APP}:443/tasks/t-1/mutate` }),
        trustedOriginFor(build({ url: `${APP}:443/tasks/t-1/mutate` })),
      ),
    ).toEqual({ allowed: true, reason: "same_origin" });
  });
});

describe("mutation provenance — rejected Origins", () => {
  it("rejects a plainly cross-site Origin", () => {
    expect(verdict({ origin: "https://evil.example" })).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
  });

  it("rejects a SIBLING subdomain — same-site is not same-origin", () => {
    // The gap SameSite cookies do not close: a compromised sibling host on
    // daly.id.au is same-site, and must still be refused.
    expect(verdict({ origin: "https://other.daly.id.au" })).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
  });

  it("rejects an http Origin against an https application — the scheme is part of the origin", () => {
    expect(verdict({ origin: "http://hub.daly.id.au" })).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
  });

  it("rejects a port mismatch on an otherwise identical host", () => {
    expect(verdict({ origin: "https://hub.daly.id.au:8443" })).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
  });

  it("rejects Origin: null (a sandboxed iframe, an opaque origin, a redirect)", () => {
    expect(verdict({ origin: "null" })).toEqual({
      allowed: false,
      reason: "invalid_origin",
    });
  });

  it.each([
    ["a bare hostname", "hub.daly.id.au"],
    ["an empty value", ""],
    ["whitespace only", "   "],
    ["a non-URL", "not a url at all"],
    ["an origin carrying a path", "https://hub.daly.id.au/mutate"],
    ["an origin carrying a query", "https://hub.daly.id.au?x=1"],
    ["a non-http scheme", "file:///etc/passwd"],
  ])("rejects a malformed Origin: %s", (_label, origin) => {
    expect(verdict({ origin })).toEqual({
      allowed: false,
      reason: "invalid_origin",
    });
  });

  it("rejects multiple / ambiguous Origin values rather than picking one", () => {
    // Repeated `Origin` headers are comma-joined by `Headers.get`, which is
    // exactly the value the policy sees. Even when one of the two is the real
    // origin, the request is ambiguous and is refused rather than resolved.
    for (const origin of [
      `${APP}, https://evil.example`,
      `https://evil.example, ${APP}`,
      `${APP},${APP}`,
    ]) {
      expect(verdict({ origin })).toEqual({
        allowed: false,
        reason: "invalid_origin",
      });
    }
  });

  it("does not use suffix matching — an attacker-owned host ENDING in the app origin is refused", () => {
    for (const origin of [
      "https://evil-hub.daly.id.au",
      "https://hub.daly.id.au.evil.example",
      "https://daly.id.au",
      "https://notdaly.id.au",
    ]) {
      expect(verdict({ origin })).toEqual({
        allowed: false,
        reason: "cross_origin",
      });
    }
  });
});

describe("mutation provenance — Sec-Fetch-Site policy", () => {
  it.each(["cross-site", "same-site", "none"])(
    "rejects Sec-Fetch-Site: %s on a mutation, even with no Origin",
    (fetchSite) => {
      expect(verdict({ fetchSite })).toEqual({
        allowed: false,
        reason: "disallowed_fetch_site",
      });
    },
  );

  it("rejects an unrecognised Sec-Fetch-Site value rather than ignoring it", () => {
    expect(verdict({ fetchSite: "same-galaxy" })).toEqual({
      allowed: false,
      reason: "disallowed_fetch_site",
    });
  });
});

describe("mutation provenance — inconsistent signals", () => {
  it.each(["same-site", "cross-site", "none", "nonsense"])(
    "rejects an exact Origin contradicted by Sec-Fetch-Site: %s",
    (fetchSite) => {
      expect(verdict({ origin: APP, fetchSite })).toEqual({
        allowed: false,
        reason: "inconsistent_signals",
      });
    },
  );

  it("rejects a hostile Origin wearing a reassuring Sec-Fetch-Site: same-origin", () => {
    expect(
      verdict({ origin: "https://evil.example", fetchSite: "same-origin" }),
    ).toEqual({ allowed: false, reason: "inconsistent_signals" });
  });
});

describe("mutation provenance — missing provenance fails closed", () => {
  it("rejects a mutation carrying NEITHER signal", () => {
    expect(verdict()).toEqual({ allowed: false, reason: "missing_provenance" });
  });

  it("rejects a mutation with Sec-Fetch-Site: same-origin but no Origin", () => {
    // The deliberate compatibility case NOT taken: every browser attaches Origin
    // to a non-GET/HEAD request, and DalyHub has no non-browser mutation client.
    expect(verdict({ fetchSite: "same-origin" })).toEqual({
      allowed: false,
      reason: "missing_provenance",
    });
  });

  it("treats a method DalyHub has never heard of as unsafe, not as unknown-therefore-fine", () => {
    // The guard is an allowlist of SAFE methods, so anything outside it — a
    // future verb, a proxy's invention, a typo — must prove its provenance.
    for (const method of ["PURGE", "LOCK", "MKCOL", "post-but-not-really"]) {
      expect(isSafeMethod(method)).toBe(false);
    }
  });

  it.each(["PROPFIND", "PURGE", "LOCK"])(
    "protects the unknown non-safe method %s exactly like POST",
    (method) => {
      expect(verdict({ method })).toEqual({
        allowed: false,
        reason: "missing_provenance",
      });
      expect(verdict({ method, origin: APP })).toEqual({
        allowed: true,
        reason: "same_origin",
      });
      expect(verdict({ method, origin: "https://evil.example" })).toEqual({
        allowed: false,
        reason: "cross_origin",
      });
    },
  );
});

describe("mutation provenance — local development origins", () => {
  const LOCAL = "http://localhost:5173";

  function localVerdict(origin: string) {
    return evaluateMutationProvenance(
      build({ origin, url: `${LOCAL}/tasks/t-1/mutate` }),
      LOCAL,
    );
  }

  it("accepts the exact localhost origin, so development and Playwright are unaffected", () => {
    expect(localVerdict(LOCAL)).toEqual({
      allowed: true,
      reason: "same_origin",
    });
  });

  it("rejects a different localhost PORT — the second local origin an attacker would use", () => {
    expect(localVerdict("http://localhost:5174")).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
  });

  it("rejects an https localhost against an http application", () => {
    expect(localVerdict("https://localhost:5173")).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
  });

  it("does NOT silently treat 127.0.0.1 and localhost as the same origin", () => {
    // They resolve to the same machine but are DIFFERENT origins to the browser,
    // and each gets its own cookie jar and its own storage.
    expect(localVerdict("http://127.0.0.1:5173")).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
    expect(localVerdict("http://[::1]:5173")).toEqual({
      allowed: false,
      reason: "cross_origin",
    });
  });
});

describe("trustedOriginFor", () => {
  it("derives the origin from the request URL, ignoring path, query and hash", () => {
    expect(
      trustedOriginFor(new Request(`${APP}/notes/n-1/mutate?tab=links#x`)),
    ).toBe(APP);
  });

  it("ignores client-supplied forwarding headers", () => {
    const spoofed = browserRequest(`${APP}/notes/n-1/mutate`, {
      method: "POST",
      origin: "https://evil.example",
      headers: {
        "X-Forwarded-Host": "evil.example",
        "X-Forwarded-Proto": "http",
      },
    });
    expect(trustedOriginFor(spoofed)).toBe(APP);
    expect(
      evaluateMutationProvenance(spoofed, trustedOriginFor(spoofed)),
    ).toEqual({ allowed: false, reason: "cross_origin" });
  });
});
