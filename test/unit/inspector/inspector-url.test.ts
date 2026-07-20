import { describe, expect, it } from "vitest";

import {
  DEFAULT_INSPECTOR_PARAM,
  MAX_INSPECTOR_KEY_LENGTH,
  readInspectorKey,
  withInspector,
  withoutInspector,
} from "~/shared/inspector/inspector-url";

describe("DS-10 inspector URL contract", () => {
  it("reads null when closed", () => {
    expect(readInspectorKey(new URLSearchParams(""))).toBeNull();
  });

  it("reads the trimmed key when open", () => {
    expect(readInspectorKey(new URLSearchParams("inspector=task%3A1"))).toBe(
      "task:1",
    );
  });

  it("rejects an empty or over-long key", () => {
    expect(readInspectorKey(new URLSearchParams("inspector="))).toBeNull();
    const huge = "x".repeat(MAX_INSPECTOR_KEY_LENGTH + 1);
    expect(
      readInspectorKey(new URLSearchParams(`inspector=${huge}`)),
    ).toBeNull();
  });

  it("opens by setting a single-valued param", () => {
    const next = withInspector(new URLSearchParams(""), "task:1");
    expect(next.getAll(DEFAULT_INSPECTOR_PARAM)).toEqual(["task:1"]);
  });

  it("replaces (never duplicates) when opening a different key", () => {
    const next = withInspector(
      new URLSearchParams("inspector=task:1"),
      "task:2",
    );
    expect(next.getAll("inspector")).toEqual(["task:2"]);
  });

  it("closes by removing the param", () => {
    const next = withoutInspector(new URLSearchParams("inspector=task:1"));
    expect(next.has("inspector")).toBe(false);
  });

  it("preserves unrelated params including repeated drawer params", () => {
    const params = new URLSearchParams(
      "drawer=project:a&drawer=goal:b&fv=1&inspector=task:1",
    );
    const closed = withoutInspector(params);
    expect(closed.getAll("drawer")).toEqual(["project:a", "goal:b"]);
    expect(closed.get("fv")).toBe("1");
    expect(closed.has("inspector")).toBe(false);

    const reopened = withInspector(closed, "task:9");
    expect(reopened.getAll("drawer")).toEqual(["project:a", "goal:b"]);
    expect(reopened.get("inspector")).toBe("task:9");
  });
});
