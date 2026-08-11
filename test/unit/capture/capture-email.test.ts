/**
 * CAPTURE-01 — email capture policy and MIME extraction.
 *
 * Fixtures only: nothing here sends or receives real internet mail, and CI never
 * depends on a mail system being reachable (CAPTURE-01 §54). The messages below are the
 * shapes real clients actually produce — Apple Mail's quoted-printable forward,
 * a Gmail `multipart/alternative`, an HTML-only newsletter, a malformed body.
 */

import { describe, expect, it } from "vitest";

import {
  buildEmailCaptureRequest,
  captureEmailIsEnabled,
  emailIsAuthenticated,
  evaluateInboundEmail,
  extractEmailAddress,
  extractEmailContent,
  htmlToPlainText,
  parseEmailAddressList,
  parseEmailAuthenticationResults,
  parseEmailSubject,
  resolveCaptureEmailConfig,
} from "~/kernel/capture";

const OWNER = "owner@daly.id.au";
const CAPTURE_ADDRESS = "capture@daly.id.au";
const RECEIVED = new Date("2026-08-11T02:00:00.000Z");

const config = resolveCaptureEmailConfig({
  CAPTURE_EMAIL_RECIPIENTS: CAPTURE_ADDRESS,
  CAPTURE_EMAIL_ALLOWED_SENDERS: OWNER,
});

const PASSING = parseEmailAuthenticationResults(
  "mx.cloudflare.com; dkim=pass header.d=daly.id.au; spf=pass smtp.mailfrom=daly.id.au; dmarc=pass header.from=daly.id.au",
);

/** Base64 of the UTF-8 bytes, the way a real encoder produces an encoded-word. */
function base64Utf8(value: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}

/** Join lines the way SMTP does, so the fixtures read as real messages. */
function message(lines: readonly string[]): string {
  return lines.join("\r\n");
}

describe("configuration", () => {
  it("is off until BOTH a capture address and an allowed sender are configured", () => {
    expect(captureEmailIsEnabled(resolveCaptureEmailConfig({}))).toBe(false);
    expect(
      captureEmailIsEnabled(
        resolveCaptureEmailConfig({
          CAPTURE_EMAIL_RECIPIENTS: CAPTURE_ADDRESS,
        }),
      ),
    ).toBe(false);
    expect(captureEmailIsEnabled(config)).toBe(true);
  });

  it("does not hard-code the production address anywhere", () => {
    const other = resolveCaptureEmailConfig({
      CAPTURE_EMAIL_RECIPIENTS: "inbox@example.org",
      CAPTURE_EMAIL_ALLOWED_SENDERS: "me@example.org",
    });
    expect(other.recipients).toEqual(["inbox@example.org"]);
  });

  it("parses a list and normalises case", () => {
    expect(parseEmailAddressList("A@X.com, b@y.com  c@z.com")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@z.com",
    ]);
    expect(parseEmailAddressList("not-an-address")).toEqual([]);
  });

  it("reads the bare address out of a display-name header", () => {
    expect(extractEmailAddress("Aidan Daly <owner@daly.id.au>")).toBe(OWNER);
    expect(extractEmailAddress("  OWNER@Daly.ID.AU ")).toBe(OWNER);
  });
});

describe("who may write into DalyHub by email", () => {
  it("accepts the allowlisted sender at the configured address", () => {
    expect(
      evaluateInboundEmail({
        config,
        recipient: CAPTURE_ADDRESS,
        envelopeFrom: OWNER,
        authentication: PASSING,
      }),
    ).toEqual({ accepted: true });
  });

  it("refuses a sender who is not on the allowlist", () => {
    expect(
      evaluateInboundEmail({
        config,
        recipient: CAPTURE_ADDRESS,
        envelopeFrom: "stranger@example.com",
        authentication: PASSING,
      }),
    ).toEqual({ accepted: false, reason: "sender_not_allowed" });
  });

  it("refuses an unknown recipient BEFORE it considers the sender", () => {
    // A prober cannot learn the allowlist by guessing at addresses.
    expect(
      evaluateInboundEmail({
        config,
        recipient: "someone-else@daly.id.au",
        envelopeFrom: "stranger@example.com",
        authentication: PASSING,
      }),
    ).toEqual({ accepted: false, reason: "unknown_recipient" });
  });

  it("refuses a spoofed message that fails every authentication check", () => {
    expect(
      evaluateInboundEmail({
        config,
        recipient: CAPTURE_ADDRESS,
        envelopeFrom: OWNER,
        authentication: parseEmailAuthenticationResults(
          "mx.cloudflare.com; dkim=fail; spf=fail; dmarc=fail",
        ),
      }),
    ).toEqual({ accepted: false, reason: "sender_not_authenticated" });
  });

  it("refuses a message carrying no authentication evidence at all", () => {
    expect(
      evaluateInboundEmail({
        config,
        recipient: CAPTURE_ADDRESS,
        envelopeFrom: OWNER,
        authentication: parseEmailAuthenticationResults(null),
      }),
    ).toEqual({ accepted: false, reason: "sender_not_authenticated" });
  });

  it("accepts when any one method passes", () => {
    expect(
      emailIsAuthenticated(parseEmailAuthenticationResults("spf=pass")),
    ).toBe(true);
    expect(
      emailIsAuthenticated(parseEmailAuthenticationResults("dkim=pass")),
    ).toBe(true);
    expect(
      emailIsAuthenticated(
        parseEmailAuthenticationResults("dmarc=pass (p=REJECT)"),
      ),
    ).toBe(true);
    expect(
      emailIsAuthenticated(
        parseEmailAuthenticationResults("spf=softfail; dkim=none; dmarc=none"),
      ),
    ).toBe(false);
  });

  it("refuses everything when email capture is not configured", () => {
    expect(
      evaluateInboundEmail({
        config: resolveCaptureEmailConfig({}),
        recipient: CAPTURE_ADDRESS,
        envelopeFrom: OWNER,
        authentication: PASSING,
      }),
    ).toEqual({ accepted: false, reason: "email_capture_disabled" });
  });
});

