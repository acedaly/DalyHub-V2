/**
 * CAPTURE-01 — conservative classification.
 *
 * The property under test is not "the classifier is clever". It is that the
 * classifier only ever acts on a signal the owner deliberately put there, and
 * that everything else lands in the Inbox rather than being guessed at (CAPTURE-01 §6, §8).
 */

import { describe, expect, it } from "vitest";

import {
  classifyCapture,
  parseCaptureRequest,
  type CaptureRequest,
} from "~/kernel/capture";
import {
  interpretationIsMeaningful,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";

const TODAY = "2026-08-11";

/** The SAME deterministic parser Task capture uses — not a second one (CAPTURE-01 §7). */
const planningGrammar = (text: string): boolean =>
  interpretationIsMeaningful(parseQuickCapture(text, { todayIso: TODAY }));

function capture(body: Record<string, unknown>): CaptureRequest {
  return parseCaptureRequest(body);
}

function classify(body: Record<string, unknown>) {
  return classifyCapture(capture(body), planningGrammar);
}

describe("explicit intent always wins", () => {
  it("creates a Task when the sender said task", () => {
    const result = classify({
      kind: "task",
      text: "A long reflective passage",
    });
    expect(result.kind).toBe("task");
    expect(result.destination).toBe("Inbox");
    expect(result.reason).toBe("explicit_intent");
  });

  it("creates a Note when the sender said note", () => {
    const result = classify({ kind: "note", text: "Call Sarah tomorrow" });
    expect(result.kind).toBe("note");
    expect(result.destination).toBe("Notes");
  });

  it("treats inbox as an unassigned Task, not a third record type", () => {
    const result = classify({ kind: "inbox", text: "Look into camper solar" });
    expect(result.kind).toBe("task");
    expect(result.destination).toBe("Inbox");
  });

  it("never lets the classifier override a shared URL the sender called a Task", () => {
    const result = classify({
      kind: "task",
      text: "Read this",
      sourceUrl: "https://example.com/a",
    });
    expect(result.kind).toBe("task");
  });
});

describe("auto — the signals that are strong enough to act on", () => {
  it("reads planning grammar as a Task", () => {
    expect(classify({ text: "Call Sarah tomorrow" }).reason).toBe(
      "planning_grammar",
    );
    expect(classify({ text: "Submit the form p1" }).kind).toBe("task");
    expect(classify({ text: "Water the plants every Monday" }).kind).toBe(
      "task",
    );
  });

  it("reads an unmistakable action opener as a Task", () => {
    const result = classify({ text: "Book the campsite" });
    expect(result.kind).toBe("task");
    expect(result.reason).toBe("action_verb");
    expect(classify({ text: "Pick up the parcel" }).kind).toBe("task");
    expect(classify({ text: "Follow up with the academy" }).kind).toBe("task");
  });

  it("reads an explicit reference marker as a Note", () => {
    const result = classify({
      text: "OpO idea: entry pathways need a common foundational block",
    });
    expect(result.kind).toBe("note");
    expect(result.reason).toBe("note_marker");
    expect(classify({ text: "Note: the trailer bearings run hot" }).kind).toBe(
      "note",
    );
  });

  it("reads a headline plus a body as a Note", () => {
    const result = classify({
      title: "Modularisation",
      text: "Induction may work better as a prerequisite.",
    });
    expect(result.kind).toBe("note");
    expect(result.reason).toBe("title_and_body");
  });

  it("reads several paragraphs as a Note", () => {
    expect(
      classify({ text: "First thought.\n\nSecond, unrelated thought." }).reason,
    ).toBe("multiple_paragraphs");
  });

  it("reads a long passage as a Note", () => {
    expect(classify({ text: "word ".repeat(80) }).kind).toBe("note");
  });

  it("reads a shared page with no action in it as a Note", () => {
    const result = classify({
      text: "camper solar",
      sourceUrl: "https://example.com/article",
      source: "ios-share-sheet",
    });
    expect(result.kind).toBe("note");
    expect(result.reason).toBe("shared_page");
  });

  it("still reads a shared page WITH an action in it as a Task", () => {
    const result = classify({
      text: "Read this tomorrow",
      sourceUrl: "https://example.com/article",
      source: "ios-share-sheet",
    });
    expect(result.kind).toBe("task");
    expect(result.reason).toBe("planning_grammar");
  });
});

describe("auto — ambiguity goes to the Inbox, never to a guess", () => {
  it("files the brief's own ambiguous example in the Inbox", () => {
    const result = classify({ text: "Look into camper solar" });
    expect(result.kind).toBe("task");
    expect(result.destination).toBe("Inbox");
    expect(result.reason).toBe("ambiguous");
  });

  it("files an ordinary fragment in the Inbox", () => {
    for (const text of [
      "Trailer bearings",
      "Something about the shed",
      "That thing Dad mentioned",
      "Hilux",
    ]) {
      const result = classify({ text });
      expect(result.destination).toBe("Inbox");
      expect(result.reason).toBe("ambiguous");
    }
  });

  it("never discards anything it cannot classify", () => {
    // Every branch of the classifier returns a record kind. There is no "drop"
    // outcome to test for, and that is the guarantee: the type has no third case.
    const result = classify({ text: "???" });
    expect(["task", "note"]).toContain(result.kind);
  });
});

describe("classification is deterministic", () => {
  it("gives the same answer for the same capture, every time", () => {
    const value = capture({ text: "Look into camper solar" });
    const first = classifyCapture(value, planningGrammar);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(classifyCapture(value, planningGrammar)).toEqual(first);
    }
  });

  it("needs no network, model or credential", () => {
    // The probe is the only injected dependency and it is a pure function.
    expect(classifyCapture(capture({ text: "x" }), () => false).kind).toBe(
      "task",
    );
  });
});
