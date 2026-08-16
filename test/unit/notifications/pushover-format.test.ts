/**
 * NOTIFY-01 — the Pushover formatter's bounds and its escaping.
 *
 * Two things can only be got wrong once here and then are wrong forever: a
 * message Pushover REFUSES because it is too long, and a record title that
 * arrives as markup because it was interpolated into an `html=1` body.
 */

import { describe, expect, it } from "vitest";

import {
  PUSHOVER_MESSAGE_MAX,
  PUSHOVER_TITLE_MAX,
  PUSHOVER_URL_MAX,
  formatPushoverMessage,
} from "~/kernel/notifications";

const ORIGIN = "https://hub.example.test";

describe("length bounds", () => {
  it("clamps the title to Pushover's documented maximum", () => {
    const message = formatPushoverMessage({
      title: "x".repeat(600),
      body: "short",
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.title.length).toBeLessThanOrEqual(PUSHOVER_TITLE_MAX);
    expect(message.title.endsWith("…")).toBe(true);
  });

  it("measures the message on the ESCAPED string, not the owner's words", () => {
    // Every one of these becomes five characters, so a body clamped to 1024
    // plain characters would be sent as ~5,000 and refused.
    const message = formatPushoverMessage({
      title: "t",
      body: "&".repeat(2000),
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.message.length).toBeLessThanOrEqual(PUSHOVER_MESSAGE_MAX);
  });

  it("counts a line break as the `<br>` it becomes", () => {
    const message = formatPushoverMessage({
      title: "t",
      body: "line\n".repeat(400),
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.message.length).toBeLessThanOrEqual(PUSHOVER_MESSAGE_MAX);
  });

  it("never cuts inside an entity or a tag", () => {
    const message = formatPushoverMessage({
      title: "t",
      body: `${"a".repeat(1010)}&&&&&&&&&&`,
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.message.length).toBeLessThanOrEqual(PUSHOVER_MESSAGE_MAX);
    // A truncated `&amp;` or `<br>` is what a naive slice of the rendered string
    // produces; neither may appear.
    expect(/&[a-z]*$/.test(message.message)).toBe(false);
    expect(/<b?r?$/.test(message.message)).toBe(false);
  });

  it("clamps the deep link", () => {
    const message = formatPushoverMessage({
      title: "t",
      body: "b",
      href: `/asset/${"x".repeat(900)}`,
      origin: ORIGIN,
    });
    expect(message.url?.length ?? 0).toBeLessThanOrEqual(PUSHOVER_URL_MAX);
  });

  it("leaves a short message exactly as written", () => {
    const message = formatPushoverMessage({
      title: "Your day",
      body: "3 tasks for today",
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.title).toBe("Your day");
    expect(message.message).toBe("3 tasks for today");
  });
});

describe("escaping, because html=1", () => {
  it("renders a record title as text, not as markup", () => {
    const message = formatPushoverMessage({
      title: "t",
      body: '<b>Buy milk</b> & "eggs"',
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.message).toBe(
      "&lt;b&gt;Buy milk&lt;/b&gt; &amp; &quot;eggs&quot;",
    );
  });

  it("turns line breaks into the one tag it emits", () => {
    const message = formatPushoverMessage({
      title: "t",
      body: "first\nsecond",
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.message).toBe("first<br>second");
  });

  it("does not escape the title, which Pushover renders as plain text", () => {
    const message = formatPushoverMessage({
      title: "Ross & Co — service",
      body: "b",
      href: "/today",
      origin: ORIGIN,
    });
    expect(message.title).toBe("Ross & Co — service");
  });
});

describe("the deep link", () => {
  it("joins the origin to the notification's in-application path", () => {
    const message = formatPushoverMessage({
      title: "t",
      body: "b",
      href: "/asset/abc?tab=obligations",
      origin: ORIGIN,
    });
    expect(message.url).toBe(`${ORIGIN}/asset/abc?tab=obligations`);
    expect(message.urlTitle).toBe("Open in DalyHub");
  });

  it("tolerates a trailing slash on the configured origin", () => {
    const message = formatPushoverMessage({
      title: "t",
      body: "b",
      href: "/today",
      origin: `${ORIGIN}/`,
    });
    expect(message.url).toBe(`${ORIGIN}/today`);
  });

  it("omits the link entirely when no origin is configured", () => {
    // The message still goes. Arriving without a tappable link is a smaller
    // failure than not arriving.
    const message = formatPushoverMessage({
      title: "t",
      body: "b",
      href: "/today",
      origin: null,
    });
    expect(message.url).toBeUndefined();
    expect(message.urlTitle).toBeUndefined();
  });
});

describe("priority", () => {
  it("is 0 unless a caller asks for 1", () => {
    expect(
      formatPushoverMessage({
        title: "t",
        body: "b",
        href: "/today",
        origin: null,
      }).priority,
    ).toBe(0);
    expect(
      formatPushoverMessage({
        title: "t",
        body: "b",
        href: "/today",
        origin: null,
        priority: 1,
      }).priority,
    ).toBe(1);
  });

  // There is deliberately no test for priority 2. It is refused by the TYPE —
  // `NotificationPriority` is `0 | 1` — so there is no call to write, which is
  // the strongest form the refusal can take.
});
