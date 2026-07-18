import { describe, expect, it } from "vitest";

import {
  ActivityPayloadError,
  ActivityValidationError,
  MAX_SUBJECTS,
  PAYLOAD_MAX_DEPTH,
  parseActivityType,
  parseActorType,
  parseSubjectRole,
  serializeActivityPayload,
  validateActivityLimit,
  validateActor,
  validateActorId,
  validateActivityPayload,
  validateSubjects,
  isActivityType,
} from "~/kernel/activity";

// FND-05: pure, storage-independent validation of everything crossing the
// Activity kernel boundary (ADR-012). No D1 involved.

describe("Activity type validation", () => {
  it("accepts valid lowercase dotted identifiers", () => {
    for (const t of [
      "entity.created",
      "entity_link.unlinked",
      "system",
      "a.b.c_d",
    ]) {
      expect(parseActivityType(t)).toBe(t);
      expect(isActivityType(t)).toBe(true);
    }
  });

  it("rejects invalid types", () => {
    for (const t of [
      "",
      "Entity.Created",
      "entity..created",
      ".entity",
      "entity.",
      "entity created",
      "1entity",
      42,
      null,
      "a".repeat(129),
    ]) {
      expect(() => parseActivityType(t)).toThrow(ActivityValidationError);
      expect(isActivityType(t)).toBe(false);
    }
  });
});

describe("Actor validation", () => {
  it("accepts valid actor types", () => {
    for (const t of ["system", "user", "ai", "import", "integration"]) {
      expect(parseActorType(t)).toBe(t);
    }
  });

  it("rejects invalid actor types", () => {
    for (const t of ["", "System", "a b", 5, null, "x".repeat(65)]) {
      expect(() => parseActorType(t)).toThrow(ActivityValidationError);
    }
  });

  it("validates actor id: null allowed, empty rejected, bounded", () => {
    expect(validateActorId(null)).toBeNull();
    expect(validateActorId(undefined)).toBeNull();
    expect(validateActorId("user_123")).toBe("user_123");
    expect(() => validateActorId("")).toThrow(ActivityValidationError);
    expect(() => validateActorId("x".repeat(129))).toThrow(
      ActivityValidationError,
    );
    expect(() => validateActorId(42)).toThrow(ActivityValidationError);
  });

  it("validates a whole actor context", () => {
    expect(validateActor({ type: "system", id: null })).toEqual({
      type: "system",
      id: null,
    });
    expect(validateActor({ type: "user", id: "u1" })).toEqual({
      type: "user",
      id: "u1",
    });
    expect(() => validateActor({ type: "BAD", id: null })).toThrow(
      ActivityValidationError,
    );
  });
});

describe("Subject validation", () => {
  it("accepts valid roles", () => {
    for (const r of ["subject", "source", "target"]) {
      expect(parseSubjectRole(r)).toBe(r);
    }
  });

  it("rejects invalid roles", () => {
    for (const r of ["", "Source", "a b", 1, null]) {
      expect(() => parseSubjectRole(r)).toThrow(ActivityValidationError);
    }
  });

  it("requires at least one subject and bounds the count", () => {
    expect(() => validateSubjects([])).toThrow(ActivityValidationError);
    const many = Array.from({ length: MAX_SUBJECTS + 1 }, (_, i) => ({
      entityId: `e${i}`,
      role: "subject",
    }));
    expect(() => validateSubjects(many)).toThrow(ActivityValidationError);
  });

  it("rejects duplicate subject entities (regardless of role)", () => {
    expect(() =>
      validateSubjects([
        { entityId: "e1", role: "source" },
        { entityId: "e1", role: "target" },
      ]),
    ).toThrow(ActivityValidationError);
  });

  it("accepts distinct subjects", () => {
    expect(
      validateSubjects([
        { entityId: "e1", role: "source" },
        { entityId: "e2", role: "target" },
      ]),
    ).toEqual([
      { entityId: "e1", role: "source" },
      { entityId: "e2", role: "target" },
    ]);
  });
});

describe("Payload validation", () => {
  it("accepts a valid nested JSON object payload", () => {
    const payload = {
      entityType: "task",
      title: "Do it",
      changes: { title: { before: "a", after: "b" } },
      tags: ["x", "y", 1, true, null],
    };
    expect(validateActivityPayload(payload)).toEqual(payload);
    expect(typeof serializeActivityPayload(payload)).toBe("string");
  });

  it("rejects a non-object payload (primitive or array at top level)", () => {
    for (const bad of ["str", 5, true, null, [1, 2, 3]]) {
      expect(() => validateActivityPayload(bad)).toThrow(ActivityPayloadError);
    }
  });

  it("rejects a cyclic payload", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => validateActivityPayload(cyclic)).toThrow(ActivityPayloadError);
  });

  it("rejects unsupported values (functions, symbols, undefined, bigint)", () => {
    expect(() => validateActivityPayload({ f: () => 1 })).toThrow(
      ActivityPayloadError,
    );
    expect(() => validateActivityPayload({ s: Symbol("x") })).toThrow(
      ActivityPayloadError,
    );
    expect(() => validateActivityPayload({ u: undefined })).toThrow(
      ActivityPayloadError,
    );
    expect(() => validateActivityPayload({ b: BigInt(1) })).toThrow(
      ActivityPayloadError,
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() => validateActivityPayload({ n: NaN })).toThrow(
      ActivityPayloadError,
    );
    expect(() => validateActivityPayload({ n: Infinity })).toThrow(
      ActivityPayloadError,
    );
  });

  it("rejects excessive nesting depth", () => {
    // Build an object nested deeper than the allowed maximum.
    let deep: Record<string, unknown> = { v: 1 };
    for (let i = 0; i < PAYLOAD_MAX_DEPTH + 2; i++) {
      deep = { nested: deep };
    }
    expect(() => validateActivityPayload(deep)).toThrow(ActivityPayloadError);
  });

  it("rejects a payload whose encoded size exceeds the maximum", () => {
    const big = { blob: "x".repeat(9000) };
    // Structure is valid, but the encoded bytes exceed PAYLOAD_MAX_BYTES.
    expect(() => serializeActivityPayload(big)).toThrow(ActivityPayloadError);
  });
});

describe("Page limit validation", () => {
  it("defaults, clamps and rejects", () => {
    expect(validateActivityLimit(undefined)).toBe(50);
    expect(validateActivityLimit(10)).toBe(10);
    expect(validateActivityLimit(1000)).toBe(100); // clamped to max
    expect(() => validateActivityLimit(0)).toThrow(ActivityValidationError);
    expect(() => validateActivityLimit(-1)).toThrow(ActivityValidationError);
    expect(() => validateActivityLimit(1.5)).toThrow(ActivityValidationError);
  });
});
