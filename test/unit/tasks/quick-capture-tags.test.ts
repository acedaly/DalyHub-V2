import { describe, expect, it } from "vitest";

import {
  MAX_CAPTURE_TAGS,
  applyCaptureTags,
  interpretationIsMeaningful,
  parseQuickCapture,
} from "~/shared/task-record/quick-capture";

/**
 * V2.6 FIND-04 — `#tag` as ONE more token in the closed capture grammar.
 *
 * The parser's own opening comment is the constraint this item works inside:
 * *"a DELIBERATELY BOUNDED, deterministic token vocabulary — NOT natural-language
 * understanding and NOT AI"*, and *"a phrase the grammar cannot fully recognise
 * is left as ORDINARY WORDS rather than clamped into a rule the owner did not
 * ask for."*
 *
 * So the adversarial half of this file is not decoration. `#` is the single most
 * common character in ordinary text that a naive tag token would eat — issue
 * numbers, pasted Markdown headings, hashes in prose — and every one of those
 * cases is enumerated below and required to stay text.
 */

const TODAY = "2026-07-25";
const VOCABULARY = [
  { key: "errand", label: "Errand" },
  { key: "deep work", label: "Deep Work" },
];

function parse(text: string, knownTags = VOCABULARY) {
  return parseQuickCapture(text, { todayIso: TODAY, knownTags });
}

describe("FIND-04 — `#tag` is recognised as a whole token", () => {
  it("recognises a tag and reduces the title", () => {
    const result = parse("Call the plumber #errand");
    expect(result.title).toBe("Call the plumber");
    expect(result.tags).toEqual([
      { key: "errand", label: "Errand", known: true },
    ]);
  });

  it("resolves CASE-INSENSITIVELY, by FIND-02's canonicalisation rule", () => {
    // The recorded case decision, reaching the capture line: `#ERRAND` is the
    // tag the workspace already has, and the owner sees ITS spelling — exactly
    // what choosing it in the picker would have shown.
    for (const written of ["#ERRAND", "#Errand", "#errand"]) {
      const result = parse(`Call the plumber ${written}`);
      expect(result.tags).toEqual([
        { key: "errand", label: "Errand", known: true },
      ]);
      expect(result.title).toBe("Call the plumber");
    }
  });

  it("works ANYWHERE the other tokens work, not only at the end", () => {
    for (const line of [
      "#errand Call the plumber",
      "Call #errand the plumber",
      "Call the plumber #errand",
    ]) {
      const result = parse(line);
      expect(
        result.tags.map((tag) => tag.key),
        line,
      ).toEqual(["errand"]);
      expect(result.title, line).toBe("Call the plumber");
    }
  });

  it("carries several tags, and collapses a repeat to one", () => {
    const result = parse("Errands #errand #deep-work #ERRAND");
    expect(result.tags.map((tag) => tag.key)).toEqual(["errand", "deep-work"]);
    // Both spellings of the repeated tag are consumed — one must not survive as
    // prose while the other becomes a tag.
    expect(result.title).toBe("Errands");
  });

  it("combines with every other token in the grammar", () => {
    // The roadmap's own example, plus the tokens either side of it.
    const result = parse("Call the plumber #home p2 friday");
    expect(result.title).toBe("Call the plumber");
    expect(result.priority).toBe("p2");
    expect(result.scheduledDate).not.toBeNull();
    expect(result.tags.map((tag) => tag.key)).toEqual(["home"]);
  });

  it("NEVER empties the title — a line of only tags stays literal text", () => {
    /*
     * The parser's own never-empty-title rule, which a tag token must obey like
     * every other: if removing the tokens would leave nothing, the ORIGINAL text
     * is the title and the interpretation is dropped. `#errand` alone is a Task
     * called "#errand", not an untitled Task with a tag.
     */
    const result = parse("#errand");
    expect(result.title).toBe("#errand");
    expect(result.tags).toEqual([]);
    expect(result.tokens).toEqual([]);

    const two = parse("#errand #deep-work");
    expect(two.title).toBe("#errand #deep-work");
    expect(two.tags).toEqual([]);
  });

  it("is bounded — an eleventh tag stays text", () => {
    const many = Array.from(
      { length: MAX_CAPTURE_TAGS + 1 },
      (_, index) => `#tag${index}`,
    ).join(" ");
    const result = parse(`Paste ${many}`);
    expect(result.tags).toHaveLength(MAX_CAPTURE_TAGS);
    // The overflow survives as the words the owner pasted.
    expect(result.title).toContain(`#tag${MAX_CAPTURE_TAGS}`);
  });

  it("makes a tag-only capture MEANINGFUL, so the preview is shown", () => {
    const result = parse("Call the plumber #errand");
    expect(interpretationIsMeaningful(result)).toBe(true);
  });
});

