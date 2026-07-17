import { describe, expect, it } from "vitest";

import {
  WORKSPACE_ID_MAX_LENGTH,
  isWorkspaceId,
  newWorkspaceId,
  parseWorkspaceId,
} from "~/kernel/workspaces";
import { WorkspaceValidationError } from "~/kernel/workspaces";

describe("parseWorkspaceId", () => {
  it("accepts UUIDs and readable scope ids", () => {
    expect(parseWorkspaceId("018f7e2a-0000-4000-8000-000000000000")).toBe(
      "018f7e2a-0000-4000-8000-000000000000",
    );
    expect(parseWorkspaceId("ws_alpha")).toBe("ws_alpha");
    expect(parseWorkspaceId("local-dev-workspace")).toBe("local-dev-workspace");
  });

  it("accepts every id shape FND-02 accepted (no charset restriction)", () => {
    // FND-02's validateWorkspaceId allowed any non-empty string ≤128 chars.
    // Migration 0002 back-fills such ids unchanged, so they must still validate.
    for (const legacy of [
      "personal.v1",
      "personal workspace",
      "personal/work",
      "Работа",
      "ws:with:colons",
    ]) {
      expect(parseWorkspaceId(legacy)).toBe(legacy);
    }
  });

  it("rejects a non-string", () => {
    expect(() => parseWorkspaceId(undefined)).toThrow(WorkspaceValidationError);
    expect(() => parseWorkspaceId(42)).toThrow(WorkspaceValidationError);
  });

  it("rejects an empty id", () => {
    expect(() => parseWorkspaceId("")).toThrow(WorkspaceValidationError);
  });

  it("rejects an over-long id", () => {
    expect(() =>
      parseWorkspaceId("a".repeat(WORKSPACE_ID_MAX_LENGTH + 1)),
    ).toThrow(WorkspaceValidationError);
  });
});

describe("isWorkspaceId", () => {
  it("is a type guard consistent with parseWorkspaceId", () => {
    expect(isWorkspaceId("ws_alpha")).toBe(true);
    expect(isWorkspaceId("personal.v1")).toBe(true);
    expect(isWorkspaceId("")).toBe(false);
    expect(isWorkspaceId("a".repeat(WORKSPACE_ID_MAX_LENGTH + 1))).toBe(false);
    expect(isWorkspaceId(123)).toBe(false);
  });
});

describe("newWorkspaceId", () => {
  it("produces a valid, unique workspace id", () => {
    const a = newWorkspaceId();
    const b = newWorkspaceId();
    expect(a).not.toBe(b);
    expect(isWorkspaceId(a)).toBe(true);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
