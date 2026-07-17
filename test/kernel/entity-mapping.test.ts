import { describe, expect, it } from "vitest";

import {
  fromStorageTimestamp,
  rowToEntity,
  toStorageTimestamp,
  type EntityRow,
} from "~/platform/storage/d1/database";

describe("storage timestamps", () => {
  it("formats a Date as ISO-8601 UTC with millisecond precision", () => {
    const date = new Date(Date.UTC(2026, 6, 17, 12, 34, 56, 789));
    expect(toStorageTimestamp(date)).toBe("2026-07-17T12:34:56.789Z");
  });

  it("round-trips a Date through storage form", () => {
    const date = new Date("2026-01-02T03:04:05.006Z");
    expect(fromStorageTimestamp(toStorageTimestamp(date)).getTime()).toBe(
      date.getTime(),
    );
  });
});

describe("rowToEntity", () => {
  const baseRow: EntityRow = {
    id: "id_1",
    workspace_id: "ws_1",
    type: "task",
    title: "Buy milk",
    created_at: "2026-07-17T12:00:00.000Z",
    updated_at: "2026-07-17T12:30:00.000Z",
    deleted_at: null,
  };

  it("maps snake_case columns to the camelCase domain record", () => {
    const entity = rowToEntity(baseRow);
    expect(entity).toEqual({
      id: "id_1",
      workspaceId: "ws_1",
      type: "task",
      title: "Buy milk",
      createdAt: new Date("2026-07-17T12:00:00.000Z"),
      updatedAt: new Date("2026-07-17T12:30:00.000Z"),
      deletedAt: null,
    });
  });

  it("converts timestamp strings to Date instances", () => {
    const entity = rowToEntity(baseRow);
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
  });

  it("maps a set deleted_at to a Date", () => {
    const entity = rowToEntity({
      ...baseRow,
      deleted_at: "2026-07-18T09:00:00.000Z",
    });
    expect(entity.deletedAt).toEqual(new Date("2026-07-18T09:00:00.000Z"));
  });
});
