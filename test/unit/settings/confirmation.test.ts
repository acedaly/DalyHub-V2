import { describe, expect, it } from "vitest";

import {
  canConfirm,
  initConfirmation,
  matchesConfirmationPhrase,
  reduceConfirmation,
  type ConfirmationState,
} from "~/shared/settings/model";

describe("DS-10b confirmation model", () => {
  describe("matchesConfirmationPhrase", () => {
    it("is satisfied when no phrase is required", () => {
      expect(matchesConfirmationPhrase(undefined, "")).toBe(true);
      expect(matchesConfirmationPhrase("", "anything")).toBe(true);
    });

    it("requires an exact, case- and whitespace-significant match", () => {
      expect(matchesConfirmationPhrase("DELETE", "DELETE")).toBe(true);
      expect(matchesConfirmationPhrase("DELETE", "delete")).toBe(false);
      expect(matchesConfirmationPhrase("DELETE", "DELETE ")).toBe(false);
      expect(matchesConfirmationPhrase("DELETE", "DELET")).toBe(false);
    });
  });

  describe("canConfirm", () => {
    it("gates on the typed phrase when one is required", () => {
      const state = initConfirmation();
      expect(canConfirm(state, "DELETE")).toBe(false);
      const typed = reduceConfirmation(state, {
        type: "type",
        value: "DELETE",
      });
      expect(canConfirm(typed, "DELETE")).toBe(true);
    });

    it("allows confirming with no required phrase", () => {
      expect(canConfirm(initConfirmation(), undefined)).toBe(true);
    });

    it("blocks confirming while a confirmation is pending (duplicate prevention)", () => {
      const pending = reduceConfirmation(initConfirmation(), {
        type: "submit",
      });
      expect(pending.phase).toBe("pending");
      expect(canConfirm(pending, undefined)).toBe(false);
    });
  });

  describe("reducer transitions", () => {
    it("updates the typed value and clears a stale error", () => {
      const errored: ConfirmationState = {
        phase: "error",
        typed: "",
        error: "boom",
      };
      const next = reduceConfirmation(errored, { type: "type", value: "D" });
      expect(next.typed).toBe("D");
      expect(next.error).toBeNull();
    });

    it("enters pending on submit and back to idle on resolve", () => {
      const pending = reduceConfirmation(initConfirmation(), {
        type: "submit",
      });
      expect(pending.phase).toBe("pending");
      const resolved = reduceConfirmation(pending, { type: "resolved" });
      expect(resolved.phase).toBe("idle");
      expect(resolved.error).toBeNull();
    });

    it("records a failure and re-enables retry, preserving the typed phrase", () => {
      let state = reduceConfirmation(initConfirmation(), {
        type: "type",
        value: "DELETE",
      });
      state = reduceConfirmation(state, { type: "submit" });
      state = reduceConfirmation(state, {
        type: "rejected",
        message: "Network error",
      });
      expect(state.phase).toBe("error");
      expect(state.error).toBe("Network error");
      expect(state.typed).toBe("DELETE");
      // Retry is possible again.
      expect(canConfirm(state, "DELETE")).toBe(true);
    });

    it("ignores typing while pending (an in-flight confirmation is immutable)", () => {
      const pending = reduceConfirmation(initConfirmation(), {
        type: "submit",
      });
      const attempted = reduceConfirmation(pending, {
        type: "type",
        value: "x",
      });
      expect(attempted).toBe(pending);
    });

    it("ignores a second submit while pending", () => {
      const pending = reduceConfirmation(initConfirmation(), {
        type: "submit",
      });
      const again = reduceConfirmation(pending, { type: "submit" });
      expect(again).toBe(pending);
    });

    it("reset restores the pristine state", () => {
      let state = reduceConfirmation(initConfirmation(), {
        type: "type",
        value: "DELETE",
      });
      state = reduceConfirmation(state, {
        type: "rejected",
        message: "err",
      });
      const reset = reduceConfirmation(state, { type: "reset" });
      expect(reset).toEqual(initConfirmation());
    });
  });
});
