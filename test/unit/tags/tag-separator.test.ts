import { describe, expect, it } from "vitest";

import {
  parseEntityTagInput,
  parseTagFilterKeys,
  tagKeys,
  validateEntityTags,
} from "~/kernel/tags";
import { parseTaskViewConfig } from "~/kernel/task-views";
import {
  configFromParams,
  paramsFromConfig,
} from "~/modules/tasks/tasks-url-state";

/**
 * V2.6 FIND-02/03 — a comma is a SEPARATOR, and therefore never part of a tag.
 *
 * Found in review on PR #238, and it is a round-trip bug rather than a
 * cosmetic one: `paramsFromConfig` joins the selected filter members with
 * commas and `parseTagFilterKeys` splits the value at every comma, so a tag
 * whose key contained one would be decoded as two different tags. The
 * repository would then query identities the owner never chose, and a shared or
 * bookmarked filter URL would quietly change meaning.
 *
 * The two readings cannot both be possible, so the tag is the one made
 * impossible — which is not a new rule but the one the product already had:
 * `parseEntityTagInput` has always split a typed string on a comma. This file
 * pins that the SAME rule now holds wherever a tag can enter, and that the
 * filter therefore round-trips.
 */

describe("a comma never reaches a tag key", () => {
  it("splits a JSON member carrying one, keeping both words", () => {
    // The path the old rule missed: a JSON array (what every shared form posts)
    // whose MEMBER contains the separator. It used to become one tag `a,b`.
    expect(tagKeys(validateEntityTags(["errand,garage"]))).toEqual([
      "errand",
      "garage",
    ]);
    expect(tagKeys(parseEntityTagInput('["errand,garage"]'))).toEqual([
      "errand",
      "garage",
    ]);
  });

  it("normalises the whitespace around the separator away", () => {
    expect(tagKeys(validateEntityTags(["  spaced , out  "]))).toEqual([
      "out",
      "spaced",
    ]);
  });

  it("drops an empty member rather than inventing a blank tag", () => {
    expect(tagKeys(validateEntityTags(["errand,,garage", ","]))).toEqual([
      "errand",
      "garage",
    ]);
  });

  it("collapses a repeat that arrives across the separator", () => {
    expect(tagKeys(validateEntityTags(["Errand,errand", "ERRAND"]))).toEqual([
      "errand",
    ]);
  });

  it("keeps the plain comma-separated string behaving as it always did", () => {
    expect(tagKeys(parseEntityTagInput("errand, garage"))).toEqual([
      "errand",
      "garage",
    ]);
  });
});

describe("the Tasks tag filter round-trips through its URL", () => {
  it("decodes exactly the keys it encoded", () => {
    // Through the REAL URL codec — `paramsFromConfig` is what writes the shared
    // link and `configFromParams` is what a bookmark of it is read back with.
    const config = parseTaskViewConfig({
      filters: { tags: ["errand", "deep work", "garage"] },
    });
    const params = paramsFromConfig(config, new URLSearchParams());
    const round = configFromParams(params);
    expect(round.filters.tags).toEqual(["deep work", "errand", "garage"]);
    // A tag containing a space survives the comma-joined value intact, which is
    // the case that made the delimiter worth pinning at all.
    expect(params.get("tag")).toContain("deep work");
  });

  it("cannot be handed a member that splits, because no tag can contain one", () => {
    // The defect, stated as the property that now prevents it: whatever a tag
    // set contains, joining it on the separator and splitting it back returns
    // the same set — which is only true because no key holds a comma.
    const keys = tagKeys(
      validateEntityTags(["errand,garage", "Deep Work", "  spaced , out "]),
    );
    expect(parseTagFilterKeys(keys.join(","))).toEqual([...keys].sort());
  });
});