describe("subject syntax — the entire grammar", () => {
  it("reads a task prefix", () => {
    expect(parseEmailSubject("task: Call supplier tomorrow")).toEqual({
      intent: "task",
      subject: "Call supplier tomorrow",
      explicit: true,
    });
  });

  it("reads a note prefix", () => {
    expect(parseEmailSubject("note: OpO workshop idea").intent).toBe("note");
  });

  it("reads a prefix through a forwarding chain", () => {
    expect(parseEmailSubject("Fwd: task: Book the ferry").intent).toBe("task");
    expect(parseEmailSubject("Re: Fwd: note: Ideas").intent).toBe("note");
  });

  it("does NOT read an email that is merely ABOUT tasks as a task", () => {
    const parsed = parseEmailSubject("Task list for Friday");
    expect(parsed.explicit).toBe(false);
    expect(parsed.subject).toBe("Task list for Friday");
  });

  it("invents no other directives", () => {
    for (const subject of [
      "project: Something",
      "due: tomorrow",
      "p1: urgent",
      "area: Home",
    ]) {
      expect(parseEmailSubject(subject).explicit).toBe(false);
    }
  });

  it("strips the forwarding noise from an ordinary forward", () => {
    expect(parseEmailSubject("Fwd: Your booking confirmation").subject).toBe(
      "Your booking confirmation",
    );
  });
});

describe("MIME extraction", () => {
  it("reads a plain-text message", () => {
    const extracted = extractEmailContent(
      message([
        "From: Aidan <owner@daly.id.au>",
        "Subject: task: Book the Hilux service",
        "Message-ID: <abc@daly.id.au>",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "Next Friday if they have a slot.",
      ]),
    );
    expect(extracted.subject).toBe("task: Book the Hilux service");
    expect(extracted.text).toBe("Next Friday if they have a slot.");
    expect(extracted.messageId).toBe("<abc@daly.id.au>");
    expect(extracted.fromHeader).toBe("Aidan <owner@daly.id.au>");
  });

  it("decodes quoted-printable, which is what a forward usually is", () => {
    const extracted = extractEmailContent(
      message([
        "Subject: Fwd: Caf=C3=A9 booking",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: quoted-printable",
        "",
        "Booking at the caf=C3=A9 is confirmed for a very long line that =",
        "continues here.",
      ]),
    );
    expect(extracted.text).toBe(
      "Booking at the café is confirmed for a very long line that continues here.",
    );
  });

  it("decodes base64 parts", () => {
    const body = btoa("Base64 body text.");
    const extracted = extractEmailContent(
      message([
        "Subject: Encoded",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: base64",
        "",
        body,
      ]),
    );
    expect(extracted.text).toBe("Base64 body text.");
  });

  it("decodes an RFC 2047 encoded-word subject", () => {
    const encoded = base64Utf8("Café notes");
    const extracted = extractEmailContent(
      message([`Subject: =?utf-8?B?${encoded}?=`, "", "body"]),
    );
    expect(extracted.subject).toBe("Café notes");
  });

  it("prefers the plain-text alternative of a multipart message", () => {
    const extracted = extractEmailContent(
      message([
        "Subject: Newsletter",
        'Content-Type: multipart/alternative; boundary="B1"',
        "",
        "--B1",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "The readable version.",
        "--B1",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<p>The <b>HTML</b> version.</p>",
        "--B1--",
      ]),
    );
    expect(extracted.text).toBe("The readable version.");
    expect(extracted.fromHtml).toBe(false);
  });

  it("falls back to converted HTML when there is no text part", () => {
    const extracted = extractEmailContent(
      message([
        "Subject: HTML only",
        'Content-Type: multipart/alternative; boundary="B1"',
        "",
        "--B1",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<p>First para</p><p>Second para</p>",
        "--B1--",
      ]),
    );
    expect(extracted.fromHtml).toBe(true);
    expect(extracted.text).toBe("First para\n\nSecond para");
  });

  it("ignores attachments entirely", () => {
    const extracted = extractEmailContent(
      message([
        "Subject: With attachment",
        'Content-Type: multipart/mixed; boundary="B1"',
        "",
        "--B1",
        "Content-Type: text/plain; charset=utf-8",
        "",
        "See attached.",
        "--B1",
        "Content-Type: text/plain; charset=utf-8",
        'Content-Disposition: attachment; filename="secret.txt"',
        "",
        "ATTACHED CONTENT",
        "--B1--",
      ]),
    );
    expect(extracted.text).toBe("See attached.");
    expect(extracted.text).not.toContain("ATTACHED CONTENT");
  });

  it("survives a malformed message rather than throwing", () => {
    expect(() => extractEmailContent("")).not.toThrow();
    expect(() => extractEmailContent("not an email at all")).not.toThrow();
    expect(() =>
      extractEmailContent(
        message([
          'Content-Type: multipart/alternative; boundary="MISSING"',
          "",
          "--NOTTHEBOUNDARY",
          "garbage",
        ]),
      ),
    ).not.toThrow();
  });

  it("does not recurse without bound on nested multiparts", () => {
    let body = "deep text";
    for (let level = 10; level >= 0; level -= 1) {
      body = message([
        `Content-Type: multipart/mixed; boundary="B${level}"`,
        "",
        `--B${level}`,
        body,
        `--B${level}--`,
      ]);
    }
    expect(() => extractEmailContent(body)).not.toThrow();
  });
});

