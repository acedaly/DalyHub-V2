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
  it("trims, drops blanks, dedupes case-insensitively and preserves order", () => {
    expect(validateTags(["  Maths ", "maths", "History", ""])).toEqual([
      "Maths",
      "History",
    ]);
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
