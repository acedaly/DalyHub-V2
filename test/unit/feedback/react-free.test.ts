import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const FEEDBACK_DIR = path.resolve(
  import.meta.dirname,
  "../../../app/shared/feedback",
);

// The pure model surface — must stay React-free.
const PURE_FILES = [
  "types.ts",
  "config.ts",
  "notifications.ts",
  "operations.ts",
  "model.ts",
];

const REACT_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router)(\/[^"']*)?["']/;

describe("pure feedback model is React-free", () => {
  for (const file of PURE_FILES) {
    it(`${file} imports no React/UI package`, () => {
      const source = readFileSync(path.join(FEEDBACK_DIR, file), "utf8");
      expect(source).not.toMatch(REACT_IMPORT);
    });
  }

  it("the model entry re-exports the pure API", async () => {
    const model = await import("~/shared/feedback/model");
    expect(typeof model.pushNotification).toBe("function");
    expect(typeof model.dismissNotification).toBe("function");
    expect(typeof model.emptyNotificationQueue).toBe("function");
    expect(typeof model.startOperation).toBe("function");
    expect(typeof model.advanceOperation).toBe("function");
    expect(typeof model.retryOperation).toBe("function");
    expect(typeof model.isAssertiveKind).toBe("function");
  });

  it("does not leak React components/hooks into the pure entry", async () => {
    const model = await import("~/shared/feedback/model");
    expect("FeedbackProvider" in model).toBe(false);
    expect("useFeedback" in model).toBe(false);
    expect("NotificationCenter" in model).toBe(false);
  });
});
