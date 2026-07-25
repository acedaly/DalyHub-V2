/**
 * DIARY-01A — architecture validation (pure static + manifest guards).
 *
 * Enforces the load-bearing architectural promises of the Diary foundation so a
 * later change cannot quietly break them:
 *
 *   1. The Diary KERNEL is storage-independent — it imports no D1/Cloudflare,
 *      React or the platform storage adapter. The dependency direction points at
 *      the contract, not the store (mirrors the entity/note/spine kernels).
 *   2. The Diary MODULE manifest registers the two Activity event types the
 *      DiaryRepository emits — the Activity-vs-Diary boundary is declared, not
 *      implicit (ADR-041).
 *   3. The kernel exposes the full public contract surface from its barrel.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import diaryModule from "~/modules/diary/module";
import {
  DIARY_ENTRY_CREATED,
  DIARY_ENTRY_UPDATED,
  createDiaryEntryTypeRegistry,
} from "~/kernel/diary";

const KERNEL_DIR = path.resolve(
  import.meta.dirname,
  "../../../app/kernel/diary",
);

const FORBIDDEN_IMPORT =
  /\bfrom\s+["'](react|react-dom|react-router|cloudflare:[^"']*|~\/platform\/[^"']*)["']/;

describe("Diary kernel is storage-independent", () => {
  const files = readdirSync(KERNEL_DIR).filter((f) => f.endsWith(".ts"));

  it("has kernel source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} imports no React, Cloudflare or platform-storage module`, () => {
      const source = readFileSync(path.join(KERNEL_DIR, file), "utf8");
      expect(source).not.toMatch(FORBIDDEN_IMPORT);
      // No `D1Database` reference — the kernel never names the storage type.
      expect(source).not.toMatch(/\bD1Database\b/);
    });
  }
});

describe("Diary module manifest declares the Activity-vs-Diary boundary", () => {
  it("registers the two Diary Activity event types the repository emits", () => {
    const types = (diaryModule.activityTypes ?? []).map((t) => t.type);
    expect(types).toContain(DIARY_ENTRY_CREATED);
    expect(types).toContain(DIARY_ENTRY_UPDATED);
  });

  it("keeps the diary entity type registered", () => {
    const entityTypes = (diaryModule.entityTypes ?? []).map((t) => t.type);
    expect(entityTypes).toContain("diary");
  });
});

describe("Diary kernel public surface", () => {
  it("exposes the built-in entry-type registry", () => {
    expect(createDiaryEntryTypeRegistry().list()).toHaveLength(9);
  });
});
