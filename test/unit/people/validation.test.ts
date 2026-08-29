import { describe, expect, it } from "vitest";

import {
  PersonValidationError,
  validatePersonDetails,
  validatePersonStatus,
  validatePersonTitle,
  validateTags,
} from "~/kernel/people";

describe("validatePersonTitle", () => {
  it("trims and returns a valid title", () => {
    expect(validatePersonTitle("  Ada  ")).toBe("Ada");
  });
  it("rejects an empty title", () => {
    expect(() => validatePersonTitle("   ")).toThrow(PersonValidationError);
  });
});

describe("validateTags", () => {
  /*
   * V2.6 FIND-02 changed the ORDER, and only the order: the returned set is now
   * canonical (ordered by folded key) rather than input-ordered, because a
   * canonical set is what lets a repository decide "nothing changed" without a
   * set-difference helper. Trimming, blank-dropping and case-insensitive
   * de-duplication with FIRST SPELLING WINS are unchanged, and the casing the
   * owner typed is still what comes back.
   */
  it("trims, drops blanks, dedupes case-insensitively and returns canonical order", () => {
    expect(validateTags(["  Maths ", "maths", "History", ""])).toEqual([
      "History",
      "Maths",
    ]);
  });
  it("keeps the FIRST spelling of a tag, whatever its case", () => {
    expect(validateTags(["MATHS", "maths"])).toEqual(["MATHS"]);
  });
  it("rejects an over-long tag", () => {
    expect(() => validateTags(["x".repeat(65)])).toThrow(PersonValidationError);
  });
  it("returns an empty array for undefined", () => {
    expect(validateTags(undefined)).toEqual([]);
  });
});

describe("validatePersonDetails", () => {
  it("materialises every scalar field on create (omitted → null)", () => {
    const result = validatePersonDetails({ email: "a@b.co" }, "create");
    expect(result.scalars.get("email")).toBe("a@b.co");
    expect(result.scalars.get("role")).toBeNull();
    expect(result.tagsProvided).toBe(true);
  });

  it("includes only present fields on update", () => {
    const result = validatePersonDetails({ role: "Dev" }, "update");
    expect(result.scalars.has("role")).toBe(true);
    expect(result.scalars.has("email")).toBe(false);
    expect(result.tagsProvided).toBe(false);
  });

  it("rejects an invalid email, unknown relationship, bad date and unsafe URL", () => {
    for (const bad of [
      { email: "nope" },
      { relationship: "villain" },
      { birthday: "2026-13-40" },
      { website: "javascript:alert(1)" },
      { favouriteContactMethod: "carrier_pigeon" },
    ]) {
      expect(() => validatePersonDetails(bad, "update")).toThrow(
        PersonValidationError,
      );
    }
  });

  it("accepts a data URI for the photo but not for the website", () => {
    expect(() =>
      validatePersonDetails(
        { photoUrl: "data:image/png;base64,AAAA" },
        "update",
      ),
    ).not.toThrow();
    expect(() =>
      validatePersonDetails(
        { website: "data:image/png;base64,AAAA" },
        "update",
      ),
    ).toThrow(PersonValidationError);
  });
});

describe("validatePersonStatus", () => {
  it("defaults to active and accepts the known statuses", () => {
    expect(validatePersonStatus(undefined)).toBe("active");
    expect(validatePersonStatus("archived")).toBe("archived");
    expect(validatePersonStatus("all")).toBe("all");
    expect(() => validatePersonStatus("weird")).toThrow(PersonValidationError);
  });
});
