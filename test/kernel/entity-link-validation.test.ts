import { describe, expect, it } from "vitest";

import { EntityLinkValidationError } from "~/kernel/entity-links";
import {
  DEFAULT_LINK_PAGE_SIZE,
  MAX_LINK_PAGE_SIZE,
  parseEntityLinkType,
  validateCreateEntityLinkInput,
  validateDirectionFilter,
  validateLinkLimit,
} from "~/kernel/entity-links/entity-link-validation";

describe("EntityLink validation (pure)", () => {
  describe("parseEntityLinkType", () => {
    it("accepts documented lowercase dotted identifiers", () => {
      for (const t of [
        "meeting.produced_task",
        "project.supporting_note",
        "person.attended_meeting",
        "task",
        "a.b.c.d",
      ]) {
        expect(parseEntityLinkType(t)).toBe(t);
      }
    });

    it("rejects empty, mis-shaped, and non-string types", () => {
      for (const bad of [
        "",
        "Meeting.Produced",
        "meeting..task",
        ".leading",
        "trailing.",
        "has space",
        "with-dash",
        123,
        null,
        undefined,
      ]) {
        expect(() => parseEntityLinkType(bad)).toThrow(
          EntityLinkValidationError,
        );
      }
    });

    it("rejects an over-long type", () => {
      expect(() => parseEntityLinkType("a".repeat(129))).toThrow(
        EntityLinkValidationError,
      );
    });
  });

  describe("validateCreateEntityLinkInput", () => {
    it("returns the validated, branded fields", () => {
      const v = validateCreateEntityLinkInput({
        sourceEntityId: "s",
        targetEntityId: "t",
        type: "task.relates_to",
      });
      expect(v).toEqual({
        sourceEntityId: "s",
        targetEntityId: "t",
        type: "task.relates_to",
      });
    });

    it("rejects a self-link before any storage access", () => {
      expect(() =>
        validateCreateEntityLinkInput({
          sourceEntityId: "same",
          targetEntityId: "same",
          type: "task.relates_to",
        }),
      ).toThrow(EntityLinkValidationError);
    });

    it("rejects empty endpoint ids", () => {
      expect(() =>
        validateCreateEntityLinkInput({
          sourceEntityId: "",
          targetEntityId: "t",
          type: "task.relates_to",
        }),
      ).toThrow(EntityLinkValidationError);
    });
  });

  describe("validateLinkLimit", () => {
    it("defaults, clamps, and rejects bad values", () => {
      expect(validateLinkLimit(undefined)).toBe(DEFAULT_LINK_PAGE_SIZE);
      expect(validateLinkLimit(10)).toBe(10);
      expect(validateLinkLimit(10_000)).toBe(MAX_LINK_PAGE_SIZE);
      expect(() => validateLinkLimit(0)).toThrow(EntityLinkValidationError);
      expect(() => validateLinkLimit(1.5)).toThrow(EntityLinkValidationError);
    });
  });

  describe("validateDirectionFilter", () => {
    it("defaults to both and accepts the three directions", () => {
      expect(validateDirectionFilter(undefined)).toBe("both");
      expect(validateDirectionFilter("outgoing")).toBe("outgoing");
      expect(validateDirectionFilter("incoming")).toBe("incoming");
      expect(validateDirectionFilter("both")).toBe("both");
    });

    it("rejects an unknown direction", () => {
      expect(() => validateDirectionFilter("sideways")).toThrow(
        EntityLinkValidationError,
      );
    });
  });
});