describe("HTML is converted to text, never stored as markup", () => {
  it("removes scripts and styles with their contents", () => {
    const text = htmlToPlainText(
      "<style>body{color:red}</style><script>alert(1)</script><p>Real text</p>",
    );
    expect(text).toBe("Real text");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("removes an unterminated script's contents too", () => {
    expect(htmlToPlainText("<p>Before</p><script>alert(1)")).toBe("Before");
  });

  it("drops every tag, including a remote tracking image", () => {
    const text = htmlToPlainText(
      '<p>Hello</p><img src="https://tracker.example/pixel.gif"><a href="https://x">link</a>',
    );
    expect(text).not.toContain("<");
    expect(text).not.toContain("tracker.example");
    expect(text).toContain("Hello");
  });

  it("keeps paragraph structure", () => {
    expect(htmlToPlainText("<p>One</p><p>Two</p><br>Three")).toBe(
      "One\n\nTwo\n\nThree",
    );
  });

  it("decodes the entities that matter and leaves the rest alone", () => {
    expect(htmlToPlainText("<p>a &amp; b &lt;c&gt; &#39;d&#39;</p>")).toBe(
      "a & b <c> 'd'",
    );
  });
});

describe("building the capture", () => {
  it("makes a forwarded email an Inbox capture by default", () => {
    const request = buildEmailCaptureRequest({
      subject: "Fwd: Your booking confirmation",
      body: "Reference 12345.",
      fromHeader: "Hotel <bookings@example.com>",
      clientCaptureId: "abcdefgh",
      receivedAt: RECEIVED,
    });
    expect(request.intent).toBe("inbox");
    expect(request.title).toBe("Your booking confirmation");
    expect(request.source).toBe("email");
    expect(request.text).toContain("Reference 12345.");
    expect(request.text).toContain(
      "Forwarded from: Hotel <bookings@example.com>",
    );
  });

  it("honours an explicit task prefix", () => {
    const request = buildEmailCaptureRequest({
      subject: "task: Call the supplier tomorrow",
      body: "",
      fromHeader: "",
      clientCaptureId: null,
      receivedAt: RECEIVED,
    });
    expect(request.intent).toBe("task");
    expect(request.title).toBe("Call the supplier tomorrow");
    // A subject with no body still captures — the subject IS the thought.
    expect(request.text).toBe("Call the supplier tomorrow");
  });

  it("honours an explicit note prefix", () => {
    expect(
      buildEmailCaptureRequest({
        subject: "note: OpO workshop idea",
        body: "Induction first.",
        fromHeader: "",
        clientCaptureId: null,
        receivedAt: RECEIVED,
      }).intent,
    ).toBe("note");
  });

  it("never guesses a Project, Area or Goal from an email", () => {
    const request = buildEmailCaptureRequest({
      subject: "Fwd: OpO project update for the Health area",
      body: "text",
      fromHeader: "",
      clientCaptureId: null,
      receivedAt: RECEIVED,
    });
    // The contract carries no destination field at all — there is nothing here
    // that could file it anywhere but the Inbox.
    expect(request.intent).toBe("inbox");
    expect(Object.keys(request)).not.toContain("projectId");
  });

  it("bounds the captured text however long the email was", () => {
    const request = buildEmailCaptureRequest({
      subject: "Long one",
      body: "x".repeat(50_000),
      fromHeader: "",
      clientCaptureId: null,
      receivedAt: RECEIVED,
    });
    expect(request.text.length).toBeLessThanOrEqual(10_000);
  });
});