describe("FIND-04 — the unknown-tag decision, and how it is worded", () => {
  /*
   * The recorded decision: a `#tag` the workspace does not hold yet is
   * RECOGNISED and OFFERED FOR CREATION in the preview — never created silently,
   * and never left as literal words.
   *
   * The middle option, and the reasoning is worth stating because ADR-112 §6
   * points at "the third-or-second". `#` is an EXPLICIT marker, like `due …` and
   * `on …`, not a phrase the grammar is guessing at — so the "left as ordinary
   * words" rule, which exists for phrases the grammar cannot fully recognise,
   * does not apply: the grammar recognises this perfectly. What is genuinely at
   * stake is the VOCABULARY, and *"creating vocabulary as a side effect of
   * typing is how a tag list becomes unusable"* — which the preview answers by
   * showing the word as new before it is saved, where the owner can remove it.
   */
  it("recognises an unknown tag and marks it NEW", () => {
    const result = parse("Call the plumber #newthing");
    expect(result.tags).toEqual([
      { key: "newthing", label: "newthing", known: false },
    ]);
    const token = result.tokens.find((entry) => entry.kind === "tag");
    expect(token?.label).toBe("New tag: newthing");
  });

  it("names an EXISTING tag rather than offering to create it", () => {
    const result = parse("Call the plumber #errand");
    const token = result.tokens.find((entry) => entry.kind === "tag");
    expect(token?.label).toBe("Tag: Errand");
  });

  it("lets the owner REMOVE it, restoring the literal words", () => {
    // The preview's remove is the whole of "offered, not created": the chip is
    // dismissed by id, and the parser then treats the word as prose.
    const first = parse("Call the plumber #newthing");
    const token = first.tokens.find((entry) => entry.kind === "tag")!;
    const corrected = parseQuickCapture("Call the plumber #newthing", {
      todayIso: TODAY,
      knownTags: VOCABULARY,
      ignoredTokenIds: new Set([token.id]),
    });
    expect(corrected.title).toBe("Call the plumber #newthing");
    expect(corrected.tags).toEqual([]);
  });

  it("recognises the tag with NO vocabulary at all, calling it new", () => {
    // A surface that cannot supply the vocabulary — an offline replay, a
    // server-side classification — parses the same title into the same tag.
    const result = parseQuickCapture("Call the plumber #errand", {
      todayIso: TODAY,
    });
    expect(result.title).toBe("Call the plumber");
    expect(result.tags).toEqual([
      { key: "errand", label: "errand", known: false },
    ]);
  });
});

