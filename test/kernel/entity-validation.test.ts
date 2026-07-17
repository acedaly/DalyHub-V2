import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  ENTITY_TYPE_MAX_LENGTH,
  ID_MAX_LENGTH,
  MAX_PAGE_SIZE,
  TITLE_MAX_LENGTH,
} from "~/kernel/entities";
import { EntityValidationError } from "~/kernel/entities/entity-errors";
import {
  validateCreateInput,
  validateEntityType,
  validateLimit,
  validateOptionalType,
  validateTitle,
  validateWorkspaceId,
} from "~/kernel/entities/entity-validation";

describe("validateWorkspaceId / validateId", () => {
  it("accepts a non-empty id", () => {
    expect(validateWorkspaceId("ws_1")).toBe("ws_1");
  });

  it("rejects an empty id", () => {
    expect(() => validateWorkspaceId("")).toThrow(EntityValidationError);
  });

  it("rejects a non-string id", () => {
    expect(() => validateWorkspaceId(undefined)).toThrow(EntityValidationError);
    expect(() => validateWorkspaceId(42)).toThrow(EntityValidationError);
  });

  it("rejects an over-long id", () => {
    expect(() => validateWorkspaceId("a".repeat(ID_MAX_LENGTH + 1))).toThrow(
      EntityValidationError,
    );
  });

  it("reports the offending field", () => {
    try {
      validateWorkspaceId("");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EntityValidationError);
      expect((error as EntityValidationError).field).toBe("workspaceId");
    }
  });
});

describe("validateEntityType", () => {
  it("accepts simple and dotted identifiers", () => {
    expect(validateEntityType("task")).toBe("task");
    expect(validateEntityType("meeting.follow_up")).toBe("meeting.follow_up");
    expect(validateEntityType("note2")).toBe("note2");
  });

  it("rejects an empty type", () => {
    expect(() => validateEntityType("")).toThrow(EntityValidationError);
  });

  it("rejects invalid shapes", () => {
    for (const bad of [
      "Task",
      "1task",
      "task-name",
      "task ",
      " task",
      "task.",
      ".task",
      "task..name",
      "тип",
    ]) {
      expect(() => validateEntityType(bad)).toThrow(EntityValidationError);
    }
  });

  it("rejects an over-long type", () => {
    expect(() =>
      validateEntityType("a".repeat(ENTITY_TYPE_MAX_LENGTH + 1)),
    ).toThrow(EntityValidationError);
  });

  it("does not hard-code the known entity types (any valid slug works)", () => {
    // A type a future module might register without a migration.
    expect(validateEntityType("some_future_module.widget")).toBe(
      "some_future_module.widget",
    );
  });
});

describe("validateTitle", () => {
  it("trims and returns the title", () => {
    expect(validateTitle("  Hello  ")).toBe("Hello");
  });

  it("rejects a blank or whitespace-only title", () => {
    expect(() => validateTitle("")).toThrow(EntityValidationError);
    expect(() => validateTitle("   ")).toThrow(EntityValidationError);
  });

  it("rejects a non-string title", () => {
    expect(() => validateTitle(null)).toThrow(EntityValidationError);
  });

  it("accepts a title at the length limit and rejects one over it", () => {
    expect(validateTitle("x".repeat(TITLE_MAX_LENGTH))).toHaveLength(
      TITLE_MAX_LENGTH,
    );
    expect(() => validateTitle("x".repeat(TITLE_MAX_LENGTH + 1))).toThrow(
      EntityValidationError,
    );
  });

  it("measures length in code points, not UTF-16 units", () => {
    // "😀" is two UTF-16 units but one code point; TITLE_MAX_LENGTH of them fit.
    expect(validateTitle("😀".repeat(TITLE_MAX_LENGTH))).toBeDefined();
  });
});

describe("validateLimit", () => {
  it("defaults to DEFAULT_PAGE_SIZE when omitted", () => {
    expect(validateLimit(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("clamps to the maximum page size", () => {
    expect(validateLimit(MAX_PAGE_SIZE + 1000)).toBe(MAX_PAGE_SIZE);
  });

  it("passes a valid limit through", () => {
    expect(validateLimit(10)).toBe(10);
  });

  it("rejects non-integers and non-positive limits", () => {
    expect(() => validateLimit(1.5)).toThrow(EntityValidationError);
    expect(() => validateLimit(0)).toThrow(EntityValidationError);
    expect(() => validateLimit(-1)).toThrow(EntityValidationError);
    expect(() => validateLimit("10")).toThrow(EntityValidationError);
  });
});

describe("validateOptionalType", () => {
  it("returns undefined when not provided", () => {
    expect(validateOptionalType(undefined)).toBeUndefined();
  });

  it("validates a provided type", () => {
    expect(validateOptionalType("project")).toBe("project");
    expect(() => validateOptionalType("Bad Type")).toThrow(
      EntityValidationError,
    );
  });
});

describe("validateCreateInput", () => {
  it("validates and normalises the caller-supplied fields (no workspace)", () => {
    // FND-03: the create input carries no workspace — scope comes from the
    // repository's bound context, not the caller.
    expect(
      validateCreateInput({
        type: "task",
        title: "  Buy milk  ",
      }),
    ).toEqual({ type: "task", title: "Buy milk" });
  });

  it("fails if any single field is invalid", () => {
    expect(() => validateCreateInput({ type: "task", title: "  " })).toThrow(
      EntityValidationError,
    );
  });
});
