import { describe, expect, it } from "vitest";

import {
  clearRecentSearchResults,
  loadRecentSearchResults,
  saveRecentSearchResult,
  targetIdentity,
  toRecentSearchResult,
} from "~/shared/search/recent";
import type { RankedSearchResult } from "~/shared/search/model";

class MemoryStorage {
  readonly #items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#items.set(key, value);
  }
  removeItem(key: string): void {
    this.#items.delete(key);
  }
}

class ThrowingStorage {
  getItem(): string {
    throw new Error("blocked");
  }
  setItem(): void {
    throw new Error("blocked");
  }
  removeItem(): void {
    throw new Error("blocked");
  }
}

function result(
  overrides: Partial<RankedSearchResult> = {},
): RankedSearchResult {
  return {
    id: "tasks::tasks.search::task:1",
    providerId: "tasks.search",
    moduleId: "tasks",
    title: "Follow up",
    subtitle: "Project: Work",
    entityType: "task",
    target: {
      kind: "drawer",
      drawerKey: "task:1",
      canonicalPath: "/tasks",
    },
    score: 1,
    titleMatches: [],
    subtitleMatches: [],
    ...overrides,
  };
}

describe("recent search results", () => {
  it("stores newest-first, deduped and bounded to eight entries", () => {
    const store = new MemoryStorage();
    for (let index = 0; index < 10; index += 1) {
      saveRecentSearchResult(
        result({
          id: `tasks::tasks.search::task:${index}`,
          title: `Task ${index}`,
          target: {
            kind: "drawer",
            drawerKey: `task:${index}`,
            canonicalPath: "/tasks",
          },
        }),
        store,
      );
    }
    saveRecentSearchResult(
      result({
        title: "Task 5 again",
        target: {
          kind: "drawer",
          drawerKey: "task:5",
          canonicalPath: "/tasks",
        },
      }),
      store,
    );

    const recent = loadRecentSearchResults(store);
    expect(recent).toHaveLength(8);
    expect(recent[0]?.title).toBe("Task 5 again");
    expect(
      new Set(recent.map((entry) => targetIdentity(entry.target))).size,
    ).toBe(8);
  });

  it("strips sensitive subtitles before storage", () => {
    const diary = toRecentSearchResult(
      result({
        entityType: "diary",
        subtitle: "Reflection · private prose excerpt",
        target: { kind: "route", to: "/diary?inspector=view:entry-1" },
      }),
    );
    const person = toRecentSearchResult(
      result({
        entityType: "person",
        subtitle: "aidan@example.test",
        target: { kind: "route", to: "/person/p1" },
      }),
    );
    expect(diary.subtitle).toBeUndefined();
    expect(person.subtitle).toBeUndefined();
  });

  it("drops malformed stored signals", () => {
    const store = new MemoryStorage();
    store.setItem(
      "dalyhub.search.recent.v1",
      JSON.stringify([
        {
          title: "Task with bad signal",
          target: {
            kind: "drawer",
            drawerKey: "task:bad-signal",
            canonicalPath: "/tasks",
          },
          signals: [
            { id: "", kind: "priority", label: "P1" },
            { id: "ok", kind: "priority", label: "P1", tone: "danger" },
          ],
        },
      ]),
    );

    expect(loadRecentSearchResults(store)[0]?.signals).toEqual([
      { id: "ok", kind: "priority", label: "P1", tone: "danger" },
    ]);
  });

  it("fails calmly when localStorage is unavailable", () => {
    const store = new ThrowingStorage();
    expect(loadRecentSearchResults(store)).toEqual([]);
    expect(saveRecentSearchResult(result(), store)).toEqual([]);
    expect(clearRecentSearchResults(store)).toEqual([]);
  });

  it("clears stored history", () => {
    const store = new MemoryStorage();
    saveRecentSearchResult(result(), store);
    expect(loadRecentSearchResults(store)).toHaveLength(1);
    clearRecentSearchResults(store);
    expect(loadRecentSearchResults(store)).toEqual([]);
  });
});