describe("FIND-04 — a surface with no preview cannot create vocabulary", () => {
  /*
   * Raised in review on PR #238, and correctly: the recorded decision is that an
   * unknown tag is OFFERED before it is created, and an offer only exists where
   * the owner is shown it. The full create form renders the token preview; the
   * in-list quick-add row, the capture sheet and every external transport do
   * not — so on those, an unknown `#word` used to be created permanently and
   * invisibly, and unreferenced vocabulary entries are kept on purpose, which
   * made a typo permanent.
   *
   * `unknownTags: "ignore"` is the same recorded decision applied to a surface
   * that cannot offer: resolve what the workspace already has, and leave
   * everything else as the words the owner typed.
   */
  function quiet(text: string, knownTags = VOCABULARY) {
    return parseQuickCapture(text, {
      todayIso: TODAY,
      knownTags,
      unknownTags: "ignore",
    });
  }

  it("still resolves a tag the workspace ALREADY has", () => {
    // Resolving an existing word is not creating vocabulary, so nothing is lost
    // by having no preview: this is the fast path the owner asked for.
    const result = quiet("Call the plumber #ERRAND");
    expect(result.tags).toEqual([
      { key: "errand", label: "Errand", known: true },
    ]);
    expect(result.title).toBe("Call the plumber");
  });

  it("leaves an unknown tag as the words the owner typed", () => {
    const result = quiet("Call the plumber #newthing");
    expect(result.tags).toEqual([]);
    expect(result.tokens.filter((token) => token.kind === "tag")).toEqual([]);
    // The whole point: the word SURVIVES. Nothing was created and nothing was
    // thrown away.
    expect(result.title).toBe("Call the plumber #newthing");
  });

  it("keeps the known one and leaves the unknown one, in the same line", () => {
    const result = quiet("Sort it #errand #newthing");
    expect(result.tags.map((tag) => tag.key)).toEqual(["errand"]);
    expect(result.title).toBe("Sort it #newthing");
  });

  it("creates nothing at all when the vocabulary could not be read", () => {
    // The soft-failure path on the capture service: no vocabulary means no tag
    // resolves, and the capture still arrives with its text intact.
    const result = quiet("Call the plumber #errand #newthing", []);
    expect(result.tags).toEqual([]);
    expect(result.title).toBe("Call the plumber #errand #newthing");
  });

  it("still recognises every OTHER token on those surfaces", () => {
    // The narrowing is about vocabulary, not about the grammar: priority, dates
    // and the rest are unaffected.
    const result = quiet("Call the plumber #newthing p2 friday");
    expect(result.priority).toBe("p2");
    expect(result.scheduledDate).not.toBeNull();
    expect(result.title).toBe("Call the plumber #newthing");
  });

  it("is NOT what the previewing surface does", () => {
    // The contrast, asserted rather than described: the same text, the same
    // vocabulary, the default option — offered, because there is a preview.
    const offered = parse("Call the plumber #newthing");
    expect(offered.tags).toEqual([
      { key: "newthing", label: "newthing", known: false },
    ]);
    expect(offered.title).toBe("Call the plumber");
  });
});

describe("FIND-04 — ordinary text stays ordinary text", () => {
  /**
   * The adversarial table. Each row is a real thing an owner types or pastes,
   * and every one of them must survive with its `#` intact.
   */
  const ORDINARY: readonly (readonly [string, string])[] = [
    // The canonical case, named in the acceptance criteria.
    ["the #1 priority", "digits only — an issue or rank, never a tag"],
    ["Fix #42 before Friday", "an issue number mid-sentence"],
    ["Row #1-2 needs checking", "digits and a hyphen, still no letter"],
    // Pasted Markdown.
    ["# Heading pasted in", "a bare `#` is a heading marker"],
    ["## Subheading pasted in", "and so is `##`"],
    ["Read ### three hashes", "any run of hashes"],
    // Malformed markers.
    ["A stray # in the middle", "a lone hash"],
    ["Weigh #- the options", "a body starting with punctuation"],
    ["Check #_private later", "and with an underscore"],
    // Punctuation adjoining the marker.
    ["Call the plumber #home.", "a full stop makes it a different word"],
    ["Buy milk #home, then go", "and so does a comma"],
    ["Shout #home!", "and an exclamation"],
    ["Is it #home?", "and a question mark"],
    ["Quote “#home”", "and quotation marks"],
    ["Ring end.#home", "a hash that does not START the word"],
    ["Path a/#home", "the same, with a slash"],
  ];

  for (const [line, why] of ORDINARY) {
    it(`keeps “${line}” as text — ${why}`, () => {
      const result = parse(line);
      expect(result.tags).toEqual([]);
      expect(result.tokens.filter((token) => token.kind === "tag")).toEqual([]);
      // The words survive exactly, hash included.
      expect(result.title).toContain("#");
    });
  }

  it("does not let a tag swallow the words around it", () => {
    const result = parse("Read the #1 issue about #errand handling");
    expect(result.tags.map((tag) => tag.key)).toEqual(["errand"]);
    expect(result.title).toBe("Read the #1 issue about handling");
  });
});

describe("FIND-04 — every surface submits the same thing", () => {
  it("writes the LABELS, and nothing at all when there are none", () => {
    // `applyCaptureTags` is the shared mapping, so the `/tasks` form, the
    // in-list quick add and the phone capture sheet cannot disagree about what
    // a recognised tag becomes on the wire.
    const body = new FormData();
    applyCaptureTags(body, parse("Call the plumber #errand #newthing").tags);
    expect(body.get("tags")).toBe(JSON.stringify(["Errand", "newthing"]));

    const empty = new FormData();
    applyCaptureTags(empty, parse("Call the plumber").tags);
    // An untagged capture posts exactly the body it always did.
    expect(empty.has("tags")).toBe(false);
  });
});
