/**
 * AUDIT-10 — the effective Content-Security-Policy, asserted invariant by
 * invariant.
 *
 * Deliberately NOT a snapshot of the whole header string. A snapshot fails
 * loudly when a directive is added and silently accepts the one change that
 * matters — a source quietly widened. Each rule below is the thing the audit
 * actually asked for, stated on its own, so a regression names itself.
 */

import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  createCspNonce,
  isValidCspNonce,
  resolveCspMode,
} from "~/platform/request/content-security-policy";

const NONCE = "abcdefghijklmnop0123";

/** The directives of a policy, as a name → value map. */
function directives(policy: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const part of policy.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const space = trimmed.indexOf(" ");
    if (space === -1) {
      map.set(trimmed, "");
      continue;
    }
    map.set(trimmed.slice(0, space), trimmed.slice(space + 1).trim());
  }
  return map;
}

const production = () =>
  directives(buildContentSecurityPolicy({ nonce: NONCE, mode: "production" }));

describe("the production Content-Security-Policy", () => {
  it("declares a complete source policy with default-src", () => {
    expect(production().get("default-src")).toBe("'self'");
  });

  it("restricts script-src to same-origin plus this response's nonce", () => {
    expect(production().get("script-src")).toBe(`'self' 'nonce-${NONCE}'`);
  });

  // The two directives the audit named. Either one turns the policy back into
  // decoration, so each gets its own failing test rather than sharing one.
  it("never allows unsafe-eval in production", () => {
    expect(
      buildContentSecurityPolicy({ nonce: NONCE, mode: "production" }),
    ).not.toContain("unsafe-eval");
  });

  it("never allows unsafe-inline for scripts in production", () => {
    expect(production().get("script-src")).not.toContain("'unsafe-inline'");
  });

  it("blocks plugin content and framing outright", () => {
    const policy = production();
    expect(policy.get("object-src")).toBe("'none'");
    expect(policy.get("frame-ancestors")).toBe("'none'");
    expect(policy.get("frame-src")).toBe("'none'");
    expect(policy.get("media-src")).toBe("'none'");
  });

  it("forbids a base element and confines form submission to DalyHub", () => {
    expect(production().get("base-uri")).toBe("'none'");
    expect(production().get("form-action")).toBe("'self'");
  });

  it("names the service worker's source explicitly rather than inheriting it", () => {
    expect(production().get("worker-src")).toBe("'self'");
    expect(production().get("manifest-src")).toBe("'self'");
  });

  it("styles: external and nonced, with the exception confined to attributes", () => {
    const policy = production();
    // An injected `<style>` ELEMENT is still refused …
    expect(policy.get("style-src")).toBe(`'self' 'nonce-${NONCE}'`);
    expect(policy.get("style-src")).not.toContain("'unsafe-inline'");
    // … while React's `style={{…}}` attributes keep working. This is the one
    // documented exception in the policy.
    expect(policy.get("style-src-attr")).toBe("'unsafe-inline'");
  });

  it("allows only the image sources the product actually uses", () => {
    // `data:` — the segmented-filter CSS mask and data-URI Person avatars.
    // `https:` — owner-entered Person photo URLs. Nothing else: no `*`, and no
    // plain `http:`. Markdown cannot contribute an image at all (the
    // sanitisation schema forbids `img`).
    expect(production().get("img-src")).toBe("'self' data: https:");
  });

  it("keeps fonts and connections same-origin", () => {
    expect(production().get("font-src")).toBe("'self'");
    // The AI providers are called by the Worker, server-side. A browser CSP does
    // not govern that, so their domains must not appear here.
    const connect = production().get("connect-src") ?? "";
    expect(connect).toBe("'self'");
    expect(connect).not.toContain("anthropic");
    expect(connect).not.toContain("openai");
    expect(connect).not.toContain("*");
  });

  it("refuses to build a policy around a malformed nonce", () => {
    // A nonce-source the browser cannot parse silently disables `script-src`.
    // Failing here is the only safe answer.
    for (const bad of ["", "short", "has spaces", "not/base64url+", "'x'"]) {
      expect(() =>
        buildContentSecurityPolicy({ nonce: bad, mode: "production" }),
      ).toThrow(TypeError);
    }
  });
});

describe("the development Content-Security-Policy", () => {
  const development = () =>
    directives(
      buildContentSecurityPolicy({ nonce: NONCE, mode: "development" }),
    );

  it("relaxes only what the Vite dev server needs, and says so explicitly", () => {
    const policy = development();
    expect(policy.get("script-src")).toContain("'unsafe-inline'");
    expect(policy.get("script-src")).toContain("'unsafe-eval'");
    expect(policy.get("style-src")).toContain("'unsafe-inline'");
    expect(policy.get("connect-src")).toContain("ws:");
  });

  /*
   * A CSP rule, not a style choice: a directive carrying ANY nonce or hash
   * source makes browsers ignore `'unsafe-inline'` in it. A development policy
   * that kept both would block Vite's own un-nonced styles and scripts while
   * appearing to allow them — which is what happened, and what a browser run
   * caught. So the relaxed directives carry no nonce at all.
   */
  it("drops the nonce from the relaxed directives, or unsafe-inline would be ignored", () => {
    const policy = development();
    expect(policy.get("script-src")).not.toContain("nonce-");
    expect(policy.get("style-src")).not.toContain("nonce-");
  });

  it("keeps every non-development directive identical to production", () => {
    const dev = development();
    const prod = production();
    for (const name of [
      "default-src",
      "base-uri",
      "object-src",
      "frame-ancestors",
      "frame-src",
      "media-src",
      "manifest-src",
      "worker-src",
      "font-src",
      "img-src",
      "form-action",
      "style-src-attr",
    ]) {
      expect(dev.get(name), name).toBe(prod.get(name));
    }
  });
});

describe("resolveCspMode", () => {
  // The build-time half of the gate: this suite runs under Vitest, where
  // `import.meta.env.DEV` is true, so it can exercise the ENVIRONMENT half. In a
  // production BUILD the constant is false and the function returns "production"
  // before it ever reads the environment — which is what makes a deployed bundle
  // incapable of emitting the relaxed policy.
  it("returns the production policy for anything but an explicit dev/test environment", () => {
    for (const environment of [
      "production",
      "staging",
      "",
      "prod",
      "dev",
      undefined,
    ]) {
      expect(resolveCspMode({ ENVIRONMENT: environment })).toBe("production");
    }
  });

  it("returns the development policy only for development or test", () => {
    expect(resolveCspMode({ ENVIRONMENT: "development" })).toBe("development");
    expect(resolveCspMode({ ENVIRONMENT: " Test " })).toBe("development");
  });
});

describe("createCspNonce", () => {
  it("mints an unpredictable, non-repeating base64url token", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const nonce = createCspNonce();
      expect(isValidCspNonce(nonce)).toBe(true);
      expect(seen.has(nonce)).toBe(false);
      seen.add(nonce);
    }
  });
});
