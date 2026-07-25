/**
 * DIARY-01A — the extensible Entry-type vocabulary (pure unit tests).
 *
 * Proves the vocabulary is OPEN (any syntactically valid identifier parses,
 * registered or not), the nine built-ins are present and ordered, and the
 * registry is immutable and extensible without mutating in place.
 */

import { describe, expect, it } from "vitest";

import {
  BUILT_IN_DIARY_ENTRY_TYPES,
  DiaryValidationError,
  createDiaryEntryTypeRegistry,
  isBuiltInDiaryEntryType,
  parseDiaryEntryType,
} from "~/kernel/diary";

describe("parseDiaryEntryType", () => {
  it.each(["note", "conversation", "reflection", "custom.workout", "a.b.c_d"])(
    "accepts the valid identifier %p",
    (value) => {
      expect(parseDiaryEntryType(value)).toBe(value);
    },
  );

  it.each([42, null, undefined, {}, [], true])(
    "rejects a non-string (%p)",
    (value) => {
      expect(() => parseDiaryEntryType(value)).toThrow(DiaryValidationError);
    },
  );

  it.each([
    "",
    "Note",
    "1note",
    ".note",
    "note.",
    "no te",
    "note-type",
    "a".repeat(65),
  ])("rejects the malformed identifier %p", (value) => {
    expect(() => parseDiaryEntryType(value)).toThrow(DiaryValidationError);
  });

  it("accepts an unregistered (custom) type — the vocabulary is open, not a closed set", () => {
    expect(parseDiaryEntryType("custom.mood")).toBe("custom.mood");
    expect(isBuiltInDiaryEntryType("custom.mood")).toBe(false);
  });
});

describe("built-in vocabulary", () => {
  it("ships exactly the nine initial types in a stable order", () => {
    expect(BUILT_IN_DIARY_ENTRY_TYPES.map((d) => d.type)).toEqual([
      "note",
      "conversation",
      "meeting",
      "decision",
      "idea",
      "reflection",
      "event",
      "travel",
      "observation",
    ]);
  });

  it("recognises every built-in", () => {
    for (const descriptor of BUILT_IN_DIARY_ENTRY_TYPES) {
      expect(isBuiltInDiaryEntryType(descriptor.type)).toBe(true);
    }
  });
});

describe("DiaryEntryTypeRegistry", () => {
  it("resolves built-in descriptors and returns null for unknown types", () => {
    const registry = createDiaryEntryTypeRegistry();
    expect(registry.get("meeting")?.label).toBe("Meeting");
    expect(registry.has("meeting")).toBe(true);
    expect(registry.get("custom.workout")).toBeNull();
    expect(registry.has("custom.workout")).toBe(false);
    expect(registry.list()).toHaveLength(9);
  });

  it("register returns a NEW registry, leaving the original unchanged (immutable)", () => {
    const base = createDiaryEntryTypeRegistry();
    const extended = base.register({
      type: "custom.workout",
      label: "Workout",
      description: "A training session.",
    });
    expect(extended).not.toBe(base);
    expect(base.has("custom.workout")).toBe(false);
    expect(extended.has("custom.workout")).toBe(true);
    expect(extended.get("custom.workout")?.label).toBe("Workout");
    expect(extended.list()).toHaveLength(10);
  });

  it("register validates the custom type and requires a label", () => {
    const base = createDiaryEntryTypeRegistry();
    expect(() => base.register({ type: "Bad Type", label: "x" })).toThrow(
      DiaryValidationError,
    );
    expect(() => base.register({ type: "custom.ok", label: "" })).toThrow(
      DiaryValidationError,
    );
  });

  it("registering an existing type replaces its descriptor without duplicating it", () => {
    const registry = createDiaryEntryTypeRegistry().register({
      type: "note",
      label: "Quick note",
    });
    expect(registry.list()).toHaveLength(9);
    expect(registry.get("note")?.label).toBe("Quick note");
  });
});
