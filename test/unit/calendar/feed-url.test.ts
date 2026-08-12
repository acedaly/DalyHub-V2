/**
 * CAL-01 — the feed-URL policy, which is the whole of DalyHub's SSRF defence.
 *
 * "Add a calendar" makes the SERVER fetch an address the owner types. The only
 * thing separating that from a generic internal-network HTTP proxy is this
 * function, so it is tested as a security control rather than as a form check:
 * every rule has a case, and every case that must be refused is asserted to be
 * refused rather than merely "handled".
 */

import { describe, expect, it } from "vitest";

import {
  FeedUrlError,
  feedUrlHost,
  normaliseFeedUrl,
  providerHintForUrl,
} from "~/kernel/calendar";

function rejection(value: string): string {
  try {
    normaliseFeedUrl(value);
  } catch (cause) {
    if (cause instanceof FeedUrlError) return cause.reason;
    return `unexpected:${String(cause)}`;
  }
  return "accepted";
}

describe("feed URL policy", () => {
  it("accepts an ordinary https calendar link unchanged", () => {
    expect(
      normaliseFeedUrl("https://calendar.example.com/feeds/abc123.ics"),
    ).toBe("https://calendar.example.com/feeds/abc123.ics");
  });

  it("rewrites webcal:// to https, which is the ONLY rewrite it performs", () => {
    expect(normaliseFeedUrl("webcal://calendar.example.com/x.ics")).toBe(
      "https://calendar.example.com/x.ics",
    );
    expect(normaliseFeedUrl("WEBCAL://calendar.example.com/x.ics")).toBe(
      "https://calendar.example.com/x.ics",
    );
  });

  it("refuses plain http, because the link is a credential", () => {
    // Deliberately refused rather than upgraded: upgrading would claim a
    // guarantee the publisher may not offer, and sending a calendar secret in
    // clear is not a trade DalyHub makes for one non-TLS publisher.
    expect(rejection("http://calendar.example.com/x.ics")).toBe("scheme");
  });

  it("refuses every non-web scheme", () => {
    for (const value of [
      "file:///etc/passwd",
      "data:text/calendar,BEGIN:VCALENDAR",
      "ftp://calendar.example.com/x.ics",
      "gopher://calendar.example.com/x.ics",
      "javascript:alert(1)",
    ]) {
      expect(rejection(value)).not.toBe("accepted");
    }
  });

  it("refuses credentials embedded in the URL rather than stripping them", () => {
    expect(rejection("https://user:pass@calendar.example.com/x.ics")).toBe(
      "credentials",
    );
  });

  it("refuses a non-standard port, which removes port scanning entirely", () => {
    expect(rejection("https://calendar.example.com:8080/x.ics")).toBe("port");
    expect(rejection("https://calendar.example.com:22/x.ics")).toBe("port");
    // The explicit standard port is fine.
    expect(normaliseFeedUrl("https://calendar.example.com:443/x.ics")).toBe(
      "https://calendar.example.com/x.ics",
    );
  });

  it("refuses loopback and machine-local names", () => {
    for (const host of [
      "localhost",
      "app.localhost",
      "printer.local",
      "db.internal",
      "router.home.arpa",
      "nas.lan",
    ]) {
      expect(rejection(`https://${host}/x.ics`)).toBe("blocked_host");
    }
  });

  it("refuses every private, loopback, link-local and reserved IPv4 target", () => {
    for (const host of [
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "10.0.0.5",
      "172.16.4.4",
      "172.31.255.255",
      "192.168.1.1",
      "192.0.0.1",
      "100.64.0.1", // CGNAT
      "169.254.1.1", // link-local
      "169.254.169.254", // the cloud metadata endpoint
      "224.0.0.1", // multicast
      "255.255.255.255",
    ]) {
      expect(rejection(`https://${host}/x.ics`)).toBe("blocked_host");
    }
  });

  it("refuses loopback, unique-local and link-local IPv6 targets", () => {
    for (const host of [
      "[::1]",
      "[::]",
      "[fd00::1]", // unique-local
      "[fe80::1]", // link-local
      "[ff02::1]", // multicast
      "[::ffff:127.0.0.1]", // IPv4-mapped loopback
      "[::ffff:169.254.169.254]", // IPv4-mapped metadata
    ]) {
      expect(rejection(`https://${host}/x.ics`)).toBe("blocked_host");
    }
  });

  it("refuses a bare hostname that cannot be a public name", () => {
    expect(rejection("https://intranet/x.ics")).toBe("blocked_host");
  });

  it("refuses malformed and oversized input", () => {
    expect(rejection("")).toBe("malformed");
    expect(rejection("   ")).toBe("malformed");
    expect(rejection("not a url")).toBe("malformed");
    expect(rejection(`https://calendar.example.com/${"a".repeat(3000)}`)).toBe(
      "malformed",
    );
  });

  it("drops the fragment, so one feed fingerprints once", () => {
    expect(normaliseFeedUrl("https://calendar.example.com/x.ics#anchor")).toBe(
      "https://calendar.example.com/x.ics",
    );
  });

  it("never puts the URL into its refusal message", () => {
    try {
      normaliseFeedUrl("https://127.0.0.1/secret-calendar-token.ics");
      throw new Error("expected a refusal");
    } catch (cause) {
      // A failure message is exactly where a leaked credential ends up in a
      // screenshot or a support thread.
      expect((cause as Error).message).not.toContain("secret-calendar-token");
      expect((cause as Error).message).not.toContain("127.0.0.1");
    }
  });
});

describe("provider hint", () => {
  it("recognises the common publishers by host SUFFIX", () => {
    expect(providerHintForUrl("https://outlook.office365.com/owa/x.ics")).toBe(
      "outlook",
    );
    expect(providerHintForUrl("https://p01-calendars.icloud.com/x.ics")).toBe(
      "apple",
    );
    expect(providerHintForUrl("https://calendar.google.com/x.ics")).toBe(
      "google",
    );
    expect(providerHintForUrl("https://calendar.example.com/x.ics")).toBe(
      "generic",
    );
  });

  it("is not fooled by a look-alike host", () => {
    // A substring match would read this as Outlook. It is presentation only, so
    // being wrong costs a subtitle — but being wrong for THIS reason would be a
    // bug that teaches an owner to trust the wrong label.
    expect(providerHintForUrl("https://outlook.com.evil.example/x.ics")).toBe(
      "generic",
    );
  });
});

describe("feed URL host", () => {
  it("returns the host and never the path", () => {
    const host = feedUrlHost(
      "https://calendar.example.com/feeds/secret-token.ics",
    );
    expect(host).toBe("calendar.example.com");
    expect(host).not.toContain("secret-token");
  });
});
