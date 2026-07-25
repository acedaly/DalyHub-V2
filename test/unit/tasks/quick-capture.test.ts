import { describe, expect, it } from "vitest";

import {
  interpretationIsMeaningful,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";

describe("parseQuickCapture", () => {
  it("returns the plain title when there are no tokens", () => {
    const r = parseQuickCapture("Finish the OpO slides");
    expect(r.title).toBe("Finish the OpO slides");
    expect(r.priority).toBeNull();
    expect(r.timeSector).toBeNull();
    expect(r.commitmentState).toBe("active");
    expect(r.waiting).toBe(false);
    expect(r.delegate).toBe(false);
    expect(r.tokens).toHaveLength(0);
    expect(interpretationIsMeaningful(r)).toBe(false);
  });

  it("extracts a priority token as a whole word", () => {
    const r = parseQuickCapture("Ship release p1");
    expect(r.title).toBe("Ship release");
    expect(r.priority).toBe("p1");
    expect(interpretationIsMeaningful(r)).toBe(true);
  });

  it("does not treat p1 inside a word or mid-sentence text as a token", () => {
    const r = parseQuickCapture("Plan the p1launch");
    expect(r.priority).toBeNull();
    expect(r.title).toBe("Plan the p1launch");
  });

  it("prefers the two-word sector phrase over a single word", () => {
    const r = parseQuickCapture("Draft budget next week");
    expect(r.timeSector).toBe("next_week");
    expect(r.title).toBe("Draft budget");
  });

  it("maps this week / this month / long term / routine", () => {
    expect(parseQuickCapture("a this week").timeSector).toBe("this_week");
    expect(parseQuickCapture("a this month").timeSector).toBe("this_month");
    expect(parseQuickCapture("a long term").timeSector).toBe("long_term");
    expect(parseQuickCapture("water plants routine").timeSector).toBe(
      "routines",
    );
  });

  it("recognises someday, waiting and delegate", () => {
    const r = parseQuickCapture("Learn cello someday");
    expect(r.commitmentState).toBe("someday");
    const w = parseQuickCapture("Sign-off waiting");
    expect(w.waiting).toBe(true);
    const d = parseQuickCapture("Redesign logo delegate");
    expect(d.delegate).toBe(true);
  });

  it("combines several tokens and strips them all from the title", () => {
    const r = parseQuickCapture("Prepare deck p1 this week");
    expect(r.title).toBe("Prepare deck");
    expect(r.priority).toBe("p1");
    expect(r.timeSector).toBe("this_week");
    expect(r.tokens.map((t) => t.kind).sort()).toEqual(["priority", "sector"]);
  });

  it("keeps the original text when tokens would empty the title", () => {
    const r = parseQuickCapture("p1 this week");
    // Removing tokens would leave nothing → keep original text, drop interpretation.
    expect(r.title).toBe("p1 this week");
    expect(r.priority).toBeNull();
    expect(r.timeSector).toBeNull();
    expect(r.tokens).toHaveLength(0);
  });

  it("is case-insensitive for tokens", () => {
    const r = parseQuickCapture("Review PR P2 Next Week");
    expect(r.priority).toBe("p2");
    expect(r.timeSector).toBe("next_week");
  });
});
